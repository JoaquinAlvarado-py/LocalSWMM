// test-2d-render.mjs — smoke test the 2D result render changes
// (velocity arrows, robust frame scaling, WebGL ramp shader) in Chrome via CDP.
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_PORT = 8080;
const CDP_PORT = 9225;
const CDP_HTTP = `http://127.0.0.1:${CDP_PORT}`;
const PROFILE = join(process.env.TEMP || 'C:\\Users\\joaqu\\AppData\\Local\\Temp', 'render-test-' + Date.now());

class CDP {
    constructor(ws) { this.ws = ws; this.nextId = 0; this.pending = new Map(); ws.onmessage = ev => this._onMessage(JSON.parse(ev.data)); }
    static connect(url) { const ws = new WebSocket(url); return new Promise((res, rej) => { ws.onopen = () => res(new CDP(ws)); ws.onerror = e => rej(new Error('CDP connect failed')); }); }
    _onMessage(msg) { if (msg.id && this.pending.has(msg.id)) { const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result || {}); } }
    send(method, params = {}, sessionId) { const id = ++this.nextId; const req = { id, method, params }; if (sessionId) req.sessionId = sessionId; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify(req)); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); } }, 60000); }); }
}
async function probe(url) { try { const r = await fetch(url); return r.ok; } catch { return false; } }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function evalInPage(cdp, sessionId, expression, awaitPromise = false) { const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, sessionId); if (r.exceptionDetails) throw new Error('Page exception: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result ? r.result.value : undefined; }

let server = null, chrome = null, cdp = null;
try {
    if (!(await probe(`http://127.0.0.1:${APP_PORT}/api/status`))) {
        server = spawn('python', ['server.py'], { cwd: ROOT, stdio: 'ignore' });
        for (let i = 0; i < 30; i++) { if (await probe(`http://127.0.0.1:${APP_PORT}/api/status`)) break; await sleep(500); }
    }
    if (!(await probe(`${CDP_HTTP}/json/version`))) {
        chrome = spawn(CHROME, [`--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`, '--no-first-run', '--disable-background-networking', '--window-size=1100,820', 'about:blank'], { stdio: 'ignore' });
        for (let i = 0; i < 60; i++) { if (await probe(`${CDP_HTTP}/json/version`)) break; if (chrome.exitCode !== null) throw new Error('Chrome exited early'); await sleep(500); }
    }
    const version = await (await fetch(`${CDP_HTTP}/json/version`)).json();
    cdp = await CDP.connect(version.webSocketDebuggerUrl);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${APP_PORT}/` }, sessionId);
    await evalInPage(cdp, sessionId, `new Promise(r => { if (document.readyState === 'complete') r(); else addEventListener('load', r); })`);
    await sleep(3000);
    const boot = await evalInPage(cdp, sessionId, `({ url: location.href, title: document.title, m2r: typeof Mesh2DRender, mapbox: typeof window.mapboxgl, scripts: document.scripts.length })`);
    console.log('boot:', JSON.stringify(boot));
    if (!boot.m2r) throw new Error('Mesh2DRender not loaded');

    const r = await evalInPage(cdp, sessionId, `(async () => {
        const out = {};
        // 1) velocity arrows with a synthetic mesh
        const mesh = { vertices: [{ lng: 0, lat: 0, x: 0, y: 0 }, { lng: 0.001, lat: 0, x: 1, y: 0 }, { lng: 0, lat: 0.001, x: 0, y: 1 }], triangles: [{ v: [0, 1, 2], n: 1 }] };
        const vel = [0.5], vx = [1], vy = [0.5];
        const fc = Mesh2DRender.velocityArrows(mesh, vel, 2.0, vx, vy);
        out.arrow = fc.features[0] && { size: fc.features[0].properties.size, angle: Math.round(fc.features[0].properties.angle), n: fc.features.length };
        // skip threshold
        out.arrowSkip = Mesh2DRender.velocityArrows(mesh, [0.0005], 2.0, vx, vy).features.length;
        // dry contour regression: a constant zero-depth field must not paint
        // the whole mesh as a blue contour band.
        out.dryLevels = Mesh2DRender.levelsAuto([0, 0, 0], 8).length;
        out.dryBands = Mesh2DRender.contourBands(mesh, [0, 0, 0], [0, 0.125], 0.001).features.length;
        // 2) robust frame max (same formula as results.js)
        const robust = (arr) => { let fMax = 0; for (let i = 0; i < arr.length; i++) if (arr[i] > fMax) fMax = arr[i]; if (fMax <= 0) return 0.001; const s = Array.from(arr).sort((a, b) => a - b); const p99 = s[Math.floor(s.length * 0.99)]; return (p99 > 0 && fMax > 1.5 * p99) ? p99 * 1.5 : fMax; };
        const spread = new Array(34000).fill(0.5); spread[100] = 6.0; // one outlier channel cell
        out.robustOutlier = robust(spread);
        out.robustUniform = robust(new Array(34000).fill(0.5));
        // 3) WebGL2 shader compile check (the new ramp fragment shader)
        try {
            const gl = document.createElement('canvas').getContext('webgl2');
            const fs = gl.createShader(gl.FRAGMENT_SHADER);
            gl.shaderSource(fs, '#version 300 es\\nprecision highp float; uniform vec3 u_ramp[5]; in vec4 v_color; out vec4 outColor; void main(){float t=clamp(v_color.r,0.0,1.0); vec3 col; if(t<0.25){col=mix(u_ramp[0],u_ramp[1],t*4.0);} else if(t<0.5){col=mix(u_ramp[1],u_ramp[2],(t-0.25)*4.0);} else if(t<0.75){col=mix(u_ramp[2],u_ramp[3],(t-0.5)*4.0);} else {col=mix(u_ramp[3],u_ramp[4],(t-0.75)*4.0);} outColor=vec4(col,v_color.a);}');
            gl.compileShader(fs);
            out.shaderCompile = gl.getShaderParameter(fs, gl.COMPILE_STATUS) ? 'OK' : gl.getShaderInfoLog(fs);
            // 4) arrow icon canvas drawing (same code as mesh2dRender.ensure)
            const c = document.createElement('canvas'); c.width = c.height = 64;
            const x = c.getContext('2d'); x.fillStyle = '#263238'; x.fillRect(4, 29, 38, 6); x.beginPath(); x.moveTo(42, 16); x.lineTo(60, 32); x.lineTo(42, 48); x.closePath(); x.fill();
            const img = x.getImageData(0, 0, 64, 64).data;
            let nonTransparent = 0; for (let i = 3; i < img.length; i += 4) if (img[i] > 0) nonTransparent++;
            out.iconPixels = nonTransparent;
        } catch (e) { out.glErr = String(e); }
        // The completion marker may contain non-finite values. It must not
        // turn the KPI cards into invalid values or throw during repaint.
        window.display2DResults({
            triangleIds: ['M2D_1'],
            frames: [
                { elapsedMs: 60000, depth: [0.4], head: [1], velocity: [0.2] },
                { elapsedMs: 0, depth: [Infinity], head: [Infinity], velocity: [Infinity] }
            ],
            diagnostics: { massBalance: { continuityError: 0 } }
        });
        const resultText = document.getElementById('results-content').textContent;
        out.resultKpisFinite = resultText.includes('0.400') && resultText.includes('0.200');
        return out;
    })()`, true);
    console.log(JSON.stringify(r, null, 2));
    if (!r || r.shaderCompile !== 'OK' || !r.arrow || r.arrowSkip !== 0 || r.dryLevels !== 0 || r.dryBands !== 0 || !r.iconPixels || !r.resultKpisFinite) { console.error('FAIL'); process.exitCode = 1; }
    else console.log('PASS');
} finally {
    try { cdp && cdp.ws.close(); } catch { }
    if (chrome) { try { chrome.kill(); } catch { } }
    if (server) { try { server.kill(); } catch { } }
}
