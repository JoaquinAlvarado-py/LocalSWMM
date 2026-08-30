// test-gpu-worker.mjs â€” drive the production GPU worker (gpu2dWorker.js)
// through the app's own contract in headed Chrome via CDP.
// Usage: node scripts/test-gpu-worker.mjs [--inp <path>]
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
// Chrome location per platform; override with CHROME_PATH.
const CHROME = process.env.CHROME_PATH || (
    process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
            : 'google-chrome');
const APP_PORT = 8080;
const CDP_PORT = 9224;
const CDP_HTTP = `http://127.0.0.1:${CDP_PORT}`;
const APP_URL = `http://127.0.0.1:${APP_PORT}/`;
const TMP = process.env.TEMP || process.env.TMPDIR || '/tmp';
const PROFILE = join(TMP, 'gpu-worker-' + Date.now());
const LOG = join(TMP, 'gpu-worker-live.log');
const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
try { appendFileSync(LOG, ''); } catch { }
const live = (text) => { try { appendFileSync(LOG, text + '\n'); } catch { } };
const inpArg = process.argv.indexOf('--inp');
const INP = inpArg !== -1 ? process.argv[inpArg + 1] : join(__dirname, 'verify-out', 'marcher-cpl.inp');

class CDP {
    constructor(ws) { this.ws = ws; this.nextId = 0; this.pending = new Map(); this.listeners = new Set(); ws.onmessage = ev => this._onMessage(JSON.parse(ev.data)); }
    static connect(url) { const ws = new WebSocket(url); return new Promise((res, rej) => { ws.onopen = () => res(new CDP(ws)); ws.onerror = e => rej(new Error('CDP connect failed: ' + (e && e.message))); }); }
    _onMessage(msg) { if (msg.id && this.pending.has(msg.id)) { const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result || {}); } if (msg.method) for (const fn of this.listeners) fn(msg); }
    send(method, params = {}, sessionId) { const id = ++this.nextId; const req = { id, method, params }; if (sessionId) req.sessionId = sessionId; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify(req)); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); } }, 3600000); }); }
    on(fn) { this.listeners.add(fn); }
}
async function httpGet(url) { const res = await fetch(url); if (!res.ok) throw new Error(`HTTP ${res.status}`); return res; }
async function probe(url) { try { await httpGet(url); return true; } catch { return false; } }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function evalInPage(cdp, sessionId, expression, awaitPromise = false) { const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, sessionId); if (r.exceptionDetails) throw new Error('Page exception: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result ? r.result.value : undefined; }

const inp = readFileSync(INP, 'utf8');
const triangleCount = (inp.match(/^\[2D_TRIANGLES\]/m) ? inp.split(/^\[2D_TRIANGLES\]/m)[1].split('\n').filter(l => l.trim() && !l.trim().startsWith(';')).length : 0);

let server = null, chrome = null, cdp = null;
try {
    if (!(await probe(`http://127.0.0.1:${APP_PORT}/api/status`))) {
        server = spawn(PYTHON, ['server.py'], { cwd: ROOT, stdio: 'ignore' });
        for (let i = 0; i < 30; i++) { if (await probe(`http://127.0.0.1:${APP_PORT}/api/status`)) break; await sleep(500); }
    }
    if (!(await probe(`${CDP_HTTP}/json/version`))) {
        chrome = spawn(CHROME, [`--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`, '--no-first-run', '--disable-default-apps', '--disable-background-networking', '--window-size=1100,820',
            // Linux NVIDIA WebGPU: blocklist bypass + Vulkan backend (see run-webgpu-harness.mjs)
            '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--use-angle=vulkan', '--use-vulkan=native',
            'about:blank'], { stdio: 'ignore' });
        for (let i = 0; i < 60; i++) { if (await probe(`${CDP_HTTP}/json/version`)) break; if (chrome.exitCode !== null) throw new Error('Chrome exited early: ' + chrome.exitCode); await sleep(500); }
    }
    const version = await (await httpGet(`${CDP_HTTP}/json/version`)).json();
    cdp = await CDP.connect(version.webSocketDebuggerUrl);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.navigate', { url: APP_URL }, sessionId);

    const consoleLog = [];
    cdp.on(msg => {
        if (msg.method === 'Runtime.consoleAPICalled' && msg.sessionId === sessionId) {
            try {
                const text = (msg.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ');
                consoleLog.push(text);
                live('CONSOLE: ' + text.slice(0, 200));
            } catch { }
        }
        if (msg.method === 'Runtime.exceptionThrown' && msg.sessionId === sessionId) {
            try { consoleLog.push('EXCEPTION: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text)); live('EXCEPTION: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text)); } catch { }
        }
    });

    await evalInPage(cdp, sessionId, `new Promise(r => { if (document.readyState === 'complete') r(); else addEventListener('load', r); })`);
    console.log(`launched app; triangleCount=${triangleCount} (from INP)`);
    const one = await cdp.send('Runtime.evaluate', { expression: '1 + 1', returnByValue: true }, sessionId);
    console.log('1+1 eval:', JSON.stringify(one));
    const two = await cdp.send('Runtime.evaluate', { expression: '(async () => { return { a: 1, b: "x" }; })()', awaitPromise: true, returnByValue: true }, sessionId);
    console.log('async eval:', JSON.stringify(two));

    const result = await evalInPage(cdp, sessionId, `(async () => {
        const inp = ${JSON.stringify(inp)};
        const triangleIds = Array.from({ length: ${triangleCount} }, (_, i) => i);
        const out = { progress: [], debug: [] };
        const w = new Worker('webgpu/gpu2dWorker.js?v=' + Date.now());
        w.onerror = e => { out.error = 'worker-load-error: ' + (e.message || e.type || ''); };
        w.onmessage = ev => {
            const m = ev.data || {};
            console.log('W:', JSON.stringify({ type: m.type, stage: m.stage, elapsedMs: m.elapsedMs, t: m.timings, err: m.message }).slice(0, 200));
            if (m.type === 'debug') out.debug.push(m.text);
            else if (m.type === 'status2d') out.stage = m.stage;
            else if (m.type === 'progress2d') { out.progress.push(m.elapsedMs); if (m.timings) console.log('T:', JSON.stringify(m.timings)); }
            else if (m.type === 'stderr') (out.stderr = out.stderr || []).push(m.text);
            else if (m.type === 'results2d') { out.done = { frames: m.frames.length, first: m.frames[0] && { t: m.frames[0].elapsedMs, d0: m.frames[0].depth[0], h0: m.frames[0].head[0], v0: m.frames[0].velocity[0] }, last: m.frames[m.frames.length - 1] && { t: m.frames[m.frames.length - 1].elapsedMs, d0: m.frames[m.frames.length - 1].depth[0] }, mb: m.diagnostics && m.diagnostics.massBalance, reportLen: (m.report || '').length }; }
            else if (m.type === 'error') out.error = m.message;
        };
        w.postMessage({ type: 'run2d', inp, triangleIds, meshFile: null, triangleVertices: null, dryDepth: 0.001, wantVertexFields: true, frameIntervalMs: 60000 });
        const deadline = Date.now() + 45 * 60 * 1000;
        while (Date.now() < deadline && !out.done && !out.error) await new Promise(r => setTimeout(r, 1000));
        w.terminate();
        return out;
    })()`, true);
    console.log(JSON.stringify(result, null, 2));
    if (consoleLog.length) console.log('--- console ---\n' + consoleLog.slice(-30).join('\n'));
    if (!result || result.error) { console.error('FAIL: worker error'); process.exitCode = 1; }
    else if (!result.done) { console.error('FAIL: no results (timeout)'); process.exitCode = 1; }
    else { console.log('PASS: worker produced ' + result.done.frames + ' frames'); }
} finally {
    try { cdp && cdp.ws.close(); } catch { }
    if (chrome) { try { chrome.kill(); } catch { } }
    if (server) { try { server.kill(); } catch { } }
}
