// bench-1d-bellinge.mjs — time the 1D WASM engine on the Bellinge network:
// per-stride cost (10 s routing step), per-window cost (6 strides), freeze
// cost (bulk node reads + JS getValue loops), and the whole 48 h run in
// 60 s windows. Answers: is the 1D CPU side the bottleneck of the split?
import { readFileSync, writeFileSync } from 'node:fs';
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
    nodeHeads: Module.cwrap('swmm_node_get_heads_bulk', 'number', ['number', 'number', 'number']),
    nodeDepths: Module.cwrap('swmm_node_get_depths_bulk', 'number', ['number', 'number', 'number']),
    nodeVolumes: Module.cwrap('swmm_node_get_volumes_bulk', 'number', ['number', 'number', 'number']),
    setLatInflow: Module.cwrap('swmm_node_set_lateral_inflow', 'number', ['number', 'number', 'number']),
    setPondArea: Module.cwrap('swmm_node_set_pond_area', 'number', ['number', 'number', 'number'])
};

const engine = api.create();
Module.FS.writeFile('/m1d.inp', inp1d);
const openCode = api.open(engine, '/m1d.inp', '/m1d.rpt', '/m1d.out', 0);
console.log('open:', openCode, '(0 = OK)');
api.initialize(engine);
api.start(engine, 0);
const n = api.nodeCount(engine);
console.log('nodes:', n);

const elPtr = Module._malloc(8);
const hPtr = Module._malloc(n * 8), dPtr = Module._malloc(n * 8), vPtr = Module._malloc(n * 8);
const readDoubles = (ptr, nn) => { const a = new Float64Array(nn); for (let i = 0; i < nn; i++) a[i] = Module.getValue(ptr + i * 8, 'double'); return a; };

const WINDOWS = 20;   // 20 x 60 s windows = 20 min sim, enough for a stable per-window cost
let tSec = 0;
let heads = new Float64Array(n), depths = new Float64Array(n), vols = new Float64Array(n);
const strideTimes = [];
const freezeTimes = [];
const windowTimes = [];
for (let w = 0; w < WINDOWS; w++) {
    const w0 = performance.now();
    let guard = 0;
    do {
        const s0 = performance.now();
        const err = api.stride(engine, 1, elPtr);
        strideTimes.push(performance.now() - s0);
        if (err !== 0) { console.log('stride err', err, 'at window', w); break; }
        tSec = Module.getValue(elPtr, 'double') * 86400;
    } while (guard++ < 5 && tSec < 86400 * 2);
    const f0 = performance.now();
    api.nodeHeads(engine, hPtr, n);
    api.nodeDepths(engine, dPtr, n);
    api.nodeVolumes(engine, vPtr, n);
    const heads = readDoubles(hPtr, n);
    const depths = readDoubles(dPtr, n);
    const vols = readDoubles(vPtr, n);
    freezeTimes.push(performance.now() - f0);
    windowTimes.push(performance.now() - w0);
    if (w % 5 === 0) console.log(`window ${w}: t=${tSec.toFixed(0)}s  stride-ms avg=${(strideTimes.slice(-6).reduce((a, b) => a + b, 0) / 6).toFixed(2)}`);
}
// Coupling-style cplF build (1020 points x 9) timing
const np = 1020;
const cplF = new Float32Array(np * 9);
const b0 = performance.now();
for (let k = 0; k < np; k++) {
    cplF[k * 9 + 0] = k; cplF[k * 9 + 1] = 2; cplF[k * 9 + 2] = 0.65;
    cplF[k * 9 + 3] = 1.5; cplF[k * 9 + 4] = heads[k % n]; cplF[k * 9 + 5] = depths[k % n]; cplF[k * 9 + 6] = vols[k % n];
    cplF[k * 9 + 7] = 0; cplF[k * 9 + 8] = 0;
}
const cplMs = performance.now() - b0;

// setLatInflow x np timing
const b1 = performance.now();
for (let k = 0; k < np; k++) api.setLatInflow(engine, k % n, 0.001);
const latMs = performance.now() - b1;

const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const strideAvg = avg(strideTimes);
const freezeAvg = avg(freezeTimes);
const windowAvg = avg(windowTimes);
console.log('----');
console.log(`stride (10s): avg ${strideAvg.toFixed(2)} ms  (n=${strideTimes.length})`);
console.log(`freeze (3 bulk + getValue x${3 * n}): avg ${freezeAvg.toFixed(2)} ms`);
console.log(`window (6 strides + freeze): avg ${windowAvg.toFixed(2)} ms`);
console.log(`cplF build (1020 pts): ${cplMs.toFixed(2)} ms`);
console.log(`setLatInflow x1020: ${latMs.toFixed(2)} ms`);
const windows48h = 48 * 3600 / 60;
console.log('----');
console.log(`projected 1D-only cost for 48 h: ${(windowAvg * windows48h / 1000).toFixed(0)} s wall`);
console.log(`  of which strides: ${(strideAvg * 6 * windows48h / 1000).toFixed(0)} s, freeze: ${(freezeAvg * windows48h / 1000).toFixed(0)} s`);
api.end(engine); api.close(engine); api.destroy(engine);
Module._free(elPtr); Module._free(hPtr); Module._free(dPtr); Module._free(vPtr);
