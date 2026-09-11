// run-bench.mjs — headless benchmark of the LocalSWMM wasm engine
// (public/swmm6wasm.wasm) over the 1729-SWMM5-Models suite.
//
// Runs each selected .inp through the engine's stride API exactly the way
// public/simWorker.js drives it in the browser, captures wall time plus
// .rpt/.out sizes, and appends one JSON line per model to results/.
//
// The engine glue is a pthread build but ships no Node worker shim, so when
// THREADS > 1 we polyfill `Worker` with worker_threads (same protocol the
// browser build uses: re-execute the glue with globalThis.name='em-pthread').
//
// Usage:
//   node benchmark/run-bench.mjs [--threads 4] [--sample 12] [--filter substr]
//        [--limit N] [--list] [--save-artifacts] [--max-out-bytes N] [--all]

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installWorkerShim } from './lib/worker-shim.mjs';
import {
    parseInp, simDurationSeconds, reportPeriods,
    outSizeEstimate, routingStepsEstimate, rptSizeEstimate,
} from './lib/inp-analyze.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));           // benchmark/
const PROJECT = dirname(ROOT);                                  // repo root
const PUBLIC = join(PROJECT, 'public');
const MODELS_DIR = join(ROOT, 'models');
const RESULTS_DIR = join(ROOT, 'results');
const OUT_DIR = join(ROOT, 'out');

const arg = (name, dflt) => {
    const i = process.argv.indexOf(name);
    if (i === -1) return dflt;
    const v = process.argv[i + 1];
    return (v === undefined || v.startsWith('--')) ? true : v;
};
const THREADS = Number(arg('--threads', 4));
const SAMPLE = Number(arg('--sample', 0));
const FILTER = arg('--filter', null);
const LIMIT = Number(arg('--limit', 0));
const LIST_ONLY = arg('--list', false);
const SAVE = arg('--save-artifacts', false);
const ALL = arg('--all', false);
const MAX_OUT = Number(arg('--max-out-bytes', 1.5 * 1024 ** 3)); // wasm MEMFS ceiling guard

// ---------------------------------------------------------------------------
// selection
// ---------------------------------------------------------------------------
function analyzePath(path) {
    const rel = relative(MODELS_DIR, path);
    const text = readFileSync(path, 'utf8');
    const m = parseInp(text);
    const dur = simDurationSeconds(m);
    const periods = reportPeriods(m, dur);
    return {
        rel, folder: rel.split(/[\\/]/)[0], path,
        inpBytes: statSize(path),
        subcatchments: m.counts.subcatchments, nodes: m.counts.nodes,
        links: m.counts.links, pollutants: m.counts.pollutants,
        durationH: dur === null ? null : +(dur / 3600).toFixed(2),
        periods, outEstBytes: outSizeEstimate(m, periods),
        rptEstBytes: rptSizeEstimate(m), routingSteps: routingStepsEstimate(m, dur),
    };
}
function statSize(p) { try { return statSize_(p); } catch { return 0; } }
import { statSync as statSize_ } from 'node:fs';

function loadRows() {
    const fp = join(RESULTS_DIR, 'footprint.json');
    if (existsSync(fp)) {
        const j = JSON.parse(readFileSync(fp, 'utf8'));
        return j.rows.map(r => ({ ...r, path: join(MODELS_DIR, r.rel) }));
    }
    const rows = [];
    (function walk(dir) {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const p = join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (/\.inp$/i.test(e.name)) rows.push(analyzePath(p));
        }
    })(MODELS_DIR);
    return rows;
}

const allRows = loadRows();
if (FILTER) allRows.forEach(r => r._hit = String(r.rel).toLowerCase().includes(String(FILTER).toLowerCase()));
const filtered = FILTER ? allRows.filter(r => r._hit) : allRows;
// models whose estimated .out cannot fit the wasm32/MEMFS heap ceiling
const oversized = filtered.filter(r => (r.outEstBytes ?? Infinity) > MAX_OUT);
const runnable = filtered.filter(r => (r.outEstBytes ?? 0) <= MAX_OUT && r.durationH !== 0);

let selected = ALL ? runnable : runnable;
if (SAMPLE > 0 && runnable.length > SAMPLE) {
    // stratified across the routing-step (compute load) distribution
    const sorted = [...runnable].sort((a, b) => (a.routingSteps ?? 0) - (b.routingSteps ?? 0));
    const step = sorted.length / SAMPLE;
    selected = Array.from({ length: SAMPLE }, (_, i) => sorted[Math.min(sorted.length - 1, Math.floor(i * step))]);
}
if (LIMIT > 0) selected = selected.slice(0, LIMIT);
if (LIST_ONLY) {
    console.log(`runnable: ${runnable.length}, oversized(wasm-mem): ${oversized.length}, selected: ${selected.length}`);
    for (const r of selected) console.log(`  ${r.rel}  steps=${r.routingSteps}  outEst=${((r.outEstBytes || 0) / 1048576).toFixed(1)}MiB`);
    process.exit(0);
}

// ---------------------------------------------------------------------------
// pthread shim: Emscripten's node pthread path is not compiled into the glue,
// but the browser protocol (re-run glue with globalThis.name='em-pthread')
// maps 1:1 onto worker_threads.
// ---------------------------------------------------------------------------
if (installWorkerShim()) console.log('[shim] Worker polyfilled with worker_threads (engine pthreads)');

// ---------------------------------------------------------------------------
// engine harness (mirrors public/simWorker.js)
// ---------------------------------------------------------------------------
function loadGlueFactory() {
    const glue = readFileSync(join(PUBLIC, 'swmm6wasm.js'), 'utf8');
    globalThis.self = globalThis;
    const factory = new Function(glue + '\n;return typeof createModule === "function" ? createModule : createOpenSwmm2D;')();
    return factory;
}

async function createEngine(wasmBinary) {
    const factory = loadGlueFactory();
    const logs = [];
    // The glue ships no Node wasm-loading path (ENVIRONMENT=web,worker), so
    // compile here and hand the instance over through the instantiateWasm hook.
    const wasmModule = new WebAssembly.Module(wasmBinary);
    const Module = await factory({
        noInitialRun: true,
        print: (t) => logs.push(String(t)),
        printErr: (t) => logs.push(String(t)),
        instantiateWasm(imports, receiveInstance) {
            const instance = new WebAssembly.Instance(wasmModule, imports);
            receiveInstance(instance, wasmModule);
            return instance.exports;
        },
        locateFile: f => f.endsWith('.wasm') ? join(PUBLIC, 'swmm6wasm.wasm') : f,
    });
    return { Module, logs };
}

function overrideThreads(inp, n) {
    if (/^THREADS\s+\S+/m.test(inp)) return inp.replace(/^THREADS\s+\S+.*$/mi, `THREADS            ${n}`);
    return inp.replace(/^(\[OPTIONS\][^\n]*\n)/mi, `$1THREADS            ${n}\n`);
}

function check(code, op) { if (code !== 0) throw new Error(`${op} failed with code ${code}`); }

async function runOne(r, wasmBinary) {
    const inpRaw = readFileSync(r.path, 'utf8');
    const inp = THREADS > 0 ? overrideThreads(inpRaw, THREADS) : inpRaw;
    const model = parseInp(inp);
    const aux = model.fileRefs.map(f => {
        const base = f.split(/[\\/]/).pop();
        for (const c of [join(dirname(r.path), f), join(MODELS_DIR, f), join(MODELS_DIR, base)]) {
            if (existsSync(c)) return { name: base, path: c };
        }
        return null;
    }).filter(Boolean);

    const { Module, logs } = await createEngine(wasmBinary);
    const res = { rel: r.rel, folder: r.folder, threads: THREADS, ts: new Date().toISOString() };
    let phase = performance.now();
    const mark = () => { const d = Math.round(performance.now() - phase); phase = performance.now(); return d; };
    try {
        Module.FS.writeFile('/in.inp', inp);
        for (const a of aux) Module.FS.writeFile('/' + a.name, readFileSync(a.path));

        const cwrap = Module.cwrap.bind(Module);
        const create = cwrap('swmm_engine_create', 'number', []);
        const open = cwrap('swmm_engine_open', 'number', ['number', 'string', 'string', 'string', 'number']);
        const initialize = cwrap('swmm_engine_initialize', 'number', ['number']);
        const start = cwrap('swmm_engine_start', 'number', ['number', 'number']);
        const stride = cwrap('swmm_engine_stride', 'number', ['number', 'number', 'number']);
        const end = cwrap('swmm_engine_end', 'number', ['number']);
        const report = cwrap('swmm_engine_report', 'number', ['number']);
        const close = cwrap('swmm_engine_close', 'number', ['number']);
        const destroy = cwrap('swmm_engine_destroy', null, ['number']);

        const engine = create();
        check(open(engine, '/in.inp', '/rpt.rpt', '/out.out', 0), 'open');
        res.openMs = mark();
        check(initialize(engine), 'initialize');
        check(start(engine, 1), 'start');
        res.initMs = mark();

        const elPtr = Module._malloc(8);
        res.strideErr = stride(engine, 10000000, elPtr);
        res.simMs = mark();
        Module._free(elPtr);
        try {
            res.endErr = end(engine);
            if (res.endErr !== 0) throw new Error('end failed with code ' + res.endErr);
        } catch (e) { res.endErr = res.endErr ?? 'threw'; }
        try { report(engine); } catch { }
        try { res.closeErr = close(engine); } catch { }
        res.reportMs = mark();

        let rpt = '';
        try { rpt = Buffer.from(Module.FS.readFile('/rpt.rpt')).toString('latin1'); } catch { }
        try { res.outBytes = Module.FS.stat('/out.out').size; } catch { }
        try { res.rptBytes = Module.FS.stat('/rpt.rpt').size; } catch { }
        res.rptThreads = (rpt.match(/^.*Number of Threads.*$/mi) || [''])[0].trim();
        res.rptErrs = (rpt.match(/ERROR\s+\d+[^\r\n]*/g) || []).slice(0, 3);
        res.continuityErr = (rpt.match(/Continuity Error \(%\)[^\d-]*(-?[\d.]+)/) || [])[1] ?? null;
        res.internalSteps = (rpt.match(/Total Internal Step\s+([\d.]+)/) || [])[1] ?? null;
        if (SAVE) {
            mkdirSync(OUT_DIR, { recursive: true });
            const stem = String(r.rel).replace(/[\\/]/g, '__').replace(/\.inp$/i, '');
            try { writeFileSync(join(OUT_DIR, stem + '.rpt'), rpt); } catch { }
            try { writeFileSync(join(OUT_DIR, stem + '.out'), Module.FS.readFile('/out.out')); } catch { }
        }
        res.ok = true;
    } catch (e) {
        res.error = (e && e.message) || String(e);
        res.logTail = logs.slice(-4);
        // the report file may already hold the engine's error text
        try {
            const rpt = Buffer.from(Module.FS.readFile('/rpt.rpt')).toString('latin1');
            res.rptErrs = (rpt.match(/ERROR\s+\d+[^\r\n]*/g) || []).slice(0, 3);
            res.rptBytes = rpt.length;
        } catch { }
    }
    return res;
}

// ---------------------------------------------------------------------------
// main loop
// ---------------------------------------------------------------------------
mkdirSync(RESULTS_DIR, { recursive: true });
const jsonl = join(RESULTS_DIR, `runs-t${THREADS}.jsonl`);
const wasmBinary = readFileSync(join(PUBLIC, 'swmm6wasm.wasm'));
console.log(`Engine: public/swmm6wasm.wasm (${(wasmBinary.length / 1048576).toFixed(1)} MiB), THREADS=${THREADS}`);
console.log(`Models: ${selected.length} selected, ${oversized.length} skipped by wasm memory guard (outEst>${(MAX_OUT / 1048576).toFixed(0)} MiB)`);
const started = Date.now();

for (const [i, r] of selected.entries()) {
    let res;
    try {
        res = await runOne(r, wasmBinary);
    } catch (e) {
        res = { rel: r.rel, folder: r.folder, threads: THREADS, error: 'harness: ' + ((e && e.message) || e) };
    }
    res.inpBytes = r.inpBytes; res.outEstBytes = r.outEstBytes; res.routingSteps = r.routingSteps;
    res.nodes = r.nodes; res.links = r.links; res.subcatchments = r.subcatchments;
    res.periods = r.periods; res.rptEstBytes = r.rptEstBytes;
    appendFileSync(jsonl, JSON.stringify(res) + '\n');
    const status = res.error ? `ERROR: ${res.error.slice(0, 90)}`
        : `sim ${(res.simMs / 1000).toFixed(2)}s | out=${res.outBytes ? (res.outBytes / 1048576).toFixed(1) + 'MiB' : 'n/a'} | ${res.rptThreads || 'no-threads-line'}${res.rptErrs?.length ? ' | ' + res.rptErrs[0] : ''}`;
    console.log(`[${i + 1}/${selected.length}] ${r.rel}\n    ${status}`);
}

console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s → ${jsonl}`);
process.exit(0); // engine pthread workers keep the event loop alive otherwise
