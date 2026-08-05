// webgpuMarscher.js â€” SWMM Fork WebGPU: 2D explicit local-inertial marcher.
//
// M1 scope: LTS_TIERS=1 (global dt), FLAT closure, uniform rain, WALL
// boundaries. The marching loop mirrors ExplicitInertialSolver::advance()
// exactly (rebuild cadence 4, lazy-source clock, tail handling); kernels in
// shaders/marcher.wgsl port InertialKernels.hpp 1:1 (f64 â†’ f32).
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
    // WebGPUMarcher â€” device, pipelines, buffers, marching loop
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
            this.ltsK = Math.max(1, Math.min(8, Math.floor(options.ltsTiers || 1)));
            this.cellCounts = new Uint32Array(this.ltsK);
            this.edgeCounts = new Uint32Array(this.ltsK);
            this._dbgRebuilds = 0;
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
            this.buf.red = mkState(new Uint32Array([0, 0x7F800000, 0xFFFFFFFF]), 'red'); // count, dt0-bits, argmin-cell (1e30)
            this.buf.redRB = this.device.createBuffer({
                size: 12,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                label: 'redRB'
            });
            // M2 coupling buffers (pre-created so the bind group can reference them).
            // cplF = header [9Â·np] (cell, crown, cd, area, h1d, d1d, v1d,
            // stencilPtr, stencilCount) + the static vertex-stencil tail
            // [2Â·Î£count] (cell, weight) pairs written once here.
            this.couplingNp = this.options.couplingNp || 0;
            const vst = this.options.vertexStencils || null;
            const tailLen = vst && vst.idx ? vst.idx.length : 0;
            const cplBytes = this.couplingNp ? this.couplingNp * 9 * 4 + tailLen * 8 : 4;
            this.buf.cplF = this.device.createBuffer({
                size: cplBytes,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, label: 'cplF'
            });
            if (this.couplingNp && tailLen) {
                const tail = new Float32Array(this.couplingNp * 9 + tailLen * 2);
                for (let i = 0; i < tailLen; i++) {
                    tail[this.couplingNp * 9 + 2 * i] = vst.idx[i];
                    tail[this.couplingNp * 9 + 2 * i + 1] = vst.wt[i];
                }
                this.device.queue.writeBuffer(this.buf.cplF, 0, tail);
            }
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
            // LTS v2 buffers (M3): tier map + per-tier compacted lists.
            const K = this.ltsK;
            const mkU32 = (data, label) => {
                const b = mkDyn(data.byteLength, label);
                this.device.queue.writeBuffer(b, 0, data);
                return b;
            };
            this.buf.tierBuf = mkU32(new Uint32Array(nt + ne), 'tierBuf');
            this.buf.cellList = mkU32(new Uint32Array(K * nt), 'cellList');
            this.buf.edgeList = mkU32(new Uint32Array(K * ne), 'edgeList');
            this.buf.cellCount = mkU32(new Uint32Array(K), 'cellCount');
            this.buf.edgeCount = mkU32(new Uint32Array(K), 'edgeCount');
            // staged zeroes for the per-rebuild count reset + combined readback
            this.buf.tcStage = mkDyn(K * 8, 'tcStage');
            this.device.queue.writeBuffer(this.buf.tcStage, 0, new Uint32Array(2 * K));
            this.buf.redRB = this.device.createBuffer({
                size: 12 + 8 * K,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                label: 'redRB'
            });
            this._ensureParamsBuffer();
        }

        _ensureCouplingBuffers() {
            const np = this.couplingNp;
            if (!np || this.buf.cplF) return;
            this.buf.cplF = this.device.createBuffer({
                size: np * 9 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, label: 'cplF'
            });
            this.buf.cplS = this.device.createBuffer({
                size: np * 2 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, label: 'cplS'
            });
        }

        _compile(code) {
            this.shader = this.device.createShaderModule({ code, label: 'marcher.wgsl' });
            const nBindings = 16;
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
                    { binding: 10, resource: { buffer: this.buf.pin } },
                    { binding: 11, resource: { buffer: this.buf.tierBuf } },
                    { binding: 12, resource: { buffer: this.buf.cellList } },
                    { binding: 13, resource: { buffer: this.buf.cellCount } },
                    { binding: 14, resource: { buffer: this.buf.edgeList } },
                    { binding: 15, resource: { buffer: this.buf.edgeCount } }
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
                cflArgmin: pipe('cflArgmin', 'cflArgmin'),
                couplingExchange: pipe('couplingExchange', 'couplingExchange'),
                settleAcc: pipe('settleAcc', 'settleAcc'),
                tierAssign: pipe('tierAssign', 'tierAssign'),
                faceTierAssign: pipe('faceTierAssign', 'faceTierAssign'),
                degenTier: pipe('degenTier', 'degenTier'),
                degenFaceTier: pipe('degenFaceTier', 'degenFaceTier'),
                faceFluxLts: pipe('faceFluxLts', 'faceFluxLts'),
                cellUpdateLts: pipe('cellUpdateLts', 'cellUpdateLts')
            };
        }

        // params uniform: 24 f32s â€” build via a small CPU buffer
        _ensureParamsBuffer() {
            if (this.buf.params) return;
            this.buf.params = this.device.createBuffer({
                size: 96,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
                label: 'params'
            });
            this._paramData = new Float32Array(24);
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
                np: 0, ltsK: this.ltsK, k: 0, tail: 0, nlist: 0, pad: 0, pad2: 0, pad3: 0
            };
            Object.assign(fill, patch);
            p.set([fill.nt, fill.ne, fill.dry_depth, fill.theta,
                   fill.froude_max, fill.beta_share, fill.cfl_alpha, fill.max_timestep,
                   fill.g, fill.eta_deadband, fill.h_on, fill.h_off,
                   fill.dt, fill.dt_lazy, fill.src, fill.exch_beta,
                   fill.np, fill.ltsK, fill.k, fill.tail, fill.nlist,
                   fill.pad, fill.pad2, fill.pad3]);
            // writeBuffer â†’ immediate dispatch reads stale data on some drivers;
            // write to a staging buffer and copy in-encoder instead.
            if (!this.buf.paramsStage) {
                this.buf.paramsStage = this.device.createBuffer({
                    size: 96,
                    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                    label: 'paramsStage'
                });
            }
            this.device.queue.writeBuffer(this.buf.paramsStage, 0, p);
            this._paramsDirty = true;
        }

        // M2: freeze a batch of 1D coupling data (SI metres/mÂ³, pre-converted).
        // cplF32: [np Ã— 9] (cell, crown, cd, area, h1d, d1d, v1d, stPtr, stCnt)
        // cplS32: [np Ã— 2] (drawn, exch) â€” pass null to reset accumulators.
        setCouplingData(cplF32, cplS32) {
            this.couplingNp = cplF32 ? cplF32.length / 9 : 0;
            if (this.couplingNp === 0) return;
            if (!this.buf.cplFStage) {
                const np = this.couplingNp;
                this.buf.cplFStage = this.device.createBuffer({ size: np * 9 * 4, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, label: 'cplFStage' });
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
            if (this._couplingDirty && this.couplingNp > 0) {
                enc.copyBufferToBuffer(this.buf.cplFStage, 0, this.buf.cplF, 0, this.couplingNp * 9 * 4);
                enc.copyBufferToBuffer(this.buf.cplSStage, 0, this.buf.cplS, 0, this.couplingNp * 2 * 4);
                this._couplingDirty = false;
            }
            return enc;
        }

        _dispatch(enc, name, n) {
            // params travel via an in-encoder copy at every dispatch (LTS fires
            // different tiers with different dt within one encoder).
            if (this._paramsDirty) {
                enc.copyBufferToBuffer(this.buf.paramsStage, 0, this.buf.params, 0, 96);
                this._paramsDirty = false;
            }
            const pass = enc.beginComputePass({ label: name });
            pass.setPipeline(this.pipes[name]);
            pass.setBindGroup(0, this.bindGroup);
            pass.dispatchWorkgroups(Math.ceil(n / 64));
            pass.end();
        }

        _dispatchLts(enc, name, n, patch) {
            this._setParams(patch);
            this._dispatch(enc, name, n);
        }

        // rebuild(t, dtLazy): lazy sources â†’ seed â†’ halo â†’ CFL reduction â†’ tier
        // assignment + per-tier compaction (K â‰¥ 1). Mirrors syncAndRebuild().
        async _rebuild(t, dtLazy, rainRateMps) {
            const src = { dt_lazy: dtLazy, src: rainRateMps, np: this.couplingNp };
            const enc = this._beginEncoder('rebuild');
            if (this.ltsK > 1) this._dispatchLts(enc, 'settleAcc', this.edges.nt, { ...src, dt_lazy: 0 });
            this._dispatchLts(enc, 'lazySources', this.edges.nt, src);
            this._dispatchLts(enc, 'seedActive', this.edges.nt, src);
            this._dispatchLts(enc, 'halo', this.edges.ne, src);
            // red + tier-count reset via in-encoder copies (queue.writeBuffer â†’
            // dispatch reads stale on some drivers)
            if (!this.buf.redStage) {
                this.buf.redStage = this.device.createBuffer({
                    size: 12,
                    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                    label: 'redStage'
                });
                this.device.queue.writeBuffer(this.buf.redStage, 0, new Uint32Array([0, 0x7F800000, 0xFFFFFFFF]));
            }
            enc.copyBufferToBuffer(this.buf.redStage, 0, this.buf.red, 0, 12);
            if (this.ltsK > 1) {
                enc.copyBufferToBuffer(this.buf.tcStage, 0, this.buf.cellCount, 0, this.ltsK * 4);
                enc.copyBufferToBuffer(this.buf.tcStage, this.ltsK * 4, this.buf.edgeCount, 0, this.ltsK * 4);
            }
            this._dispatchLts(enc, 'cflReduce', this.edges.nt, src);
            this._dispatchLts(enc, 'cflArgmin', this.edges.nt, src);
            if (this.ltsK > 1) {
                this._dispatchLts(enc, 'tierAssign', this.edges.nt, src);
                this._dispatchLts(enc, 'faceTierAssign', this.edges.ne, src);
            }
            this.t_last_sync = t;
            this.device.queue.submit([enc.finish()]);
            const r = await this._readReduce();
            if (this.ltsK > 1 && this._dbgRebuilds++ % 64 === 0) {
                console.log(`LTS[${this.t.toFixed(1)}s] dt0=${r.dt.toExponential(3)} active=${r.count} cells=[${Array.from(this.cellCounts).join(',')}] edges=[${Array.from(this.edgeCounts).join(',')}]`);
            }
            return r;
        }

        _readReduce() {
            return (async () => {
                const enc = this.device.createCommandEncoder({ label: 'red-readback' });
                enc.copyBufferToBuffer(this.buf.red, 0, this.buf.redRB, 0, 12);
                if (this.ltsK > 1) {
                    enc.copyBufferToBuffer(this.buf.cellCount, 0, this.buf.redRB, 12, this.ltsK * 4);
                    enc.copyBufferToBuffer(this.buf.edgeCount, 0, this.buf.redRB, 12 + this.ltsK * 4, this.ltsK * 4);
                }
                this.device.queue.submit([enc.finish()]);
                await this.buf.redRB.mapAsync(GPUMapMode.READ);
                const arr = new Uint32Array(this.buf.redRB.getMappedRange());
                const count = arr[0];
                const dtBits = arr[1];
                const argmin = arr[2];
                if (this.ltsK > 1) {
                    this.cellCounts.set(arr.subarray(3, 3 + this.ltsK));
                    this.edgeCounts.set(arr.subarray(3 + this.ltsK, 3 + 2 * this.ltsK));
                }
                this.buf.redRB.unmap();
                let dt = dtBits === 0x7F800000 ? Infinity : new Float32Array(new Uint32Array([dtBits]).buffer)[0];
                // dt0 floor: the Bellinge mesh contains ~0.25 m cells whose CFL
                // dt is ~0.02 s; they pin the GLOBAL min for both engines (the
                // engine's "Avg Internal Step 0.2456 s" is the LTS-weighted
                // effective dt — its base dt0 is the same regime). Without a
                // floor the f32 marcher runs 5-7M substeps. A floor at the
                // mesh's tiny-cell scale (2× their CFL) bounds the substeps
                // with a local-stability risk confined to those cells.
                const dtFloor = this.options.dtFloor || 0.05;
                if (isFinite(dt) && dt < dtFloor) dt = dtFloor;
                this._lastArgmin = argmin === 0xFFFFFFFF ? -1 : argmin;
                return { count, dt };
            })();
        }

        // advance(t0, t1) â€” mirror ExplicitInertialSolver::advance. K = 1 keeps
        // the global-dt path (bit-identical to the M1 marcher); K > 1 runs the
        // LTS halving macro-cycle with one encoder per macro cycle (batching).
        async advance(t0, t1, rainRateMps) {
            this.options.rainRateMps = rainRateMps;
            if (t1 <= t0) return t1;
            const K = this.ltsK;
            let t = t0;
            if (this.t_last_sync > t0) this.t_last_sync = t0;
            let cycles = this.cycles;
            let substeps = 0;
            const base = { src: rainRateMps, np: this.couplingNp };

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
                if (K <= 1) {
                    const step = Math.min(this.dt0, remaining);
                    if (!(step > 0) || !isFinite(step)) { t = t1; break; }   // dt floor guard
                    if (this.dt0 > remaining) cycles = 4;   // tail: rebuild after
                    const enc = this._beginEncoder('substep');
                    this._dispatchLts(enc, 'faceFlux', this.edges.ne, { dt: step, ...base });
                    this._dispatchLts(enc, 'cellUpdate', this.edges.nt, { dt: step, ...base });
                    if (this.couplingNp > 0) this._dispatchLts(enc, 'couplingExchange', this.couplingNp, { dt: step, ...base });
                    this.device.queue.submit([enc.finish()]);
                    t += step;
                    substeps++;
                    cycles++;
                    continue;
                }

                // ---- LTS path: one encoder per macro cycle ----
                const nsubFull = 1 << (K - 1);
                let dt0 = Math.min(this.dt0, remaining);
                if (!(dt0 > 0) || !isFinite(dt0)) { t = t1; break; }   // dt floor guard
                let nsub = nsubFull;
                let tail = false;
                if (nsubFull * this.dt0 > remaining) {
                    tail = true;                       // degenerate to global dt
                    nsub = 1;
                    cycles = 4;                        // rebuild after the tail
                }
                const enc = this._beginEncoder('macro');
                if (tail) {
                    this._dispatchLts(enc, 'settleAcc', this.edges.nt, { ...base, dt_lazy: 0 });
                    this._dispatchLts(enc, 'degenTier', this.edges.nt, { ...base, dt_lazy: 0 });
                    this._dispatchLts(enc, 'degenFaceTier', this.edges.ne, { ...base, dt_lazy: 0 });
                }
                for (let s = 0; s < nsub; s++) {
                    for (let k = 0; k < K; k++) {
                        if (s % (1 << k)) continue;
                        const dt = dt0 * (1 << k);
                        const n = tail ? (k === 0 ? this.edges.ne : 0) : this.edgeCounts[k];
                        if (n > 0) this._dispatchLts(enc, 'faceFluxLts', n, { dt, ...base, k, tail: tail ? 1 : 0, nlist: n });
                    }
                    for (let k = 0; k < K; k++) {
                        if (s % (1 << k)) continue;
                        const dt = dt0 * (1 << k);
                        const n = tail ? (k === 0 ? this.edges.nt : 0) : this.cellCounts[k];
                        if (n > 0) this._dispatchLts(enc, 'cellUpdateLts', n, { dt, ...base, k, tail: tail ? 1 : 0, nlist: n });
                    }
                    // live coupling at tier-0 cadence (engine: fireCells(tier 0))
                    if (this.couplingNp > 0) {
                        this._dispatchLts(enc, 'couplingExchange', this.couplingNp, { dt: dt0, ...base, k: 0, tail: 0, nlist: this.couplingNp });
                    }
                }
                this.device.queue.submit([enc.finish()]);
                t += nsub * dt0;
                substeps += nsub;
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
                    this._setParams({ dt_lazy: t1 - this.t_last_sync, src: rainRateMps, np: this.couplingNp });
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

        async cellState(i) {
            const tmp = this.device.createBuffer({ size: 20, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
            const enc = this.device.createCommandEncoder();
            enc.copyBufferToBuffer(this.buf.state, i * 4, tmp, 0, 20);
            this.device.queue.submit([enc.finish()]);
            await tmp.mapAsync(GPUMapMode.READ);
            const a = new Float32Array(tmp.getMappedRange());
            const out = { vol: a[0], head: a[1], depth: a[2], qx: a[3], qy: a[4] };
            tmp.unmap(); tmp.destroy();
            return out;
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
