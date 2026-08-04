// webgpuMarscher.js — SWMM Fork WebGPU: 2D explicit local-inertial marcher.
//
// M1 scope: LTS_TIERS=1 (global dt), FLAT closure, uniform rain, WALL
// boundaries. The marching loop mirrors ExplicitInertialSolver::advance()
// exactly (rebuild cadence 4, lazy-source clock, tail handling); kernels in
// shaders/marcher.wgsl port InertialKernels.hpp 1:1 (f64 → f32).
//
// Mesh input contract (from the app's mesh2DIndexed or INP parse):
//   { vertices: [{x, y, z}], triangles: [{v: [i0,i1,i2], n}] }
//
// The edge build is a port of InertialEdges.cpp (bit-exact conventions:
// cL = min(t, nbr), zface = max(cz_L, cz_R), n2 = ((nL+nR)/2)^2, ...).

(function (global) {
    'use strict';

    const G = 9.80665;
    const f32 = data => new Float32Array(data);

    // ------------------------------------------------------------------
    // InertialEdges port (InertialEdges.cpp: build())
    // ------------------------------------------------------------------
    function buildEdges(mesh) {
        const nt = mesh.triangles.length;
        const nv = mesh.vertices.length;

        // vertex arrays
        const vx = new Float64Array(nv), vy = new Float64Array(nv), vz = new Float64Array(nv);
        for (let i = 0; i < nv; i++) {
            vx[i] = mesh.vertices[i].x;
            vy[i] = mesh.vertices[i].y;
            vz[i] = mesh.vertices[i].z;
        }

        // triangle arrays + geometry
        const tri_v = new Int32Array(nt * 3);
        const mannings = new Float64Array(nt);
        const tri_cx = new Float64Array(nt), tri_cy = new Float64Array(nt), tri_cz = new Float64Array(nt);
        const tri_area = new Float64Array(nt);
        for (let t = 0; t < nt; t++) {
            const tr = mesh.triangles[t];
            const v0 = tr.v[0], v1 = tr.v[1], v2 = tr.v[2];
            tri_v[t * 3 + 0] = v0; tri_v[t * 3 + 1] = v1; tri_v[t * 3 + 2] = v2;
            mannings[t] = tr.n || 0.045;
            const x0 = vx[v0], y0 = vy[v0], x1 = vx[v1], y1 = vy[v1], x2 = vx[v2], y2 = vy[v2];
            tri_cx[t] = (x0 + x1 + x2) / 3;
            tri_cy[t] = (y0 + y1 + y2) / 3;
            tri_cz[t] = (vz[v0] + vz[v1] + vz[v2]) / 3;
            tri_area[t] = 0.5 * Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0));
        }

        // neighbors: edge keyed by sorted (min, max) vertex pair
        const nbr = new Int32Array(nt * 3).fill(-1);
        const edgeKey = new Map();          // key -> {t, e}
        for (let t = 0; t < nt; t++) {
            for (let e = 0; e < 3; e++) {
                const vA = tri_v[t * 3 + (e + 1) % 3];
                const vB = tri_v[t * 3 + (e + 2) % 3];
                const a = Math.min(vA, vB), b = Math.max(vA, vB);
                const key = a * (nv + 1) + b;
                const hit = edgeKey.get(key);
                if (!hit) {
                    edgeKey.set(key, { t, e });
                } else {
                    const t2 = hit.t, e2 = hit.e;
                    nbr[t * 3 + e] = t2;
                    nbr[t2 * 3 + e2] = t;
                    edgeKey.delete(key);
                }
            }
        }

        // per-edge geometry (flat [tri*3+e] like MeshData)
        const edgeLen = new Float64Array(nt * 3);
        const edgeNx = new Float64Array(nt * 3), edgeNy = new Float64Array(nt * 3);
        const edgeMx = new Float64Array(nt * 3), edgeMy = new Float64Array(nt * 3);
        for (let t = 0; t < nt; t++) {
            for (let e = 0; e < 3; e++) {
                const vA = tri_v[t * 3 + (e + 1) % 3], vB = tri_v[t * 3 + (e + 2) % 3];
                const idx = t * 3 + e;
                const dx = vx[vB] - vx[vA], dy = vy[vB] - vy[vA];
                edgeLen[idx] = Math.hypot(dx, dy);
                edgeMx[idx] = (vx[vA] + vx[vB]) / 2;
                edgeMy[idx] = (vy[vA] + vy[vB]) / 2;
                // outward normal via centroid-side test (MeshBuilder.cpp)
                let nx = dy, ny = -dx;
                const dot = (edgeMx[idx] - tri_cx[t]) * nx + (edgeMy[idx] - tri_cy[t]) * ny;
                if (dot < 0) { nx = -nx; ny = -ny; }
                const len = Math.hypot(nx, ny);
                if (len > 0) { edgeNx[idx] = nx / len; edgeNy[idx] = ny / len; }
                else { edgeNx[idx] = 0; edgeNy[idx] = 0; }
            }
        }

        // Phase 1: unique interior edges (InertialEdges.cpp:39-83)
        const cL = [], cR = [], xi = [], invDx = [], zface = [], slotL = [], slotR = [];
        const nxArr = [], nyArr = [], mxArr = [], myArr = [], invDxNormal = [], n2Face = [];
        const slotEdge = new Int32Array(nt * 3).fill(-1);
        for (let t = 0; t < nt; t++) {
            for (let e = 0; e < 3; e++) {
                const nb = nbr[t * 3 + e];
                if (nb < 0 || nb < t) continue;
                const eid = cL.length;
                cL.push(t); cR.push(nb);
                xi.push(edgeLen[t * 3 + e]);
                const ddx = Math.hypot(tri_cx[t] - tri_cx[nb], tri_cy[t] - tri_cy[nb]);
                invDx.push(ddx > 1e-12 ? 1 / ddx : 0.0);
                zface.push(Math.max(tri_cz[t], tri_cz[nb]));
                slotL.push(t * 3 + e);
                let e2 = 0;
                while (e2 < 3 && nbr[nb * 3 + e2] !== t) e2++;
                slotR.push(nb * 3 + e2);
                slotEdge[t * 3 + e] = eid;
                slotEdge[nb * 3 + e2] = eid;
                nxArr.push(edgeNx[t * 3 + e]); nyArr.push(edgeNy[t * 3 + e]);
                mxArr.push(edgeMx[t * 3 + e]); myArr.push(edgeMy[t * 3 + e]);
                const dxc = tri_cx[nb] - tri_cx[t], dyc = tri_cy[nb] - tri_cy[t];
                const chord = Math.hypot(dxc, dyc);
                const dn = Math.max(Math.abs(dxc * edgeNx[t * 3 + e] + dyc * edgeNy[t * 3 + e]), 0.3 * chord);
                invDxNormal.push(dn > 1e-12 ? 1 / dn : 0.0);
                const nf = 0.5 * (mannings[t] + mannings[nb]);
                n2Face.push(nf * nf);
            }
        }
        const ne = cL.length;

        // cell_lchar (InertialEdges.cpp:87-93)
        const cellLchar = new Float64Array(nt);
        for (let t = 0; t < nt; t++) {
            let xiMax = 0;
            for (let e = 0; e < 3; e++) {
                const sidx = slotEdge[t * 3 + e];
                if (sidx >= 0) xiMax = Math.max(xiMax, edgeLen[t * 3 + e]);
            }
            cellLchar[t] = xiMax > 0 ? 2 * tri_area[t] / xiMax : 0;
        }

        // Phase 2: per-cell CSR (InertialEdges.cpp:96-115), local-edge order
        const cellPtr = new Int32Array(nt + 1);
        for (let t = 0; t < nt; t++) {
            let count = 0;
            for (let e = 0; e < 3; e++) if (slotEdge[t * 3 + e] >= 0) count++;
            cellPtr[t + 1] = cellPtr[t] + count;
        }
        const cellEdge = new Int32Array(cellPtr[nt]);
        const cellSign = new Float64Array(cellPtr[nt]);
        const fill = new Int32Array(nt).fill(0);
        for (let t = 0; t < nt; t++) {
            for (let e = 0; e < 3; e++) {
                const eid = slotEdge[t * 3 + e];
                if (eid < 0) continue;
                const pos = cellPtr[t] + fill[t]++;
                cellEdge[pos] = eid;
                cellSign[pos] = cL[eid] === t ? 1.0 : -1.0;
            }
        }

        return {
            nt, ne,
            tri_cz, tri_area, tri_cx, tri_cy, cell_lchar: cellLchar,
            cL, cR, xi, zface, nx: nxArr, ny: nyArr, mx: mxArr, my: myArr,
            inv_dx_normal: invDxNormal, n2_face: n2Face,
            cell_ptr: cellPtr, cell_edge: cellEdge, cell_sign: cellSign,
            nbr
        };
    }

    // ------------------------------------------------------------------
    // WebGPUMarcher — device, pipelines, buffers, marching loop
    // ------------------------------------------------------------------
    class WebGPUMarcher {
        constructor(device, mesh, options) {
            this.device = device;
            this.mesh = mesh;
            this.options = options || {};
            this.edges = buildEdges(mesh);
            this._initBuffers();
            this.t = 0;
            this.t_last_sync = 0;
            this.cycles = 1000;               // force rebuild on first advance
            this.dt0 = options.maxTimestep;
            this.activeCount = 0;
        }

        static async create(device, mesh, options) {
            const m = new WebGPUMarcher(device, mesh, options);
            await m._uploadStatic();
            const code = await fetch('shaders/marcher.wgsl?v=' + Date.now()).then(r => {
                if (!r.ok) throw new Error('shaders/marcher.wgsl HTTP ' + r.status);
                return r.text();
            });
            m._compile(code);
            return m;
        }

        _initBuffers() {
            const e = this.edges, nt = e.nt, ne = e.ne;
            this.buf = {};
            this._tmp = {
                tri_cz: f32(e.tri_cz), tri_area: f32(e.tri_area), tri_cx: f32(e.tri_cx), tri_cy: f32(e.tri_cy),
                cell_lchar: f32(e.cell_lchar),
                face_cLR: new Uint32Array(e.cL.length * 2),
                face_xi: f32(e.xi), face_inv_dx_n: f32(e.inv_dx_normal), face_n2: f32(e.n2_face),
                face_nx: f32(e.nx), face_ny: f32(e.ny), face_zface: f32(e.zface),
                face_mx: f32(e.mx), face_my: f32(e.my),
                cell_ptr: new Uint32Array(e.cell_ptr), cell_edge: new Uint32Array(e.cell_edge), cell_sign: f32(e.cell_sign)
            };
            for (let i = 0; i < ne; i++) {
                this._tmp.face_cLR[i * 2] = e.cL[i];
                this._tmp.face_cLR[i * 2 + 1] = e.cR[i];
            }
            // Packed layout (matches marcher.wgsl):
            //   geoA [5*nt]: cz, area, cx, cy, lchar
            //   geoF [8*ne + csr]: xi, inv_dx_n, n2, nx, ny, zface, mx, my, sign
            //   topo [2*ne + nt+1 + csrTotal]: face_cLR, cell_ptr, cell_edge
            const t = this._tmp, csr = e.cell_ptr[nt];
            const geoA = new Float32Array(5 * nt);
            geoA.set(t.tri_cz, 0 * nt); geoA.set(t.tri_area, 1 * nt); geoA.set(t.tri_cx, 2 * nt);
            geoA.set(t.tri_cy, 3 * nt); geoA.set(t.cell_lchar, 4 * nt);
            const geoF = new Float32Array(8 * ne + csr);
            geoF.set(t.face_xi, 0 * ne); geoF.set(t.face_inv_dx_n, 1 * ne); geoF.set(t.face_n2, 2 * ne);
            geoF.set(t.face_nx, 3 * ne); geoF.set(t.face_ny, 4 * ne); geoF.set(t.face_zface, 5 * ne);
            geoF.set(t.face_mx, 6 * ne); geoF.set(t.face_my, 7 * ne);
            geoF.set(t.cell_sign, 8 * ne);
            const topo = new Uint32Array(2 * ne + nt + 1 + csr);
            topo.set(t.face_cLR, 0);
            topo.set(t.cell_ptr, 2 * ne);
            topo.set(t.cell_edge, 2 * ne + nt + 1);
            this._packed = { geoA, geoF, topo, nt, ne, csr };
        }

        getTriArea(cellIdx) {
            return this._packed.geoA[this.edges.nt + cellIdx];
        }

        async _uploadStatic() {
            const d = this.device, P = this._packed;
            const STORE = GPUBufferUsage.STORAGE;
            const mk = (typed, label) => {
                const b = d.createBuffer({ size: typed.byteLength, usage: STORE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, label });
                d.queue.writeBuffer(b, 0, typed);
                return b;
            };
            this.buf.geoA = mk(P.geoA, 'geoA');
            this.buf.geoF = mk(P.geoF, 'geoF');
            this.buf.topo = mk(P.topo, 'topo');

            const nt = P.nt, ne = P.ne;
            const mkDyn = (bytes, label) => d.createBuffer({
                size: bytes, usage: STORE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, label
            });
            const mkState = (data, label) => {
                const b = mkDyn(data.byteLength, label);
                d.queue.writeBuffer(b, 0, data);
                return b;
            };
            const state = new Float32Array(5 * nt);
            state.set(f32(this.edges.tri_cz), nt);        // head = cz + 0
            this.buf.state = mkState(state, 'state');     // vol, head, depth, qcx, qcy
            this.buf.qbuf = mkState(new Float32Array(3 * ne), 'qbuf'); // q, faccL, faccR
            this.buf.wk = mkState(new Uint32Array(2 * nt), 'wk');    // cell_active, next
            this.buf.red = mkState(new Uint32Array([0, 0x7F800000]), 'red'); // count, dt0-bits (1e30)
            this.buf.redRB = this.device.createBuffer({
                size: 8,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                label: 'redRB'
            });
            // M2 coupling buffers (pre-created so the bind group can reference them)
            this.couplingNp = this.options.couplingNp || 0;
            const cplBytes = Math.max(4, this.couplingNp * (this.couplingNp ? 7 * 4 : 1));
            this.buf.cplF = this.device.createBuffer({
                size: this.couplingNp ? this.couplingNp * 7 * 4 : 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, label: 'cplF'
            });
            this.buf.cplS = this.device.createBuffer({
                size: this.couplingNp ? this.couplingNp * 2 * 4 : 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, label: 'cplS'
            });
            this.buf.pin = this.device.createBuffer({
                size: Math.max(4, this.edges.nt * 4),
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
                label: 'pin'
            });
            const pins = new Uint32Array(this.edges.nt);
            for (const pnt of (this.options.couplingPoints || [])) {
                if (pnt.cell < this.edges.nt) pins[pnt.cell] = 1;
            }
            this.device.queue.writeBuffer(this.buf.pin, 0, pins);
            this._ensureParamsBuffer();
        }

        _ensureCouplingBuffers() {
            const np = this.couplingNp;
            if (!np || this.buf.cplF) return;
            this.buf.cplF = this.device.createBuffer({
                size: np * 7 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, label: 'cplF'
            });
            this.buf.cplS = this.device.createBuffer({
                size: np * 2 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, label: 'cplS'
            });
        }

        _compile(code) {
            this.shader = this.device.createShaderModule({ code, label: 'marcher.wgsl' });
            const nBindings = 11;
            const layout = this.device.createBindGroupLayout({
                entries: Array.from({ length: nBindings }, (_, i) => ({
                    binding: i,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: i <= 3 || i === 8 || i === 10 ? 'read-only-storage' : 'storage' }
                }))
            });
            this.pipelineLayout = this.device.createPipelineLayout({ label: 'marcher-pipeline-layout', bindGroupLayouts: [layout] });
            this.bindGroup = this.device.createBindGroup({
                layout,
                entries: [
                    { binding: 0, resource: { buffer: this.buf.params } },
                    { binding: 1, resource: { buffer: this.buf.geoA } },
                    { binding: 2, resource: { buffer: this.buf.geoF } },
                    { binding: 3, resource: { buffer: this.buf.topo } },
                    { binding: 4, resource: { buffer: this.buf.state } },
                    { binding: 5, resource: { buffer: this.buf.qbuf } },
                    { binding: 6, resource: { buffer: this.buf.wk } },
                    { binding: 7, resource: { buffer: this.buf.red } },
                    { binding: 8, resource: { buffer: this.buf.cplF } },
                    { binding: 9, resource: { buffer: this.buf.cplS } },
                    { binding: 10, resource: { buffer: this.buf.pin } }
                ]
            });
            const pipe = (name, entry) => this.device.createComputePipeline({
                label: name,
                layout: this.pipelineLayout,
                compute: { module: this.shader, entryPoint: entry }
            });
            this.pipes = {
                faceFlux: pipe('faceFlux', 'faceFlux'),
                cellUpdate: pipe('cellUpdate', 'cellUpdate'),
                lazySources: pipe('lazySources', 'lazySources'),
                seedActive: pipe('seedActive', 'seedActive'),
                halo: pipe('halo', 'halo'),
                cflReduce: pipe('cflReduce', 'cflReduce'),
                couplingExchange: pipe('couplingExchange', 'couplingExchange')
            };
        }

        // params uniform: 16 f32s — build via a small CPU buffer
        _ensureParamsBuffer() {
            if (this.buf.params) return;
            this.buf.params = this.device.createBuffer({
                size: 80,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
                label: 'params'
            });
            this._paramData = new Float32Array(20);
        }

        _setParams(patch) {
            this._ensureParamsBuffer();
            const o = this.options;
            const p = this._paramData;
            const nt = this.edges.nt, ne = this.edges.ne;
            const fill = {
                nt: nt, ne: ne,
                dry_depth: o.dryDepth, theta: o.theta, froude_max: o.froudeMax,
                beta_share: (o.exchangeBeta ?? 0.8) / 3.0,
                cfl_alpha: o.cflNumber, max_timestep: o.maxTimestep,
                g: G, eta_deadband: 1e-12,
                h_on: o.hMove + 0.001, h_off: Math.max(0, o.hMove - 0.001),
                dt: 0, dt_lazy: 0, src: 0, exch_beta: o.exchangeBeta ?? 0.8,
                np: 0, pad: 0, pad2: 0, pad3: 0
            };
            Object.assign(fill, patch);
            p.set([fill.nt, fill.ne, fill.dry_depth, fill.theta,
                   fill.froude_max, fill.beta_share, fill.cfl_alpha, fill.max_timestep,
                   fill.g, fill.eta_deadband, fill.h_on, fill.h_off,
                   fill.dt, fill.dt_lazy, fill.src, fill.exch_beta,
                   fill.np, fill.pad, fill.pad2, fill.pad3]);
            // writeBuffer → immediate dispatch reads stale data on some drivers;
            // write to a staging buffer and copy in-encoder instead.
            if (!this.buf.paramsStage) {
                this.buf.paramsStage = this.device.createBuffer({
                    size: 80,
                    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                    label: 'paramsStage'
                });
            }
            this.device.queue.writeBuffer(this.buf.paramsStage, 0, p);
            this._paramsDirty = true;
        }

        // M2: freeze a batch of 1D coupling data (SI metres/m³, pre-converted).
        // cplF32: [np × 7] (cell, crown, cd, area, h1d, d1d, v1d)
        // cplS32: [np × 2] (drawn, exch) — pass null to reset accumulators.
        setCouplingData(cplF32, cplS32) {
            this.couplingNp = cplF32 ? cplF32.length / 7 : 0;
            if (this.couplingNp === 0) return;
            if (!this.buf.cplFStage) {
                const np = this.couplingNp;
                this.buf.cplFStage = this.device.createBuffer({ size: np * 7 * 4, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, label: 'cplFStage' });
                this.buf.cplSStage = this.device.createBuffer({ size: np * 2 * 4, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, label: 'cplSStage' });
            }
            this.device.queue.writeBuffer(this.buf.cplFStage, 0, cplF32);
            if (cplS32) this.device.queue.writeBuffer(this.buf.cplSStage, 0, cplS32);
            else this.device.queue.writeBuffer(this.buf.cplSStage, 0, new Float32Array(this.couplingNp * 2));
            this._couplingDirty = true;
        }

        async readExch() {
            const np = this.couplingNp || 0;
            if (np === 0) return null;
            const out = new Float32Array(np * 2);
            await this._readBack(this.buf.cplS, out);
            return { exch: out.slice(np, np * 2), drawn: out.slice(0, np) };
        }

        _beginEncoder(label) {
            const enc = this.device.createCommandEncoder({ label });
            if (this._paramsDirty) {
                enc.copyBufferToBuffer(this.buf.paramsStage, 0, this.buf.params, 0, 80);
                this._paramsDirty = false;
            }
            if (this._couplingDirty && this.couplingNp > 0) {
                enc.copyBufferToBuffer(this.buf.cplFStage, 0, this.buf.cplF, 0, this.couplingNp * 7 * 4);
                enc.copyBufferToBuffer(this.buf.cplSStage, 0, this.buf.cplS, 0, this.couplingNp * 2 * 4);
                this._couplingDirty = false;
            }
            return enc;
        }

        _dispatch(enc, name, n) {
            const pass = enc.beginComputePass({ label: name });
            pass.setPipeline(this.pipes[name]);
            pass.setBindGroup(0, this.bindGroup);
            pass.dispatchWorkgroups(Math.ceil(n / 64));
            pass.end();
        }

        // rebuild(t, dtLazy): lazy sources → seed → halo → CFL reduction.
        // Mirrors syncAndRebuild() + the tier-0 reduction (K = 1).
        async _rebuild(t, dtLazy, rainRateMps) {
            this._setParams({ dt_lazy: dtLazy, src: rainRateMps });
            const enc = this._beginEncoder('rebuild');
            this._dispatch(enc, 'lazySources', this.edges.nt);
            this._dispatch(enc, 'seedActive', this.edges.nt);
            this._dispatch(enc, 'halo', this.edges.ne);
            // red reset via in-encoder copy (queue.writeBuffer → dispatch reads stale)
            if (!this.buf.redStage) {
                this.buf.redStage = this.device.createBuffer({
                    size: 8,
                    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                    label: 'redStage'
                });
                this.device.queue.writeBuffer(this.buf.redStage, 0, new Uint32Array([0, 0x7F800000]));
            }
            enc.copyBufferToBuffer(this.buf.redStage, 0, this.buf.red, 0, 8);
            this._dispatch(enc, 'cflReduce', this.edges.nt);
            this.t_last_sync = t;
            this.device.queue.submit([enc.finish()]);
            return this._readReduce();
        }

        _readReduce() {
            return (async () => {
                const enc = this.device.createCommandEncoder({ label: 'red-readback' });
                enc.copyBufferToBuffer(this.buf.red, 0, this.buf.redRB, 0, 8);
                this.device.queue.submit([enc.finish()]);
                await this.buf.redRB.mapAsync(GPUMapMode.READ);
                const arr = new Uint32Array(this.buf.redRB.getMappedRange());
                const count = arr[0];
                const dtBits = arr[1];
                this.buf.redRB.unmap();
                const dt = dtBits === 0x7F800000 ? Infinity : new Float32Array(new Uint32Array([dtBits]).buffer)[0];
                return { count, dt };
            })();
        }

        // advance(t0, t1) — mirror ExplicitInertialSolver::advance (K=1)
        async advance(t0, t1, rainRateMps) {
            this.options.rainRateMps = rainRateMps;
            if (t1 <= t0) return t1;
            let t = t0;
            if (this.t_last_sync > t0) this.t_last_sync = t0;
            let cycles = this.cycles;
            let substeps = 0;

            while (t < t1) {
                if (cycles >= 4) {
                    const r = await this._rebuild(t, t - this.t_last_sync, rainRateMps);
                    this.activeCount = r.count;
                    this.dt0 = r.count > 0 ? r.dt : this.options.maxTimestep;
                    cycles = 0;
                }
                if (this.activeCount === 0) {
                    t = t1;
                    cycles++;
                    break;
                }
                const remaining = t1 - t;
                const step = Math.min(this.dt0, remaining);
                if (this.dt0 > remaining) {
                    cycles = 4;                              // tail: rebuild after
                }
                this._setParams({ dt: step, src: rainRateMps, np: this.couplingNp });
                const enc = this._beginEncoder('substep');
                this._dispatch(enc, 'faceFlux', this.edges.ne);
                this._dispatch(enc, 'cellUpdate', this.edges.nt);
                if (this.couplingNp > 0) this._dispatch(enc, 'couplingExchange', this.couplingNp);
                this.device.queue.submit([enc.finish()]);
                t += step;
                substeps++;
                cycles++;
            }
            // final lazy-source landing
            if (t1 > this.t_last_sync) {
                if (cycles >= 4) {
                    const r = await this._rebuild(t1, t1 - this.t_last_sync, rainRateMps);
                    this.activeCount = r.count;
                    this.dt0 = r.count > 0 ? r.dt : this.options.maxTimestep;
                    cycles = 0;
                } else {
                    this._setParams({ dt_lazy: t1 - this.t_last_sync, src: rainRateMps });
                    const enc = this._beginEncoder('final-lazy');
                    this._dispatch(enc, 'lazySources', this.edges.nt);
                    this.device.queue.submit([enc.finish()]);
                    this.t_last_sync = t1;
                }
            }
            this.cycles = cycles;
            this.t = t;
            this.substeps = (this.substeps || 0) + substeps;
            return t;
        }

        async sample() {
            const nt = this.edges.nt;
            const state = new Float32Array(5 * nt);
            await this._readBack(this.buf.state, state);
            return {
                depth: state.slice(2 * nt, 3 * nt),
                head: state.slice(nt, 2 * nt),
                vol: state.slice(0, nt),
                qx: state.slice(3 * nt, 4 * nt),
                qy: state.slice(4 * nt, 5 * nt)
            };
        }

        async _readBack(buf, out) {
            const tmp = this.device.createBuffer({
                size: buf.size,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
            });
            const enc = this.device.createCommandEncoder();
            enc.copyBufferToBuffer(buf, 0, tmp, 0, buf.size);
            this.device.queue.submit([enc.finish()]);
            await tmp.mapAsync(GPUMapMode.READ);
            new Float32Array(tmp.getMappedRange()).forEach((v, i) => { out[i] = v; });
            tmp.unmap();
            tmp.destroy();
        }
    }

    global.WebGPUMarcher = WebGPUMarcher;
    global.buildMarcherEdges = buildEdges;
})(globalThis);
