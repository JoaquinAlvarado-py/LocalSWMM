// repro-report.mjs — reproduce the SWMM_Status_Report.rpt symptoms through the
// committed wasm engine: run the exact Bellinge 1D+2D INP and extract the
// report stats that were anomalous in the status report.
//
// Usage: node scripts/repro-report.mjs [model.inp] [--until H] [--frames N]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const inpPath = process.argv[2] || join(ROOT, 'scripts/verify-out/bellinge-2d.inp');
let untilHours = Infinity;
let framesLimit = Infinity;
for (let i = 3; i < process.argv.length; i++) {
    if (process.argv[i] === '--until') untilHours = Number(process.argv[++i]);
    else if (process.argv[i] === '--frames') framesLimit = Number(process.argv[++i]);
}

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
    report: Module.cwrap('swmm_engine_report', 'number', ['number']),
    close: Module.cwrap('swmm_engine_close', 'number', ['number']),
    destroy: Module.cwrap('swmm_engine_destroy', null, ['number']),
    cellCount: Module.cwrap('swmm_2d_triangle_count', 'number', ['number', 'number'])
};
function check(code, op) { if (code !== 0) throw new Error(`${op} failed with code ${code}`); }

const engine = api.create();
const inputPath = '/model2d.inp', reportPath = '/model2d.rpt', outputPath = '/model2d.out';
Module.FS.writeFile(inputPath, readFileSync(inpPath, 'utf8'));
check(api.open(engine, inputPath, reportPath, outputPath, 0), 'open');
check(api.initialize(engine), 'initialize');
check(api.start(engine, 1), 'start');

const countPtr = Module._malloc(4);
let nt = -1;
try { check(api.cellCount(engine, countPtr), 'cellCount'); nt = Module.getValue(countPtr, 'i32'); } catch (e) { console.error('(no 2D mesh — 1D-only run)'); }
Module._free(countPtr);

const elapsedPtr = Module._malloc(8);
let elapsedDays = 0;
const t0 = Date.now();
const maxIters = 30000000;
let iter = 0;
const untilDays = untilHours / 24;
let lastProgress = Date.now();
do {
    check(api.stride(engine, 512, elapsedPtr), 'stride');
    elapsedDays = Module.getValue(elapsedPtr, 'double');
    if (Date.now() - lastProgress > 20000) {
        const hrs = (elapsedDays * 24).toFixed(1);
        console.error(`  ... t=${hrs}h elapsed=${((Date.now() - t0) / 1000).toFixed(0)}s`);
        lastProgress = Date.now();
    }
    if (++iter > maxIters) throw new Error('iteration safety limit');
} while (elapsedDays > 0 && elapsedDays * 24 < untilHours);

let endCode = -1, reportCode = -1;
try { endCode = api.end(engine); } catch { }
try { reportCode = api.report(engine); } catch { }
const report = Module.FS.analyzePath(reportPath).exists
    ? Module.FS.readFile(reportPath, { encoding: 'utf8' }) : '';
api.close(engine);
api.destroy(engine);
Module._free(elapsedPtr);

const wallMs = Date.now() - t0;
writeFileSync(join(__dirname, 'verify-out', 'repro-report.rpt'), report);
console.error(`done: ${(elapsedDays * 24).toFixed(2)}h sim in ${(wallMs / 1000).toFixed(1)}s wall, ${nt} triangles, report len ${report.length}`);

function grab(re, from) {
    const m = report.match(re);
    return m ? m[1] : 'N/A';
}
const stats = {
    version: grab(/OPENSWMM ENGINE - VERSION ([^\n]+)/),
    nodeContinuity: grab(/Node Continuity \.{5,} ([^\n]+)/),
    flowRoutingCont: grab(/Flow Routing Continuity\s*[\s\S]*?Continuity Error \(%\) \.{5,}\s*([-\d.]+)/),
    surface2dCont: grab(/2D Surface Routing Continuity\s*[\s\S]*?Continuity Error \(%\) \.{5,}\s*([-\d.]+)/),
    exchangeInternal: grab(/Flow Continuity w\/ Exchange Internal \(%\)\s+([-\d.]+)/),
    faceKernelEvals: grab(/Face-Kernel Evals \.{3,}\s*([-\d]+)/),
    internalSteps: grab(/Internal Steps \.{3,}\s*([-\d]+)/),
    pctNotConverging: grab(/% of Steps Not Converging\s*:\s*([-\d.]+)/),
    avgIterations: grab(/Average Iterations per Step\s*:\s*([-\d.]+)/),
    outfallCapWarning: /2D outfall withdrawal was capped/.test(report)
        ? grab(/in (\d+) sync batch\(es\)/)
        : 'none',
    highestContinuityErrors: (report.match(/Node (\S+) \(([-\d.]+)%\)/g) || []).slice(0, 5)
};
console.log(JSON.stringify(stats, null, 2));
writeFileSync(join(__dirname, 'verify-out', 'repro-stats.json'), JSON.stringify(stats, null, 2));
