// run-webgpu-harness.mjs — drive the WebGPU marcher harness in headless Chrome.
//
// Usage: node scripts/run-webgpu-harness.mjs [fixture...]
//   fixtures default: marcher-8cells marcher-5k

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || (
    process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
            : 'google-chrome');
const APP_PORT = 8080;
const CDP_PORT = 9223;
const CDP_HTTP = `http://127.0.0.1:${CDP_PORT}`;
const APP_URL = `http://127.0.0.1:${APP_PORT}/webgpu/harness.html`;
const PROFILE = join(process.env.TEMP || (process.platform === 'win32' ? 'C:\\Users\\joaqu\\AppData\\Local\\Temp' : '/tmp'), 'wgpu-harness-' + Date.now());
const FIXTURES_OUT = join(ROOT, 'public', 'webgpu', 'fixtures');
const coupled = process.argv.includes('--coupled');
const bench = process.argv.includes('--bench');
const ltsIdx = process.argv.indexOf('--lts');
const ltsOv = ltsIdx !== -1 ? parseInt(process.argv[ltsIdx + 1], 10) : 0;
const hoursIdx = process.argv.indexOf('--hours');
const hoursOv = hoursIdx !== -1 ? process.argv[hoursIdx + 1] : '';
const fixtures = process.argv.filter((a, i) => !a.startsWith('--') && process.argv[i - 1] !== '--lts').slice(2).length
    ? process.argv.filter((a, i) => !a.startsWith('--') && process.argv[i - 1] !== '--lts').slice(2)
    : (coupled ? ['marcher-cpl'] : (bench ? ['bellinge'] : ['marcher-8cells', 'marcher-5k']));

class CDP {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 0;
        this.pending = new Map();
        this.listeners = new Set();
        ws.onmessage = ev => this._onMessage(JSON.parse(ev.data));
    }
    static connect(url) {
        const ws = new WebSocket(url);
        return new Promise((resolve, reject) => {
            ws.onopen = () => resolve(new CDP(ws));
            ws.onerror = err => reject(new Error('CDP connect failed: ' + (err && err.message)));
        });
    }
    _onMessage(msg) {
        if (msg.id && this.pending.has(msg.id)) {
            const { resolve, reject } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result || {});
            return;
        }
        if (msg.method) for (const fn of this.listeners) fn(msg);
    }
    send(method, params = {}, sessionId) {
        const id = ++this.nextId;
        const req = { id, method, params };
        if (sessionId) req.sessionId = sessionId;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify(req));
            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    reject(new Error(`CDP timeout: ${method}`));
                }
            }, 120000);
        });
    }
    on(fn) { this.listeners.add(fn); }
}

async function httpGet(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return res;
}
async function probe(url) { try { await httpGet(url); return true; } catch { return false; } }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function evalInPage(cdp, sessionId, expression) {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error('Page exception: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result ? r.result.value : undefined;
}

async function main() {
    mkdirSync(FIXTURES_OUT, { recursive: true });
    for (const f of fixtures) {
        if (bench) {
            const src = join(ROOT, 'scripts', 'verify-out', 'bellinge-2d.inp');
            if (!existsSync(src)) throw new Error(`fixture missing: ${src}`);
            copyFileSync(src, join(FIXTURES_OUT, f + '.inp'));
        } else {
            for (const ext of ['.inp', '.ref.json']) {
                const src = join(ROOT, 'scripts', 'verify-out', f + ext);
                if (!existsSync(src)) throw new Error(`fixture missing: ${src}`);
                copyFileSync(src, join(FIXTURES_OUT, f + ext));
            }
        }
    }
    console.log(`fixtures staged in ${FIXTURES_OUT}: ${fixtures.join(', ')}`);

    let chrome = null;
    let server = null;
    try {
        if (!(await probe(`http://127.0.0.1:${APP_PORT}/api/status`))) {
            server = spawn('python', ['server.py'], { cwd: ROOT, stdio: 'ignore' });
            for (let i = 0; i < 30; i++) {
                if (await probe(`http://127.0.0.1:${APP_PORT}/api/status`)) break;
                await sleep(500);
            }
        }

        if (!(await probe(`${CDP_HTTP}/json/version`))) {
            // Headless Chrome does not expose WebGPU (verified on 151/win32) —
            // run headed with a temp profile; a window appears briefly.
            const args = [
                `--remote-debugging-port=${CDP_PORT}`,
                '--remote-allow-origins=*',
                `--user-data-dir=${PROFILE}`,
                '--no-first-run',
                '--disable-default-apps',
                '--disable-background-networking',
                '--window-size=1100,820',
                // Linux NVIDIA: WebGPU is exposed only in secure contexts, and
                // Dawn needs the GPU blocklist ignored + the Vulkan backend to
                // hand back an adapter (verified 151/linux: without these,
                // requestAdapter() returns null).
                '--ignore-gpu-blocklist',
                '--enable-unsafe-webgpu',
                '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan',
                '--use-angle=vulkan',
                '--use-vulkan=native',
                'about:blank'
            ];
            console.log('Launching headed Chrome (WebGPU; window will appear briefly)…');
            chrome = spawn(CHROME, args, { stdio: 'ignore' });
            for (let i = 0; i < 60; i++) {
                if (await probe(`${CDP_HTTP}/json/version`)) break;
                if (chrome.exitCode !== null) throw new Error('Chrome exited early: ' + chrome.exitCode);
                await sleep(500);
            }
        }

        const version = await (await httpGet(`${CDP_HTTP}/json/version`)).json();
        const cdp = await CDP.connect(version.webSocketDebuggerUrl);
        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
        await cdp.send('Page.enable', {}, sessionId);
        await cdp.send('Runtime.enable', {}, sessionId);
        const consoleLog = [];
        cdp.on(msg => {
            if (msg.method === 'Runtime.consoleAPICalled' && msg.sessionId === sessionId) {
                try {
                    const text = (msg.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ');
                    consoleLog.push(text);
                } catch { }
            }
            if (msg.method === 'Runtime.exceptionThrown' && msg.sessionId === sessionId) {
                try {
                    consoleLog.push('EXCEPTION: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
                } catch { }
            }
        });

        let overall = true;
        for (const fixture of fixtures) {
            console.log(`\n==== fixture: ${fixture} ====`);
            const mode = coupled ? '&mode=coupled' : (bench ? '&mode=bench' : '');
            const ltsArg = ltsOv ? `&lts=${ltsOv}` : '';
            const hoursArg = hoursOv ? `&hours=${hoursOv}` : '';
            await cdp.send('Page.navigate', { url: `${APP_URL}?fixture=${fixture}${mode}${ltsArg}${hoursArg}` }, sessionId);
            const deadline = Date.now() + (bench ? 90 : 15) * 60 * 1000;
            let done = false;
            let status = '';
            let lastPrinted = '';
            while (Date.now() < deadline) {
                try {
                    status = await evalInPage(cdp, sessionId, `document.getElementById('status') ? document.getElementById('status').textContent : ''`);
                } catch (e) { status = ''; }
                if (status !== lastPrinted) {
                    lastPrinted = status;
                    process.stdout.write(`  [status] ${status.slice(0, 140)}\n`);
                }
                if (/done —|FAIL/.test(status)) { done = true; break; }
                await sleep(2000);
            }
            if (!done) throw new Error(`harness timeout (${fixture}) — status: ${status}`);
            const report = await evalInPage(cdp, sessionId, `document.getElementById('report').innerText`);
            console.log(report || '(empty report)');
            if (consoleLog.length) {
                console.log('--- page console ---');
                console.log(consoleLog.splice(0, consoleLog.length).join('\n'));
            }
            console.log('--- status ---\n' + status);
            const verdict = status.match(/PASS|FAIL/);
            const ok = verdict && verdict[0] === 'PASS';
            overall = overall && ok;
            if (ok) console.log(`[PASS] ${fixture}`);
            else console.log(`[FAIL] ${fixture}`);
        }
        console.log(`\n==== OVERALL: ${overall ? 'PASS' : 'FAIL'} ====`);
        process.exitCode = overall ? 0 : 1;
    } finally {
        if (chrome) { try { chrome.kill(); } catch { } }
        if (server) { try { server.kill(); } catch { } }
        if (existsSync(PROFILE)) { try { rmSync(PROFILE, { recursive: true, force: true }); } catch { } }
    }
}

main().catch(err => {
    console.error('Harness driver failed:', err);
    process.exitCode = 1;
});
