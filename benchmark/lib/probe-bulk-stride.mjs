// probe-bulk-stride.mjs — fresh engine, single bulk stride with varying n
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installWorkerShim } from './worker-shim.mjs';

installWorkerShim();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, '..', 'public');
const inpPath = process.argv[2] || join(ROOT, 'mini-smoke.inp');

const glue = readFileSync(join(PUBLIC, 'swmm6wasm.js'), 'utf8');
const wasmBinary = readFileSync(join(PUBLIC, 'swmm6wasm.wasm'));
globalThis.self = globalThis;
const wasmModule = new WebAssembly.Module(wasmBinary);
const factory = new Function(glue + '\n;return typeof createModule === "function" ? createModule : createOpenSwmm2D;')();

async function runWith(n) {
    const Module = await factory({
        noInitialRun: true,
        print: () => { }, printErr: () => { },
        instantiateWasm(imports, receiveInstance) {
            const instance = new WebAssembly.Instance(wasmModule, imports);
            receiveInstance(instance, wasmModule);
            return instance.exports;
        },
    });
    Module.FS.writeFile('/in.inp', readFileSync(inpPath, 'utf8'));
    const c = Module.cwrap.bind(Module);
    const eng = c('swmm_engine_create', 'number', [])();
    c('swmm_engine_open', 'number', ['number', 'string', 'string', 'string', 'number'])(eng, '/in.inp', '/rpt.rpt', '/out.out', 0);
    c('swmm_engine_initialize', 'number', ['number'])(eng);
    const startRc = c('swmm_engine_start', 'number', ['number', 'number'])(eng, 1);
    const stride = c('swmm_engine_stride', 'number', ['number', 'number', 'number']);
    const elPtr = Module._malloc(8);
    const err = stride(eng, n, elPtr);
    const d = Module.getValue(elPtr, 'double');
    const endRc = c('swmm_engine_end', 'number', ['number'])(eng);
    console.log(`n=${String(n).padStart(6)}  start=${startRc}  stride err=${err}  elapsed=${d.toFixed(6)} days  end=${endRc}`);
}

for (const n of [1, 100, 240, 241, 242, 250, 500, 10000000]) {
    await runWith(n);
}
