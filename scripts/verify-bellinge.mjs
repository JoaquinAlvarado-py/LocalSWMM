// verify-bellinge.mjs — Bellinge 1D+2D verification gate.
//
// Drives the real app in headless Chrome via CDP (no bundler, no test
// framework): load the Bellinge sample → project to EPSG:25832 → generate the
// 2D mesh from the bundled GeoTIFF → run the full 1D+2D WASM engine in the
// app's own worker → assert 1D + 2D results exist.
//
// Outputs (scripts/verify-out/):
//   verify-report.json  — structured PASS/FAIL evidence
//   bellinge-2d.inp     — the exact INP the engine ran (parity fixture for M1)
//   bellinge-mesh.json  — mesh2DIndexed (vertices/triangles/options)
//
// Usage: node scripts/verify-bellinge.mjs

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(__dirname, 'verify-out');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_PORT = 8080;
const CDP_PORT = 9222;
const CDP_HTTP = `http://127.0.0.1:${CDP_PORT}`;
const APP_URL = `http://127.0.0.1:${APP_PORT}/`;
const PROFILE = join(process.env.TEMP || 'C:\\Users\\joaqu\\AppData\\Local\\Temp', 'bellinge-cdp-' + Date.now());
const WATCHDOG_MS = 35 * 60 * 1000;

// ---------------------------------------------------------------- CDP client

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

// ------------------------------------------------------------------ helpers

async function httpGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res;
}

async function probe(url) {
  try { await httpGet(url); return true; } catch { return false; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function evalInPage(cdp, sessionId, expression, awaitPromise = false) {
  const r = await cdp.send('Runtime.evaluate', {
    expression, awaitPromise, returnByValue: true, userGesture: true
  }, sessionId);
  if (r.exceptionDetails) {
    throw new Error('Page exception: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }
  return r.result ? r.result.value : undefined;
}

async function waitFor(cdp, sessionId, expression, timeoutMs, label, intervalMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  let last = undefined;
  while (Date.now() < deadline) {
    try {
      last = await evalInPage(cdp, sessionId, expression);
      if (last) return last;
    } catch (e) {
      last = String(e.message);
    }
    process.stdout.write(`  [${label}] waiting… (${Math.round((deadline - Date.now()) / 1000)}s left)\r`);
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for: ${label} (last: ${JSON.stringify(last)?.slice(0, 300)})`);
}

// ----------------------------------------------------------- page-side flow

const FLOW_LOAD = `(async () => {
  window.alert = function () {};
  window.confirm = function () { return true; };
  window.__verify = { step: 'parsing', errors: [] };
  const inp = await (await fetch('./sample_models/BellingeSWMM_v021_web.inp')).text();
  const model = await window.parseInpAsync(inp);
  window.__verify.step = 'projecting';
  await window.applyProjectionAndLoad(model, 'utm', 'EPSG:25832');
  await window.maybeAutoLoadBellingeTif();
  window.__verify.step = 'loaded';
  return {
    step: window.__verify.step,
    nodes: Net.nodes.length,
    links: Net.links.length,
    subs: Net.subcatchments.length,
    units: Net.units,
    tifReady: !!(window.App && window.App.mesh2DBellingeTif),
    hasMap: !!window.map
  };
})()`;

const FLOW_MESH = `(() => {
  window.__verify = window.__verify || { errors: [] };
  window.onerror = function (m, s, l, c, e) {
    window.__verify.errors.push('onerror: ' + m + ' @' + l + ':' + c);
    return false;
  };
  window.addEventListener('unhandledrejection', function (ev) {
    window.__verify.errors.push('unhandledrejection: ' + (ev.reason && (ev.reason.stack || ev.reason.message || ev.reason)));
  });
  const phase = p => { window.__verify.meshPhase = p; console.log('[verify] phase:', p); };
  const origRun = window.Mesh2DTriangle.runGeneration;
  window.Mesh2DTriangle.runGeneration = function (sources, quality, ctx, log) {
    phase('runGeneration-start');
    const p = origRun.call(this, sources, quality, ctx, log);
    p.then(r => { phase('runGeneration-done nt=' + ((r && r.triangles) || []).length + ' nv=' + ((r && r.vertices) || []).length); })
     .catch(e => { phase('runGeneration-error'); window.__verify.errors.push('runGeneration: ' + String(e && (e.stack || e.message) || e)); });
    return p;
  };
  const origPslg = window.Mesh2DPslg.fromNetwork;
  window.Mesh2DPslg.fromNetwork = function (sources, opts) {
    phase('pslg-start points:' + (sources.subcatchments || []).length + ' subs');
    const r = origPslg.call(this, sources, opts);
    phase('pslg-done pts=' + r.points.length + ' segs=' + (r.segments || []).length + ' regions=' + (r.regions || []).length);
    return r;
  };
  const origTri = window.Mesh2DTriangle.triangulate;
  window.Mesh2DTriangle.triangulate = function (pslg, quality, ctx) {
    phase('triangulate-start pts=' + (pslg.points || []).length);
    const p = origTri.call(this, pslg, quality, ctx);
    p.then(r => phase('triangulate-done')).catch(e => { phase('triangulate-error'); window.__verify.errors.push('triangulate: ' + String(e && (e.stack || e.message) || e)); });
    return p;
  };
  window.Mesh2DDialog.open();
  window.Mesh2DDialog.generate();
  return 'kicked';
})()`;

const FLOW_RUN = `(async () => {
  try {
    const baseInp = window.inpExporter.generateInp(Net);
    const m = window.Mesh2DInp.buildInput(baseInp, Net.mesh2D, window.map);
    window.__verify.inp = m.inp;
    window.__verify.meshInput = { triangleCount: m.triangleCount, vertexCount: m.vertexCount };
    window.__verify.stage = 'worker-start';
    const w = new Worker('openSwmm2dWorker.js?v=' + Date.now());
    w.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.type === 'status2d') window.__verify.stage = msg.stage;
      else if (msg.type === 'progress2d') window.__verify.stage = 'progress ' + Math.round(msg.elapsedMs / 60000) + ' min';
      else if (msg.type === 'results2d') {
        window.__verify.stage = 'done';
        const frames = msg.frames || [];
        const report = msg.report || '';
        window.__verify.result = {
          frames: frames.length,
          cellCount: frames.length && frames[0].depth ? frames[0].depth.length : 0,
          lastElapsedMs: frames.length ? frames[frames.length - 1].elapsedMs : null,
          massBalance: (msg.diagnostics && msg.diagnostics.massBalance) || null,
          solverSteps: (msg.diagnostics && msg.diagnostics.solverStats) || null,
          reportLength: report.length,
          reportInterest: report.split('\\n').filter(l =>
            /Continuity Error|Routing Time Step|Analysis (begun|ended)|Subcatchment Runoff|Node Depth Summary|Link Flow Summary|Flow Routing Continuity|Runoff Quantity Continuity|Surface Runoff|Dry Weather/i.test(l)
          ).slice(0, 40),
          reportTail: report.slice(-1800)
        };
      } else if (msg.type === 'error') {
        window.__verify.error = msg.message;
      } else if (msg.type === 'stderr') {
        window.__verify.stderr = (window.__verify.stderr || []).concat(String(msg.text)).slice(-60);
      }
    };
    w.onerror = (e) => { window.__verify.error = 'worker-boot-error: ' + e.message; };
    w.postMessage({
      type: 'run2d',
      inp: m.inp,
      triangleIds: m.triangleIds,
      meshFile: m.meshFile || null,
      triangleVertices: Net.mesh2DIndexed ? Net.mesh2DIndexed.triangles.map(t => t.v) : null,
      dryDepth: (Net.mesh2DIndexed && Net.mesh2DIndexed.options ? Net.mesh2DIndexed.options.dryDepth : 0.001),
      wantVertexFields: true,
      frameIntervalMs: 60000
    });
    return 'started';
  } catch (e) {
    window.__verify.error = 'run-start: ' + e.message;
    return 'failed';
  }
})()`;

const FLOW_DUMP_MESH = `(() => {
  const ix = Net.mesh2DIndexed;
  if (!ix) return null;
  return JSON.stringify({
    origin: ix.origin || null,
    vertices: (ix.vertices || []).map(v => ({ x: v.x, y: v.y, z: v.z, tag: v.tag || '' })),
    triangles: (ix.triangles || []).map(t => ({ v: t.v, n: t.n, tag: t.tag || '' })),
    options: ix.options || {}
  });
})()`;

// --------------------------------------------------------------------- main

function reportCheck(report, name, ok, detail) {
  report.checks.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  process.stdout.write(`[${mark}] ${name}${detail ? ' — ' + String(detail).slice(0, 200) : ''}\n`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const report = {
    script: 'verify-bellinge.mjs',
    ranAtUtc: new Date().toISOString(),
    app: APP_URL,
    checks: [],
    summary: {}
  };
  let chrome = null;
  let server = null;
  let cdp = null;

  try {
    // 1. App server ---------------------------------------------------------
    if (!(await probe(`http://127.0.0.1:${APP_PORT}/api/status`))) {
      process.stdout.write(`Starting server.py on port ${APP_PORT}…\n`);
      server = spawn('python', ['server.py'], { cwd: ROOT, stdio: 'ignore' });
      for (let i = 0; i < 30; i++) {
        if (await probe(`http://127.0.0.1:${APP_PORT}/api/status`)) break;
        await sleep(500);
      }
    }
    reportCheck(report, 'app server on :8080', await probe(`http://127.0.0.1:${APP_PORT}/api/status`), 'http://127.0.0.1:8080/api/status');

    // 2. Headless Chrome ----------------------------------------------------
    if (!(await probe(`${CDP_HTTP}/json/version`))) {
      const args = [
        '--headless=new',
        `--remote-debugging-port=${CDP_PORT}`,
        '--remote-allow-origins=*',
        `--user-data-dir=${PROFILE}`,
        '--no-first-run',
        '--disable-default-apps',
        '--disable-background-networking',
        '--enable-unsafe-swiftshader',
        '--window-size=1440,900',
        '--force-color-profile=srgb',
        'about:blank'
      ];
      process.stdout.write('Launching headless Chrome for CDP…\n');
      chrome = spawn(CHROME, args, { stdio: 'ignore' });
      for (let i = 0; i < 60; i++) {
        if (await probe(`${CDP_HTTP}/json/version`)) break;
        if (chrome.exitCode !== null) throw new Error('Chrome exited early with code ' + chrome.exitCode);
        await sleep(500);
      }
    }
    reportCheck(report, 'chrome CDP endpoint', await probe(`${CDP_HTTP}/json/version`), CDP_HTTP);

    const version = await (await httpGet(`${CDP_HTTP}/json/version`)).json();
    cdp = await CDP.connect(version.webSocketDebuggerUrl);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.navigate', { url: APP_URL }, sessionId);
    await waitFor(cdp, sessionId, `document.readyState === 'complete' && typeof window.Net !== 'undefined' && typeof window.Mesh2DDialog !== 'undefined'`,
      WATCHDOG_MS, 'app boot');

    // 3. Load + project Bellinge -------------------------------------------
    process.stdout.write('Loading Bellinge sample + projecting…\n');
    const loaded = await evalInPage(cdp, sessionId, FLOW_LOAD, true);
    reportCheck(report, 'Bellinge INP parsed + loaded into Net', !!loaded && loaded.nodes > 0 && loaded.links > 0, JSON.stringify(loaded));
    reportCheck(report, 'bundled Bellinge2.tif auto-loaded for mesh DTM', !!loaded.tifReady, '');

    // 4. Generate the 2D mesh (full GeoTIFF domain) --------------------------
    process.stdout.write('Generating 2D mesh (full GeoTIFF domain, auto density)…\n');
    const consoleLog = [];
    cdp.on(msg => {
      if (msg.method === 'Runtime.consoleAPICalled' && msg.sessionId === sessionId) {
        try {
          const text = (msg.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ');
          consoleLog.push(text);
        } catch { }
      }
    });
    await evalInPage(cdp, sessionId, FLOW_MESH);
    const meshDeadline = Date.now() + WATCHDOG_MS;
    let mesh = null;
    let lastPhase = '';
    while (Date.now() < meshDeadline) {
      const st = await evalInPage(cdp, sessionId,
        `(() => { const ix = Net.mesh2DIndexed; return { phase: window.__verify.meshPhase || '', errors: (window.__verify.errors || []).slice(), nt: ix && ix.triangles ? ix.triangles.length : 0, nv: ix && ix.vertices ? ix.vertices.length : 0 }; })()`);
      if (st.nt > 0) { mesh = { nt: st.nt, nv: st.nv }; break; }
      if (st.errors && st.errors.length) {
        throw new Error('Mesh generation failed:\n' + st.errors.join('\n'));
      }
      if (st.phase !== lastPhase) {
        lastPhase = st.phase;
        process.stdout.write(`  [mesh] ${st.phase}\n`);
      }
      if (consoleLog.length) {
        process.stdout.write(`  [console] ${consoleLog.splice(0, consoleLog.length).join('\n  [console] ')}\n`);
      }
      await sleep(4000);
    }
    if (!mesh) throw new Error('Mesh generation timed out. Last phase: ' + lastPhase);
    reportCheck(report, '2D mesh generated', mesh.nt > 0, `${mesh.nt} triangles, ${mesh.nv} vertices`);
    report.summary.mesh = mesh;

    // 5. Full 1D+2D run in the app's WASM worker -----------------------------
    process.stdout.write('Running full Bellinge 1D+2D simulation in the WASM worker (48 h model — this takes minutes)…\n');
    const runState = await evalInPage(cdp, sessionId, FLOW_RUN, true);
    if (runState !== 'started') throw new Error('run did not start');
    const deadline = Date.now() + WATCHDOG_MS;
    let state = null;
    while (Date.now() < deadline) {
      state = await evalInPage(cdp, sessionId,
        `(() => ({ stage: window.__verify.stage || '', done: !!window.__verify.result, error: window.__verify.error || null, stderrCount: (window.__verify.stderr || []).length }))()`);
      if (state.done || state.error) break;
      process.stdout.write(`  stage: ${state.stage || '…'} (${Math.round((deadline - Date.now()) / 1000)}s left)\r`);
      await sleep(5000);
    }
    process.stdout.write('\n');
    if (state.error) throw new Error('Worker error: ' + state.error + '\nstderr:\n' + (await evalInPage(cdp, sessionId, `(window.__verify.stderr || []).join('\\n')`))?.slice(-6000));

    const result = await evalInPage(cdp, sessionId, `window.__verify.result`, false);
    if (!result) throw new Error('No result captured');
    report.summary.run = result;

    const mb = result.massBalance || {};
    reportCheck(report, 'results2d received with frames', result.frames > 0, `${result.frames} frames, last elapsed ${result.lastElapsedMs} ms`);
    reportCheck(report, 'per-frame depth arrays match cell count', result.cellCount === mesh.nt, `${result.cellCount} cells vs ${mesh.nt} triangles`);
    reportCheck(report, '1D engine ran (mass balance present)', !!result.massBalance, `coupling 1D→2D ${mb.coupling1DTo2D?.toFixed(3) ?? 'n/a'} m³, 2D→1D ${mb.coupling2DTo1D?.toFixed(3) ?? 'n/a'} m³`);
    reportCheck(report, '2D solver advanced (solver steps > 0)', result.solverSteps && result.solverSteps.internalSteps > 0, `${result.solverSteps.internalSteps} internal steps`);
    reportCheck(report, 'RPT report produced (1D summary present)', result.reportLength > 0 && result.reportInterest.some(l => /Continuity Error/i.test(l)), `report ${result.reportLength} chars`);
    reportCheck(report, '1D continuity reported', result.reportInterest.some(l => /(Runoff Quantity|Flow Routing) Continuity/i.test(l)), result.reportInterest.find(l => /Continuity/i.test(l)) || 'n/a');
    reportCheck(report, 'mass continuity error finite', Number.isFinite(mb.continuityError), `cont. error ${mb.continuityError}`);

    // 6. Dump parity fixtures ------------------------------------------------
    const inp = await evalInPage(cdp, sessionId, `window.__verify.inp`, false);
    const meshJson = await evalInPage(cdp, sessionId, FLOW_DUMP_MESH, false);
    if (typeof inp === 'string') {
      writeFileSync(join(OUT, 'bellinge-2d.inp'), inp);
      report.summary.fixtures = { inpBytes: inp.length, meshBytes: meshJson ? meshJson.length : 0 };
    }
    if (typeof meshJson === 'string') writeFileSync(join(OUT, 'bellinge-mesh.json'), meshJson);

    report.summary.verdict = report.checks.every(c => c.ok) ? 'PASS' : 'FAIL';
    writeFileSync(join(OUT, 'verify-report.json'), JSON.stringify(report, null, 2));
    process.stdout.write(`\n==== VERDICT: ${report.summary.verdict} ====\n`);
    process.stdout.write(`Artifacts in ${OUT}\n`);
    process.exitCode = report.summary.verdict === 'PASS' ? 0 : 1;
  } catch (err) {
    report.summary.verdict = 'ERROR';
    report.summary.error = String(err && err.stack || err);
    writeFileSync(join(OUT, 'verify-report.json'), JSON.stringify(report, null, 2));
    console.error('\nVerification failed:', err);
    process.exitCode = 1;
  } finally {
    try { cdp && cdp.ws.close(); } catch { }
    if (chrome) { try { chrome.kill(); } catch { } }
    if (server) { try { server.kill(); } catch { } }
    if (existsSync(PROFILE)) { try { rmSync(PROFILE, { recursive: true, force: true }); } catch { } }
  }
}

main();
