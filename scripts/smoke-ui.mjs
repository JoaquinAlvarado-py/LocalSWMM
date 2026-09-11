// smoke-ui.mjs — headless-Chrome smoke test for the six UI fixes:
//   1. layer manager APIs exist and render rows
//   2. EPSG dropdown populated + suggested from map center
//   3. FV tab + FV routing option hidden
//   4. Minimum Step field is text with dot decimals
//   5. palette collapse toggles the grid column class
//   6. lock click keeps results-content intact + shows toast
// Usage: node scripts/smoke-ui.mjs  (starts server.py if needed)
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => p && existsSync(p));
// 8080 is commonly occupied (AgentService.exe binds 0.0.0.0:8080 on some
// hosts → bind fails with WinError 10013); prefer an uncommon port.
const APP_PORT = Number(process.env.PORT || 8180);
const CDP_PORT = Number(process.env.CDP_PORT || 9226);
const CDP_HTTP = `http://127.0.0.1:${CDP_PORT}`;
const APP_URL = `http://127.0.0.1:${APP_PORT}/`;
const PROFILE = join(process.env.TEMP || '/tmp', 'smoke-ui-' + Date.now());

class CDP {
    constructor(ws) { this.ws = ws; this.nextId = 0; this.pending = new Map(); ws.onmessage = ev => this._onMessage(JSON.parse(ev.data)); }
    static connect(url) { const ws = new WebSocket(url); return new Promise((res, rej) => { ws.onopen = () => res(new CDP(ws)); ws.onerror = e => rej(new Error('CDP connect failed')); }); }
    _onMessage(msg) { if (msg.id && this.pending.has(msg.id)) { const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result || {}); } }
    send(method, params = {}, sessionId) { const id = ++this.nextId; const req = { id, method, params }; if (sessionId) req.sessionId = sessionId; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify(req)); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); } }, 30000); }); }
}
async function probe(url) {
    try {
        const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
        return r.ok;
    } catch { return false; }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function evalInPage(cdp, sessionId, expression) {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false }, sessionId);
    if (r.exceptionDetails) throw new Error('Page exception: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result ? r.result.value : undefined;
}

const consoleErrors = [];
let server = null, chrome = null, cdp = null;
let failures = 0;
const assert = (name, cond, detail) => {
    if (cond) console.log(`  ok  ${name}`);
    else { failures++; console.log(`  FAIL ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); }
};

try {
    if (!(await probe(`http://127.0.0.1:${APP_PORT}/api/status`))) {
        server = spawn('python', ['server.py'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, PORT: String(APP_PORT) } });
        for (let i = 0; i < 30 && !(await probe(`http://127.0.0.1:${APP_PORT}/api/status`)); i++) await sleep(500);
    }
    if (!(await probe(`${CDP_HTTP}/json/version`))) {
        if (!CHROME) throw new Error('No Chrome/Edge executable found for the smoke test');
        console.log(`[smoke] launching ${CHROME}`);
        chrome = spawn(CHROME, [`--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`,
            '--no-first-run', '--disable-default-apps', '--disable-background-networking', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
        chrome.on('error', e => console.error('[smoke] browser spawn error:', e.message));
        for (let i = 0; i < 60 && !(await probe(`${CDP_HTTP}/json/version`)); i++) await sleep(500);
    }
    const version = await (await fetch(`${CDP_HTTP}/json/version`)).json();
    cdp = await CDP.connect(version.webSocketDebuggerUrl);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);

    await cdp.send('Page.navigate', { url: APP_URL }, sessionId);
    await evalInPage(cdp, sessionId, `new Promise(r => { if (document.readyState === 'complete') r(); else addEventListener('load', r); })`);
    await evalInPage(cdp, sessionId, `addEventListener('error', e => { (window.__smokeErrors = window.__smokeErrors || []).push(String(e.message)); }); addEventListener('unhandledrejection', e => { (window.__smokeErrors = window.__smokeErrors || []).push(String(e.reason)); });`);
    await sleep(2500); // let mapbox + scripts settle

    console.log('1) layer manager');
    assert('LayerTree API', await evalInPage(cdp, sessionId, `typeof window.LayerTree.refresh === 'function' && typeof window.LayerTree.rows === 'function'`));
    assert('overlay ops exposed', await evalInPage(cdp, sessionId,
        `['updateOverlayLayer','removeOverlayLayer','zoomToOverlayLayer','updateMasterPlanStyle','removeMasterPlan'].every(k => typeof window[k] === 'function')`));
    const seedRows = await evalInPage(cdp, sessionId, `(() => {
        window.App.importedLayers = [{ name: 'smoke.shp', geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-71.25, -29.9] } }] }, style: {} }];
        window.LayerTree.refresh();
        return { rows: window.LayerTree.rows().length, dom: document.getElementById('uploaded-layers-list').children.length };
    })()`);
    assert('manager renders seeded layer', seedRows.rows === 1 && seedRows.dom === 1, seedRows);

    console.log('2) EPSG dropdown');
    const epsg = await evalInPage(cdp, sessionId, `(() => {
        const sel = document.getElementById('epsg-select');
        const input = document.getElementById('epsg-code-input');
        window.EpsgSuggest();
        const opts = sel.querySelectorAll('option').length;
        const south = sel.querySelector('option[value="EPSG:32719"]');
        return { opts, has32719: !!south, inputVal: input.value, customPresent: !!sel.querySelector('option[value=custom]'),
                 inputHiddenAfterSuggest: input.classList.contains('hidden') };
    })()`);
    assert('120 UTM zones + extras', epsg.opts >= 125, epsg.opts);
    assert('EPSG:32719 present', epsg.has32719);
    assert('suggest fills input (Chile default view)', String(epsg.inputVal).startsWith('EPSG:'), epsg);
    assert('custom code option present', epsg.customPresent);

    console.log('3) FV options hidden');
    const fv = await evalInPage(cdp, sessionId, `(() => {
        const tab = document.getElementById('opt-tab-btn-fv');
        const opt = document.querySelector('#opt-flow-routing option[value="FV"]');
        return { tabHidden: tab.hidden || tab.offsetParent === null, optHidden: opt.hidden };
    })()`);
    assert('FV tab hidden', fv.tabHidden, fv);
    assert('FV routing option hidden', fv.optHidden, fv);
    assert('FV option still settable programmatically', await evalInPage(cdp, sessionId,
        `(() => { const fr = document.getElementById('opt-flow-routing'); fr.value='FV'; const ok = fr.value==='FV'; fr.value=''; return ok; })()`));

    console.log('4) Minimum Step dot decimals');
    const minStep = await evalInPage(cdp, sessionId, `(() => {
        const el = document.getElementById('opt-minimum-step');
        return { type: el.type, mode: el.getAttribute('inputmode') };
    })()`);
    assert('text input with decimal mode', minStep.type === 'text' && minStep.mode === 'decimal', minStep);

    console.log('5) palette collapse re-grid');
    const pal = await evalInPage(cdp, sessionId, `(() => {
        const grid = document.getElementById('app-grid');
        document.getElementById('btn-collapse-palette').click();
        const collapsed = grid.classList.contains('palette-collapsed');
        const cols = getComputedStyle(grid).gridTemplateColumns.split(' ')[0];
        document.getElementById('btn-reopen-palette').click();
        const restored = !grid.classList.contains('palette-collapsed');
        return { collapsed, firstCol: cols.trim(), restored };
    })()`);
    assert('grid class toggles', pal.collapsed && pal.restored, pal);
    assert('column width collapses to 0', pal.collapsed && pal.firstCol === '0px', pal);

    console.log('6) lock keeps results');
    const lock = await evalInPage(cdp, sessionId, `(() => {
        const container = document.getElementById('results-content');
        container.innerHTML = '<div class="rv-card">FAKE RESULTS</div>';
        window.App.outData = { fake: true };
        window.App.results = { fake: true };
        document.getElementById('btn-lock-network').click();
        const preserved = container.innerHTML.indexOf('FAKE RESULTS') !== -1;
        const toast = document.getElementById('app-toast');
        const toastShown = !!toast && toast.classList.contains('visible');
        document.getElementById('btn-lock-network').click(); // unlock again
        return { preserved, toastShown, warningDiv: !!container.querySelector('.results-warning') };
    })()`);
    assert('results-content preserved on lock', lock.preserved, lock);
    assert('toast shown', lock.toastShown, lock);
    assert('no results-warning wiped into content', !lock.warningDiv, lock);

    const errs = await evalInPage(cdp, sessionId, `window.__smokeErrors || []`);
    assert('no page errors during interactions', errs.length === 0, errs);

    console.log(failures === 0 ? '\nSMOKE PASS' : `\n${failures} FAILURE(S)`);
    process.exitCode = failures === 0 ? 0 : 1;
} finally {
    try { cdp && cdp.ws.close(); } catch { }
    if (chrome) { try { chrome.kill(); } catch { } }
    if (server) { try { server.kill(); } catch { } }
}
