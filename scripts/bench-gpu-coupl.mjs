// bench-gpu-coupl.mjs — run the production GPU worker (gpu2dWorker.js) on the
// Bellinge fixture and capture the per-window timing breakdown (strideMs /
// freezeMs / advanceMs / exchMs / dt0 / substeps). Exits after N windows and
// extrapolates the full 48 h cost.
// Usage: node scripts/bench-gpu-coupl.mjs [--windows N]
import { readFileSync, appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_PORT = 8080;
const CDP_PORT = 9225;
const CDP_HTTP = `http://127.0.0.1:${CDP_PORT}`;
const APP_URL = `http://127.0.0.1:${APP_PORT}/`;
const PROFILE = join(process.env.TEMP || 'C:\\Users\\joaqu\\AppData\\Local\\Temp', 'gpu-coupl-' + Date.now());
const LOG = join(process.env.TEMP || 'C:\\Users\\joaqu\\AppData\\Local\\Temp', 'gpu-coupl-live.log');
try { appendFileSync(LOG, ''); } catch { }
const live = (text) => { try { appendFileSync(LOG, text + '\n'); } catch { } };
const winIdx = process.argv.indexOf('--windows');
const MAX_WINDOWS = winIdx !== -1 ? parseInt(process.argv[winIdx + 1], 10) : 80;
const ltsIdx = process.argv.indexOf('--lts');
const LTS_OV = ltsIdx !== -1 ? parseInt(process.argv[ltsIdx + 1], 10) : 0;
const cadIdx = process.argv.indexOf('--cadence');
const CAD_OV = cadIdx !== -1 ? parseInt(process.argv[cadIdx + 1], 10) : 0;
const dtfIdx = process.argv.indexOf('--dtfloor');
const DTF_OV = dtfIdx !== -1 ? parseFloat(process.argv[dtfIdx + 1]) : 0;
const dbgIdx = process.argv.indexOf('--dbgcell');
const DBG_CELL = dbgIdx !== -1 ? parseInt(process.argv[dbgIdx + 1], 10) : -1;
const inpIdx = process.argv.indexOf('--inp');
const INP = inpIdx !== -1 ? join(__dirname, '..', process.argv[inpIdx + 1]) : join(__dirname, '..', 'public', 'webgpu', 'fixtures', 'bellinge.inp');
let inp = readFileSync(INP, 'utf8');
if (LTS_OV >= 1) inp = inp.replace(/^LTS_TIERS\s+\d+/m, `LTS_TIERS ${LTS_OV}`);
if (CAD_OV >= 1) inp = inp.replace(/^\[2D_OPTIONS\]/m, `[2D_OPTIONS]\nREBUILD_CADENCE ${CAD_OV}`);
if (DTF_OV > 0) inp = inp.replace(/^\[2D_OPTIONS\]/m, `[2D_OPTIONS]\nDT_FLOOR ${DTF_OV}`);
console.log(`LTS=${LTS_OV || 'inp'} REBUILD_CADENCE=${CAD_OV || 'inp'} DT_FLOOR=${DTF_OV || 'inp'}`);
const triangleCount = (inp.match(/^\[2D_TRIANGLES\]/m) ? inp.split(/^\[2D_TRIANGLES\]/m)[1].split('\n').filter(l => l.trim() && !l.trim().startsWith(';')).length : 0);

class CDP {
    constructor(ws) { this.ws = ws; this.nextId = 0; this.pending = new Map(); this.listeners = new Set(); ws.onmessage = ev => this._onMessage(JSON.parse(ev.data)); }
    static connect(url) { const ws = new WebSocket(url); return new Promise((res, rej) => { ws.onopen = () => res(new CDP(ws)); ws.onerror = e => rej(new Error('CDP connect failed: ' + (e && e.message))); }); }
    _onMessage(msg) { if (msg.id && this.pending.has(msg.id)) { const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result || {}); } if (msg.method) for (const fn of this.listeners) fn(msg); }
    send(method, params = {}, sessionId) { const id = ++this.nextId; const req = { id, method, params }; if (sessionId) req.sessionId = sessionId; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify(req)); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); } }, 2700000); }); }
    on(fn) { this.listeners.add(fn); }
}
async function httpGet(url) { const res = await fetch(url); if (!res.ok) throw new Error(`HTTP ${res.status}`); return res; }
async function probe(url) { try { await httpGet(url); return true; } catch { return false; } }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function evalInPage(cdp, sessionId, expression, awaitPromise = false) { const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, sessionId); if (r.exceptionDetails) throw new Error('Page exception: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result ? r.result.value : undefined; }

let server = null, chrome = null, cdp = null;
try {
    if (!(await probe(`http://127.0.0.1:${APP_PORT}/api/status`))) {
        server = spawn('python', ['server.py'], { cwd: ROOT, stdio: 'ignore' });
        for (let i = 0; i < 30; i++) { if (await probe(`http://127.0.0.1:${APP_PORT}/api/status`)) break; await sleep(500); }
    }
    if (!(await probe(`${CDP_HTTP}/json/version`))) {
        chrome = spawn(CHROME, [`--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`, '--no-first-run', '--disable-default-apps', '--disable-background-networking', '--window-size=1100,820', 'about:blank'], { stdio: 'ignore' });
        for (let i = 0; i < 60; i++) { if (await probe(`${CDP_HTTP}/json/version`)) break; if (chrome.exitCode !== null) throw new Error('Chrome exited early: ' + chrome.exitCode); await sleep(500); }
    }
    const version = await (await httpGet(`${CDP_HTTP}/json/version`)).json();
    cdp = await CDP.connect(version.webSocketDebuggerUrl);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.navigate', { url: APP_URL }, sessionId);
    await evalInPage(cdp, sessionId, `new Promise(r => { if (document.readyState === 'complete') r(); else addEventListener('load', r); })`);

    const result = await evalInPage(cdp, sessionId, `(async () => {
        const inp = ${JSON.stringify(inp)};
        const triangleIds = Array.from({ length: ${triangleCount} }, (_, i) => i);
        const out = { windows: [], error: null, done: null };
        const w = new Worker('webgpu/gpu2dWorker.js?v=' + Date.now());
        w.onerror = e => { out.error = 'worker-load-error: ' + (e.message || e.type || ''); };
        w.onmessage = ev => {
            const m = ev.data || {};
            if (m.type === 'progress2d' && m.timings) {
                out.windows.push(m.timings);
                if (m.timings.debugCell) {
                    (out.dbg = out.dbg || []).push(m.timings.debugCell);
                    if (out.dbg.length % 25 === 0) console.log('DBG', JSON.stringify(m.timings.debugCell));
                }
                if (out.windows.length % 200 === 0) out.snaps = out.snaps || [];
                if (out.windows.length % 200 === 0) out.snaps.push(m.timings);
            }
            else if (m.type === 'status2d') out.stage = m.stage;
            else if (m.type === 'stderr') (out.stderr = out.stderr || []).push(m.text);
            else if (m.type === 'debug') out.debug = m.text;
            else if (m.type === 'results2d') {
                const frames = m.frames || [];
                const lastF = frames[frames.length - 1];
                let nanDepth = 0, nanHead = 0, maxD = 0, firstNan = -1, firstNanCell = -1, firstNanT = 0;
                for (let f = 0; f < frames.length; f++) {
                    const d = frames[f].depth, h = frames[f].head;
                    if (!d) continue;
                    for (let i = 0; i < d.length; i++) {
                        if (!Number.isFinite(d[i])) {
                            nanDepth++;
                            if (firstNan < 0) { firstNan = f; firstNanCell = i; firstNanT = frames[f].elapsedMs; }
                        }
                        if (h && !Number.isFinite(h[i])) nanHead++;
                        if (Number.isFinite(d[i]) && d[i] > maxD) maxD = d[i];
                    }
                }
                out.done = { frames: frames.length, last: lastF && lastF.elapsedMs, nanDepth, nanHead, maxD, firstNan, firstNanCell, firstNanT, mb: m.diagnostics && m.diagnostics.massBalance };
            }
            else if (m.type === 'error') out.error = m.message;
        };
        w.postMessage({ type: 'run2d', inp, triangleIds, meshFile: null, triangleVertices: null, dryDepth: 0.001, wantVertexFields: true, frameIntervalMs: 60000, debugCell: ${DBG_CELL} });
        const deadline = Date.now() + 40 * 60 * 1000;
        while (Date.now() < deadline && !out.done && !out.error && out.windows.length < ${MAX_WINDOWS}) await new Promise(r => setTimeout(r, 2000));
        w.terminate();
        return out;
    })()`, true);
    const wins = result.windows || [];
    console.log('windows captured:', wins.length);
    if ((result.dbg || []).length) {
        const dbg = result.dbg.filter(d => d && typeof d.v === 'number');
        console.log('debugCell samples:', dbg.length);
        const step = Math.max(1, Math.floor(dbg.length / 24));
        for (let i = 0; i < dbg.length; i += step) {
            const d = dbg[i];
            console.log(`  t=${d.t}s v=${d.v.toExponential(3)} h=${d.h.toExponential(3)} d=${d.d.toExponential(3)} qx=${d.qx.toExponential(3)} qy=${d.qy.toExponential(3)}`);
        }
        if (dbg.length) console.log('  LAST:', JSON.stringify(dbg[dbg.length - 1]));
    }
    if ((result.snaps || []).length) {
        console.log('snapshot every 200 windows (win=s window length, dt0, advanceMs):');
        for (const s of result.snaps) console.log(`  win=${s.win}s dt0=${s.dt0 !== undefined && s.dt0 !== null ? s.dt0.toExponential(2) : '?'} advance=${s.advanceMs}ms stride=${s.strideMs}ms exch=${s.exchMs}ms sub=${s.sub}`);
    }
    if (wins.length) {
        const avg = (k) => wins.reduce((a, b) => a + (b[k] || 0), 0) / wins.length;
        const sum = (k) => wins.reduce((a, b) => a + (b[k] || 0), 0);
        console.log('per-window averages (ms):');
        console.log(`  stride ${avg('strideMs').toFixed(2)}  freeze ${avg('freezeMs').toFixed(2)}  advance ${avg('advanceMs').toFixed(2)}  exch ${avg('exchMs').toFixed(2)}  total ${avg('totalMs').toFixed(2)}`);
        const dt0s = wins.map(w => w.dt0).filter(d => d && isFinite(d)).sort((a, b) => a - b);
        const medDt0 = dt0s.length ? dt0s[Math.floor(dt0s.length / 2)].toExponential(2) : 'n/a';
        console.log(`  dt0=${medDt0}  substeps/window=${(sum('sub') || 0)}`);
        const totalMs = sum('totalMs');
        console.log(`captured ${wins.length} windows in ${(totalMs / 1000).toFixed(1)} s`);
        const perWindow = totalMs / wins.length;
        const winSec = wins[wins.length - 1] && wins[wins.length - 1].win ? wins[wins.length - 1].win : 60;
        console.log(`projected 48 h (${(48 * 3600 / winSec).toFixed(0)} windows x ${perWindow.toFixed(0)} ms): ${(perWindow * 48 * 3600 / winSec / 1000 / 60).toFixed(1)} min`);
    }
    console.log('stderr:', (result.stderr || []).slice(0, 5));
    console.log('done:', JSON.stringify(result.done));
    console.log('error:', result.error);
    if (result.error) process.exitCode = 1;
} finally {
    try { cdp && cdp.ws.close(); } catch { }
    if (chrome) { try { chrome.kill(); } catch { } }
    if (server) { try { server.kill(); } catch { } }
}
