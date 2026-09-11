// estimate-footprint.mjs — walks benchmark/models/**/ *.inp and estimates, per
// model and in aggregate, the disk footprint the benchmark runs will allocate:
//   - .out binary results (deterministic function of object counts + periods)
//   - .rpt text report (heuristic; calibrate with run-bench.mjs results)
// plus per-model compute-load proxies (sim duration, routing-step count).
//
// Usage: node benchmark/estimate-footprint.mjs [--models <dir>] [--out <dir>]

import { readdirSync, statSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    parseInp, simDurationSeconds, reportPeriods,
    outSizeEstimate, routingStepsEstimate, rptSizeEstimate,
} from './lib/inp-analyze.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const arg = (name, dflt) => {
    const i = process.argv.indexOf(name);
    return i !== -1 ? process.argv[i + 1] : dflt;
};
const MODELS_DIR = arg('--models', join(ROOT, 'models'));
const OUT_DIR = arg('--out', join(ROOT, 'results'));

function walkInp(dir, acc = []) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walkInp(p, acc);
        else if (/\.inp$/i.test(e.name)) acc.push(p);
    }
    return acc;
}

const files = walkInp(MODELS_DIR).sort();
const rows = [];
for (const path of files) {
    const rel = relative(MODELS_DIR, path);
    const folder = rel.split(/[\\/]/)[0];
    let text;
    try { text = readFileSyncUtf8(path); } catch { text = null; }
    if (text === null) { rows.push({ rel, folder, error: 'unreadable' }); continue; }

    const m = parseInp(text);
    const dur = simDurationSeconds(m);
    const periods = reportPeriods(m, dur);
    const outBytes = outSizeEstimate(m, periods);
    const rptBytes = rptSizeEstimate(m);
    const rSteps = routingStepsEstimate(m, dur);
    const flags = [];
    if (dur === null) flags.push('no-end-date');
    else if (dur === 0) flags.push('zero-duration');
    if (m.options.VARIABLE_STEP && Number(m.options.VARIABLE_STEP) > 0) flags.push('variable-step');
    if (m.options.THREADS) flags.push('threads=' + m.options.THREADS);
    const missingAux = m.fileRefs.filter(f => {
        const base = f.split(/[\\/]/).pop();
        return !exists(join(dirname(path), f)) && !exists(join(MODELS_DIR, f))
            && !exists(join(MODELS_DIR, base));
    });
    if (m.fileRefs.length) flags.push(`file-refs=${m.fileRefs.length}` + (missingAux.length ? `(missing ${missingAux.length})` : ''));
    rows.push({
        rel, folder,
        inpBytes: statSync(path).size,
        subcatchments: m.counts.subcatchments, nodes: m.counts.nodes,
        links: m.counts.links, pollutants: m.counts.pollutants,
        durationH: dur === null ? null : +(dur / 3600).toFixed(2),
        periods, outEstBytes: outBytes, rptEstBytes: rptBytes, routingSteps: rSteps,
        flags: flags.join(',') || null,
    });
}

function readFileSyncUtf8(p) {
    const b = readFileSync(p);
    // tolerate UTF-8 BOM and mostly-ASCII content
    return b.toString('utf8');
}
function exists(p) { try { statSync(p); return true; } catch { return false; } }

// ---- aggregation ----------------------------------------------------------
const fmt = n => n.toLocaleString('en-US');
const mib = n => (n / (1024 * 1024)).toFixed(1) + ' MiB';
const gib = n => (n / (1024 ** 3)).toFixed(2) + ' GiB';

const ok = rows.filter(r => !r.error && r.durationH !== null);
const bad = rows.filter(r => r.error || r.durationH === null);
const total = pick => rows.reduce((a, r) => a + (r[pick] || 0), 0);

const perFolder = {};
for (const r of ok) {
    const f = perFolder[r.folder] ??= { models: 0, inp: 0, out: 0, rpt: 0, steps: 0 };
    f.models++; f.inp += r.inpBytes; f.out += r.outEstBytes; f.rpt += r.rptEstBytes; f.steps += r.routingSteps;
}

mkdirSync(OUT_DIR, { recursive: true });
const json = { generatedAt: new Date().toISOString(), modelsDir: MODELS_DIR,
    totals: {
        inpFiles: rows.length, ok: ok.length, bad: bad.length,
        inpBytes: total('inpBytes'), outEstBytes: total('outEstBytes'),
        rptEstBytes: total('rptEstBytes'), routingSteps: total('routingSteps'),
    },
    perFolder, rows };
writeFileSync(join(OUT_DIR, 'footprint.json'), JSON.stringify(json, null, 1));

const csvHead = 'rel,folder,inpBytes,subcatchments,nodes,links,pollutants,durationH,periods,outEstBytes,rptEstBytes,routingSteps,flags';
const csv = [csvHead, ...rows.map(r => [r.rel, r.folder, r.inpBytes ?? '', r.subcatchments ?? '', r.nodes ?? '',
    r.links ?? '', r.pollutants ?? '', r.durationH ?? '', r.periods ?? '', r.outEstBytes ?? '',
    r.rptEstBytes ?? '', r.routingSteps ?? '', r.flags ?? ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
writeFileSync(join(OUT_DIR, 'footprint.csv'), csv);

// ---- report ---------------------------------------------------------------
console.log(`Models parsed: ${rows.length} (${ok.length} analyzable, ${bad.length} skipped)`);
console.log(`Input (.inp) total:      ${gib(total('inpBytes'))}`);
console.log(`.out estimate (exact):   ${gib(total('outEstBytes'))}`);
console.log(`.rpt estimate (heuristic):${gib(total('rptEstBytes'))}`);
console.log(`Combined results+reports: ${gib(total('outEstBytes') + total('rptEstBytes'))}`);
console.log(`Total routing steps:     ${fmt(total('routingSteps'))}`);
console.log('\nPer folder (models | inp | .out est | .rpt est):');
for (const [f, v] of Object.entries(perFolder).sort((a, b) => b[1].out - a[1].out))
    console.log(`  ${f.padEnd(20)} ${String(v.models).padStart(5)}  ${mib(v.inp).padStart(11)}  ${mib(v.out).padStart(11)}  ${mib(v.rpt).padStart(11)}`);

const top = [...ok].sort((a, b) => b.outEstBytes - a.outEstBytes).slice(0, 15);
console.log('\nTop 15 .out footprints:');
for (const r of top)
    console.log(`  ${mib(r.outEstBytes).padStart(11)}  ${r.rel}  (${r.periods} periods, ${r.durationH} h)`);

if (bad.length) {
    console.log(`\nSkipped (${bad.length}):`);
    for (const r of bad.slice(0, 20)) console.log(`  ${r.rel} [${r.error || 'no-end-date'}]`);
    if (bad.length > 20) console.log(`  ... and ${bad.length - 20} more`);
}
const flagCounts = {};
for (const r of ok) for (const f of (r.flags || '').split(',')) if (f) flagCounts[f.split('=')[0]] = (flagCounts[f.split('=')[0]] || 0) + 1;
if (Object.keys(flagCounts).length) {
    console.log('\nFlags across models:');
    for (const [k, v] of Object.entries(flagCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
}
console.log(`\nWrote ${join(OUT_DIR, 'footprint.json')} and footprint.csv`);
