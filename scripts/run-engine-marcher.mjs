// run-engine-marcher.mjs — reference run of a 2D INP through the WASM engine
// in Node. Samples per-cell depth/head/velocity at frameIntervalMs cadence.
//
// Usage: node scripts/run-engine-marcher.mjs <model.inp> <out.json>
//   [--frames <N>]            limit sampled frames (default: all)
//   [--interval <sec>]        frame interval in sim seconds (default 60)
//   [--wasm <path>]           openswmm2d.wasm override

import { readFileSync, writeFileSync } from 'node:fs';

const [, , inpPath, outPath] = process.argv;
let framesLimit = Infinity;
let intervalSec = 60;
let wasmPath = new URL('../public/openswmm2d.wasm', import.meta.url);
for (let i = 4; i < process.argv.length; i++) {
    if (process.argv[i] === '--frames') framesLimit = Number(process.argv[++i]);
    else if (process.argv[i] === '--interval') intervalSec = Number(process.argv[++i]);
    else if (process.argv[i] === '--wasm') wasmPath = process.argv[++i];
}

const glue = readFileSync(new URL('../public/openswmm2d.js', import.meta.url), 'utf8');
globalThis.self = globalThis;
globalThis.window = globalThis;
const factory = new Function(glue + '\n;return typeof createOpenSwmm2D === "function" ? createOpenSwmm2D : null;')();
const wasmBinary = readFileSync(wasmPath);
const wasmModule = new WebAssembly.Module(wasmBinary);
const Module = await factory({
    wasmBinary,
    instantiateWasm(imports, receiveInstance) {
        const instance = new WebAssembly.Instance(wasmModule, imports);
        receiveInstance(instance, wasmModule);
        return instance.exports;
    },
    locateFile: file => file.endsWith('.wasm') ? 'openswmm2d.wasm' : file,
    print: () => {},
    printErr: () => {}
});

const optional = (name, ret, args) => typeof Module['_' + name] === 'function' ? Module.cwrap(name, ret, args) : null;
const api = {
    create: Module.cwrap('swmm_engine_create', 'number', []),
    open: Module.cwrap('swmm_engine_open', 'number', ['number', 'string', 'string', 'string', 'number']),
    initialize: Module.cwrap('swmm_engine_initialize', 'number', ['number']),
    start: Module.cwrap('swmm_engine_start', 'number', ['number', 'number']),
    stride: Module.cwrap('swmm_engine_stride', 'number', ['number', 'number', 'number']),
    end: Module.cwrap('swmm_engine_end', 'number', ['number']),
    report: Module.cwrap('swmm_engine_report', 'number', ['number']),
    close: Module.cwrap('swmm_engine_close', 'number', ['number']),
    destroy: Module.cwrap('swmm_engine_destroy', null, ['number']),
    cellCount: Module.cwrap('swmm_2d_triangle_count', 'number', ['number', 'number']),
    depths: Module.cwrap('swmm_2d_get_depths_bulk', 'number', ['number', 'number']),
    heads: Module.cwrap('swmm_2d_get_heads_bulk', 'number', ['number', 'number']),
    maxVelocities: Module.cwrap('swmm_2d_get_stat_max_velocities', 'number', ['number', 'number']),
    massBalance: Module.cwrap('swmm_2d_get_mass_balance', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']),
    continuityError: Module.cwrap('swmm_2d_get_continuity_error', 'number', ['number', 'number']),
    vertexCount: optional('swmm_2d_vertex_count', 'number', ['number', 'number']),
    vertexXYZ: optional('swmm_2d_vertex_get_xyz_bulk', 'number', ['number', 'number', 'number', 'number']),
    nodeCount: optional('swmm_node_count', 'number', ['number']),
    nodeHeads: optional('swmm_node_get_heads_bulk', 'number', ['number', 'number', 'number']),
    nodeIndex: optional('swmm_node_index', 'number', ['number', 'string']),
    solverSteps: optional('swmm_2d_get_solver_steps', 'number', ['number', 'number']),
    solverLastStep: optional('swmm_2d_get_solver_last_step', 'number', ['number', 'number'])
};

function check(code, op) { if (code !== 0) throw new Error(`${op} failed with code ${code}`); }
function readDoubles(ptr, count) {
    const arr = new Float64Array(count);
    for (let i = 0; i < count; i++) arr[i] = Module.getValue(ptr + i * 8, 'double');
    return arr;
}

const engine = api.create();
const inputPath = '/model2d.inp', reportPath = '/model2d.rpt', outputPath = '/model2d.out';
Module.FS.writeFile(inputPath, readFileSync(inpPath, 'utf8'));
check(api.open(engine, inputPath, reportPath, outputPath, 0), 'open');
check(api.initialize(engine), 'initialize');
check(api.start(engine, 1), 'start');

const countPtr = Module._malloc(4);
check(api.cellCount(engine, countPtr), 'cellCount');
const nt = Module.getValue(countPtr, 'i32');
Module._free(countPtr);
console.error(`engine: ${nt} triangles`);

// Mesh geometry (SI metres, post-scaling) for the GPU side.
let mesh = null;
if (api.vertexCount && api.vertexXYZ) {
    const vcPtr = Module._malloc(4);
    if (api.vertexCount(engine, vcPtr) === 0) {
        const nv = Module.getValue(vcPtr, 'i32');
        const xp = Module._malloc(nv * 8), yp = Module._malloc(nv * 8), zp = Module._malloc(nv * 8);
        if (api.vertexXYZ(engine, xp, yp, zp) === 0) {
            mesh = {
                vertices: { x: Array.from(readDoubles(xp, nv)), y: Array.from(readDoubles(yp, nv)), z: Array.from(readDoubles(zp, nv)) }
            };
        }
        Module._free(xp); Module._free(yp); Module._free(zp);
    }
    Module._free(vcPtr);
}

const depthPtr = Module._malloc(nt * 8), headPtr = Module._malloc(nt * 8), velPtr = Module._malloc(nt * 8);
const elapsedPtr = Module._malloc(8);
let nodeHeadPtr = null;
let nNodes = 0;
if (api.nodeCount && api.nodeHeads) {
    nNodes = api.nodeCount(engine);          // returns the count directly
    if (nNodes > 0) nodeHeadPtr = Module._malloc(nNodes * 8);
}
const frames = [];
let nextFrameSec = 0;
let elapsedDays = 0;
const maxIters = 10000000;
let iter = 0;
let stepsThisChunk = 1;
let lastProgress = Date.now();
do {
    check(api.stride(engine, stepsThisChunk, elapsedPtr), 'stride');
    elapsedDays = Module.getValue(elapsedPtr, 'double');
    const elapsedMs = elapsedDays * 86400000;
    const elapsedSec = elapsedDays * 86400;
    if (elapsedSec >= nextFrameSec || elapsedDays <= 0) {
        check(api.depths(engine, depthPtr), 'depths');
        check(api.heads(engine, headPtr), 'heads');
        check(api.maxVelocities(engine, velPtr), 'velocities');
        if (nodeHeadPtr) check(api.nodeHeads(engine, nodeHeadPtr, nNodes), 'nodeHeads');
        const frame = {
            tSec: elapsedSec,
            depth: Array.from(readDoubles(depthPtr, nt)),
            head: Array.from(readDoubles(headPtr, nt)),
            velocity: Array.from(readDoubles(velPtr, nt)),
            nodeHeads: nodeHeadPtr ? Array.from(readDoubles(nodeHeadPtr, nNodes)) : null
        };
        // solver stats (the dt0 / substep cadence — for the GPU-vs-engine
        // dt0-collapse investigation)
        if (api.solverSteps && api.solverLastStep) {
            const sp = Module._malloc(8), lp = Module._malloc(8);
            if (api.solverSteps(engine, sp) === 0) frame.solverSteps = Module.getValue(sp, 'i64');
            if (api.solverLastStep(engine, lp) === 0) frame.lastStep = Module.getValue(lp, 'double');
            Module._free(sp); Module._free(lp);
        }
        frames.push(frame);
        nextFrameSec = elapsedSec + intervalSec;
        if (Date.now() - lastProgress > 10000) {
            console.error(`  ... t=${(elapsedSec / 60).toFixed(1)} min, frames=${frames.length}`);
            lastProgress = Date.now();
        }
        if (frames.length >= framesLimit) break;
    }
    if (++iter > maxIters) throw new Error('iteration safety limit');
} while (elapsedDays > 0);

const mbPtr = Array.from({ length: 10 }, () => Module._malloc(8));
const contPtr = Module._malloc(8);
let massBalance = null;
if (api.massBalance ? api.massBalance(engine, ...mbPtr) === 0 : false) {
    massBalance = {
        initialVolume: Module.getValue(mbPtr[0], 'double'),
        finalVolume: Module.getValue(mbPtr[1], 'double'),
        rainfall: Module.getValue(mbPtr[2], 'double'),
        coupling1DTo2D: Module.getValue(mbPtr[3], 'double'),
        coupling2DTo1D: Module.getValue(mbPtr[4], 'double'),
        outfallIn: Module.getValue(mbPtr[5], 'double'),
        outfallOut: Module.getValue(mbPtr[6], 'double'),
        boundaryIn: Module.getValue(mbPtr[7], 'double'),
        boundaryOut: Module.getValue(mbPtr[8], 'double'),
        evaporation: Module.getValue(mbPtr[9], 'double')
    };
}
if (api.continuityError) {
    const c = api.continuityError(engine, contPtr);
    if (c === 0) massBalance.continuityError = Module.getValue(contPtr, 'double');
}
mbPtr.forEach(p => Module._free(p));
Module._free(contPtr);
// The stride API signals natural completion with the CFFI lifecycle code
// (6) — the production workers close without calling end(), so tolerate it.
let endCode = -1, reportCode = -1;
try { endCode = api.end(engine); } catch { }
try { reportCode = api.report(engine); } catch { }
const report = Module.FS.analyzePath(reportPath).exists ? Module.FS.readFile(reportPath, { encoding: 'utf8' }) : '';
api.close(engine);
api.destroy(engine);

function writeCompact(outPath) {
    const step = Math.max(1, Math.floor(frames.length / 64));
    const compact = {
        nt,
        frames: frames.filter((_, i) => i % step === 0).map(f => ({
            tSec: f.tSec,
            depth: f.depth.slice(0, 2048),
            head: f.head.slice(0, 2048),
            velocity: f.velocity.slice(0, 2048),
            nodeHeads: f.nodeHeads ? f.nodeHeads.slice(0, 2048) : null
        })),
        massBalance, frameCount: frames.length,
        frameIntervalSec: intervalSec,
        compact: true
    };
    writeFileSync(outPath, JSON.stringify(compact));
}
try {
    writeFileSync(outPath, JSON.stringify({
        nt, frames, massBalance, mesh,
        report: report,
        frameIntervalSec: intervalSec,
        endCode, reportCode
    }));
} catch (err) {
    if (String(err).includes('Invalid string length')) {
        console.error(`json too large (${frames.length} frames × ${nt} cells) — writing compact output`);
        writeCompact(outPath);
    } else throw err;
}
console.error(`done: ${frames.length} frames → ${outPath}`);
console.error(`mass: rain=${massBalance?.rainfall?.toFixed(1)} m³ final=${massBalance?.finalVolume?.toFixed(1)} m³ contErr=${massBalance?.continuityError}`);
