// probe-rpt.mjs — when does the engine produce the .rpt content?
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installWorkerShim } from './worker-shim.mjs';

installWorkerShim();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, '..', 'public');
const glue = readFileSync(join(PUBLIC, 'swmm6wasm.js'), 'utf8');
const wasmBinary = readFileSync(join(PUBLIC, 'swmm6wasm.wasm'));
globalThis.self = globalThis;
const wasmModule = new WebAssembly.Module(wasmBinary);
const factory = new Function(glue + '\n;return typeof createModule === "function" ? createModule : createOpenSwmm2D;')();
const Module = await factory({
    noInitialRun: true,
    print: () => {}, printErr: () => {},
    instantiateWasm(imports, receiveInstance) {
        const instance = new WebAssembly.Instance(wasmModule, imports);
        receiveInstance(instance, wasmModule);
        return instance.exports;
    },
});

const inp = readFileSync(join(ROOT, 'models', 'Weirs', '2_Weirs_4Subs.inp'), 'utf8');
Module.FS.writeFile('/in.inp', inp);
const c = Module.cwrap.bind(Module);
const create = c('swmm_engine_create', 'number', []);
const open = c('swmm_engine_open', 'number', ['number', 'string', 'string', 'string', 'number']);
const initialize = c('swmm_engine_initialize', 'number', ['number']);
const start = c('swmm_engine_start', 'number', ['number', 'number']);
const stride = c('swmm_engine_stride', 'number', ['number', 'number', 'number']);
const end = c('swmm_engine_end', 'number', ['number']);
const report = c('swmm_engine_report', 'number', ['number']);
const close = c('swmm_engine_close', 'number', ['number']);

const eng = create();
console.log('open:', open(eng, '/in.inp', '/rpt.rpt', '/out.out', 0));
console.log('initialize:', initialize(eng));
console.log('start:', start(eng, 1));
const p = Module._malloc(8);
console.log('stride:', stride(eng, 10000000, p));
const safeStat = () => { try { return Module.FS.stat('/rpt.rpt').size; } catch { return 'missing'; } };
console.log('rpt after stride:', safeStat());
console.log('end:', end(eng));
console.log('rpt after end:', safeStat());
console.log('report:', report(eng));
console.log('rpt after report:', safeStat());
const content = Module.FS.readFile('/rpt.rpt', { encoding: 'latin1' });
console.log('rpt content length:', content.length, '| head:', JSON.stringify(content.slice(0, 120)));
console.log('close:', close(eng));
console.log('rpt after close:', safeStat());
