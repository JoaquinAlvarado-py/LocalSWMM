// check-html-ids.mjs — quick integrity check for index.html after edits
import { readFileSync } from 'node:fs';
const s = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const ids = [...s.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
console.log('total ids:', ids.length, 'duplicates:', JSON.stringify([...new Set(dup)]));
for (const id of ['uploaded-layers-list', 'uploaded-layers-empty', 'epsg-select', 'epsg-code-input',
    'opt-tab-btn-fv', 'opt-minimum-step', 'opt-tab-fv']) {
    console.log(id, s.includes('id="' + id + '"') ? 'OK' : 'MISSING');
}
console.log('FV option hidden:', /value="FV" hidden/.test(s));
console.log('FV tab hidden:', s.includes('data-tab="fv" hidden'));
// script tag versions bumped
for (const f of ['ui.js', 'results.js', 'importers.js', 'app.js', 'layerTree.js', 'inpExporter.js']) {
    const m = s.match(new RegExp('src="' + f.replace('.', '\\.') + '\\?v=(\\d+)"'));
    console.log(f, 'v=' + (m ? m[1] : 'NOT FOUND'));
}
console.log('styles.css v=' + (s.match(/styles\.css\?v=(\d+)/) || [])[1]);
