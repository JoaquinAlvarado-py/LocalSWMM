// probe-chunked-stride.mjs — verify chunked stride semantics: elapsed advances
// toward total sim days, progress fractions increase, and the loop terminates.
// Usage: node benchmark/lib/probe-chunked-stride.mjs [model.inp]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installWorkerShim } from './worker-shim.mjs';

installWorkerShim();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, '..', 'public');
const inpPath = process.argv[2] || join(ROOT, 'models', 'Weirs', '2_Weirs_4Subs.inp');

const glue = readFileSync(join(PUBLIC, 'swmm6wasm.js'), 'utf8');
const wasmBinary = readFileSync(join(PUBLIC, 'swmm6wasm.wasm'));
globalThis.self = globalThis;
const wasmModule = new WebAssembly.Module(wasmBinary);
const factory = new Function(glue + '\n;return typeof createModule === "function" ? createModule : createOpenSwmm2D;')();
const Module = await factory({
    noInitialRun: true,
    print: () => { }, printErr: () => { },
    instantiateWasm(imports, receiveInstance) {
        const instance = new WebAssembly.Instance(wasmModule, imports);
        receiveInstance(instance, wasmModule);
        return instance.exports;
    },
});

const inp = readFileSync(inpPath, 'utf8');
Module.FS.writeFile('/in.inp', inp);
const c = Module.cwrap.bind(Module);
const create = c('swmm_engine_create', 'number', []);
const open = c('swmm_engine_open', 'number', ['number', 'string', 'string', 'string', 'number']);
const initialize = c('swmm_engine_initialize', 'number', ['number']);
const start = c('swmm_engine_start', 'number', ['number', 'number']);
const stride = c('swmm_engine_stride', 'number', ['number', 'number', 'number']);
const end = c('swmm_engine_end', 'number', ['number']);

const eng = create();
if (open(eng, '/in.inp', '/rpt.rpt', '/out.out', 0) !== 0) throw new Error('open failed');
const initRc = initialize(eng);
const startRc = start(eng, 1);
console.log('init rc:', initRc, 'start rc:', startRc);
if (initRc !== 0 || startRc !== 0) {
    const rpt = Module.FS.readFile('/rpt.rpt', { encoding: 'utf8' });
    console.log(rpt.split(/\r?\n/).filter(l => /error/i.test(l)).slice(0, 6).join('\n') || rpt.slice(0, 600));
    process.exit(1);
}

// total days from [OPTIONS] (same logic as simWorker.parseSimDurationDays)
const opt = {};
let inOpts = false;
for (let line of inp.split(/\r?\n/)) {
    line = line.replace(/;.*$/, '').trim();
    if (!line) continue;
    if (line.startsWith('[') && line.endsWith(']')) { inOpts = line.toUpperCase() === '[OPTIONS]'; continue; }
    if (inOpts) { const p = line.split(/\s+/); opt[p[0].toUpperCase()] = p.slice(1).join(' '); }
}
const toMs = (d) => { const p = String(d || '').split(/[/-]/).map(Number); return p.length === 3 && !p.some(isNaN) ? Date.UTC(p[2], p[0] - 1, p[1]) : null; };
const toSec = (t, dflt) => {
    if (t === undefined) return dflt;
    if (String(t).includes(':')) { const p = String(t).split(':').map(Number); return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0); }
    const v = Number(t); return isNaN(v) ? dflt : v;
};
const totalSec = ((toMs(opt.END_DATE) ?? toMs(opt.START_DATE)) + toSec(opt.END_TIME, 86400) * 1000
    - (toMs(opt.START_DATE) + toSec(opt.START_TIME, 0) * 1000)) / 1000;
const totalDays = totalSec / 86400;
console.log('totalDays:', totalDays);

const elPtr = Module._malloc(8);
const CHUNK = 250;
let last = -1, posts = 0, iters = 0;
const t0 = performance.now();
while (true) {
    const err = stride(eng, CHUNK, elPtr);
    if (err !== 0) {
        console.log('stride err', err);
        const rpt = Module.FS.readFile('/rpt.rpt', { encoding: 'utf8' });
        console.log(rpt.split(/\r?\n/).filter(l => /error/i.test(l)).slice(0, 5).join('\n'));
        break;
    }
    const days = Module.getValue(elPtr, 'double');
    if (!(days > last)) { console.log('no progress at', days); break; }
    last = days;
    if (++iters % 4 === 0) console.log(`frac=${(days / totalDays).toFixed(3)} iters=${iters}`);
    if (totalDays > 0 && days >= totalDays - 1e-9) { console.log('reached end'); break; }
    if (iters > 100000) { console.log('runaway'); break; }
}
console.log(`done: elapsed=${(last * 24).toFixed(3)}h of ${(totalDays * 24).toFixed(3)}h in ${iters} chunks, ${((performance.now() - t0) / 1000).toFixed(2)}s`);
console.log('end rc=', end(eng));
