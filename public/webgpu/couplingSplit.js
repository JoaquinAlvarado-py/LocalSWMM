// couplingSplit.js â€” M2 1Dâ†”2D split machinery shared by the harness and the
// production GPU worker. Worker-safe (no DOM). Exposes:
//   parse2DMesh, parse2DOptions, parseCoupling, build1DInp, simEndSec,
//   rainMpsAt, runSplit
//
// The split replicates the engine's windowless co-advance: stride the 1D
// (one routing step per landing), freeze the node state, advance the GPU
// marcher over the window, feed âˆ«Q back via set_lateral_inflow. All the
// hard-won M2 lessons live here (see WEBGPU_PLAN.md Â§M2).
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
        for (const t of triangles) {
            const a = vertices[t.v[0]], b = vertices[t.v[1]], c = vertices[t.v[2]];
            t.cx = (a.x + b.x + c.x) / 3;
            t.cy = (a.y + b.y + c.y) / 3;
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
            rebuildCadence: Math.max(1, Math.round(get('REBUILD_CADENCE', 4))),
            dtFloor: get('DT_FLOOR', 0.1),
            exchangeBeta: 0.8
        };
    }

    // Node order = the order the node sections appear in the INP (the engine
    // indexes nodes by parse order) â€” ALL sections sorted by global text
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

    // Vertex stencil CSR for the pseudo-Laplacian head reconstruction
    // (VertexReconstruction.cpp): incident triangles in ascending order, with
    // the Jawahar-Kamath partition-of-unity weights (moment-fit Î», negative
    // clipping, renormalization; uniform fallback on degenerate/collinear or
    // all-clipped stencils). Returns { ptr, idx, wt } (Float64/Int32 arrays).
    function buildVertexStencil(mesh) {
        const nv = mesh.vertices.length, nt = mesh.triangles.length;
        const vertTris = Array.from({ length: nv }, () => []);
        for (let t = 0; t < nt; t++) {
            const v = mesh.triangles[t].v;
            vertTris[v[0]].push(t); vertTris[v[1]].push(t); vertTris[v[2]].push(t);
        }
        const ptr = new Int32Array(nv + 1);
        const idx = [], wt = [];
        for (let b = 0; b < nv; b++) {
            ptr[b] = idx.length;
            const tris = vertTris[b];
            const M = tris.length;
            if (M === 0) continue;
            const xb = mesh.vertices[b].x, yb = mesh.vertices[b].y;
            let Ixx = 0, Iyy = 0, Ixy = 0;
            for (const t of tris) {
                const dx = mesh.triangles[t].cx - xb, dy = mesh.triangles[t].cy - yb;
                Ixx += dx * dx; Iyy += dy * dy; Ixy += dx * dy;
            }
            const det = Ixx * Iyy - Ixy * Ixy;
            let weights;
            if (Math.abs(det) < 1e-30) {
                weights = tris.map(() => 1 / M);
            } else {
                let Sx = 0, Sy = 0;
                for (const t of tris) {
                    Sx += mesh.triangles[t].cx - xb;
                    Sy += mesh.triangles[t].cy - yb;
                }
                const Rx = -Sx / M, Ry = -Sy / M;
                const invDet = 1 / det;
                const lx = (Iyy * Rx - Ixy * Ry) * invDet;
                const ly = (Ixx * Ry - Ixy * Rx) * invDet;
                weights = tris.map(t => {
                    const dx = mesh.triangles[t].cx - xb, dy = mesh.triangles[t].cy - yb;
                    const w = (1 / M) + lx * dx + ly * dy;
                    return w < 0 ? 0 : w;
                });
                const wSum = weights.reduce((a, b) => a + b, 0);
                if (wSum > 1e-30) weights = weights.map(w => w / wSum);
                else weights = tris.map(() => 1 / M);
            }
            for (let i = 0; i < M; i++) { idx.push(tris[i]); wt.push(weights[i]); }
        }
        ptr[nv] = idx.length;
        return { ptr, idx: Int32Array.from(idx), wt: Float64Array.from(wt) };
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
            // Keep the INP name: an unresolved node would index heads[-1] →
            // undefined → NaN in the exchange, so the caller drops the point
            // and reports it rather than silently poisoning the 2D field.
            p.nodeId = p.node;
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
        const vRows = [];
        for (const line of sec(text, '2D_VERTEX_NODE_MAP').split('\n').slice(1)) {
            const t = line.trim();
            if (!t || t.startsWith(';') || t.startsWith('[')) continue;
            const p = t.split(/\s+/);
            if (p.length < 2) continue;
            vRows.push({ vertex: +p[0], node: p[1], cd: p.length > 2 ? +p[2] : 0.65, area: p.length > 3 ? +p[3] : 1.0 });
        }
        if (vRows.length) {
            // Live vertex-coupled points become SINGLE-CELL points on the
            // LOWEST-BED incident cell (SurfaceRouter2D.cpp:394-412: "the
            // lowest-bed incident cell, where water pools â€” the wet/dry ramp
            // then reflects the real pond, not an incidentally-dry neighbour";
            // vertex_idx is cleared so the live exchange uses the CELL head,
            // not the pseudo-Laplacian). The vertex-head/scatter machinery
            // only applies to the outfall injection path (not in the marcher).
            const st = buildVertexStencil(mesh);
            const bed = (t) => {
                const v = mesh.triangles[t].v;
                return (mesh.vertices[v[0]].z + mesh.vertices[v[1]].z + mesh.vertices[v[2]].z) / 3;
            };
            for (const r of vRows) {
                const v = r.vertex;
                if (v < 0 || v >= mesh.vertices.length) continue;
                const cnt = st.ptr[v + 1] - st.ptr[v];
                if (!cnt) continue;
                let lo = st.idx[st.ptr[v]], zlo = bed(lo);
                for (let j = 1; j < cnt; j++) {
                    const t = st.idx[st.ptr[v] + j];
                    const z = bed(t);
                    if (z < zlo) { zlo = z; lo = t; }
                }
                const p = finish({ kind: 'vertex', vertex: v, node: r.node, cd: r.cd, area: r.area, cell: lo, stPtr: 0, stCnt: 0 });
                vertexPoints.push(p);
            }
        }
        // Drop points whose node name is absent from the node sections; the
        // caller surfaces `unresolved` so a bad map is visible instead of
        // turning into NaN heads inside the coupling kernel.
        const unresolved = [];
        const resolved = (list) => list.filter(p => {
            if (p.node >= 0) return true;
            unresolved.push(p.nodeId);
            return false;
        });
        return { points: resolved(points), vertexPoints: resolved(vertexPoints), unresolved };
    }

    // The 1D-only INP: strip the 2D sections and let coupling nodes pond above
    // the brim (the engine flags coupled nodes pond-capable regardless of
    // ALLOW_PONDING).
    //
    // The model's OWN time stepping is preserved. An earlier revision pinned
    // VARIABLE_STEP to 0 to force fixed ROUTING_STEP strides — measured on
    // bellinge-8h (identical INP, same 1020 set_pond_area calls, no GPU drain
    // in either arm):
    //
    //   VARIABLE_STEP 0    → 10.00 s fixed step, 2874 strides, 4.5 s wall,
    //                        40.19 % of steps not converging,
    //                        645 of 1020 coupling-node heads NON-FINITE
    //                        (max 2.07e+300), routing continuity block
    //                        corrupted by NaN.
    //   model's 0.75       → 1.50 s mean step (min 0.50), 19067 strides,
    //                        18.5 s wall, 32.79 % not converging,
    //                        0 non-finite heads (max 49.89 m),
    //                        routing continuity +7.33 %.
    //
    // Bellinge declares MINIMUM_STEP 0.5; the pin ran 20× coarser than the
    // model asks for. A FIXED 1 s step reproduces the adaptive answer
    // (+6.64 % continuity) but costs 23 s — adaptive is both cheaper and
    // correct, so there is no fixed-step variant worth keeping. The pin
    // bought ~90 s on a 48 h run of ~11 min and cost the entire 1D solution.
    // See scripts/verify-1d-split.mjs for the regression gate.
    function build1DInp(text) {
        return text
            .replace(/(^|\n)\[2D_[A-Z_]+\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
            .replace(/(^|\n)\[2D_OPTIONS\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
            .replace(/ALLOW_PONDING\s+NO/i, 'ALLOW_PONDING        YES');
    }

    function routingStepSec(text) {
        const m = sec(text, 'OPTIONS').match(/^ROUTING_STEP\s+(\S+)/m);
        if (!m) return 60;
        const p = m[1].split(':').map(Number);
        return (p.length === 3) ? p[0] * 3600 + p[1] * 60 + p[2] : (parseFloat(m[1]) || 60);
    }

    function simStartSec(text) {        const s = sec(text, 'OPTIONS');
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
    // mm/hr â†’ m/s. NATURAL_NEIGHBOUR spatial variation is not modelled by the
    // marcher yet (M3 item) â€” documented limitation.
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
    // setLatInflow; `coupling.points` are tri-coupled, `coupling.vertexPoints`
    // vertex-coupled (engine order: vertex points first). `rainAt(tSec)`
    // returns the uniform rain rate (m/s) for the window. The 1D advances
    // `couplingWindowSec` of sim per GPU window (default 60 s): the engine
    // delivers each window's exchange through a queue at a uniform rate, so a
    // 60 s coupling cadence is the M2-validated equivalence.
    async function runSplit({ Module, api, engine, marcher, coupling, simEndSec,
                              frameIntervalSec, rainAt, onStatus, onProgress,
                              couplingWindowSec }) {
        const nNodes = api.nodeCount(engine);          // returns the count directly
        const hPtr = Module._malloc(nNodes * 8), dPtr = Module._malloc(nNodes * 8), vPtr = Module._malloc(nNodes * 8);
        const elPtr = Module._malloc(8);
        const readDoubles = (ptr, n) => {
            const a = new Float64Array(n);
            for (let i = 0; i < n; i++) a[i] = Module.getValue(ptr + i * 8, 'double');
            return a;
        };
        const allPoints = [...(coupling.vertexPoints || []), ...(coupling.points || [])];
        const np = allPoints.length;
        const cplF = new Float32Array(np * 9);
        const zeroS = new Float32Array(np * 2);
        const frames = [];
        let prevT = 0, elapsed = 0;
        const windowSec = Math.max(1, couplingWindowSec || 60);
        let nextFrameSec = 0;
        let exch1d2d = 0, exch2d1d = 0;
        // Rain enters every cell as dt·rate·area — cellUpdate, cellUpdateLts
        // and lazySources in marcher.wgsl all apply the same term — so the
        // domain footprint turns the window's rate into a volume.
        let rainVolume = 0, domainArea = 0;
        for (let i = 0; i < marcher.edges.nt; i++) domainArea += marcher.getTriArea(i);
        while (elapsed < simEndSec) {
            const t0 = performance.now();
            // Fill the window by TIME, not by stride count. The 1D runs the
            // model's own adaptive step, so a stride lands anywhere between
            // MINIMUM_STEP and ROUTING_STEP; a fixed count would yield windows
            // from a few seconds to a full minute. Overshoot is bounded by one
            // internal step, and the exchange below divides by the real
            // dtBatch, so the delivered rate self-corrects.
            const target = prevT + windowSec;
            let strideErr = 0, stalled = 0, lastElapsed = elapsed;
            do {
                strideErr = api.stride(engine, 1, elPtr);
                if (strideErr !== 0) break;      // sim finished mid-window
                elapsed = Module.getValue(elPtr, 'double') * 86400;
                if (elapsed > lastElapsed) { lastElapsed = elapsed; stalled = 0; }
                else if (++stalled >= 8) break;  // engine no longer advancing
            } while (elapsed < target && elapsed < simEndSec);
            if (strideErr !== 0 && elapsed < simEndSec) throw new Error('1D stride failed with code ' + strideErr);
            if (elapsed <= prevT) break;         // no progress — stop, do not spin
            const t1 = performance.now();
            const dtBatch = elapsed - prevT;
            // freeze the 1D state (project units m / m / mÂ³)
            api.nodeHeads(engine, hPtr, nNodes);
            api.nodeDepths(engine, dPtr, nNodes);
            api.nodeVolumes(engine, vPtr, nNodes);
            const t2 = performance.now();
            const heads = readDoubles(hPtr, nNodes);
            const depths = readDoubles(dPtr, nNodes);
            const vols = readDoubles(vPtr, nNodes);
            for (let k = 0; k < np; k++) {
                const p = allPoints[k];
                const h = heads[p.node], d = depths[p.node], v = vols[p.node];
                // A diverged 1D solve produces NaN/Inf node state. The
                // coupling kernel has no guard — it would feed the orifice law
                // and silently poison the whole 2D field — so fail loudly
                // here. The app treats this code as a fallback trigger and
                // retries on the WASM co-advance worker.
                if (!Number.isFinite(h) || !Number.isFinite(d) || !Number.isFinite(v)) {
                    throw new Error(`COUPLING_STATE_NONFINITE: 1D node ${p.nodeId || p.node} `
                        + `returned a non-finite state at t=${elapsed.toFixed(1)} s `
                        + `(head=${h}, depth=${d}, volume=${v}). The 1D solve diverged; `
                        + `refusing to feed it into the 2D exchange.`);
                }
                cplF[k * 9 + 0] = p.cell;
                cplF[k * 9 + 1] = p.crown;
                cplF[k * 9 + 2] = p.cd;
                cplF[k * 9 + 3] = p.area;
                cplF[k * 9 + 4] = h;
                cplF[k * 9 + 5] = d;
                cplF[k * 9 + 6] = v;
                cplF[k * 9 + 7] = p.stPtr || 0;
                cplF[k * 9 + 8] = p.stCnt || 0;
            }
            const rainRate = rainAt ? rainAt(prevT) : 0;
            marcher.setCouplingData(cplF, zeroS);
            await marcher.advance(prevT, elapsed, rainRate);
            rainVolume += rainRate * dtBatch * domainArea;
            const t3 = performance.now();
            if (marcher.options.debugCell >= 0) {
                try {
                    const cs = await marcher.cellState(marcher.options.debugCell);
                    if (onProgress) onProgress(elapsed * 1000, { debugCell: { t: Math.round(elapsed), v: cs.vol, h: cs.head, d: cs.depth, qx: cs.qx, qy: cs.qy } });
                } catch (e) { }
            }
            const ex = await marcher.readExch();
            const t4 = performance.now();
            for (let k = 0; k < np; k++) {
                // The engine delivers the exchange through a queue whose
                // per-window rate is the MEAN of the last two windows' exchs;
                // set_lateral_inflow applies the mean of the last two SET
                // values (measured), so setting exch/dt lands exactly there.
                api.setLatInflow(engine, allPoints[k].node, ex.exch[k] / dtBatch);
                if (ex.exch[k] < 0) exch1d2d += -ex.exch[k];
                else exch2d1d += ex.exch[k];
            }
            // frame emission at the report cadence
            if (elapsed >= nextFrameSec || elapsed >= simEndSec) {
                const s = await marcher.sample();
                const nt = s.depth.length;
                const velocity = new Float64Array(nt), vx = new Float64Array(nt), vy = new Float64Array(nt);
                if (!global.View2D) throw new Error('COUPLING_VIEW2D_MISSING: view2d.js was not loaded in the GPU worker');
                const velocityOf = global.View2D.velocityFromDischarge;
                for (let i = 0; i < nt; i++) {
                    const qx = s.qx ? s.qx[i] || 0 : 0, qy = s.qy ? s.qy[i] || 0 : 0;
                    const depth = Number(s.depth[i]);
                    // Depth-gated + magnitude-clamped velocity (CONTEXT.md:
                    // q/h inflation). The engine Froude-caps its face fluxes;
                    // the gate here keeps the rendered field from amplifying
                    // q over the mm-scale film into tens of m/s.
                    const v = velocityOf(qx, qy, depth);
                    velocity[i] = v.mag;
                    vx[i] = v.vx; vy[i] = v.vy;
                }
                frames.push({ elapsedMs: elapsed * 1000, depth: s.depth, head: s.head, velocity, velocityX: vx, velocityY: vy });
                nextFrameSec = elapsed + (frameIntervalSec || 60);
                if (onProgress) onProgress(elapsed * 1000);
            }
            prevT = elapsed;
            // dt0-collapse diagnosis: sample the argmin cell's state when the
            // CFL min is pathological (f32 Perot speed qm/h at a pinned
            // coupling cell).
            if (marcher._lastArgmin >= 0 && marcher.dt0 < 0.05) {
                try {
                    const cs = await marcher.cellState(marcher._lastArgmin);
                    const lchar = marcher.edges.cell_lchar[marcher._lastArgmin];
                    const speed = cs.depth > 1e-6 ? Math.hypot(cs.qx, cs.qy) / cs.depth : Infinity;
                    if (onProgress) onProgress(elapsed * 1000, { cell: marcher._lastArgmin, h: cs.depth, qm: Math.hypot(cs.qx, cs.qy), speed, lchar, dt0: marcher.dt0 });
                } catch (e) { }
            }
            if (onProgress) onProgress(elapsed * 1000, { totalMs: Math.round(performance.now() - t0), strideMs: Math.round(t1 - t0), freezeMs: Math.round(t2 - t1), advanceMs: Math.round(t3 - t2), exchMs: Math.round(t4 - t3), win: Math.round(dtBatch), dt0: marcher.dt0, sub: marcher.substeps, arg: marcher._lastArgmin });
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
        // Continuity uses the engine's own convention (verified against
        // swmm_2d_get_continuity_error): (in − out − Δstored) / in, as a
        // fraction. It is NULL when nothing entered the domain, so the UI
        // hides the chip rather than showing a fabricated 0 %.
        const volIn = rainVolume + exch1d2d;
        const volOut = exch2d1d;
        const massBalance = {
            initialVolume: 0,
            finalVolume: finalVol,
            rainfall: rainVolume,
            coupling1DTo2D: exch1d2d,
            coupling2DTo1D: exch2d1d,
            outfallIn: 0, outfallOut: 0, boundaryIn: 0, boundaryOut: 0,
            evaporation: 0,
            continuityError: volIn > 0 ? (volIn - volOut - finalVol) / volIn : null
        };
        Module._free(hPtr); Module._free(dPtr); Module._free(vPtr); Module._free(elPtr);
        if (onStatus) onStatus('done');
        return { frames, report, massBalance };
    }

    global.CouplingSplit = {
        parse2DMesh, parse2DOptions, parseCoupling, build1DInp,
        simEndSec, rainMpsAt, runSplit, buildVertexStencil, routingStepSec
    };
})(globalThis);
