// bench-wasm-threads.mjs — run the production 2D WASM worker (openSwmm2dWorker.js)
// in headed Chrome at THREADS 1 vs THREADS n and compare wall-clock solve time.
// Requires the page to be cross-origin isolated (server.py sends COOP/COEP).
// Usage: node scripts/bench-wasm-threads.mjs [--inp <path>] [--threads 1,4]
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || (
    process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
            : 'google-chrome');
const APP_PORT = 8080;
const CDP_PORT = 9225;
const CDP_HTTP = `http://127.0.0.1:${CDP_PORT}`;
const APP_URL = `http://127.0.0.1:${APP_PORT}/`;
const PROFILE = join(process.env.TEMP || '/tmp', 'wgpu-threads-' + Date.now());
const inpIdx = process.argv.indexOf('--inp');
const INP = inpIdx !== -1 ? process.argv[inpIdx + 1] : join(ROOT, 'scripts', 'verify-out', 'marcher-5k.inp');
const threadsIdx = process.argv.indexOf('--threads');
const THREADS = threadsIdx !== -1 ? process.argv[threadsIdx + 1].split(',').map(Number) : [1, 4];

class CDP {
    constructor(ws) { this.ws = ws; this.nextId = 0; this.pending = new Map(); this.listeners = new Set(); ws.onmessage = ev => this._onMessage(JSON.parse(ev.data)); }
    static connect(url) { const ws = new WebSocket(url); return new Promise((res, rej) => { ws.onopen = () => res(new CDP(ws)); ws.onerror = e => rej(new Error('CDP connect failed: ' + (e && e.message))); }); }
    _onMessage(msg) { if (msg.id && this.pending.has(msg.id)) { const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result || {}); } if (msg.method) for (const fn of this.listeners) fn(msg); }
    send(method, params = {}, sessionId) { const id = ++this.nextId; const req = { id, method, params }; if (sessionId) req.sessionId = sessionId; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify(req)); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); } }, 1200000); }); }
    on(fn) { this.listeners.add(fn); }
}
async function httpGet(url) { const res = await fetch(url); if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`); return res; }
async function probe(url) { try { await httpGet(url); return true; } catch { return false; } }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function evalInPage(cdp, sessionId, expression, awaitPromise = false) {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, sessionId);
    if (r.exceptionDetails) throw new Error('Page exception: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result ? r.result.value : undefined;
}

function withThreads(inp, n) {
    let out = inp;
    const minutes = Number(process.argv[process.argv.indexOf('--minutes') + 1]) || 10;
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    out = out.replace(/^END_TIME\s+\S+/m, `END_TIME             ${hh}:${mm}:00`);
    if (!/^THREADS\s/m.test(out)) return out.replace(/^(\[OPTIONS\]\r?\n)/m, `$1THREADS            ${n}\n`);
    return out.replace(/^THREADS\s+\S+/m, `THREADS            ${n}`);
}

async function runSolve(cdp, sessionId, inp, n) {
    await evalInPage(cdp, sessionId, `(async () => {
        const out = { stderr: [], progress: [], stages: [], wallMs: 0 };
        self.__bench = out;
        const w = new Worker('openSwmm2dWorker.js?v=${n}');
        w.onerror = e => { out.error = 'worker-load-error: ' + (e.message || e.type || ''); };
        w.onmessage = ev => {
            const m = ev.data || {};
            if (m.type === 'stderr') out.stderr.push(m.text);
            else if (m.type === 'status2d') out.stages.push(m.stage);
            else if (m.type === 'progress2d') out.progress.push(m.elapsedMs);
            else if (m.type === 'results2d') out.done = { frames: m.frames.length, diagnostics: m.diagnostics, report: (m.report || '').split('\\n').filter(l => /Number of Threads|Continuity Error|Routing Time Step/i.test(l)).join('\\n') };
            else if (m.type === 'error') out.error = m.message;
        };
        const t0 = performance.now();
        out.t0 = t0;
        w.postMessage({ type: 'run2d', inp: ${JSON.stringify(withThreads(inp, n))}, triangleIds: null, meshFile: null, triangleVertices: null, dryDepth: 0.001, wantVertexFields: false, frameIntervalMs: 60000 });
        out.w = w;
        out.started = true;
    })()`);
    const deadline = Date.now() + 8 * 60 * 1000;
    let lastStage = '';
    while (Date.now() < deadline) {
        const s = await evalInPage(cdp, sessionId, `(() => { const b = self.__bench; if (!b) return null; return { stages: b.stages, done: !!b.done, error: b.error || null, stderr: (b.stderr || []).slice(-3), wall: b.wallMs }; })()`);
        if (!s) { await new Promise(r => setTimeout(r, 500)); continue; }
        const stageKey = (s.stages || []).join('>');
        if (stageKey !== lastStage) { lastStage = stageKey; console.log('  [stage] ' + stageKey); }
        if (s.done || s.error) {
            const done = await evalInPage(cdp, sessionId, `(() => { const b = self.__bench; return { done: b.done, error: b.error, wall: performance.now() - b.t0, stderr: b.stderr, stages: b.stages, progress: b.progress }; })()`);
            try { await evalInPage(cdp, sessionId, `self.__bench.w.terminate()`); } catch { }
            return done;
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    try { await evalInPage(cdp, sessionId, `self.__bench.w.terminate()`); } catch { }
    return { error: 'timeout' };
}

let server = null, chrome = null, cdp = null;
try {
    if (!(await probe(`http://127.0.0.1:${APP_PORT}/api/status`))) {
        server = spawn('python', ['server.py'], { cwd: ROOT, stdio: 'ignore' });
        for (let i = 0; i < 30; i++) { if (await probe(`http://127.0.0.1:${APP_PORT}/api/status`)) break; await sleep(500); }
    }
    if (!(await probe(`${CDP_HTTP}/json/version`))) {
        chrome = spawn(CHROME, [`--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`, '--no-first-run', '--disable-default-apps', '--disable-background-networking', '--window-size=800,600', 'about:blank'], { stdio: 'ignore' });
        for (let i = 0; i < 60; i++) { if (await probe(`${CDP_HTTP}/json/version`)) break; if (chrome.exitCode !== null) throw new Error('Chrome exited early: ' + chrome.exitCode); await sleep(500); }
    }
    const version = await (await httpGet(`${CDP_HTTP}/json/version`)).json();
    cdp = await CDP.connect(version.webSocketDebuggerUrl);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    const consoleLog = [];
    cdp.on(msg => {
        if (msg.method === 'Runtime.consoleAPICalled' && msg.sessionId === sessionId) {
            try { consoleLog.push((msg.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ').slice(0, 300)); } catch { }
        }
    });
    await cdp.send('Page.navigate', { url: APP_URL }, sessionId);
    await evalInPage(cdp, sessionId, `new Promise(r => { if (document.readyState === 'complete') r(); else addEventListener('load', r); })`);

    const isolated = await evalInPage(cdp, sessionId, 'self.crossOriginIsolated');
    console.log(`crossOriginIsolated: ${isolated}`);
    if (!isolated) { console.error('FAIL: page is not cross-origin isolated (COOP/COEP missing)'); process.exitCode = 1; }

    const inp = readFileSync(INP, 'utf8');
    const results = {};
    for (const n of THREADS) {
        console.log(`\n==== THREADS ${n} ====`);
        const out = await runSolve(cdp, sessionId, inp, n);
        if (out.error) { console.error('FAIL: ' + out.error); process.exitCode = 1; continue; }
        if (!out.done) { console.error('FAIL: timeout'); process.exitCode = 1; continue; }
        results[n] = out;
        const last = out.done && out.done.diagnostics ? out.done.diagnostics.massBalance : null;
        const steps = out.done && out.done.diagnostics ? out.done.diagnostics.solverStats : null;
        console.log(`wall ${((out.wall || 0) / 1000).toFixed(1)}s | stages: ${(out.stages || []).join(' -> ')}`);
        if (out.error) console.log('error: ' + out.error);
        if (out.done) {
            console.log(`frames ${out.done.frames} | continuityErr ${last ? last.continuityError : 'n/a'} | internalSteps ${steps ? steps.internalSteps : 'n/a'}`);
            if (last) console.log('massBalance: ' + JSON.stringify(last).slice(0, 300));
            if (out.done.report) console.log('report: ' + out.done.report.replace(/\\n/g, ' | '));
        }
        if (out.stderr && out.stderr.length) console.log('stderr tail:\n' + out.stderr.slice(-4).join('\n'));
        if (consoleLog.length) console.log('page console:\n' + consoleLog.splice(0, consoleLog.length).join('\n'));
        if (out.stderr.length) console.log('stderr tail:\n' + out.stderr.slice(-4).join('\n'));
    }
    if (Object.keys(results).length >= 2) {
        const [a, b] = Object.keys(results).sort((x, y) => x - y);
        const wa = results[a].wall || 0, wb = results[b].wall || 0;
        console.log(`\n==== THREADS ${a} ${(wa / 1000).toFixed(1)}s vs THREADS ${b} ${(wb / 1000).toFixed(1)}s => ${wb > 0 ? (wa / wb).toFixed(2) : 'n/a'}x ====`);
    }
} finally {
    try { cdp && cdp.ws.close(); } catch { }
    if (chrome) { try { chrome.kill(); } catch { } }
    if (server) { try { server.kill(); } catch { } }
}
