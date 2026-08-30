// probe-1d.mjs — run a 1D-only INP through the engine, dump the node heads.
import { readFileSync } from 'node:fs';

const inpPath = process.argv[2];
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
    nodeDepths: Module.cwrap('swmm_node_get_depths_bulk', 'number', ['number', 'number', 'number'])
};
const engine = api.create();
Module.FS.writeFile('/m.inp', readFileSync(inpPath, 'utf8'));
console.log('open:', api.open(engine, '/m.inp', '/m.rpt', '/m.out', 0));
api.initialize(engine);
api.start(engine, 0);
const n = api.nodeCount(engine);
const el = Module._malloc(8);
const hp = Module._malloc(n * 8), dp = Module._malloc(n * 8);
let t = 0, it = 0;
const out = [];
while (true) {
    const err = api.stride(engine, 1, el);
    t = Module.getValue(el, 'double');
    if (err !== 0 || t <= 0) break;
    api.nodeHeads(engine, hp, n);
    api.nodeDepths(engine, dp, n);
    const h0 = Module.getValue(hp, 'double'), d0 = Module.getValue(dp, 'double');
    if (it % 2 === 0) out.push(`t=${(t * 86400).toFixed(0)}s J1h=${(h0 * 0.3048).toFixed(3)}m J1d=${(d0 * 0.3048).toFixed(3)}m`);
    if (++it > 80) break;
}
api.end(engine); api.close(engine); api.destroy(engine);
console.log(out.join('\n'));
