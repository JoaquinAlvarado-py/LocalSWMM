// summarize.mjs — aggregate footprint + calibration runs into the benchmark
// report: disk-footprint estimates and ETA for the suite with N threads.
//
// Usage: node benchmark/summarize.mjs [--threads 4]

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const R = join(ROOT, 'results');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i === -1 ? d : Number(process.argv[i + 1]); };
const THREADS = arg('--threads', 4);

const G = n => (n / 1024 ** 3).toFixed(2) + ' GiB';
const M = n => (n / 1048576).toFixed(1) + ' MiB';
const fmt = n => Math.round(n).toLocaleString('en-US');

const fp = JSON.parse(readFileSync(join(R, 'footprint.json'), 'utf8'));
const rows = fp.rows.filter(r => r.outEstBytes !== undefined);
const byRel = Object.fromEntries(rows.map(r => [r.rel, r]));
const MAX_OUT = 1.5 * 1024 ** 3;   // wasm32 shared-memory practical ceiling

const runnable = rows.filter(r => (r.outEstBytes || 0) <= MAX_OUT && r.durationH > 0);
const oversized = rows.filter(r => (r.outEstBytes || 0) > MAX_OUT);
const dead = rows.filter(r => r.durationH === 0 || r.durationH === null || r.error);
const sum = (a, k) => a.reduce((x, r) => x + (r[k] || 0), 0);

// ---- disk footprint -------------------------------------------------------
const report = [];
report.push(`# LocalSWMM wasm engine — 1729-SWMM5-Models benchmark plan`);
report.push(`\nGenerated ${new Date().toISOString()} · static analysis of ${rows.length} .inp models\n`);

report.push(`## Suite partition (wasm32 shared-memory ceiling ≈ 2 GiB)`);
report.push(`\n| set | models | .inp | .out est | .rpt est |`);
report.push(`|---|---|---|---|---|`);
report.push(`| runnable (outEst ≤ ${M(MAX_OUT)}) | ${runnable.length} | ${G(sum(runnable, 'inpBytes'))} | ${G(sum(runnable, 'outEstBytes'))} | ${G(sum(runnable, 'rptEstBytes'))} |`);
report.push(`| exceeds wasm memory | ${oversized.length} | ${G(sum(oversized, 'inpBytes'))} | ${G(sum(oversized, 'outEstBytes'))} | ${G(sum(oversized, 'rptEstBytes'))} |`);
report.push(`| no/zero duration | ${dead.length} | ${G(sum(dead, 'inpBytes'))} | ${G(sum(dead, 'outEstBytes'))} | ${G(sum(dead, 'rptEstBytes'))} |`);
report.push(`| **full suite** | **${rows.length}** | **${G(sum(rows, 'inpBytes'))}** | **${G(sum(rows, 'outEstBytes'))}** | **${G(sum(rows, 'rptEstBytes'))}** |`);

// ---- calibration runs -----------------------------------------------------
function loadRuns(tag) {
    const f = join(R, `runs-t${tag}.jsonl`);
    if (!existsSync(f)) return {};
    const byRel = {};
    for (const line of readFileSync(f, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try { const r = JSON.parse(line); byRel[r.rel] = r; } catch { }
    }
    return byRel;
}
const runsT = loadRuns(THREADS);
const runs1 = loadRuns(1);
const okT = Object.values(runsT).filter(r => r.ok && r.simMs > 0);
const ok1 = Object.values(runs1).filter(r => r.ok && r.simMs > 0);

// calibrate .rpt heuristic: ratio of measured rpt bytes to static estimate
const rptRatios = [...okT, ...ok1].filter(r => r.rptBytes && r.rptEstBytes).map(r => r.rptBytes / r.rptEstBytes);
const rptRatio = rptRatios.length ? median(rptRatios) : 1;
// compare actual .out bytes against the CURRENT footprint estimate for the
// same model (jsonl records may carry values from older formula revisions)
const outErr = [...okT, ...ok1]
    .filter(r => r.outBytes && byRel[r.rel]?.outEstBytes)
    .map(r => Math.abs(r.outBytes - byRel[r.rel].outEstBytes) / r.outBytes);

// This engine's report has no per-step counter; calibrate against the
// statically-predicted routing-step count (deterministic for fixed-step
// models; variable-step deviation is absorbed in the residual band).
const cal = okT.map(r => {
    const fpr = byRel[r.rel] ?? {};
    const el = (fpr.nodes ?? 0) + (fpr.links ?? 0) + (fpr.subcatchments ?? 0);
    const steps = fpr.routingSteps ?? 0;
    return { rel: r.rel, el, steps, msPerStep: steps ? r.simMs / steps : null, simMs: r.simMs };
}).filter(c => c.steps > 0 && c.msPerStep !== null);

report.push(`\n## Calibration sample, THREADS=${THREADS} (${okT.length} completed, ${Object.keys(runsT).length - okT.length} failed)`);
if (okT.length) {
    report.push(`\n| model | wall sim | steps | ms/step | out actual vs est |`);
    report.push(`|---|---|---|---|---|`);
    for (const r of [...okT].sort((a, b) => b.simMs - a.simMs).slice(0, 15)) {
        const est = byRel[r.rel]?.outEstBytes;
        const outDelta = r.outBytes && est ? ((r.outBytes - est) / r.outBytes * 100).toFixed(2) + '%' : 'n/a';
        const st = byRel[r.rel]?.routingSteps ?? 0;
        report.push(`| ${r.rel} | ${(r.simMs / 1000).toFixed(2)} s | ${st ? fmt(st) : 'n/a'} | ${st ? (r.simMs / st).toFixed(4) : 'n/a'} | ${outDelta} |`);
    }
    if (outErr.length) report.push(`\n- .out size formula error on completed runs: max ${(Math.max(...outErr) * 100).toFixed(2)}%, mean ${(mean(outErr) * 100).toFixed(3)}%`);
    if (rptRatios.length) report.push(`- .rpt heuristic factor (measured/estimated): median ${rptRatio.toFixed(2)}, range ${Math.min(...rptRatios).toFixed(2)}–${Math.max(...rptRatios).toFixed(2)}`);
}

// thread speedup on models present in both runs
const both = Object.keys(runsT).filter(k => runs1[k]?.ok && runsT[k]?.ok)
    .map(k => {
        const links = byRel[k]?.links ?? 0;
        return { rel: k, links, t1: runs1[k].simMs, tn: runsT[k].simMs, speedup: runs1[k].simMs / runsT[k].simMs };
    });
if (both.length) {
    report.push(`\n## THREADS 1 vs ${THREADS} (same model, same machine)`);
    report.push(`\n| model | links | t1 | t${THREADS} | speedup |`);
    report.push(`|---|---|---|---|---|`);
    for (const b of [...both].sort((x, y) => y.links - x.links)) {
        report.push(`| ${b.rel} | ${b.links} | ${(b.t1 / 1000).toFixed(2)} s | ${(b.tn / 1000).toFixed(2)} s | ${b.speedup.toFixed(2)}x |`);
    }
    // engine forces 1 thread when links < 4*threads; only larger nets can speed up
    const big = both.filter(b => b.links >= 4 * THREADS);
    if (big.length) {
        const sp = median(big.map(b => b.speedup));
        report.push(`\n- median speedup on nets with ≥ ${4 * THREADS} links (parallel-eligible): ${sp.toFixed(2)}x`);
    }
    const small = both.filter(b => b.links < 4 * THREADS);
    if (small.length) report.push(`- models below the ${4 * THREADS}-link eligibility bar run single-threaded regardless of THREADS (engine rule, statsrpt.c)`);
}

// ---- ETA ------------------------------------------------------------------
// Cost model: engine cost per routing step scales ~linearly with network
// size (nodes+links+subs). Calibrate ms/step/element from the sample, then
// correct with the measured distribution of (actual time / predicted time) —
// variable-step models shrink their time step under load, so static step
// counts are only a lower bound; the factor distribution carries that.
if (cal.length >= 5) {
    const usable = cal.filter(c => c.el >= 20);   // below ~20 elements the loop is in the noise floor
    const mpsPerEl = median(usable.map(c => c.msPerStep / c.el));
    const predict = el => Math.max(mpsPerEl * el, 0.002); // ms for one routing step
    const factors = cal.map(c => c.simMs / (c.steps * predict(c.el)));
    const fMed = median(factors), fLo = quantile(factors, 0.1), fHi = quantile(factors, 0.9);
    const fMax = Math.max(...factors);

    const etaRows = runnable.map(r => {
        const el = (r.subcatchments || 0) + (r.nodes || 0) + (r.links || 0);
        const steps = Math.max(r.routingSteps || 0, 1);
        return { rel: r.rel, folder: r.folder, steps, baseMs: steps * predict(el), etaMs: steps * predict(el) * fMed };
    });
    const baseTotal = sum0(etaRows.map(e => e.baseMs));
    const totalEta = baseTotal * fMed;
    const top = [...etaRows].sort((x, y) => y.etaMs - x.etaMs).slice(0, 10);

    const vari = runnable.filter(r => /variable-step/.test(r.flags || '')).length;
    report.push(`\n## ETA for the runnable suite with THREADS=${THREADS}`);
    report.push(`- cost model from ${usable.length} sample models: ${mpsPerEl.toFixed(5)} ms per routing step per element (median); floor 0.002 ms/step`);
    report.push(`- correction factor (measured/predicted): median ×${fMed.toFixed(2)}, P10–P90 ×${fLo.toFixed(2)}–×${fHi.toFixed(2)}, max ×${fMax.toFixed(0)}`);
    report.push(`- ${vari} of ${runnable.length} runnable models use VARIABLE_STEP: their true step count can exceed the static estimate under surcharge (the factor band absorbs this)`);
    report.push(`- **point estimate: ${dur(totalEta)}** (P10–P90: ${dur(baseTotal * fLo)} – ${dur(baseTotal * fHi)}); pathological models can exceed it (worst sample factor ×${fMax.toFixed(0)})`);
    report.push(`- per model: median ${dur(median(etaRows.map(e => e.etaMs)))}, mean ${dur(mean(etaRows.map(e => e.etaMs)))}`);
    report.push(`- sequential runs, one model at a time, on this machine (${THREADS} threads per run)`);
    report.push(`\nTop 10 slowest (drives the total):`);
    report.push(`\n| model | est. steps | ETA |`);
    report.push(`|---|---|---|`);
    for (const e of top) report.push(`| ${e.rel} | ${fmt(e.steps)} | ${dur(e.etaMs)} |`);
} else {
    report.push(`\n## ETA — insufficient calibration data (need ≥5 completed sample runs)`);
}

report.push(`\n## Full-suite (theoretical, ignoring the wasm memory ceiling)`);
report.push(`- On a native build (no 2 GiB wasm limit), all ${rows.length} models would produce ≈ ${G(sum(rows, 'outEstBytes'))} of .out + ≈ ${G(sum(rows, 'rptEstBytes') * rptRatio)} of .rpt.`);
report.push(`- The ${oversized.length} over-ceiling models are dominated by SWMM5_NCIMM stress tests and z1000Years long-duration runs.`);

const outPath = join(R, 'benchmark-report.md');
writeFileSync(outPath, report.join('\n') + '\n');
console.log(report.join('\n'));
console.log(`\n→ ${outPath}`);

function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function median(a) { return quantile(a, 0.5); }
function quantile(a, q) {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    const pos = (s.length - 1) * q, i = Math.floor(pos);
    return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (pos - i);
}
function sum0(a) { return a.reduce((x, y) => x + y, 0); }
function dur(ms) {
    const s = ms / 1000;
    if (s < 90) return s.toFixed(1) + ' s';
    const m = s / 60;
    if (m < 90) return m.toFixed(1) + ' min';
    const h = m / 60;
    if (h < 48) return h.toFixed(1) + ' h';
    return (h / 24).toFixed(1) + ' days';
}
