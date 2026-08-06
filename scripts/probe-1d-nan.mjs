// probe-1d-nan.mjs — run the full 48 h 1D-only Bellinge (VARIABLE_STEP 0)
// with the split's coupling load and scan node state for NaN/Inf.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VS = process.argv[2] || '0';   // VARIABLE_STEP value to pin

const inpText = readFileSync(join(ROOT, 'public/webgpu/fixtures/bellinge.inp'), 'utf8');
const inp1d = inpText
    .replace(/(^|\n)\[2D_[A-Z_]+\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
    .replace(/(^|\n)\[2D_OPTIONS\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
    .replace(/ALLOW_PONDING\s+NO/i, 'ALLOW_PONDING        YES')
    .replace(/^VARIABLE_STEP\s+\S+.*$/mi, `VARIABLE_STEP        ${VS}`)
    .replace(/^(ROUTING_STEP\s+.*)$/mi, '$1\nVARIABLE_STEP        ' + VS);

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
    nodeHeads: Module.cwrap('swmm_node_get_heads_bulk', 'number', ['number', 'number', 'number']),
    nodeDepths: Module.cwrap('swmm_node_get_depths_bulk', 'number', ['number', 'number', 'number']),
    nodeVolumes: Module.cwrap('swmm_node_get_volumes_bulk', 'number', ['number', 'number', 'number']),
    setLatInflow: Module.cwrap('swmm_node_set_lateral_inflow', 'number', ['number', 'number', 'number']),
    setPondArea: Module.cwrap('swmm_node_set_pond_area', 'number', ['number', 'number', 'number'])
};
const engine = api.create();
Module.FS.writeFile('/m1d.inp', inp1d);
console.log('open:', api.open(engine, '/m1d.inp', '/m1d.rpt', '/m1d.out', 0));
console.log('initialize:', api.initialize(engine));
console.log('start:', api.start(engine, 0));
const n = api.nodeCount(engine);
console.log('nodes:', n, 'VARIABLE_STEP', VS);
for (let i = 0; i < n; i++) api.setPondArea(engine, i, 3.0);

const elPtr = Module._malloc(8);
const hPtr = Module._malloc(n * 8), dPtr = Module._malloc(n * 8), vPtr = Module._malloc(n * 8);
let t = 0, it = 0;
let nanAt = null, maxHead = 0;
const t0 = performance.now();
while (it++ < 20000) {
    const err = api.stride(engine, 1, elPtr);
    t = Module.getValue(elPtr, 'double') * 86400;
    if (err !== 0) { console.log('stride err', err, 'at', t.toFixed(0), 's'); break; }
    if (t >= 48 * 3600) break;
    if (it % 6 === 0) {
        const v = (it / 6) % 2 ? 0.5 : -0.4;
        for (let i = 0; i < n; i++) api.setLatInflow(engine, i, v * 0.001);
        api.nodeHeads(engine, hPtr, n);
        api.nodeDepths(engine, dPtr, n);
        api.nodeVolumes(engine, vPtr, n);
        const arr = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            arr[i] = Module.getValue(hPtr + i * 8, 'double');
            if (!Number.isFinite(arr[i])) { nanAt = nanAt || { t, kind: 'head', i }; break; }
            const d = Module.getValue(dPtr + i * 8, 'double');
            if (!Number.isFinite(d)) { nanAt = nanAt || { t, kind: 'depth', i }; break; }
            const vv = Module.getValue(vPtr + i * 8, 'double');
            if (!Number.isFinite(vv)) { nanAt = nanAt || { t, kind: 'vol', i }; break; }
            if (arr[i] > maxHead) maxHead = arr[i];
        }
        if (nanAt) break;
    }
}
const wall = (performance.now() - t0) / 1000;
console.log(`ran ${it} strides to t=${(t / 3600).toFixed(2)} h in ${wall.toFixed(1)} s (${(wall / it * 1000).toFixed(2)} ms/stride)`);
console.log('NaN/Inf:', nanAt ? `YES at t=${(nanAt.t / 3600).toFixed(2)}h node ${nanAt.i} field ${nanAt.kind}` : 'none');
console.log('max head:', maxHead.toFixed(2), 'm');
api.end(engine); api.close(engine); api.destroy(engine);
Module._free(elPtr); Module._free(hPtr); Module._free(dPtr); Module._free(vPtr);
