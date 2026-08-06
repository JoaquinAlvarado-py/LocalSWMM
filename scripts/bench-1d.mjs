// probe-1d.mjs — bare 1D stride probe through the WASM engine in Node.
// Mirrors the split's 1D build (2D sections stripped, VARIABLE_STEP pinned to 0)
// and reports wall time, stride count, sim seconds, and report step stats.
//
// Usage: node scripts/probe-1d.mjs <model.inp> [--wasm <path>] [--tag <label>] [--keep-vs]

import { readFileSync } from 'node:fs';

const [, , inpPath] = process.argv;
let wasmPath = new URL('../public/openswmm2d.wasm', import.meta.url);
let tag = inpPath;
let keepVariableStep = false;
for (let i = 3; i < process.argv.length; i++) {
    if (process.argv[i] === '--wasm') wasmPath = process.argv[i + 1];
    else if (process.argv[i] === '--tag') tag = process.argv[i + 1];
    else if (process.argv[i] === '--keep-vs') keepVariableStep = true;
}

function build1DInp(text) {
    const hasVar = /^VARIABLE_STEP\s+\S+/m.test(text);
    let out = text
        .replace(/(^|\n)\[2D_[A-Z_]+\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
        .replace(/(^|\n)\[2D_OPTIONS\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1');
    if (!keepVariableStep) {
        out = out
            .replace(/^VARIABLE_STEP\s+\S+.*$/mi, 'VARIABLE_STEP        0')
            .replace(/^(ROUTING_STEP\s+.*)$/mi, hasVar ? '$1' : '$1\nVARIABLE_STEP        0');
    }
    return out;
}

function secOf(text, key) {
    const m = text.match(new RegExp(`^\\s*${key}\\s+(\\S+)`, 'm'));
    return m ? m[1] : null;
}

function simStartSec(text) {
    const d = secOf(text, 'START_DATE'), t = secOf(text, 'START_TIME');
    if (!d || !t) return 0;
    const dp = d.split('/').map(Number), tp = t.split(':').map(Number);
    return Date.UTC(dp[2], dp[0] - 1, dp[1], tp[0], tp[1], tp[2] || 0) / 1000;
}

function simEndSec(text) {
    const s0 = simStartSec(text);
    const d = secOf(text, 'END_DATE'), t = secOf(text, 'END_TIME');
    if (!d || !t) return 3600;
    const dp = d.split('/').map(Number), tp = t.split(':').map(Number);
    const s1 = Date.UTC(dp[2], dp[0] - 1, dp[1], tp[0], tp[1], tp[2] || 0) / 1000;
    if (s1 <= s0) return 3600;
    return s1 - s0;
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

const api = {
    create: Module.cwrap('swmm_engine_create', 'number', []),
    open: Module.cwrap('swmm_engine_open', 'number', ['number', 'string', 'string', 'string', 'number']),
    initialize: Module.cwrap('swmm_engine_initialize', 'number', ['number']),
    start: Module.cwrap('swmm_engine_start', 'number', ['number', 'number']),
    stride: Module.cwrap('swmm_engine_stride', 'number', ['number', 'number', 'number']),
    end: Module.cwrap('swmm_engine_end', 'number', ['number']),
    close: Module.cwrap('swmm_engine_close', 'number', ['number']),
    destroy: Module.cwrap('swmm_engine_destroy', null, ['number'])
};

function check(code, op) { if (code !== 0) throw new Error(`${op} failed with code ${code}`); }

const raw = readFileSync(inpPath, 'utf8');
const inp = build1DInp(raw);
const simEnd = simEndSec(inp);

const engine = api.create();
const inputPath = '/probe.inp', reportPath = '/probe.rpt', outputPath = '/probe.out';
Module.FS.writeFile(inputPath, inp);
check(api.open(engine, inputPath, reportPath, outputPath, 0), 'open');
check(api.initialize(engine), 'initialize');
check(api.start(engine, 1), 'start');

const elPtr = Module._malloc(8);
let strides = 0, lastErr = 0, elapsed = 0;
const t0 = performance.now();
while (elapsed < simEnd) {
    lastErr = api.stride(engine, 1, elPtr);
    if (lastErr !== 0) break;
    elapsed = Module.getValue(elPtr, 'double') * 86400;
    strides++;
}
const wallMs = performance.now() - t0;
let endErr = -1, closeErr = -1;
try { endErr = api.end(engine); } catch { }
try { closeErr = api.close(engine); } catch { }

const report = Module.FS.readFile(reportPath, { encoding: 'utf8' });
const stats = {};
for (const key of ['Avg Internal Step', 'Total Internal Step', 'Total External Inflow', 'Final Storage', 'Continuity Error']) {
    const m = report.match(new RegExp(`^\\s*${key.replace(/ /g, '\\s+')}\\s+([^\\r\\n]+)`, 'm'));
    if (m) stats[key] = m[1].trim();
}

console.log(JSON.stringify({
    tag,
    simSeconds: simEnd,
    strides,
    wallMs: Math.round(wallMs),
    msPerStride: (wallMs / strides).toFixed(2),
    simSecPerWallSec: (simEnd / (wallMs / 1000)).toFixed(2),
    lastStrideErr: lastErr,
    endErr,
    closeErr,
    report: stats
}, null, 2));

api.destroy(engine);
