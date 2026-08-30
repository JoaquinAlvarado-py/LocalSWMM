// probe-cpl.mjs — full engine: J1 head + 2D cell-0 depth + coupling volumes per stride.
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
    depths2d: Module.cwrap('swmm_2d_get_depths_bulk', 'number', ['number', 'number']),
    massBalance: Module.cwrap('swmm_2d_get_mass_balance', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'])
};
const engine = api.create();
Module.FS.writeFile('/m.inp', readFileSync(inpPath, 'utf8'));
console.log('open:', api.open(engine, '/m.inp', '/m.rpt', '/m.out', 0));
api.initialize(engine);
api.start(engine, 0);
const n = api.nodeCount(engine);
const el = Module._malloc(8);
const hp = Module._malloc(n * 8), dp = Module._malloc(8);
const mb = Array.from({ length: 10 }, () => Module._malloc(8));
let prev1d2d = 0, prev2d1d = 0;
let t = 0, it = 0;
const rows = [];
while (true) {
    const err = api.stride(engine, 1, el);
    t = Module.getValue(el, 'double');
    if (err !== 0 || t <= 0) break;
    api.nodeHeads(engine, hp, n);
    api.depths2d(engine, dp);
    api.massBalance(engine, ...mb);
    const c1 = Module.getValue(mb[3], 'double'), c2 = Module.getValue(mb[4], 'double');
    const h0 = Module.getValue(hp, 'double'), d0 = Module.getValue(dp, 'double');
    if (it < 12 || (it > 12 && c1 - prev1d2d > 1)) {
        rows.push(`t=${(t * 86400).toFixed(0)}s J1=${(h0 * 0.3048).toFixed(3)}m c0=${d0.toFixed(3)}m 1d2d+${(c1 - prev1d2d).toFixed(1)} 2d1d+${(c2 - prev2d1d).toFixed(1)}`);
    }
    prev1d2d = c1; prev2d1d = c2;
    if (++it > 70) break;
}
api.end(engine); api.close(engine); api.destroy(engine);
console.log(rows.join('\n'));
