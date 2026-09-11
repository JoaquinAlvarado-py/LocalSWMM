// validate-out-size.mjs — verify the .out size formula against the repo's
// precomputed .out files (ground truth), and show THREADS distribution.
// Usage: node benchmark/lib/validate-out-size.mjs
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    parseInp, simDurationSeconds, reportPeriods, outSizeEstimate,
} from './inp-analyze.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const j = JSON.parse(readFileSync(join(ROOT, 'results', 'footprint.json'), 'utf8'));

const th = {};
for (const r of j.rows) {
    const m = (r.flags || '').match(/threads=(\S+)/);
    if (m) th[m[1]] = (th[m[1]] || 0) + 1;
}
console.log('THREADS value distribution:', JSON.stringify(th));

const big = j.rows.find(r => r.rel.includes('14600_Nodes.inp'));
console.log('14600_Nodes:', JSON.stringify(big));
const half = j.rows.find(r => r.rel.toUpperCase().includes('HALF_A_MILLION'));
console.log('HALF_A_MiLLION:', JSON.stringify(half));

// candidates: precomputed .out files from the tree whose .inp we have locally
const tree = JSON.parse(readFileSync(join(process.env.TEMP, 'models-tree.json'), 'utf8'));
const outs = (tree.tree || []).filter(f => f.type === 'blob' && /\.out$/i.test(f.path));
let matched = 0;
for (const o of outs) {
    const stem = basename(o.path).replace(/\.out$/i, '.inp');
    const local = join(ROOT, 'models', dirname(o.path), stem);
    let inpText;
    try { inpText = readFileSync(local, 'utf8'); } catch { continue; }
    const m = parseInp(inpText);
    const dur = simDurationSeconds(m);
    const periods = reportPeriods(m, dur);
    const est = outSizeEstimate(m, periods);
    const err = ((est - o.size) / o.size * 100);
    console.log(`${o.path}  actual=${o.size}  est=${est}  periods=${periods}  err=${err.toFixed(3)}%`);
    if (++matched >= 12) break;
}
if (!matched) console.log('no matching .inp found locally for precomputed .out files');
