// probe-engine.mjs — verbose step-by-step engine init to find where Node hangs.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, '..', 'public');
const step = (s) => console.log(`[t+${((performance.now() - t0) / 1000).toFixed(2)}s] ${s}`);
const t0 = performance.now();

// watchdog
setTimeout(() => { step('WATCHDOG: still alive — dumping stacks'); debugger; }, 15000).unref();

const glue = readFileSync(join(PUBLIC, 'swmm6wasm.js'), 'utf8');
const wasmBinary = readFileSync(join(PUBLIC, 'swmm6wasm.wasm'));
step(`glue ${(glue.length / 1024).toFixed(0)} KiB, wasm ${(wasmBinary.length / 1048576).toFixed(1)} MiB`);

globalThis.self = globalThis;
const wasmModule = new WebAssembly.Module(wasmBinary);
step('wasm module compiled');

const factory = new Function(glue + '\n;return typeof createModule === "function" ? createModule : createOpenSwmm2D;')();
step('factory extracted');

const Module = await factory({
    noInitialRun: true,
    print: (t) => console.log('[out]', t),
    printErr: (t) => console.log('[err]', t),
    instantiateWasm(imports, receiveInstance) {
        step('instantiateWasm called');
        const instance = new WebAssembly.Instance(wasmModule, imports);
        step('instance created');
        receiveInstance(instance, wasmModule);
        step('receiveInstance done');
        return instance.exports;
    },
    locateFile: f => f.endsWith('.wasm') ? join(PUBLIC, 'swmm6wasm.wasm') : f,
});
step('factory resolved');

const open = Module.cwrap('swmm_engine_open', 'number', ['number', 'string', 'string', 'string', 'number']);
const create = Module.cwrap('swmm_engine_create', 'number', []);
const inp = readFileSync(join(ROOT, 'models', 'Weirs', '2_Weirs_4Subs.inp'), 'utf8');
Module.FS.writeFile('/in.inp', inp);
const engine = create();
step('engine created: ' + engine);
const rc = open(engine, '/in.inp', '/rpt.rpt', '/out.out', 0);
step('open rc=' + rc);
const initialize = Module.cwrap('swmm_engine_initialize', 'number', ['number']);
const start = Module.cwrap('swmm_engine_start', 'number', ['number', 'number']);
const stride = Module.cwrap('swmm_engine_stride', 'number', ['number', 'number', 'number']);
const elPtr = Module._malloc(8);
step('initialize rc=' + initialize(engine));
step('start rc=' + start(engine, 1));
const tS = performance.now();
const err = stride(engine, 10000000, elPtr);
step(`stride rc=${err} in ${((performance.now() - tS) / 1000).toFixed(2)}s, elapsed days=${Module.getValue(elPtr, 'double')}`);
step('end rc=' + Module.cwrap('swmm_engine_end', 'number', ['number'])(engine));
step('report rc=' + Module.cwrap('swmm_engine_report', 'number', ['number'])(engine));
step('close rc=' + Module.cwrap('swmm_engine_close', 'number', ['number'])(engine));
const rpt = Module.FS.readFile('/rpt.rpt', { encoding: 'latin1' });
step(`rpt ${(rpt.length / 1024).toFixed(1)} KiB; threads line: ${(rpt.match(/^.*Number of Threads.*$/mi) || ['(none)'])[0].trim()}`);
console.log(rpt.slice(0, 800));
