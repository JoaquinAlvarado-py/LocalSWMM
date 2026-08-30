// test-layer-tree.mjs — checks that LayerTree.applyResultsPreset toggles the
// correct overlays per selected 2D variable (velocity → arrows on, head →
// clean, depth → fill + isolines) and that results arrival no longer force-
// enables every overlay. Standalone Node assertions with DOM stubs.
// Usage: node scripts/test-layer-tree.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// ---- minimal DOM/localStorage/map stubs ----
const ALL_LAYER_IDS = ['m2d-velocity-arrows', 'm2d-output-vertices', 'm2d-depth-isolines', 'swmm-2d-mesh-line', 'm2d-depth-bands', 'm2d-smooth-depth-fill', 'swmm-2d-mesh-fill', 'm2d-mesh-terrain', 'm2d-static-vertices', 'm2d-elevation-isolines', 'm2d-elevation-bands'];
const layerProps = {};
const getLayer = (id) => (ALL_LAYER_IDS.includes(id) ? { id } : null);
const getLayerProp = (id, key) => (layerProps[id] || {})[key];
const makeElement = () => {
    const el = {
        children: [],
        classList: { add() {}, remove() {} },
        style: {},
        innerHTML: '',
        textContent: '',
        checked: true,
        _value: 100,
        addEventListener() {},
        querySelector(sel) {
            const out = makeElement();
            if (sel.indexOf('checkbox') !== -1) out.checked = /type="checkbox"\s+checked/.test(this.innerHTML);
            if (sel.indexOf('range') !== -1) { const m = this.innerHTML.match(/type="range" min="\d+" max="\d+" value="(\d+)"/); out.value = m ? Number(m[1]) : 100; }
            return out;
        },
        appendChild(c) { this.children.push(c); return c; },
        get value() { return this._value; }, set value(v) { this._value = v; }
    };
    return el;
};
const documentStub = {
    getElementById: makeElement,
    createElement: makeElement,
    readyState: 'complete'
};
const localStorageStub = (() => { let store = {}; return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    _dump: () => store
}; })();

const sandbox = {
    window: {},
    document: documentStub,
    localStorage: localStorageStub,
    setTimeout
};
sandbox.window.map = {
    getLayer,
    getLayoutProperty: getLayerProp,
    setLayoutProperty(id, key, val) { layerProps[id] = layerProps[id] || {}; layerProps[id][key] = val; },
    setPaintProperty() {}
};
sandbox.window.Mesh2DLayers = { ensure() {} };
sandbox.window.Mesh2DGL = { setOpacity() {} };
sandbox.window.App = { is3D: false };
vm.createContext(sandbox);

const src = readFileSync(new URL('../public/layerTree.js', import.meta.url), 'utf8');
vm.runInContext(src, sandbox);
const LayerTree = sandbox.window.LayerTree;

let failures = 0;
const assert = (name, cond, detail) => {
    if (cond) { console.log(`  ok  ${name}`); }
    else { failures++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
};
const visible = (id) => getLayerProp(id, 'visibility') === 'visible';

console.log('velocity preset');
{
    LayerTree.applyResultsPreset('velocity');
    assert('velocity-arrows visible', visible('m2d-velocity-arrows'), `got ${getLayerProp('m2d-velocity-arrows', 'visibility')}`);
    assert('cell-fill visible', visible('swmm-2d-mesh-fill'));
    assert('depth-isolines hidden', !visible('m2d-depth-isolines'));
    assert('depth-bands hidden', !visible('m2d-depth-bands'));
}
console.log('depth preset');
{
    LayerTree.applyResultsPreset('depth');
    assert('velocity-arrows hidden in depth view', !visible('m2d-velocity-arrows'));
    assert('depth-isolines visible', visible('m2d-depth-isolines'));
    assert('cell-fill visible', visible('swmm-2d-mesh-fill'));
}
console.log('head preset');
{
    LayerTree.applyResultsPreset('head');
    assert('velocity-arrows hidden', !visible('m2d-velocity-arrows'));
    assert('depth-isolines hidden', !visible('m2d-depth-isolines'));
    assert('cell-fill visible', visible('swmm-2d-mesh-fill'));
}
console.log('results arrival does not force overlays on');
{
    // results.js now calls applyResultsPreset('depth'), not enableResultsDefaults().
    // Verify enableResultsDefaults (= refresh) leaves saved state alone.
    localStorageStub._dump()['swmm-2d-layer-tree'] = JSON.stringify({ 'velocity-arrows': { visible: false, opacity: 100 } });
    LayerTree.enableResultsDefaults();
    const saved = JSON.parse(localStorageStub.getItem('swmm-2d-layer-tree') || '{}');
    assert('velocity-arrows stays hidden after results arrival', saved['velocity-arrows'] && saved['velocity-arrows'].visible === false, JSON.stringify(saved['velocity-arrows']));
}

console.log(failures === 0 ? '\nPASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
