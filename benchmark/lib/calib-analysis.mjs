// calib-analysis.mjs — explore ms/step vs elements split by step mode
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = join(ROOT, 'results');
const fp = JSON.parse(readFileSync(join(R, 'footprint.json'), 'utf8'));
const byRel = Object.fromEntries(fp.rows.map(r => [r.rel, r]));

function loadRuns(tag) {
    const f = join(R, `runs-t${tag}.jsonl`);
    const byRel = {};
    for (const line of readFileSync(f, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try { const r = JSON.parse(line); byRel[r.rel] = r; } catch { }
    }
    return byRel;
}
const t4 = loadRuns(4);

console.log('rel | varStep | el | staticSteps | simMs | ms/step(static) | ms/step/el');
for (const [rel, r] of Object.entries(t4)) {
    if (!r.ok) continue;
    const f = byRel[rel];
    const el = (f?.nodes ?? 0) + (f?.links ?? 0) + (f?.subcatchments ?? 0);
    const steps = f?.routingSteps ?? 0;
    if (!steps || !r.simMs) continue;
    const vari = /variable-step/.test(f.flags || '');
    const mps = r.simMs / steps;
    console.log(`${rel.slice(0, 44).padEnd(45)} ${vari ? 'VAR' : 'FIX'} el=${String(el).padStart(5)} steps=${String(steps).padStart(9)} sim=${String(r.simMs).padStart(7)}ms mps=${mps.toFixed(4)} mps/el=${(mps / Math.max(el, 1)).toFixed(5)}`);
}
