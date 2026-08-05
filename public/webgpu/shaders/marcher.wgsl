// marcher.wgsl — SWMM Fork WebGPU: explicit local-inertial 2D marcher (M1).
//
// Bit-exact port of openswmm-engine's ExplicitInertialSolver with K=1
// (LTS_TIERS 1, global dt) + FLAT closure, the M1 scope:
//   - faceFlux:  de Almeida & Bates local-inertial face update
//   - cellUpdate:volume/head/depth closure + Perot cell discharge
//   - lazySources, seedActive, halo, cflReduce: active-set + CFL machinery
//
// Reference: third_party/openswmm-engine/src/engine/2d/solver/
//   InertialKernels.hpp + ExplicitInertialSolver.cpp (f64 to f32 here).
//
// WebGPU limits storage bindings to 8 per stage: mesh geometry is packed
// into 3 buffers, state into 3, the work set into 1, plus the atomic
// reduction buffer. Params travel as a plain f32 array (struct-typed
// storage bindings misbehave on some drivers).

// params as array<f32>: [nt, ne, dry, theta, froude, beta, cfl, maxdt,
//                        g, deadband, hon, hoff, dt, dt_lazy, src,
//                        exch_beta, np, pad, pad, pad]
const P_NT: u32 = 0u;
const P_NE: u32 = 1u;
const P_DRY: u32 = 2u;
const P_THETA: u32 = 3u;
const P_FROUDE: u32 = 4u;
const P_BETA: u32 = 5u;
const P_CFL: u32 = 6u;
const P_MAXDT: u32 = 7u;
const P_G: u32 = 8u;
const P_DEAD: u32 = 9u;
const P_HON: u32 = 10u;
const P_HOFF: u32 = 11u;
const P_DT: u32 = 12u;
const P_DTLAZY: u32 = 13u;
const P_SRC: u32 = 14u;
const P_EXCHBETA: u32 = 15u;
const P_NP: u32 = 16u;
const P_LTSK: u32 = 17u;
const P_K: u32 = 18u;
const P_TAIL: u32 = 19u;
const P_NLIST: u32 = 20u;

@group(0) @binding(0) var<storage, read> params: array<f32>;

// Packed layouts (offsets in ELEMENTS):
//   geoA:  [0,nt) tri_cz | [nt,2nt) tri_area | [2nt,3nt) tri_cx
//          | [3nt,4nt) tri_cy | [4nt,5nt) cell_lchar
//   geoF:  [0,ne) xi | [ne,2ne) inv_dx_n | [2ne,3ne) n2
//          | [3ne,4ne) nx | [4ne,5ne) ny | [5ne,6ne) zface
//          | [6ne,7ne) mx | [7ne,8ne) my | [8ne,8ne+csr) cell_sign
//   topo:  [0,2ne) face_cLR | [2ne,2ne+nt+1) cell_ptr | [2ne+nt+1, ...) cell_edge
//   state: [0,nt) vol | [nt,2nt) head | [2nt,3nt) depth
//          | [3nt,4nt) qcx | [4nt,5nt) qcy
//   qbuf:  [0,ne) q | [ne,2ne) faccL | [2ne,3ne) faccR
//   wk:    [0,nt) cell_active | [nt,2nt) next
//   red:   [0] count | [1] dt0-bits

@group(0) @binding(1) var<storage, read> geoA: array<f32>;       // 5*nt
@group(0) @binding(2) var<storage, read> geoF: array<f32>;       // 8*ne + csr
@group(0) @binding(3) var<storage, read> topo: array<u32>;       // 2*ne + nt+1 + 3*nt
@group(0) @binding(4) var<storage, read_write> state: array<f32>;// 5*nt
@group(0) @binding(5) var<storage, read_write> qbuf: array<f32>; // 3*ne
@group(0) @binding(6) var<storage, read_write> wk: array<u32>;   // 2*nt
@group(0) @binding(7) var<storage, read_write> red: array<atomic<u32>>; // 2

// M2 coupling (needs the maxStorageBuffersPerShaderStage=16 opt-in):
//   cplF: header [9*np]: cell(f32), crown_m, cd, area, h1d_m, d1d_m, v1d_m3,
//                stencilPtr, stencilCount — then the static vertex stencil
//                tail [2*Σcount]: (cell, weight) pairs. Vertex-coupled points
//                (stencilCount > 0) reconstruct h_2d via the pseudo-Laplacian
//                (vertexHeadAt) and use the stencil-max depth for the wet/dry
//                ramp; triangle points (stencilCount == 0) use the cell
//                directly. Q always applies to the point's FIRST stencil cell
//                (the engine's cp.cell_idx).
//   cplS [2*np]: drawn_m3, exch_m3 (accumulators, reset per batch)
@group(0) @binding(8) var<storage, read> cplF: array<f32>;
@group(0) @binding(9) var<storage, read_write> cplS: array<f32>;
@group(0) @binding(10) var<storage, read> pin: array<u32>;   // [nt] pinned cells

// LTS (M3): tiered local timestepping — power-of-two tiers, the engine's
// halving scheme (ExplicitInertialSolver.cpp runMacroCycle):
//   tierBuf: [0,nt) cell tier | [nt,nt+ne) face tier (255 = inactive/walled)
//   cellList/edgeList: compacted per-tier work lists (built at rebuild)
//   cellCount/edgeCount: atomic counts per tier (read back at rebuild)
@group(0) @binding(11) var<storage, read_write> tierBuf: array<u32>;
@group(0) @binding(12) var<storage, read_write> cellList: array<u32>;
@group(0) @binding(13) var<storage, read_write> cellCount: array<atomic<u32>>;
@group(0) @binding(14) var<storage, read_write> edgeList: array<u32>;
@group(0) @binding(15) var<storage, read_write> edgeCount: array<atomic<u32>>;

const F32_1E30: f32 = 1e30;
const F32_1E_12: f32 = 1e-12;
const F32_1E_6: f32 = 1e-6;
const F32_1E_30: f32 = 1e-30;

// ---- faceFlux: local-inertial update per interior face --------------------
// fireFaces() in ExplicitInertialSolver.cpp -- identical scalar order.
@compute @workgroup_size(64)
fn faceFlux(@builtin(global_invocation_id) gid: vec3<u32>) {
    let e = gid.x;
    if (e >= u32(params[P_NE])) { return; }
    // Clear this face's booking slots FIRST: the engine's accumulators are
    // drained+zeroed by the cell pass each substep; a face that does not fire
    // this pass (dry/inactive) must not leave a stale dM behind for the cells.
    qbuf[u32(params[P_NE]) + e] = 0.0;       // faccL
    qbuf[2u * u32(params[P_NE]) + e] = 0.0;  // faccR
    let a = topo[2u * e + 0u];
    let b = topo[2u * e + 1u];
    if (wk[a] == 0u || wk[b] == 0u) {
        qbuf[e] = 0.0;
        return;
    }
    let headA = state[u32(params[P_NT]) + a];
    let headB = state[u32(params[P_NT]) + b];
    let hf = max(headA, headB) - geoF[5u * u32(params[P_NE]) + e];
    if (hf <= params[P_DRY]) {
        qbuf[e] = 0.0;
        return;
    }
    var qhat: f32 = qbuf[e];
    var q_mag: f32 = abs(qbuf[e]);
    let qfx = 0.5 * (state[3u * u32(params[P_NT]) + a] + state[3u * u32(params[P_NT]) + b]);
    let qfy = 0.5 * (state[4u * u32(params[P_NT]) + a] + state[4u * u32(params[P_NT]) + b]);
    let qn = qfx * geoF[3u * u32(params[P_NE]) + e] + qfy * geoF[4u * u32(params[P_NE]) + e];
    qhat = params[P_THETA] * qbuf[e] + (1.0 - params[P_THETA]) * qn;
    q_mag = max(q_mag, sqrt(qfx * qfx + qfy * qfy));
    var deta = headB - headA;
    if (abs(deta) < params[P_DEAD]) { deta = 0.0; }
    let slope = deta * geoF[1u * u32(params[P_NE]) + e];
    let h73 = hf * hf * pow(hf, 0.33333334);           // h^(7/3), cbrt form
    let num = qhat - params[P_G] * hf * params[P_DT] * slope;
    let den = 1.0 + params[P_G] * params[P_DT] * geoF[2u * u32(params[P_NE]) + e] * q_mag / h73;
    var qn1 = num / den;
    let qcap = params[P_FROUDE] * hf * sqrt(params[P_G] * hf);
    qn1 = clamp(qn1, -qcap, qcap);
    let exp_cell = select(b, a, qn1 > 0.0);   // exporting cell (engine parity)
    let budget = params[P_BETA] * max(state[exp_cell], 0.0);
    let take = abs(qn1) * geoF[e] * params[P_DT];
    if (take > budget) {
        qn1 *= select(0.0, budget / take, take > 0.0);
    }
    qbuf[e] = qn1;
    let dM = qn1 * geoF[e] * params[P_DT];
    qbuf[u32(params[P_NE]) + e] = -dM;       // faccL
    qbuf[2u * u32(params[P_NE]) + e] = dM;   // faccR
}

// ---- cellUpdate: gather accumulators + source, closure, Perot -------------
// fireCells() in ExplicitInertialSolver.cpp.
@compute @workgroup_size(64)
fn cellUpdate(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= u32(params[P_NT])) { return; }
    if (wk[i] == 0u) { return; }
    let ptrBase = 2u * u32(params[P_NE]);
    let p0 = topo[ptrBase + i];
    let p1 = topo[ptrBase + i + 1u];
    let edgeBase = ptrBase + u32(params[P_NT]) + 1u;
    var flux_m3: f32 = 0.0;
    for (var p = p0; p < p1; p++) {
        let e = topo[edgeBase + p];
        let s = geoF[8u * u32(params[P_NE]) + p];
        if (s > 0.0) { flux_m3 += qbuf[u32(params[P_NE]) + e]; } else { flux_m3 += qbuf[2u * u32(params[P_NE]) + e]; }
    }
    let src = params[P_SRC];                     // rain + coupling - evap
    let v = state[i] + flux_m3 + params[P_DT] * src * geoA[u32(params[P_NT]) + i];
    let vc = max(v, 0.0);
    state[i] = vc;
    let d = select(0.0, vc / geoA[u32(params[P_NT]) + i], geoA[u32(params[P_NT]) + i] > F32_1E_30);
    state[2u * u32(params[P_NT]) + i] = d;
    state[u32(params[P_NT]) + i] = geoA[i] + d;
    var sx: f32 = 0.0;
    var sy: f32 = 0.0;
    for (var p = p0; p < p1; p++) {
        let e = topo[edgeBase + p];
        let s = geoF[8u * u32(params[P_NE]) + p];
        let f = s * qbuf[e] * geoF[e];
        sx += f * (geoF[6u * u32(params[P_NE]) + e] - geoA[2u * u32(params[P_NT]) + i]);
        sy += f * (geoF[7u * u32(params[P_NE]) + e] - geoA[3u * u32(params[P_NT]) + i]);
    }
    let inv_a = 1.0 / geoA[u32(params[P_NT]) + i];
    state[3u * u32(params[P_NT]) + i] = sx * inv_a;
    state[4u * u32(params[P_NT]) + i] = sy * inv_a;
}

// ---- lazySources: rain storage on INACTIVE cells (lazy tier) --------------
@compute @workgroup_size(64)
fn lazySources(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= u32(params[P_NT])) { return; }
    if (wk[i] != 0u) { return; }
    if (params[P_DTLAZY] <= 0.0) { return; }
    let v = state[i] + params[P_DTLAZY] * params[P_SRC] * geoA[u32(params[P_NT]) + i];
    let vc = max(v, 0.0);
    state[i] = vc;
    let d = select(0.0, vc / geoA[u32(params[P_NT]) + i], geoA[u32(params[P_NT]) + i] > F32_1E_30);
    state[2u * u32(params[P_NT]) + i] = d;
    state[u32(params[P_NT]) + i] = geoA[i] + d;
}

// ---- seedActive: hysteretic depth-threshold activation --------------------
// syncAndRebuild() steps 2-3: cell_active_ = next (base copy); the halo
// kernel then expands one ring. Coupling/pin terms are M2 scope.
@compute @workgroup_size(64)
fn seedActive(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= u32(params[P_NT])) { return; }
    let thresh = select(params[P_HON], params[P_HOFF], wk[i] != 0u);
    // pin_t0: coupling cells (+ boundary cells, M3) are always active
    let seed = select(0u, 1u, (state[2u * u32(params[P_NT]) + i] >= thresh) || pin[i] != 0u);
    wk[i] = seed;                 // active = next (base copy)
    wk[u32(params[P_NT]) + i] = seed;
}

// ---- halo: one-ring activation expansion (reads seeded `next` only) -------
@compute @workgroup_size(64)
fn halo(@builtin(global_invocation_id) gid: vec3<u32>) {
    let e = gid.x;
    if (e >= u32(params[P_NE])) { return; }
    let a = topo[2u * e + 0u];
    let b = topo[2u * e + 1u];
    if (wk[u32(params[P_NT]) + a] != 0u && wk[u32(params[P_NT]) + b] == 0u) { wk[b] = 1u; }
    if (wk[u32(params[P_NT]) + b] != 0u && wk[u32(params[P_NT]) + a] == 0u) { wk[a] = 1u; }
}

// ---- couplingExchange: 1D↔2D orifice exchange per coupling point ----------
// Port of computeNodeCouplingQ() + the live exchange block in fireCells()
// (tier-0 cadence; K=1 = every substep). Runs AFTER cellUpdate, mirroring the
// engine's order (faces → cells → coupling). The 1D state is frozen per batch
// by the orchestrator (h1d/d1d/v1d pre-converted to SI metres/m³).
// Q > 0 drains 2D→1D; Q < 0 spills 1D→2D. Vertex-coupled points reconstruct
// h_2d with the pseudo-Laplacian weights (vertexHeadAt, FLAT closure) and cap
// the wet/dry ramp on the stencil-max depth (computeNodeCouplingQ's
// depth_2d_avail); the exchange itself applies to the FIRST stencil cell
// (the engine's cp.cell_idx).
@compute @workgroup_size(64)
fn couplingExchange(@builtin(global_invocation_id) gid: vec3<u32>) {
    let k = gid.x;
    if (k >= u32(params[P_NP])) { return; }
    let base = 9u * k;
    let ci = u32(cplF[base + 0u]);
    if (ci >= u32(params[P_NT])) { return; }
    if (wk[ci] == 0u) { return; }                 // engine: !cell_active_[ci]
    let crown = cplF[base + 1u];
    let cd = cplF[base + 2u];
    let area = cplF[base + 3u];
    let h1d = cplF[base + 4u];
    let d1d = cplF[base + 5u];
    let v1d = cplF[base + 6u];
    let stPtr = u32(cplF[base + 7u]);
    let stCnt = u32(cplF[base + 8u]);
    var h2d: f32 = state[u32(params[P_NT]) + ci];
    var dAvail: f32 = state[2u * u32(params[P_NT]) + ci];
    if (stCnt > 0u) {
        let tailBase = u32(params[P_NP]) * 9u;
        h2d = 0.0;
        dAvail = 0.0;
        for (var j = 0u; j < stCnt; j++) {
            let c = u32(cplF[tailBase + 2u * (stPtr + j) + 0u]);
            let w = cplF[tailBase + 2u * (stPtr + j) + 1u];
            h2d += w * state[u32(params[P_NT]) + c];
            dAvail = max(dAvail, state[2u * u32(params[P_NT]) + c]);
        }
    }

    // effectiveArea(h_max, crown, full_depth, A_inlet, 2·A_inlet)
    let h_max = max(h1d, h2d);
    var Aeff = area;
    if (h_max >= crown) {
        let frac = min((h_max - crown) / 0.05, 1.0);
        Aeff = area + frac * area;
    }
    // orificeFlow(h2d − h1d, cd, Aeff) with the C¹-regularized √ (ε = 0.02)
    let dh = h2d - h1d;
    let a = abs(dh);
    var Q: f32 = 0.0;
    if (a >= 1.0e-12) {
        var phi = sqrt(a);
        if (a < 0.02) {
            let inv_sqrt_e = 1.0 / sqrt(0.02);
            phi = (1.5 * inv_sqrt_e) * a - (0.5 * inv_sqrt_e / 0.02) * a * a;
        }
        Q = select(-1.0, 1.0, dh > 0.0) * cd * Aeff * sqrt(2.0 * params[P_G]) * phi;
    }
    // capped-pipe gate over a 5 cm band above the crown
    let ct = clamp((h_max - crown) / 0.05, 0.0, 1.0);
    Q *= ct * ct * (3.0 - 2.0 * ct);
    // source-side wet/dry Hermite ramp (Q → 0 as the source empties);
    // vertex points use the stencil-max depth (engine depth_2d_avail)
    let tR = select(clamp(d1d / params[P_DRY], 0.0, 1.0), clamp(dAvail / params[P_DRY], 0.0, 1.0), Q > 0.0);
    Q *= tR * tR * (3.0 - 2.0 * tR);
    if (Q == 0.0) { return; }
    if (Q > 0.0) {
        // 2D→1D drain: availability share of the FIRST stencil cell
        Q = min(Q, params[P_EXCHBETA] * max(state[ci], 0.0) / params[P_DT]);
    } else {
        // 1D→2D spill: node stored-volume budget (drawn ledger per batch)
        let avail = max(0.0, v1d) - cplS[2u * k + 0u];
        if (avail <= 0.0) { return; }
        let take = min(-Q * params[P_DT], avail);
        cplS[2u * k + 0u] += take;                // node_drawn
        Q = -take / params[P_DT];
    }
    state[ci] = max(state[ci] - Q * params[P_DT], 0.0);
    let d = state[ci] / geoA[u32(params[P_NT]) + ci];
    state[2u * u32(params[P_NT]) + ci] = d;
    state[u32(params[P_NT]) + ci] = geoA[ci] + d;
    cplS[2u * k + 1u] += Q * params[P_DT];        // exch ∫Q dt (m³, + = drain)
}

// ---- cflReduce: per-active-cell CFL step, atomicMin into red[1] -----------
@compute @workgroup_size(64)
fn cflReduce(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= u32(params[P_NT])) { return; }
    if (wk[i] == 0u) { return; }
    atomicAdd(&red[0], 1u);
    let h = state[2u * u32(params[P_NT]) + i];
    var speed: f32 = 0.0;
    if (h > F32_1E_6) {
        let qm = sqrt(state[3u * u32(params[P_NT]) + i] * state[3u * u32(params[P_NT]) + i] + state[4u * u32(params[P_NT]) + i] * state[4u * u32(params[P_NT]) + i]);
        speed = qm / h;
    }
    var dt: f32 = F32_1E30;
    if (h > params[P_DRY]) {
        let c = sqrt(params[P_G] * h) + speed;
        dt = select(F32_1E30, params[P_CFL] * geoA[4u * u32(params[P_NT]) + i] / c, c > F32_1E_12);
    }
    dt = min(dt, params[P_MAXDT]);
    atomicMin(&red[1], bitcast<u32>(dt));
}

// ---- cflArgmin: the cell whose CFL dt equals the reduced min (for the
// dt0-collapse investigation: an f32 Perot speed qm/h can blow a single cell's
// dt to ~1e-30, stalling the whole march — identify it).
@compute @workgroup_size(64)
fn cflArgmin(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= u32(params[P_NT])) { return; }
    if (wk[i] == 0u) { return; }
    let h = state[2u * u32(params[P_NT]) + i];
    var speed: f32 = 0.0;
    if (h > F32_1E_6) {
        let qm = sqrt(state[3u * u32(params[P_NT]) + i] * state[3u * u32(params[P_NT]) + i] + state[4u * u32(params[P_NT]) + i] * state[4u * u32(params[P_NT]) + i]);
        speed = qm / h;
    }
    var dt: f32 = F32_1E30;
    if (h > params[P_DRY]) {
        let c = sqrt(params[P_G] * h) + speed;
        dt = select(F32_1E30, params[P_CFL] * geoA[4u * u32(params[P_NT]) + i] / c, c > F32_1E_12);
    }
    dt = min(dt, params[P_MAXDT]);
    if (dt == bitcast<f32>(atomicLoad(&red[1]))) {
        atomicMin(&red[2], i);
    }
}

// ---------------------------------------------------------------------------
// LTS v2 (M3): tiered local timestepping, port of the engine's halving scheme
// (ExplicitInertialSolver.cpp). K = params[P_LTSK] tiers; tier k fires every
// 2^k base substeps with dt = 2^k·dt0. Face tier = min of incident cell tiers
// so a face always integrates at the sharper side's cadence; every face firing
// books ±dM into per-side accumulators (faccL/faccR) which the cell pass
// drains+zeroes at the cell's own cadence — conservation across tier
// interfaces is exact by construction.
// ---------------------------------------------------------------------------

// ---- settleAcc: apply + clear pending face accumulators (settleAccumulators)
@compute @workgroup_size(64)
fn settleAcc(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= u32(params[P_NT])) { return; }
    let ptrBase = 2u * u32(params[P_NE]);
    let p0 = topo[ptrBase + i];
    let p1 = topo[ptrBase + i + 1u];
    let edgeBase = ptrBase + u32(params[P_NT]) + 1u;
    var pending: f32 = 0.0;
    for (var p = p0; p < p1; p++) {
        let e = topo[edgeBase + p];
        let s = geoF[8u * u32(params[P_NE]) + p];
        if (s > 0.0) {
            pending += qbuf[u32(params[P_NE]) + e];
            qbuf[u32(params[P_NE]) + e] = 0.0;
        } else {
            pending += qbuf[2u * u32(params[P_NE]) + e];
            qbuf[2u * u32(params[P_NE]) + e] = 0.0;
        }
    }
    if (pending == 0.0) { return; }
    let v = max(state[i] + pending, 0.0);
    state[i] = v;
    let d = v / geoA[u32(params[P_NT]) + i];
    state[2u * u32(params[P_NT]) + i] = d;
    state[u32(params[P_NT]) + i] = geoA[i] + d;
}

// ---- tierAssign: CFL tier per active cell + compaction (runs AFTER cflReduce)
// syncAndRebuild() step 4: ratio = dt_cell/dt0; tk = ratio>=2 ? min(K-1,
// floor(log2(ratio))) : 0; coupling/pinned cells pin to tier 0.
@compute @workgroup_size(64)
fn tierAssign(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= u32(params[P_NT])) { return; }
    if (wk[i] == 0u) { tierBuf[i] = 255u; return; }
    let K = u32(params[P_LTSK]);
    let dt0 = bitcast<f32>(atomicLoad(&red[1]));
    let h = state[2u * u32(params[P_NT]) + i];
    var speed: f32 = 0.0;
    if (h > F32_1E_6) {
        let qm = sqrt(state[3u * u32(params[P_NT]) + i] * state[3u * u32(params[P_NT]) + i] + state[4u * u32(params[P_NT]) + i] * state[4u * u32(params[P_NT]) + i]);
        speed = qm / h;
    }
    var dt: f32 = F32_1E30;
    if (h > params[P_DRY]) {
        let c = sqrt(params[P_G] * h) + speed;
        dt = select(F32_1E30, params[P_CFL] * geoA[4u * u32(params[P_NT]) + i] / c, c > F32_1E_12);
    }
    dt = min(dt, params[P_MAXDT]);
    var tk: u32 = 0u;
    if (K > 1u) {
        let ratio = dt / dt0;
        if (ratio >= 2.0) { tk = min(K - 1u, u32(floor(log2(ratio)))); }
        if (pin[i] != 0u) { tk = 0u; }
    }
    tierBuf[i] = tk;
    let pos = atomicAdd(&cellCount[tk], 1u);
    cellList[tk * u32(params[P_NT]) + pos] = i;
}

// ---- faceTierAssign: face tier = min(cell tiers) + compaction; walled faces
// carry no stale momentum (q = 0, like the engine's rebuild).
@compute @workgroup_size(64)
fn faceTierAssign(@builtin(global_invocation_id) gid: vec3<u32>) {
    let e = gid.x;
    if (e >= u32(params[P_NE])) { return; }
    let a = topo[2u * e + 0u];
    let b = topo[2u * e + 1u];
    if (wk[a] == 0u || wk[b] == 0u) {
        qbuf[e] = 0.0;
        tierBuf[u32(params[P_NT]) + e] = 255u;
        return;
    }
    let ft = min(tierBuf[a], tierBuf[b]);
    tierBuf[u32(params[P_NT]) + e] = ft;
    let pos = atomicAdd(&edgeCount[ft], 1u);
    edgeList[ft * u32(params[P_NE]) + pos] = e;
}

// ---- degenTier/degenFaceTier: tail — collapse the active set to tier 0 so a
// single global-dt substep lands the window exactly (advance() tail branch).
@compute @workgroup_size(64)
fn degenTier(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= u32(params[P_NT])) { return; }
    tierBuf[i] = select(255u, 0u, wk[i] != 0u);
}

@compute @workgroup_size(64)
fn degenFaceTier(@builtin(global_invocation_id) gid: vec3<u32>) {
    let e = gid.x;
    if (e >= u32(params[P_NE])) { return; }
    let a = topo[2u * e + 0u];
    let b = topo[2u * e + 1u];
    tierBuf[u32(params[P_NT]) + e] = select(255u, 0u, wk[a] != 0u && wk[b] != 0u);
}

// ---- faceFluxLts: local-inertial update for one tier's face list.
// dt = params[P_DT] (already scaled to 2^k·dt0 by the dispatcher). The
// accumulators are NOT cleared here — the cell pass drains them (a slow cell
// gathers the sum of its fast-side bookings over its own interval). Positivity
// budget divided by refire = 2^(tier_exp − face_tier): a face that fires
// multiple times within the exporter's cell cycle takes a β/3 share each time.
@compute @workgroup_size(64)
fn faceFluxLts(@builtin(global_invocation_id) gid: vec3<u32>) {
    let pos = gid.x;
    if (pos >= u32(params[P_NLIST])) { return; }
    let k = u32(params[P_K]);
    let tail = u32(params[P_TAIL]);
    let e = select(edgeList[k * u32(params[P_NE]) + pos], pos, tail != 0u);
    if (tail != 0u && tierBuf[u32(params[P_NT]) + e] != k) { return; }
    let a = topo[2u * e + 0u];
    let b = topo[2u * e + 1u];
    let headA = state[u32(params[P_NT]) + a];
    let headB = state[u32(params[P_NT]) + b];
    let hf = max(headA, headB) - geoF[5u * u32(params[P_NE]) + e];
    if (hf <= params[P_DRY]) {
        qbuf[e] = 0.0;
        return;
    }
    var qhat: f32 = qbuf[e];
    var q_mag: f32 = abs(qbuf[e]);
    let qfx = 0.5 * (state[3u * u32(params[P_NT]) + a] + state[3u * u32(params[P_NT]) + b]);
    let qfy = 0.5 * (state[4u * u32(params[P_NT]) + a] + state[4u * u32(params[P_NT]) + b]);
    let qn = qfx * geoF[3u * u32(params[P_NE]) + e] + qfy * geoF[4u * u32(params[P_NE]) + e];
    qhat = params[P_THETA] * qbuf[e] + (1.0 - params[P_THETA]) * qn;
    q_mag = max(q_mag, sqrt(qfx * qfx + qfy * qfy));
    var deta = headB - headA;
    if (abs(deta) < params[P_DEAD]) { deta = 0.0; }
    let slope = deta * geoF[1u * u32(params[P_NE]) + e];
    let h73 = hf * hf * pow(hf, 0.33333334);
    let num = qhat - params[P_G] * hf * params[P_DT] * slope;
    let den = 1.0 + params[P_G] * params[P_DT] * geoF[2u * u32(params[P_NE]) + e] * q_mag / h73;
    var qn1 = num / den;
    let qcap = params[P_FROUDE] * hf * sqrt(params[P_G] * hf);
    qn1 = clamp(qn1, -qcap, qcap);
    let exp_cell = select(b, a, qn1 > 0.0);
    let refire = 1u << (tierBuf[exp_cell] - tierBuf[u32(params[P_NT]) + e]);
    let budget = params[P_BETA] * max(state[exp_cell], 0.0) / f32(refire);
    let take = abs(qn1) * geoF[e] * params[P_DT];
    if (take > budget) {
        qn1 *= select(0.0, budget / take, take > 0.0);
    }
    qbuf[e] = qn1;
    let dM = qn1 * geoF[e] * params[P_DT];
    qbuf[u32(params[P_NE]) + e] -= dM;       // faccL (book, no clear)
    qbuf[2u * u32(params[P_NE]) + e] += dM;  // faccR
}

// ---- cellUpdateLts: one tier's cell list — gather + clear own-side face
// accumulators, apply sources, closure + Perot (fireCells in the engine).
@compute @workgroup_size(64)
fn cellUpdateLts(@builtin(global_invocation_id) gid: vec3<u32>) {
    let pos = gid.x;
    if (pos >= u32(params[P_NLIST])) { return; }
    let k = u32(params[P_K]);
    let tail = u32(params[P_TAIL]);
    let i = select(cellList[k * u32(params[P_NT]) + pos], pos, tail != 0u);
    if (tail != 0u && tierBuf[i] != k) { return; }
    let ptrBase = 2u * u32(params[P_NE]);
    let p0 = topo[ptrBase + i];
    let p1 = topo[ptrBase + i + 1u];
    let edgeBase = ptrBase + u32(params[P_NT]) + 1u;
    var flux_m3: f32 = 0.0;
    for (var p = p0; p < p1; p++) {
        let e = topo[edgeBase + p];
        let s = geoF[8u * u32(params[P_NE]) + p];
        if (s > 0.0) {
            flux_m3 += qbuf[u32(params[P_NE]) + e];
            qbuf[u32(params[P_NE]) + e] = 0.0;
        } else {
            flux_m3 += qbuf[2u * u32(params[P_NE]) + e];
            qbuf[2u * u32(params[P_NE]) + e] = 0.0;
        }
    }
    let src = params[P_SRC];
    let v = max(state[i] + flux_m3 + params[P_DT] * src * geoA[u32(params[P_NT]) + i], 0.0);
    state[i] = v;
    let d = v / geoA[u32(params[P_NT]) + i];
    state[2u * u32(params[P_NT]) + i] = d;
    state[u32(params[P_NT]) + i] = geoA[i] + d;
    var sx: f32 = 0.0;
    var sy: f32 = 0.0;
    for (var p = p0; p < p1; p++) {
        let e = topo[edgeBase + p];
        let s = geoF[8u * u32(params[P_NE]) + p];
        let f = s * qbuf[e] * geoF[e];
        sx += f * (geoF[6u * u32(params[P_NE]) + e] - geoA[2u * u32(params[P_NT]) + i]);
        sy += f * (geoF[7u * u32(params[P_NE]) + e] - geoA[3u * u32(params[P_NT]) + i]);
    }
    let inv_a = 1.0 / geoA[u32(params[P_NT]) + i];
    state[3u * u32(params[P_NT]) + i] = sx * inv_a;
    state[4u * u32(params[P_NT]) + i] = sy * inv_a;
}
