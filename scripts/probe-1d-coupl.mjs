// probe-1d-coupl.mjs — replicate the split's 1D-side load (setPondArea on all
// nodes + setLatInflow per window) and measure per-stride elapsed advance.
// Answers: does the 1D engine degrade its routing step under coupling load
// despite VARIABLE_STEP NO?
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const inpText = readFileSync(join(ROOT, 'public/webgpu/fixtures/bellinge.inp'), 'utf8');
const inp1d = inpText
    .replace(/(^|\n)\[2D_[A-Z_]+\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
    .replace(/(^|\n)\[2D_OPTIONS\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
    .replace(/ALLOW_PONDING\s+NO/i, 'ALLOW_PONDING        YES')
    .replace(/^VARIABLE_STEP\s+\S+.*$/mi, 'VARIABLE_STEP        NO')
    .replace(/^(ROUTING_STEP\s+.*)$/mi, '$1\nVARIABLE_STEP        NO');

const glue = readFileSync(new URL('../public/openswmm2d.js', import.meta.url), 'utf8');
globalThis.self = globalThis;
globalThis.window = globalThis;
const factory = new Function(glue + ';return createOpenSwmm2D;')();
const wasmBinary = readFileSync(new URL('../public/openswmm2d.wasm', import.meta.url));
const wasmModule = new WebAssembly.Module(wasmBinary);
const Module = await factory({
    wasmBinary,
    instantiateWasm(imports, receiveInstance) { const i = new WebAssembly.Instance(wasmModule, imports); receiveInstance(i, wasmModule); return i.exports; },
    locateFile: f => 'openswmm2d.wasm',
    print: () => {}, printErr: () => {}
});
const api = {
    create: Module.cwrap('swmm_engine_create', 'number', []),
    open: Module.cwrap('swmm_engine_open', 'number', ['number', 'string', 'string', 'string', 'number']),
    initialize: Module.cwrap('swmm_engine_initialize', 'number', ['number']),
    start: Module.cwrap('swmm_engine_start', 'number', ['number', 'number']),
    stride: Module.cwrap('swmm_engine_stride', 'number', ['number', 'number', 'number']),
    end: Module.cwrap('swmm_engine_end', 'number', ['number']),
    close: Module.cwrap('swmm_engine_close', 'number', ['number']),
    destroy: Module.cwrap('swmm_engine_destroy', null, ['number']),
    nodeCount: Module.cwrap('swmm_node_count', 'number', ['number']),
    setLatInflow: Module.cwrap('swmm_node_set_lateral_inflow', 'number', ['number', 'number', 'number']),
    setPondArea: Module.cwrap('swmm_node_set_pond_area', 'number', ['number', 'number', 'number'])
};

const engine = api.create();
Module.FS.writeFile('/m1d.inp', inp1d);
const openCode = api.open(engine, '/m1d.inp', '/m1d.rpt', '/m1d.out', 0);
console.log('open:', openCode);
api.initialize(engine);
api.start(engine, 0);
const n = api.nodeCount(engine);
console.log('nodes:', n);

// replicate the split's setPondArea pass
for (let i = 0; i < n; i++) {
    const rc = api.setPondArea(engine, i, 3.0);
    if (rc !== 0) console.log('setPondArea', i, 'rc', rc);
}

const elPtr = Module._malloc(8);
let t = 0, prev = 0, it = 0;
let minStep = 1e9, maxStep = 0, hist = {};
while (it++ < 6000) {
    const t0 = performance.now();
    const err = api.stride(engine, 1, elPtr);
    const ms = performance.now() - t0;
    t = Module.getValue(elPtr, 'double') * 86400;
    if (err !== 0) { console.log('stride err', err, 'at', t); break; }
    if (t <= prev) continue;
    const dt = t - prev;
    prev = t;
    if (dt < minStep) minStep = dt;
    if (dt > maxStep) maxStep = dt;
    const bucket = dt < 1 ? '0-1s' : dt < 2 ? '1-2s' : dt < 4 ? '2-4s' : dt < 8 ? '4-8s' : dt < 11 ? '8-11s' : '11s+';
    hist[bucket] = (hist[bucket] || 0) + 1;
    // couple like the split: alternate inflow sign, small magnitude
    if (it % 6 === 0) {
        const v = (it / 6) % 2 ? 0.5 : -0.4;
        for (let i = 0; i < n; i++) api.setLatInflow(engine, i, v * 0.001);
    }
    if (it % 200 === 0) {
        const tHr = (t / 3600).toFixed(2);
        console.log(`step ${it}: t=${tHr}h  dt=${dt.toFixed(2)}s  stride=${ms.toFixed(2)}ms  ${JSON.stringify(hist)}`);
    }
}
const tHr = (t / 3600).toFixed(2);
console.log(`final: t=${tHr}h  minStep=${minStep.toFixed(2)}s  maxStep=${maxStep.toFixed(2)}s  ${JSON.stringify(hist)}`);
api.end(engine); api.close(engine); api.destroy(engine);
Module._free(elPtr);
