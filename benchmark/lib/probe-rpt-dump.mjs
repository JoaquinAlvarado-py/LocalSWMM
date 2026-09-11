// probe-rpt-dump.mjs — run the mini model and dump the full report
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installWorkerShim } from './worker-shim.mjs';

installWorkerShim();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, '..', 'public');
const inpPath = process.argv[2] || join(ROOT, 'lib', 'mini-smoke.inp');

const glue = readFileSync(join(PUBLIC, 'swmm6wasm.js'), 'utf8');
const wasmBinary = readFileSync(join(PUBLIC, 'swmm6wasm.wasm'));
globalThis.self = globalThis;
const wasmModule = new WebAssembly.Module(wasmBinary);
const factory = new Function(glue + '\n;return typeof createModule === "function" ? createModule : createOpenSwmm2D;')();
const Module = await factory({
    noInitialRun: true,
    print: (t) => console.log('[out]', t),
    printErr: (t) => console.log('[err]', t),
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
console.log('open:', open(eng, '/in.inp', '/rpt.rpt', '/out.out', 0));
console.log('initialize:', initialize(eng));
console.log('start:', start(eng, 1));
const elPtr = Module._malloc(8);
console.log('stride(1):', stride(eng, 1, elPtr), 'elapsed:', Module.getValue(elPtr, 'double'));
// single-step loop to find where bulk stride fails
let last = 0, i = 0;
for (i = 0; i < 400; i++) {
    const err = stride(eng, 1, elPtr);
    const d = Module.getValue(elPtr, 'double');
    if (err !== 0) { console.log(`step ${i + 2}: err=${err} elapsed=${d}`); break; }
    if (!(d > last) && i > 0) { console.log(`step ${i + 2}: no progress (elapsed=${d}) — sim ended`); break; }
    last = d;
}
console.log('bulk stride(250):', stride(eng, 250, elPtr), 'elapsed:', Module.getValue(elPtr, 'double'));
try {
    const rpt = Module.FS.readFile('/rpt.rpt', { encoding: 'utf8' });
    console.log('=== RPT ===');
    console.log(rpt.slice(0, 3000));
} catch (e) { console.log('no rpt'); }
