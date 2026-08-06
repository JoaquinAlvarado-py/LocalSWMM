// verify-1d-split.mjs — regression gate for the WebGPU split's 1D leg.
//
// The split runs the 1D network in the WASM engine on its own (2D sections
// stripped by CouplingSplit.build1DInp) and feeds the coupling nodes' heads
// into the GPU exchange kernel every window. If that 1D solve diverges, the
// heads go non-finite and silently poison the whole 2D field — the kernel has
// no NaN guard by design (the check lives in runSplit).
//
// This gate runs EXACTLY that leg — the real build1DInp, the real parseCoupling,
// the same set_pond_area calls the production worker makes, strided the way
// runSplit strides — and fails if the node state ever goes non-finite or the
// routing continuity error leaves the tolerance band. Only the GPU exchange
// feedback is absent, which makes the gate conservative, not lenient: the
// exchange drains ponded water, so a leg that is sane here stays sane there.
//
// It exists because an earlier revision pinned VARIABLE_STEP to 0 for speed
// (10 s fixed steps on a model declaring MINIMUM_STEP 0.5). That was measured
// for wall time only, and shipped with 645 of Bellinge's 1020 coupling heads
// at NaN/Inf. See WEBGPU_PLAN.md and build1DInp's comment.
//
// Usage:
//   node scripts/verify-1d-split.mjs <model.inp> [--wasm <path>]
//                                    [--tol <percent>] [--hours <n>] [--json]
// Exit code 0 = PASS, 1 = FAIL, 2 = could not run.

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const argv = process.argv.slice(2);
const inpPath = argv.find(a => !a.startsWith('--'));
const argOf = (k, d) => { const i = argv.indexOf(k); return i === -1 ? d : argv[i + 1]; };
const asJson = argv.includes('--json');
const tolPct = Number(argOf('--tol', 10));
const limitHours = Number(argOf('--hours', 0)) || 0;
const wasmPath = argOf('--wasm', new URL('../public/openswmm2d.wasm', import.meta.url));
const gluePath = new URL('../public/openswmm2d.js', import.meta.url);
// --split points the gate at another revision of the module (e.g.
// `git show <rev>:public/webgpu/couplingSplit.js > /tmp/old.js`) so a fix can
// be A/B'd against the build it replaces.
const splitPath = argOf('--split', new URL('../public/webgpu/couplingSplit.js', import.meta.url));

if (!inpPath) {
    console.error('usage: node scripts/verify-1d-split.mjs <model.inp> [--wasm <path>] [--tol <percent>] [--hours <n>] [--json]');
    process.exit(2);
}

// Load the production split module (it assigns globalThis.CouplingSplit).
globalThis.performance = globalThis.performance || performance;
new Function(readFileSync(splitPath, 'utf8'))();
const CS = globalThis.CouplingSplit;
if (!CS || typeof CS.build1DInp !== 'function') {
    console.error('Could not load CouplingSplit from public/webgpu/couplingSplit.js');
    process.exit(2);
}

// Load the engine through the same Emscripten glue the workers use.
globalThis.self = globalThis;
globalThis.window = globalThis;
const factory = new Function(readFileSync(gluePath, 'utf8')
    + '\n;return typeof createOpenSwmm2D === "function" ? createOpenSwmm2D : null;')();
const wasmBinary = readFileSync(wasmPath);
const wasmModule = new WebAssembly.Module(wasmBinary);
const Module = await factory({
    wasmBinary,
    instantiateWasm(imports, receiveInstance) {
        const instance = new WebAssembly.Instance(wasmModule, imports);
        receiveInstance(instance, wasmModule);
        return instance.exports;
    },
    locateFile: f => f.endsWith('.wasm') ? 'openswmm2d.wasm' : f,
    print: () => { }, printErr: () => { }
});

const cw = (n, r, a) => Module.cwrap(n, r, a);
const api = {
    create: cw('swmm_engine_create', 'number', []),
    open: cw('swmm_engine_open', 'number', ['number', 'string', 'string', 'string', 'number']),
    initialize: cw('swmm_engine_initialize', 'number', ['number']),
    start: cw('swmm_engine_start', 'number', ['number', 'number']),
    stride: cw('swmm_engine_stride', 'number', ['number', 'number', 'number']),
    end: cw('swmm_engine_end', 'number', ['number']),
    report: cw('swmm_engine_report', 'number', ['number']),
    destroy: cw('swmm_engine_destroy', null, ['number']),
    nodeCount: cw('swmm_node_count', 'number', ['number']),
    nodeHeads: cw('swmm_node_get_heads_bulk', 'number', ['number', 'number', 'number']),
    nodeDepths: cw('swmm_node_get_depths_bulk', 'number', ['number', 'number', 'number']),
    setPondArea: cw('swmm_node_set_pond_area', 'number', ['number', 'number', 'number'])
};

const raw = readFileSync(inpPath, 'utf8');
const mesh = CS.parse2DMesh(raw);
if (!mesh.triangles.length) {
    console.error(`${inpPath} has no [2D_TRIANGLES] — nothing to verify.`);
    process.exit(2);
}
const coupling = CS.parseCoupling(raw, mesh);
const points = [...(coupling.vertexPoints || []), ...(coupling.points || [])];
const inp = CS.build1DInp(raw);
let simEnd = CS.simEndSec(raw);
if (limitHours > 0) simEnd = Math.min(simEnd, limitHours * 3600);

// The 2D footprint the worker hands each coupling node as its ponded area.
const triArea = (t) => {
    const v = mesh.triangles[t].v, V = mesh.vertices;
    return Math.abs((V[v[1]].x - V[v[0]].x) * (V[v[2]].y - V[v[0]].y)
        - (V[v[2]].x - V[v[0]].x) * (V[v[1]].y - V[v[0]].y)) / 2;
};

const engine = api.create();
Module.FS.writeFile('/verify.inp', inp);
const openCode = api.open(engine, '/verify.inp', '/verify.rpt', '/verify.out', 0);
if (openCode !== 0) {
    console.error(`1D open failed with code ${openCode}`);
    process.exit(2);
}
for (const p of points) api.setPondArea(engine, p.node, triArea(p.cell));
api.initialize(engine);
api.start(engine, 0);

const nNodes = api.nodeCount(engine);
const hPtr = Module._malloc(nNodes * 8), dPtr = Module._malloc(nNodes * 8);
const elPtr = Module._malloc(8);
const WINDOW = 60;                       // the production coupling window

let elapsed = 0, prevT = 0, strides = 0, windows = 0, strideErr = 0;
let firstBadAt = null, firstBadNode = null, maxAbsHead = 0;
const t0 = performance.now();

outer:
while (elapsed < simEnd) {
    const target = prevT + WINDOW;
    let stalled = 0, lastElapsed = elapsed;
    do {
        strideErr = api.stride(engine, 1, elPtr);
        if (strideErr !== 0) break;
        elapsed = Module.getValue(elPtr, 'double') * 86400;
        strides++;
        if (elapsed > lastElapsed) { lastElapsed = elapsed; stalled = 0; }
        else if (++stalled >= 8) break;
    } while (elapsed < target && elapsed < simEnd);
    if (elapsed <= prevT) break;
    windows++;

    // Exactly what runSplit freezes into cplF every window.
    api.nodeHeads(engine, hPtr, nNodes);
    api.nodeDepths(engine, dPtr, nNodes);
    for (const p of points) {
        const h = Module.getValue(hPtr + p.node * 8, 'double');
        const d = Module.getValue(dPtr + p.node * 8, 'double');
        if (!Number.isFinite(h) || !Number.isFinite(d)) {
            firstBadAt = elapsed;
            firstBadNode = p.nodeId || p.node;
            break outer;
        }
        if (Math.abs(h) > maxAbsHead) maxAbsHead = Math.abs(h);
    }
    prevT = elapsed;
    if (strideErr !== 0) break;
}
const wallMs = performance.now() - t0;

// The engine auto-ends with lifecycle code 6; end() then errors and the
// report never lands, so only call it when the loop finished on its own.
if (strideErr !== 6) { try { api.end(engine); } catch (e) { /* report is best-effort */ } }
let report = '';
try {
    api.report(engine);
    report = Module.FS.readFile('/verify.rpt', { encoding: 'utf8' });
} catch (e) { /* report is best-effort */ }

const one = (label) => {
    const m = report.match(new RegExp(`^\\s*${label}[\\s.]*([^\\r\\n]+)`, 'm'));
    return m ? m[1].trim() : null;
};
// Capture the whole token, not a digit run: a diverged run prints "-nan" and
// a [\d.]+ group would happily match a lone dot out of the leader and report
// a bogus value as if it had parsed.
const contErrors = [...report.matchAll(/^\s*Continuity Error \(%\)\s*\.*\s*(\S+)/gm)]
    .map(m => Number(m[1]));
const finiteOrNull = (v) => Number.isFinite(v) ? v : null;
const routingErr = contErrors.length > 1 ? finiteOrNull(contErrors[1]) : null;

const checks = [];
checks.push({
    name: 'coupling-node state stays finite',
    ok: firstBadAt === null,
    detail: firstBadAt === null
        ? `${points.length} points finite across ${windows} windows (max |head| ${maxAbsHead.toFixed(2)} m)`
        : `node ${firstBadNode} went non-finite at t=${firstBadAt.toFixed(1)} s`
});
checks.push({
    name: 'flow routing continuity reported',
    ok: routingErr !== null,
    detail: routingErr !== null
        ? `${routingErr} %`
        : 'the report has no Flow Routing continuity value (a NaN mass balance corrupts the block)'
});
checks.push({
    name: `flow routing continuity within +/-${tolPct} %`,
    ok: routingErr !== null && Math.abs(routingErr) <= tolPct,
    detail: routingErr === null ? 'not reported' : `${routingErr} % (tolerance ${tolPct} %)`
});

const pass = checks.every(c => c.ok);
const result = {
    script: 'verify-1d-split.mjs',
    model: String(inpPath).split(/[\\/]/).pop(),
    simSeconds: simEnd,
    couplingPoints: points.length,
    droppedPoints: (coupling.unresolved || []).length,
    variableStepLine: (inp.match(/^VARIABLE_STEP.*$/m) || ['(absent — engine default)'])[0].trim(),
    routingStepLine: (inp.match(/^ROUTING_STEP.*$/m) || [''])[0].trim(),
    strides, windows,
    wallMs: Math.round(wallMs),
    msPerStride: strides ? +(wallMs / strides).toFixed(3) : null,
    minStep: one('Minimum Time Step'),
    avgStep: one('Average Time Step'),
    pctNotConverging: one('% of Steps Not Converging'),
    runoffContinuityPct: contErrors.length ? finiteOrNull(contErrors[0]) : null,
    routingContinuityPct: routingErr,
    checks,
    verdict: pass ? 'PASS' : 'FAIL'
};

if (asJson) {
    console.log(JSON.stringify(result, null, 2));
} else {
    console.log(`\n  verify-1d-split — ${result.model} (${(simEnd / 3600).toFixed(1)} h, ${points.length} coupling points)`);
    console.log(`  ${result.variableStepLine} | ${result.routingStepLine}`);
    console.log(`  ${strides} strides / ${windows} windows in ${(wallMs / 1000).toFixed(1)} s`
        + `${result.avgStep ? ` | avg step ${result.avgStep}` : ''}`
        + `${result.pctNotConverging ? ` | not converging ${result.pctNotConverging}` : ''}`);
    for (const c of checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'}  ${c.name} — ${c.detail}`);
    console.log(`  ${result.verdict}\n`);
}

Module._free(hPtr); Module._free(dPtr); Module._free(elPtr);
api.destroy(engine);
process.exit(pass ? 0 : 1);
