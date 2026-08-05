// couplingSplit.js — M2 1D↔2D split machinery shared by the harness and the
// production GPU worker. Worker-safe (no DOM). Exposes:
//   parse2DMesh, parse2DOptions, parseCoupling, build1DInp, simEndSec,
//   rainMpsAt, runSplit
//
// The split replicates the engine's windowless co-advance: stride the 1D
// (one routing step per landing), freeze the node state, advance the GPU
// marcher over the window, feed ∫Q back via set_lateral_inflow. All the
// hard-won M2 lessons live here (see WEBGPU_PLAN.md §M2).
(function (global) {
    'use strict';

    const sec = (text, name) => {
        const m = text.match(new RegExp(`(^|\\n)\\[${name}\\][\\s\\S]*?(?=\\n\\[[^\\]]+\\]|$)`));
        return m ? m[0] : '';
    };

    function parse2DMesh(text) {
        const vertices = [];
        for (const line of sec(text, '2D_VERTICES').split('\n').slice(1)) {
            const t = line.trim();
            if (!t || t.startsWith(';')) continue;
            const p = t.split(/\s+/);
            if (p.length < 3) continue;
            vertices.push({ x: +p[0], y: +p[1], z: +p[2] });
        }
        const triangles = [];
        for (const line of sec(text, '2D_TRIANGLES').split('\n').slice(1)) {
            const t = line.trim();
            if (!t || t.startsWith(';')) continue;
            const p = t.split(/\s+/);
            if (p.length < 4) continue;
            triangles.push({ v: [+p[0], +p[1], +p[2]], n: +p[3] });
        }
        return { vertices, triangles };
    }

    function parse2DOptions(text) {
        const s = sec(text, '2D_OPTIONS');
        const get = (key, dflt) => {
            const m = s.match(new RegExp(`^\\s*${key}\\s+([\\d.eE+-]+)`, 'm'));
            return m ? +m[1] : dflt;
        };
        return {
            theta: get('THETA', 0.5),
            cflNumber: get('CFL_NUMBER', 0.8),
            hMove: get('H_MOVE', 0.003),
            froudeMax: get('FROUDE_MAX', 1.0),
            dryDepth: get('DRY_DEPTH', 0.001),
            maxTimestep: get('MAX_TIMESTEP', 10.0),
            ltsTiers: get('LTS_TIERS', 1),
            exchangeBeta: 0.8
        };
    }

    // Node order = the order the node sections appear in the INP (the engine
    // indexes nodes by parse order) — ALL sections sorted by global text
    // position (a fixed [JUNCTIONS, OUTFALLS, STORAGE, DIVIDERS] walk
    // mis-indexes storage-before-outfall INPs).
    function nodeOrder(text) {
        const secTexts = (name) => {
            const re = new RegExp(`(^|\\n)\\[${name}\\][\\s\\S]*?(?=\\n\\[[^\\]]+\\]|$)`, 'g');
            const out = [];
            let m;
            while ((m = re.exec(text)) !== null) out.push({ at: m.index, text: m[0] });
            return out;
        };
        const all = [];
        for (const name of ['JUNCTIONS', 'OUTFALLS', 'STORAGE', 'DIVIDERS'])
            all.push(...secTexts(name));
        all.sort((a, b) => a.at - b.at);
        const order = [];
        for (const { text: t } of all) {
            for (const line of t.split('\n')) {
                const l = line.trim();
                if (!l || l.startsWith(';') || l.startsWith('[')) continue;
                order.push(l.split(/\s+/)[0]);
            }
        }
        return order;
    }

    function parseCoupling(text, mesh) {
        const order = nodeOrder(text);
        const siUnits = /\bFLOW_UNITS\s+(CMS|LPS|MLD)\b/i.test(text);
        const len12 = siUnits ? 1.0 : 0.3048;
        const invert = {}, fullDepth = {};
        for (const secName of ['JUNCTIONS', 'STORAGE']) {
            const s = (text.match(new RegExp(`(^|\\n)\\[${secName}\\][\\s\\S]*?(?=\\n\\[[^\\]]+\\]|$)`, 'g')) || []);
            s.forEach(st => {
                for (const line of st.split('\n')) {
                    const t = line.trim();
                    if (!t || t.startsWith(';') || t.startsWith('[')) continue;
                    const p = t.split(/\s+/);
                    if (p.length >= 3) { invert[p[0]] = +p[1]; fullDepth[p[0]] = +p[2]; }
                }
            });
        }
        const autoArea = /\[2D_OPTIONS\][\s\S]*?COUPLING_AREA\s+DEFAULT/i.test(text);
        const conduits = [], xsects = {};
        for (const line of sec(text, 'CONDUITS').split('\n').slice(1)) {
            const t = line.trim();
            if (!t || t.startsWith(';')) continue;
            const p = t.split(/\s+/);
            if (p.length >= 3) conduits.push({ id: p[0], n1: p[1], n2: p[2] });
        }
        for (const line of sec(text, 'XSECTIONS').split('\n').slice(1)) {
            const t = line.trim();
            if (!t || t.startsWith(';')) continue;
            const p = t.split(/\s+/);
            if (p.length >= 3) xsects[p[0]] = { shape: p[1], g1: +p[2] };
        }
        const conduitAreaM2 = (c) => {
            const x = xsects[c.id];
            if (!x) return 0;
            if (x.shape.toUpperCase() === 'CIRCULAR') return Math.PI * x.g1 * x.g1 / 4;
            return 0;
        };
        const finish = (p) => {
            p.crown = ((invert[p.node] !== undefined ? invert[p.node] : 0) +
                (fullDepth[p.node] !== undefined ? fullDepth[p.node] : 0)) * len12;
            if (autoArea) {
                let aPipeMax = 0;
                for (const c of conduits)
                    if (c.n1 === p.node || c.n2 === p.node)
                        aPipeMax = Math.max(aPipeMax, conduitAreaM2(c));
                if (aPipeMax > 0) p.area = Math.min(2.0, Math.max(0.05, 1.25 * aPipeMax));
            }
            p.node = order.indexOf(p.node);
            return p;
        };
        const points = [];
        for (const line of sec(text, '2D_TRIANGLE_NODE_MAP').split('\n').slice(1)) {
            const t = line.trim();
            if (!t || t.startsWith(';') || t.startsWith('[')) continue;
            const p = t.split(/\s+/);
            if (p.length < 2) continue;
            points.push(finish({
                kind: 'tri', cell: +p[0], node: p[1],
                cd: p.length > 2 ? +p[2] : 0.65,
                area: p.length > 3 ? +p[3] : 1.0
            }));
        }
        const vertexPoints = [];
        for (const line of sec(text, '2D_VERTEX_NODE_MAP').split('\n').slice(1)) {
            const t = line.trim();
            if (!t || t.startsWith(';') || t.startsWith('[')) continue;
            const p = t.split(/\s+/);
            if (p.length < 2) continue;
            vertexPoints.push(finish({
                kind: 'vertex', vertex: +p[0], node: p[1],
                cd: p.length > 2 ? +p[2] : 0.65,
                area: p.length > 3 ? +p[3] : 1.0
            }));
        }
        return { points, vertexPoints };
    }

    // The 1D-only INP: strip the 2D sections, let coupling nodes pond above
    // the brim (the engine flags coupled nodes pond-capable regardless of
    // ALLOW_PONDING), and pin the routing step (the 1D-only adaptive step
    // does not match the co-advance grid).
    function build1DInp(text) {
        return text
            .replace(/(^|\n)\[2D_[A-Z_]+\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
            .replace(/(^|\n)\[2D_OPTIONS\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
            .replace(/ALLOW_PONDING\s+NO/i, 'ALLOW_PONDING        YES')
            .replace(/^(ROUTING_STEP\s+.*)$/mi, '$1\nVARIABLE_STEP        NO');
    }

    function simStartSec(text) {
        const s = sec(text, 'OPTIONS');
        const get = (key) => {
            const m = s.match(new RegExp(`^\\s*${key}\\s+(\\S+)`, 'm'));
            return m ? m[1] : null;
        };
        const d = get('START_DATE'), t = get('START_TIME');
        if (!d || !t) return 0;
        const dp = d.split('/').map(Number), tp = t.split(':').map(Number);
        if (dp.length !== 3 || tp.length < 2) return 0;
        return Date.UTC(dp[2], dp[0] - 1, dp[1], tp[0], tp[1], tp[2] || 0) / 1000;
    }

    function simEndSec(text) {
        const s = sec(text, 'OPTIONS');
        const get = (key) => {
            const m = s.match(new RegExp(`^\\s*${key}\\s+(\\S+)`, 'm'));
            return m ? m[1] : null;
        };
        const parse = (d, t) => {
            if (!d || !t) return NaN;
            const dp = d.split('/').map(Number);
            const tp = t.split(':').map(Number);
            if (dp.length !== 3 || tp.length < 2) return NaN;
            return Date.UTC(dp[2], dp[0] - 1, dp[1], tp[0], tp[1], tp[2] || 0) / 1000;
        };
        const s0 = parse(get('START_DATE'), get('START_TIME'));
        const s1 = parse(get('END_DATE'), get('END_TIME'));
        if (isNaN(s0) || isNaN(s1) || s1 <= s0) return 3600;
        return s1 - s0;
    }

    // Uniform 2D rain: the mean over the model's gages of their rate at tSec.
    // mm/hr → m/s. NATURAL_NEIGHBOUR spatial variation is not modelled by the
    // marcher yet (M3 item) — documented limitation.
    function rainMpsAt(text) {
        const start0 = simStartSec(text);
        const gages = [];
        for (const line of sec(text, 'RAINGAGES').split('\n').slice(1)) {
            const t = line.trim();
            if (!t || t.startsWith(';') || t.startsWith('[')) continue;
            const p = t.split(/\s+/);
            if (p.length < 3) continue;
            const fmt = (p[1] || '').toUpperCase();
            const interval = p[2].includes(':')
                ? p[2].split(':').reduce((a, v) => a * 60 + +v, 0)
                : (+p[2] || 1) * 3600;
            const tsIdx = p.indexOf('TIMESERIES');
            gages.push({ id: p[0], fmt, intervalSec: Math.max(1, interval), ts: tsIdx !== -1 ? p[tsIdx + 1] : '' });
        }
        const tsData = {};
        const parseAt = (s) => {
            const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
            if (m) return Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +(m[6] || 0)) / 1000 - start0;
            const n = parseFloat(s);
            return isFinite(n) ? n : 0;
        };
        for (const line of sec(text, 'TIMESERIES').split('\n').slice(1)) {
            const t = line.trim();
            if (!t || t.startsWith(';') || t.startsWith('[')) continue;
            const p = t.split(/\s+/);
            if (p.length < 3) continue;
            const name = p[0];
            const dateIdx = p.length === 4 ? 1 : (p.length === 5 ? 2 : -1);
            if (dateIdx === -1) continue;
            (tsData[name] = tsData[name] || []).push({ at: parseAt(p[dateIdx] + ' ' + p[dateIdx + 1]), v: +p[p.length - 1] });
        }
        const at = (g, tSec) => {
            const rows = (tsData[g.ts] || []).sort((a, b) => a.at - b.at);
            if (!rows.length) return 0;
            if (tSec <= rows[0].at) return rows[0].v;
            let lo = rows[0];
            for (const r of rows) {
                if (r.at <= tSec) lo = r;
                else break;
            }
            const hi = rows[rows.indexOf(lo) + 1];
            const v = hi && hi.at > lo.at
                ? lo.v + (hi.v - lo.v) * (tSec - lo.at) / (hi.at - lo.at)
                : lo.v;
            if (g.fmt === 'INTENSITY') return v;
            if (g.fmt === 'CUMULATIVE') {
                const prev = rows[Math.max(0, rows.indexOf(lo) - 1)] || lo;
                const dt = Math.max(1, tSec - prev.at);
                return (v - prev.v) / (dt / 3600);
            }
            return v / (g.intervalSec / 3600);   // VOLUME: mm per interval
        };
        return (tSec) => {
            if (!gages.length) return 0;
            let mmHr = 0;
            for (const g of gages) mmHr += Math.max(0, at(g, tSec));
            return (mmHr / gages.length) * 0.001 / 3600;
        };
    }

    // The M2 split loop (see harness runCoupled). Returns { frames, report,
    // massBalance }. `api` must expose stride/nodeHeads/nodeDepths/nodeVolumes/
    // setLatInflow; `coupling.points` are tri-coupled only. `rainAt(tSec)`
    // returns the uniform rain rate (m/s) for the window.
    async function runSplit({ Module, api, engine, marcher, coupling, simEndSec,
                              frameIntervalSec, rainAt, onStatus, onProgress }) {
        const nNodes = api.nodeCount(engine);          // returns the count directly
        const hPtr = Module._malloc(nNodes * 8), dPtr = Module._malloc(nNodes * 8), vPtr = Module._malloc(nNodes * 8);
        const elPtr = Module._malloc(8);
        const readDoubles = (ptr, n) => {
            const a = new Float64Array(n);
            for (let i = 0; i < n; i++) a[i] = Module.getValue(ptr + i * 8, 'double');
            return a;
        };
        const cplF = new Float32Array(coupling.points.length * 7);
        const zeroS = new Float32Array(coupling.points.length * 2);
        const np = coupling.points.length;
        const frames = [];
        let prevT = 0, elapsed = 0;
        let nextFrameSec = 0;
        let exch1d2d = 0, exch2d1d = 0;
        const dry = marcher.options.dryDepth || 0.001;
        while (elapsed < simEndSec) {
            const err = api.stride(engine, 1, elPtr);
            if (err !== 0) throw new Error('1D stride failed with code ' + err);
            elapsed = Module.getValue(elPtr, 'double') * 86400;
            if (elapsed <= prevT) continue;
            const dtBatch = elapsed - prevT;
            // freeze the 1D state (project units m / m / m³)
            api.nodeHeads(engine, hPtr, nNodes);
            api.nodeDepths(engine, dPtr, nNodes);
            api.nodeVolumes(engine, vPtr, nNodes);
            const heads = readDoubles(hPtr, nNodes);
            const depths = readDoubles(dPtr, nNodes);
            const vols = readDoubles(vPtr, nNodes);
            for (let k = 0; k < np; k++) {
                const p = coupling.points[k];
                cplF[k * 7 + 0] = p.cell;
                cplF[k * 7 + 1] = p.crown;
                cplF[k * 7 + 2] = p.cd;
                cplF[k * 7 + 3] = p.area;
                cplF[k * 7 + 4] = heads[p.node];
                cplF[k * 7 + 5] = depths[p.node];
                cplF[k * 7 + 6] = vols[p.node];
            }
            marcher.setCouplingData(cplF, zeroS);
            await marcher.advance(prevT, elapsed, rainAt ? rainAt(prevT) : 0);
            const ex = await marcher.readExch();
            for (let k = 0; k < np; k++) {
                // The engine delivers the exchange through a queue whose
                // per-window rate is the MEAN of the last two windows' exchs;
                // set_lateral_inflow applies the mean of the last two SET
                // values (measured), so setting exch/dt lands exactly there.
                api.setLatInflow(engine, coupling.points[k].node, ex.exch[k] / dtBatch);
                if (ex.exch[k] < 0) exch1d2d += -ex.exch[k];
                else exch2d1d += ex.exch[k];
            }
            // frame emission at the report cadence
            if (elapsed >= nextFrameSec || elapsed >= simEndSec) {
                const s = await marcher.sample();
                const nt = s.depth.length;
                const velocity = new Float64Array(nt), vx = new Float64Array(nt), vy = new Float64Array(nt);
                for (let i = 0; i < nt; i++) {
                    const qx = s.qx ? s.qx[i] || 0 : 0, qy = s.qy ? s.qy[i] || 0 : 0;
                    const m = Math.hypot(qx, qy);
                    velocity[i] = m;
                    vx[i] = qx; vy[i] = qy;
                }
                frames.push({ elapsedMs: elapsed * 1000, depth: s.depth, head: s.head, velocity, velocityX: vx, velocityY: vy });
                nextFrameSec = elapsed + (frameIntervalSec || 60);
                if (onProgress) onProgress(elapsed * 1000);
            }
            prevT = elapsed;
        }
        let report = '';
        try {
            api.end(engine);
            api.report(engine);
            if (Module.FS.analyzePath('/model2d.rpt').exists)
                report = Module.FS.readFile('/model2d.rpt', { encoding: 'utf8' });
        } catch (e) { /* report is optional */ }
        let finalVol = 0;
        {
            const s = await marcher.sample();
            for (let i = 0; i < s.vol.length; i++) finalVol += s.vol[i];
        }
        const massBalance = {
            initialVolume: 0,
            finalVolume: finalVol,
            rainfall: 0,
            coupling1DTo2D: exch1d2d,
            coupling2DTo1D: exch2d1d,
            outfallIn: 0, outfallOut: 0, boundaryIn: 0, boundaryOut: 0,
            evaporation: 0,
            continuityError: 0
        };
        Module._free(hPtr); Module._free(dPtr); Module._free(vPtr); Module._free(elPtr);
        if (onStatus) onStatus('done');
        return { frames, report, massBalance };
    }

    global.CouplingSplit = {
        parse2DMesh, parse2DOptions, parseCoupling, build1DInp,
        simEndSec, rainMpsAt, runSplit
    };
})(globalThis);
