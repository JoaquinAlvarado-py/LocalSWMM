// bench_perf.js — Benchmark hot paths of SWMM_3D_Web_UI with a real model.inp
// Usage: node bench_perf.js <path-to-model.inp>
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const inpPath = process.argv[2] || 'C:\\Users\\joaqu\\Downloads\\model.inp';
const publicDir = path.join(__dirname, 'public');
const inpText = fs.readFileSync(inpPath, 'utf8');

// --- browser shims ---
const sandbox = {
    localStorage: { setItem() { }, getItem() { return null; }, removeItem() { } },
    document: { createElement: () => ({ style: {}, classList: { add() { }, remove() { } }, click() { } }) },
    URL: { createObjectURL: () => '', revokeObjectURL() { } },
    Blob: function () { },
    console, setTimeout, clearTimeout, Math, JSON, Date,
};
sandbox.window = sandbox; // window === global, like browsers
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function load(file) {
    const code = fs.readFileSync(path.join(publicDir, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
}

load('inpParser.js');
load('network.js');

const Net = sandbox.Net;
const inpParser = sandbox.inpParser;

function bench(label, fn, iters = 1) {
    fn(); // warmup
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < iters; i++) fn();
    const t1 = process.hrtime.bigint();
    const ms = Number(t1 - t0) / 1e6 / iters;
    console.log(`${label.padEnd(48)} ${ms.toFixed(3).padStart(10)} ms${iters > 1 ? `  (avg of ${iters})` : ''}`);
    return ms;
}

console.log(`\n=== Benchmark: ${path.basename(inpPath)} (${(inpText.length / 1024).toFixed(0)} KB) ===\n`);

// 1. Parse
let model;
bench('parse .inp', () => { model = inpParser.parse(inpText); }, 5);
console.log(`   -> nodes=${model.nodes.length} links=${model.links.length} subs=${model.subcatchments.length}\n`);

// 2. loadState (includes index build if optimized)
bench('Net.loadState (reset history)', () => {
    Net.loadState(JSON.parse(JSON.stringify({
        title: model.title, units: model.units, options: model.options,
        counters: {}, nodes: model.nodes, links: model.links,
        subcatchments: model.subcatchments, rawSections: {}
    })), true);
}, 3);

// 3. getNode lookups (simulate linksGeoJSON-scale lookup load)
const ids = Net.nodes.map(n => n.id);
bench('getNode x all-nodes x 100', () => {
    let acc = 0;
    for (let r = 0; r < 100; r++)
        for (const id of ids) { if (Net.getNode(id)) acc++; }
    return acc;
}, 3);

// 4. findAny across all element ids (nextId collision path)
const allIds = [...Net.nodes.map(n => n.id), ...Net.links.map(l => l.id), ...Net.subcatchments.map(s => s.id)];
bench('findAny x all-elements x 10', () => {
    let acc = 0;
    for (let r = 0; r < 10; r++)
        for (const id of allIds) { if (Net.findAny(id)) acc++; }
    return acc;
}, 3);

// 5. GeoJSON builds
bench('nodesGeoJSON()', () => Net.nodesGeoJSON(), 20);
bench('linksGeoJSON()', () => Net.linksGeoJSON(), 20);
bench('subcatchmentsGeoJSON()', () => Net.subcatchmentsGeoJSON(), 20);

// 6. commit (undo snapshot)
bench('commit() [forced snapshot]', () => {
    Net.title = 'T' + Math.random(); // force distinct snapshots
    Net.commit();
}, 10);

// 7. Simulated node drag: 60 mouse-move frames (moveNode + full GeoJSON rebuild = current per-pixel cost)
const dragId = Net.nodes[0].id;
const base = Net.getNode(dragId).lngLat.slice();
bench('drag frame x60 (moveNode + rebuild GeoJSON)', () => {
    for (let i = 0; i < 60; i++) {
        Net.moveNode(dragId, [base[0] + i * 1e-7, base[1]], false);
        Net.nodesGeoJSON(); Net.linksGeoJSON(); Net.subcatchmentsGeoJSON();
    }
}, 3);

// 8. Full-serialize autosave cost
bench('JSON.stringify(serialize()) [autosave]', () => JSON.stringify(Net.serialize()), 10);

// 9. undo/redo roundtrip
Net.title = 'A'; Net.commit();
Net.title = 'B'; Net.commit();
bench('undo + redo roundtrip', () => { Net.undo(); Net.redo(); }, 5);

// history memory estimate
const histBytes = (Net.history || []).reduce((a, s) => a + (typeof s === 'string' ? s.length : JSON.stringify(s).length), 0);
console.log(`\nUndo history entries: ${Net.history.length}, approx ${(histBytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`Heap used: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB\n`);
