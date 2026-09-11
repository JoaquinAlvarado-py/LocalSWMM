// test-layer-tree.mjs — checks the Uploaded Layers manager (layerTree.js):
// rows are built from App.masterPlan + App.importedLayers, and each row's
// visibility/color/opacity/zoom/remove controls route into the app.js overlay
// operations (updateOverlayLayer / updateMasterPlanStyle / remove*).
// Standalone Node assertions with DOM stubs.
// Usage: node scripts/test-layer-tree.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// ---- DOM stubs -------------------------------------------------------------
function makeClassList(initial = []) {
    const set = new Set(initial);
    return {
        add: c => set.add(c),
        remove: c => set.delete(c),
        toggle: (c, force) => {
            const on = force === undefined ? !set.has(c) : !!force;
            on ? set.add(c) : set.delete(c);
            return on;
        },
        contains: c => set.has(c),
    };
}

function makeElement(tag = 'div') {
    const listeners = {};
    const el = {
        tagName: tag.toUpperCase(),
        children: [],
        dataset: {},
        style: {},
        textContent: '',
        className: '',
        classList: makeClassList(),
        hidden: false,
        title: '',
        appendChild(c) { this.children.push(c); c.parent = this; return c; },
        insertBefore(c) { this.children.unshift(c); return c; },
        addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
        dispatch(type, ev = {}) {
            (listeners[type] || []).forEach(fn => fn(ev));
        },
        focus() {},
        // innerHTML acts like a real element: setting it replaces children
        // (parsed just well enough for the fixed row template)
        set innerHTML(html) {
            this.children = [];
            this._html = html;
            const cls = html.match(/class="ms-switch([^"]*)"/);
            if (cls) this._switchToggled = /\btoggled\b/.test(cls[1]);
            this._values = {};
            const re = /<input[^>]*type="(color|range)"[^>]*value="([^"]*)"/g;
            let m;
            while ((m = re.exec(html)) !== null) this._values[m[1]] = m[2];
            const col = html.match(/<input[^>]*type="color"[^>]*value="([^"]*)"/);
            if (col) this._values.color = col[1];
        },
        get innerHTML() { return this._html || ''; },
        // querySelector over the fixed row template: order matches the
        // innerHTML produced by buildRow() in layerTree.js
        querySelector(sel) {
            const map = {
                '.ms-switch': 0,
                'input[type="color"]': 1,
                '.ov-layer-info': 2,
                'input[type="range"]': 3,
                '.zoom': 4,
                '.danger': 5,
            };
            if (map[sel] === undefined) return null;
            while (this.children.length < 6) {
                const c = makeElement('input');
                this.appendChild(c);
            }
            const c = this.children[map[sel]];
            if (sel === '.ms-switch') {
                c.classList = makeClassList(['ms-switch'].concat(this._switchToggled ? ['toggled'] : []));
            } else if (sel === 'input[type="color"]') {
                c.value = this._values.color || '';
            } else if (sel === 'input[type="range"]') {
                c.value = this._values.range || '';
            }
            return c;
        },
        remove() {},
    };
    return el;
}

const elements = {};
const byId = (id) => (elements[id] = elements[id] || makeElement());
const documentStub = {
    getElementById: byId,
    createElement: makeElement,
    readyState: 'complete',
    addEventListener() {},
};

const calls = { update: [], master: [], remove: [], removeMaster: 0 };
const sandbox = {
    window: {},
    document: documentStub,
    confirm: () => true,
    setTimeout,
};
sandbox.window.map = {};
sandbox.window.App = {
    masterPlan: { features: [{}, {}, {}] },
    masterPlanStyle: { color: '#111111' },
    importedLayers: [
        { name: 'cad_parcelas.dxf', geojson: { features: [{}] }, style: { visible: true, opacity: 0.8, color: '#22cc88' } },
        { name: 'red.shp', geojson: { features: [{}, {}] }, style: {} },
    ],
};
sandbox.window.updateOverlayLayer = (name, patch) => calls.update.push([name, patch]);
sandbox.window.updateMasterPlanStyle = (patch) => calls.master.push(patch);
sandbox.window.removeOverlayLayer = (name) => calls.remove.push(name);
sandbox.window.removeMasterPlan = () => { calls.removeMaster++; };
sandbox.window.zoomToOverlayLayer = () => {};
sandbox.window.zoomToMasterPlan = () => {};
vm.createContext(sandbox);

const src = readFileSync(new URL('../public/layerTree.js', import.meta.url), 'utf8');
vm.runInContext(src, sandbox);
const LayerTree = sandbox.window.LayerTree;

let failures = 0;
const assert = (name, cond, detail) => {
    if (cond) console.log(`  ok  ${name}`);
    else { failures++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
};

console.log('rows()');
{
    const rows = LayerTree.rows();
    assert('3 rows (master plan + 2 imports)', rows.length === 3, `got ${rows.length}`);
    assert('master plan first', rows[0].kind === 'masterplan' && rows[0].count === 3);
    assert('import names preserved', rows[1].name === 'cad_parcelas.dxf' && rows[2].name === 'red.shp');
}

console.log('refresh() rendering');
{
    LayerTree.refresh();
    const list = byId('uploaded-layers-list');
    assert('empty hint hidden when layers exist', byId('uploaded-layers-empty').classList.contains('hidden') === true);
    assert('one row per layer', list.children.length === 3, `got ${list.children.length}`);
    const row = list.children[0];
    const sw = row.querySelector('.ms-switch');
    assert('master plan row reflects saved color', row.querySelector('input[type="color"]').value === '#111111',
        `got ${row.querySelector('input[type="color"]').value}`);
    sw.dispatch('click', { currentTarget: sw });
    assert('visibility toggle routes to master plan style', calls.master.some(p => p.visible === false),
        JSON.stringify(calls.master));
    assert('switch class follows state', sw.classList.contains('toggled') === false);
}

console.log('constraint row controls');
{
    const row = byId('uploaded-layers-list').children[1]; // cad_parcelas.dxf
    const color = row.querySelector('input[type="color"]');
    color.dispatch('input', { target: { value: '#ff0000' } });
    assert('color change routed', calls.update.some(([n, p]) => n === 'cad_parcelas.dxf' && p.color === '#ff0000'),
        JSON.stringify(calls.update));

    const range = row.querySelector('input[type="range"]');
    range.dispatch('input', { target: { value: '0.5' } });
    assert('opacity change routed', calls.update.some(([n, p]) => n === 'cad_parcelas.dxf' && p.opacity === 0.5));

    const danger = row.querySelector('.danger');
    danger.dispatch('click');
    assert('remove routed after confirm', calls.remove.includes('cad_parcelas.dxf'), JSON.stringify(calls.remove));
}

console.log('empty state');
{
    sandbox.window.App.importedLayers = [];
    sandbox.window.App.masterPlan = null;
    LayerTree.refresh();
    assert('empty hint shown with no layers', byId('uploaded-layers-empty').classList.contains('hidden') === false);
    assert('no rows rendered', byId('uploaded-layers-list').children.length === 0);
}

console.log(failures === 0 ? '\nPASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
