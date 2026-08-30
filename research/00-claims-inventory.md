# Claim Inventory — Engine-Behavior Claims in the LocalSWMM Project

Inventory of every claim the project makes about how the OpenSWMM engine works,
extracted from the coupling/WebGPU/worker/render code and `WEBGPU_PLAN.md`.
Each claim is numbered; categories: SOLVER_PHYSICS, NUMERICS, COUPLING,
RAINFALL, NODE_CONTINUITY, SURCHARGE, RENDERING, CROSS_SECTION,
OPTIONS_DEFAULT, OTHER.

Source: `/home/nekzoh/LocalSWMM` code + `WEBGPU_PLAN.md`, extracted 2026-08-12.

## `public/webgpu/couplingSplit.js`

- CLAIM-1 | :6-9 | "The split replicates the engine's windowless co-advance: stride the 1D (one routing step per landing), freeze the node state, advance the GPU marcher over the window, feed ∫Q back via set_lateral_inflow." | COUPLING
- CLAIM-2 | :50-59 | 2D_OPTIONS parse defaults: "theta: get('THETA', 0.5), cflNumber: get('CFL_NUMBER', 0.8), hMove: get('H_MOVE', 0.003), froudeMax: get('FROUDE_MAX', 1.0), dryDepth: get('DRY_DEPTH', 0.001), maxTimestep: get('MAX_TIMESTEP', 10.0), ltsTiers: get('LTS_TIERS', 1), rebuildCadence: get('REBUILD_CADENCE', 4), dtFloor: get('DT_FLOOR', 0.1), exchangeBeta: 0.8" | OPTIONS_DEFAULT
- CLAIM-3 | :63-66 | "Node order = the order the node sections appear in the INP (the engine indexes nodes by parse order)" | OTHER
- CLAIM-4 | :90-94 | "Vertex stencil CSR for the pseudo-Laplacian head reconstruction (VertexReconstruction.cpp): incident triangles in ascending order, Jawahar-Kamath partition-of-unity weights (moment-fit λ, negative clipping, renormalization; uniform fallback on degenerate/collinear or all-clipped stencils)." | NUMERICS
- CLAIM-5 | :146-147 | "const len12 = siUnits ? 1.0 : 0.3048" — feet→metre conversion applied to node crown | OTHER
- CLAIM-6 | :181-182 | "crown = (invert + fullDepth)·len12" | CROSS_SECTION
- CLAIM-7 | :183-189 | COUPLING_AREA DEFAULT auto-fill: "if (aPipeMax > 0) p.area = Math.min(2.0, Math.max(0.05, 1.25 * aPipeMax))" — auto coupling area = 1.25 × max incident circular-pipe area (πd²/4), clamped [0.05, 2.0] m² | OPTIONS_DEFAULT
- CLAIM-8 | :205,216 | "cd: … : 0.65, area: … : 1.0" — COUPLING_CD default 0.65, area default 1.0 m² | OPTIONS_DEFAULT
- CLAIM-9 | :219-225 | "Live vertex-coupled points become SINGLE-CELL points on the LOWEST-BED incident cell (SurfaceRouter2D.cpp:394-412); vertex_idx cleared so live exchange uses the CELL head. The vertex-head/scatter machinery only applies to the outfall injection path (not in the marcher)." | COUPLING
- CLAIM-10 | :258-260 | "The 1D-only INP: strip the 2D sections and let coupling nodes pond above the brim (the engine flags coupled nodes pond-capable regardless of ALLOW_PONDING)." | SURCHARGE
- CLAIM-11 | :328-330 | "Uniform 2D rain: the mean over the model's gages of their rate at tSec. mm/hr → m/s. NATURAL_NEIGHBOUR spatial variation is not modelled by the marcher yet (M3 item)." | RAINFALL
- CLAIM-12 | :377-383 | Rain gage formats: "INTENSITY → v as-is; CUMULATIVE → (v − prev.v)/(dt/3600); VOLUME → v/(g.intervalSec/3600)" | RAINFALL
- CLAIM-13 | :384-389 | "uniform rain rate = mean over all gages of their (clamped ≥ 0) rate, converted mm/hr → m/s" | RAINFALL
- CLAIM-14 | :397-399 | "The engine delivers each window's exchange through a queue at a uniform rate, so a 60 s coupling cadence is the M2-validated equivalence." | COUPLING
- CLAIM-15 | :420-422 | "Rain enters every cell as dt·rate·area — cellUpdate, cellUpdateLts and lazySources all apply the same term." | RAINFALL
- CLAIM-16 | :457-467 | "A diverged 1D solve produces NaN/Inf node state; the coupling kernel has no guard — fail loudly here." | COUPLING
- CLAIM-17 | :492-495 | "The engine delivers the exchange through a queue whose per-window rate is the MEAN of the last two windows' exchs; set_lateral_inflow applies the mean of the last two SET values." | NODE_CONTINUITY
- CLAIM-18 | :510-513 | "The engine Froude-caps its face fluxes; the gate here keeps the rendered field from amplifying q over the mm-scale film into tens of m/s." | SOLVER_PHYSICS
- CLAIM-19 | :524-525 | "the CFL min is pathological (f32 Perot speed qm/h at a pinned coupling cell)" | NUMERICS
- CLAIM-20 | :548-551 | "Continuity uses the engine's own convention (verified against swmm_2d_get_continuity_error): (in − out − Δstored) / in, as a fraction. NULL when nothing entered the domain" | OTHER

## `public/webgpu/webgpuMarscher.js`

- CLAIM-21 | :1-6 | "M1 scope: LTS_TIERS=1 (global dt), FLAT closure, uniform rain, WALL boundaries. The marching loop mirrors ExplicitInertialSolver::advance() exactly (rebuild cadence 4, lazy-source clock, tail handling); kernels port InertialKernels.hpp 1:1 (f64 → f32)." | NUMERICS
- CLAIM-22 | :11-12 | "The edge build is a port of InertialEdges.cpp (bit-exact conventions: cL = min(t, nbr), zface = max(cz_L, cz_R), n2 = ((nL+nR)/2)^2)". | NUMERICS
- CLAIM-23 | :44 | "mannings[t] = tr.n || 0.045" — default Manning's n 0.045 | OPTIONS_DEFAULT
- CLAIM-24 | :85-91 | "outward normal via centroid-side test (MeshBuilder.cpp)" | NUMERICS
- CLAIM-25 | :108 | "zface = max of the two adjacent cell centroid elevations" | NUMERICS
- CLAIM-26 | :119-120 | "face-normal distance dn has a 0.3×chord floor" | NUMERICS
- CLAIM-27 | :121-122 | "face friction n² = squared mean cell Manning's n" | NUMERICS
- CLAIM-28 | :135 | "cell characteristic length = 2A / longest edge" | NUMERICS
- CLAIM-29 | :265 | "initial cell head = bed elevation (cz + 0)" | SOLVER_PHYSICS
- CLAIM-30 | :299-303 | "coupling cells are marked pinned (always active)" | COUPLING
- CLAIM-31 | :416 | "wetting threshold = H_MOVE + 1 mm, drying threshold = H_MOVE − 1 mm (hysteresis ±0.001 m)" | NUMERICS
- CLAIM-32 | :413 | "per-face positivity budget share β/3 (β default 0.8)" | NUMERICS
- CLAIM-33 | :575-583 | "Bellinge has ~0.25 m cells whose CFL dt ~0.02 s pin the GLOBAL min for both engines ('Avg Internal Step 0.2456 s' is the LTS-weighted effective dt — base dt0 is the same regime). dtFloor default 0.05." | NUMERICS
- CLAIM-34 | :589-591 | "advance mirrors ExplicitInertialSolver::advance. K = 1 keeps the global-dt path (bit-identical to M1); K > 1 runs the LTS halving macro-cycle" | NUMERICS
- CLAIM-35 | :605-612 | "The segment after a rebuild must run with the FRESH dt0 and FRESH active count" | NUMERICS
- CLAIM-36 | :644 | "LTS macro cycle length = 2^(K−1) base substeps" | NUMERICS
- CLAIM-37 | :649-653 | "if nsubFull·dt0 > remaining → tail: degenerate to global dt; nsub = 1; cycles = RC; rebuild after the tail" | NUMERICS
- CLAIM-38 | :665-668,671-674 | "tier k fires every 2^k substeps at dt = 2^k·dt0" | NUMERICS
- CLAIM-39 | :676-678 | "live coupling at tier-0 cadence (engine: fireCells(tier 0))" | COUPLING

## `public/webgpu/shaders/marcher.wgsl`

- CLAIM-40 | :95-96 | "faceFlux: local-inertial update per interior face // fireFaces() in ExplicitInertialSolver.cpp — identical scalar order." | NUMERICS
- CLAIM-41 | :114 | "face flow depth hf = max(adjacent heads) − zface" | NUMERICS
- CLAIM-42 | :115-118 | "a face with hf ≤ DRY_DEPTH carries zero flux" | SOLVER_PHYSICS
- CLAIM-43 | :121-124 | "qhat = θ·qbuf + (1−θ)·qn; qn = (0.5(qx_a+qx_b), 0.5(qy_a+qy_b))·n̂" — Perot θ-blend | NUMERICS
- CLAIM-44 | :125 | "|q| for friction takes max of face |q| and averaged cell discharge |q|" | NUMERICS
- CLAIM-45 | :126-128 | "deta = headB − headA; if |deta| < 1e-12 → 0; slope = deta/dn" | NUMERICS
- CLAIM-46 | :129-132 | "de Almeida & Bates local-inertial update: qn1 = (qhat − g·hf·dt·slope)/(1 + g·dt·n²·q_mag/h^(7/3))" | SOLVER_PHYSICS
- CLAIM-47 | :133-134 | "face flux Froude-capped at Fr_max·h·√(gh)" | SOLVER_PHYSICS
- CLAIM-48 | :135 | "positivity budget uses the flux-exporting cell (engine parity)" | NUMERICS
- CLAIM-49 | :136-140 | "outflow volume capped at β/3 × exporting-cell volume" | SOLVER_PHYSICS
- CLAIM-50 | :143-144 | "dM = qn1·len·dt; faccL = −dM; faccR = +dM — anti-symmetric booking" | NUMERICS
- CLAIM-51 | :148,164-170 | "cellUpdate: v = state + flux_m3 + dt·src·area; vc = max(v,0); d = vc/area; head = cz + d" — volume update; depth derived V/A | SOLVER_PHYSICS
- CLAIM-52 | :171-182 | "Perot cell specific discharge: qcx = Σ s·q·len·(mx−cx)/area" | NUMERICS
- CLAIM-53 | :185-198 | "lazySources: rain storage on INACTIVE cells (lazy tier), applied at rebuild" | RAINFALL
- CLAIM-54 | :200-212 | "seedActive: depth ≥ thresh or pin; thresh = H_ON if active else H_OFF; H_ON = hMove+0.001, H_OFF = hMove−0.001" | NUMERICS
- CLAIM-55 | :216-223 | "halo: one-ring activation expansion" | NUMERICS
- CLAIM-56 | :225-234 | "couplingExchange: port of computeNodeCouplingQ() + live exchange block in fireCells() (tier-0 cadence). Runs AFTER cellUpdate, mirroring engine order (faces → cells → coupling). Q > 0 drains 2D→1D; Q < 0 spills 1D→2D." | COUPLING
- CLAIM-57 | :242 | "the coupling exchange only fires on active cells (engine: !cell_active_)" | COUPLING
- CLAIM-58 | :265-271 | "effectiveArea: if h_max ≥ crown, Aeff = area + frac·area with frac = min((h_max−crown)/0.05, 1) — ramps A → 2A over a 5 cm band above the crown" | COUPLING
- CLAIM-59 | :272-283 | "orificeFlow: Q = sign(dh)·cd·Aeff·√(2g)·φ; φ = √|dh| with C¹-regularized blend for |dh| < 0.02" | COUPLING
- CLAIM-60 | :284-286 | "capped-pipe gate over a 5 cm band above the crown: Q *= ct²(3−2ct), ct = clamp((h_max−crown)/0.05, 0, 1)" | COUPLING
- CLAIM-61 | :287-290 | "source-side wet/dry Hermite ramp (Q → 0 as source empties); vertex points use stencil-max depth (engine depth_2d_avail); tR = clamp(d1d/DRY, 0, 1); Q *= tR²(3−2tR)" | COUPLING
- CLAIM-62 | :292-294 | "2D→1D drain: Q = min(Q, exchangeBeta·max(state,0)/dt)" — capped at β·V_cell/dt | COUPLING
- CLAIM-63 | :296-301 | "1D→2D spill: take = min(−Q·dt, avail), avail = max(0, v1d) − drawn ledger; Q = −take/dt" | COUPLING
- CLAIM-64 | :303-307 | "exchange applied to the point's cell, volume clamped ≥ 0, ∫Q dt accumulated" | COUPLING
- CLAIM-65 | :310-330 | "cflReduce: dt = CFL_NUMBER·lchar/c; c = √(gh) + speed; dt = min(dt, MAX_TIMESTEP); atomicMin" | NUMERICS
- CLAIM-66 | :332-334 | "cflArgmin: f32 Perot speed qm/h can blow a single cell's dt to ~1e-30" | NUMERICS
- CLAIM-67 | :358-364 | "LTS v2 halving scheme: K tiers, tier k fires every 2^k base substeps with dt = 2^k·dt0; face tier = min of incident cell tiers; faces book ±dM into faccL/faccR which the cell pass drains — conservation across tier interfaces exact by construction." | NUMERICS
- CLAIM-68 | :397-398,419-423 | "tierAssign: ratio = dt_cell/dt0; tk = ratio≥2 ? min(K−1, floor(log2(ratio))) : 0; coupling/pinned cells pin to tier 0." | NUMERICS
- CLAIM-69 | :442 | "face tier = min of incident cell tiers" | NUMERICS
- CLAIM-70 | :429-430,483 | "walled faces carry no stale momentum (q = 0, like the engine's rebuild)" | NUMERICS
- CLAIM-71 | :466-474 | "Positivity budget divided by refire = 2^(tier_exp − face_tier)" | NUMERICS
- CLAIM-72 | :510 | "refire = 1 << (tier_exp − face_tier)" | NUMERICS
- CLAIM-73 | :522-565 | "cellUpdateLts: one tier's cell list — gather + clear own-side accumulators, apply sources, closure + Perot (fireCells in the engine)." | NUMERICS

## `public/openSwmm2dWorker.js`

- CLAIM-74 | :100-106 | mass-balance export contract: initialVolume, finalVolume, rainfall, coupling1DTo2D, coupling2DTo1D, outfallIn, outfallOut, boundaryIn, boundaryOut, evaporation, continuityError | OTHER
- CLAIM-75 | :197-233 (readVelocity) | "Edge flux reconstructs specific discharge (q = h·v). Convert it to physical velocity; use all three rows of Nᵀq; first two rows define the LS system, third contributes to RHS — (NᵀN)v = Nᵀq, then divide by cell depth h." | NUMERICS
- CLAIM-76 | :217 | "velocity only where depth exceeds dryDepth (default 1 mm)" | RENDERING
- CLAIM-77 | :227-229 | "Depth-gated + magnitude-clamped (q/h inflation) so a thin film does not render as tens of m/s." | RENDERING
- CLAIM-78 | :313-314 | "engine elapsed time is in days" | OTHER
- CLAIM-79 | :330-336 | "A natural-completion stride can write elapsedDays=0 even though the last sampled frame already contains the end-of-run state." | OTHER

## `public/mesh2dCoupling.js`

- CLAIM-80 | :16,22,27 | "cd: Number(m.cd) || Number(opts.defaultCd) || 0.65" — default coupling discharge coefficient 0.65 | OPTIONS_DEFAULT

## `public/mesh2dInp.js`

- CLAIM-81 | :6,27 | "METERS_PER_DEGREE_LAT = 111320; metersPerDegreeLng = METERS_PER_DEGREE_LAT·cos(lat)" — plate-carrée projection | OTHER
- CLAIM-82 | :64 | "manningN: max(0.001, finite(…, 0.045))" — default Manning's n 0.045, clamped ≥ 0.001 | OPTIONS_DEFAULT
- CLAIM-83 | :91-98 | Emitted [2D_OPTIONS] defaults: "MAX_TIMESTEP 2.0", "DRY_DEPTH 0.001", "COUPLING_SYNC 1.0", "THETA 0.5", "CFL_NUMBER 0.8", "H_MOVE 0.001", "FROUDE_MAX 1.0", "LTS_TIERS 1" (clamped [1,8]) | OPTIONS_DEFAULT
- CLAIM-84 | :101-107 | "LIMITER_EPSILON 1e-6", "FLUX_DH_EPS 1e-6", "CELL_CLOSURE FLAT (default) / VFR", "FACE_RECONSTRUCTION MEAN (default) / VFR_FACE", "VFR_MIN_WET_FRAC 0.1", "INTEGRATOR EXPLICIT" | OPTIONS_DEFAULT
- CLAIM-85 | :108-109 | "COUPLING_CD 0.65"; "COUPLING_AREA DEFAULT | AUTO" | OPTIONS_DEFAULT
- CLAIM-86 | :110-112 | "RAINFALL_MODE NATURAL_NEIGHBOUR | SYSTEM | NONE" | RAINFALL
- CLAIM-87 | :163-164 | "2D simulation currently only supports SI units (meters)." | OTHER

## `public/mesh2dExport.js`

- CLAIM-88 | :25-29 | Same [2D_OPTIONS] defaults: "MAX_TIMESTEP 2", "DRY_DEPTH 0.001", "COUPLING_CD 0.65", "COUPLING_SYNC 1", "THETA 0.5", "CFL_NUMBER 0.8", "H_MOVE 0.001", "LTS_TIERS 1", "FROUDE_MAX 1", "LIMITER_EPSILON 1e-6", "FLUX_DH_EPS 1e-6" | OPTIONS_DEFAULT
- CLAIM-89 | :31-33 | "CELL_CLOSURE FLAT / VFR", "FACE_RECONSTRUCTION MEAN / VFR_FACE", "VFR_MIN_WET_FRAC 0.1", "INTEGRATOR EXPLICIT" | OPTIONS_DEFAULT
- CLAIM-90 | :35-37 | "COUPLING_AREA DEFAULT | AUTO", "RAINFALL_MODE …", "REPORT_2D YES | NO" | OPTIONS_DEFAULT
- CLAIM-91 | :48-50 | [2D_VERTEX_NODE_MAP] row format "IDX NODE CD AREA" — area column only when COUPLING_AREA ≠ AUTO | COUPLING

## `public/view2d.js`

- CLAIM-92 | :17 | "DEPTH_MASK_M = 0.005 — cells shallower than 5 mm render nothing (sits above the uniform-rain film scale)" | RENDERING
- CLAIM-93 | :22-23 | "VELOCITY_GATE_M = 0.05; VELOCITY_CLAMP_MPS = 5.0" | RENDERING
- CLAIM-94 | :28-37 | "velocityFromDischarge(qx, qy, depth): v = q/depth; clamp to 5 m/s" | RENDERING
- CLAIM-95 | :52-56,75 | "p99 of every finite value over every frame, capped at 1.5×p99 … Head keeps a true global min/max (its gradient is the signal)" | RENDERING

## `public/results.js` (display2DResults)

- CLAIM-96 | :1331-1335 | "Some engine builds emit a completion marker with elapsedMs=0 after the real last frame. Never use that marker as the initial map field." | OTHER
- CLAIM-97 | :1344-1346 | "cells below the mask render nothing (uniform-rain film stays hidden — CONTEXT.md)" | RENDERING
- CLAIM-98 | :1373-1379 | "contErr = mb.continuityError; contPct = contErr*100; thresholds <5 ok, <10 warn, ≥10 bad" | OTHER

## `public/webgpu/gpu2dWorker.js`

- CLAIM-99 | :121-125 | "Coupled nodes: engine flags them coupled → can pond; replicate with ALLOW_PONDING YES + 2D footprint as ponded area. api.setPondArea(engine, p.node, marcher.getTriArea(p.cell))" | SURCHARGE
- CLAIM-100 | :130-137 | "couplingWindowSec: 60" | COUPLING

## `wasm/openswmm2d_exports.cpp`

- CLAIM-101 | :4-6 | "The browser hosts OpenSWMM through its exported C API; there is no program entry point." | OTHER

## `WEBGPU_PLAN.md`

- CLAIM-102 | :5-7 | "the 2D solver is an explicit local-inertial scheme with LTS" | SOLVER_PHYSICS
- CLAIM-103 | :44-51 | "ExplicitInertialSolver is a stencil: fireFaces per-face flux q from the 2 adjacent triangle heads (Manning + Froude cap + limiter); fireCells per-cell volume/head/depth from the 3-face flux sum + sources (rain, coupling); syncAndRebuild / tiers (LTS): v1 global dt; v2 tier lists." | SOLVER_PHYSICS
- CLAIM-104 | :77 | "hf = faceFlowDepth(head[a], head[b], zmid) (port exacto de inertial::faceFlowDepth)" | NUMERICS
- CLAIM-105 | :83 | "vol = max(0, vol + Δ); head = z + vol/area; depth = head − z — depth derived; head = bed + V/A" | SOLVER_PHYSICS
- CLAIM-106 | :84 | "boundaryApply (v1: WALL on all exterior faces; later NORMAL_FLOW / SPECIFIED_STAGE)" | SOLVER_PHYSICS
- CLAIM-107 | :91-96 | "1D stride → read coupled node head/depth; GPU advances N substeps; COUPLING_SYNC; reads coupling_flux → feeds 1D as lateral inflow." | COUPLING
- CLAIM-108 | :100-104 | "WebGPU compute is f32; the engine uses double. head = z + depth with z≈65 m, depth≈0.001–1 m: f32 resolution ≈ 7.8e-6 m — acceptable vs DRY_DEPTH 0.001" | NUMERICS
- CLAIM-109 | :110-111 | "Port the exact formulas from ExplicitInertialSolver.cpp + inertial::* (faceFlowDepth, Manning, cellCflDt, limiter)" | NUMERICS
- CLAIM-110 | :160-164 | "uniform rain RAINFALL_MODE SYSTEM; the first 2D batch is [0, routing+0.5] (pending_dt_ accumulator)" | COUPLING
- CLAIM-111 | :179-182 | "M1 port: faceFlux, cellUpdate (Perot θ-mix), lazySources, seedActive (hysteresis h_on/h_off + base active copy), halo (one ring), cflReduce (atomicMin dt0), JS advance loop (rebuild cadence 4, lazy clock, tail)" | NUMERICS
- CLAIM-112 | :213-215 | "engine co-advance batch: pending_dt_ accumulates the routing step (initial 0.5 s + 60 s) → the first 2D batch is [0, 60.5], not [0, 0.5]" | COUPLING
- CLAIM-113 | :221 | "couplingExchange kernel is a 1:1 port of computeNodeCouplingQ + live-exchange block of fireCells — orifice law with C¹-regularized φ (ε=0.02), capped-pipe gate (5 cm band above crown), source dry Hermite wet-ramp, availability caps (β·V_cell for drain; node volume budget for spill), ∫Q accumulator." | COUPLING
- CLAIM-114 | :223 | "the engine forces coupling cells active (pin_t0)" | COUPLING
- CLAIM-115 | :224 | "the engine marks coupled_node → can_pond (DynamicWave commitNodeDepthState) and overwrites ponded_area with the 2D footprint" | SURCHARGE
- CLAIM-116 | :225 | "storage-node FUNC area coefficient is read as ft² even in SI units" | CROSS_SECTION
- CLAIM-117 | :230 | "The 1D-only stride does NOT match the engine's co-advance (adaptive steps 1 s/120 s vs 60 s with the coupling)" | COUPLING
- CLAIM-118 | :231 | "set_lateral_inflow applies the MEAN of the last TWO set values (measured: set −1.0 → applied −0.5); applied = ½(exch_N + exch_{N−1})/dt = exactly the engine's queue delivery (coupling_queue, delivery ≈ 2 windows)." | NODE_CONTINUITY
- CLAIM-119 | :234 | "faceFlux positivity budget uses the EXPORTER cell (exp_cell = qn1 > 0 ? a : b)" | NUMERICS
- CLAIM-120 | :236-237 | "the ref json includes a final frame tSec=0 (engine END state); the final 2D frame in the ref = sum of TWO 60 s windows" | OTHER
- CLAIM-121 | :268-269 | "sample() now returns qx/qy (Perot cell discharge) for production frames — cell velocity is the Perot cell discharge" | NUMERICS
- CLAIM-122 | :280-285 | "the engine scatters Q over the stencil (upwind/geometric weights) and the 2D vertex head uses reconstruction (vertexHeadAt) — port NodeCoupling.cpp vertexHeadAt/scatterCouplingFlux" | COUPLING
- CLAIM-123 | :286-287 | "Rain NATURAL_NEIGHBOUR in the split's uniform rain (today: per-window gage mean)" | RAINFALL
- CLAIM-124 | :289-298 | "halving scheme port: tier k fires every 2^k substeps at Δt = 2^k·dt0; face tier = min(cells); each face firing books ±dM into faccL/faccR drained by the cell pass at its own cadence — exact conservation; positivity budget divided by refire = 2^(tier_exp − face_tier)." | NUMERICS
- CLAIM-125 | :300-302 | "K=1 keeps the M1 bit-identical path." | NUMERICS
- CLAIM-126 | :308-310 | "f32 guard: dt0 floor 1e-3 s (a pathological Perot speed q/h in f32 can drive CFL min to ~1e-30; the engine in f64 never hits it)." | NUMERICS
- CLAIM-127 | :315-321 | "the engine's live path does NOT use the stencil — each per-vertex point becomes a SINGLE-cell point on the lowest-bed incident cell (sc.cell_idx = lo, vertex_idx = −1 → exchange head = cell head, not pseudo-Laplacian). The stencil only applies to the outfall injection path (router), outside the marcher." | COUPLING
- CLAIM-128 | :323-325 | "stencil Jawahar-Kamath ported from VertexReconstruction.cpp" | NUMERICS
- CLAIM-129 | :338-342 | "runSplit strides exactly N = round(couplingWindowSec / routing_step) 1D steps per GPU window. Lesson: a time-based target MERGES windows by the ~1 s landing offset (50 vs 51 windows → −12 % exchange)." | COUPLING
- CLAIM-130 | :364-371 | "the cells pinning dt0 are coupling cells with lchar 0.25–0.30 m; real CFL dt = 0.018–0.023 s, NOT an f32 blow-up. 'Avg Internal Step 0.2456 s' is the LTS-weighted EFFECTIVE dt (tier 3 = 8×dt0); the engine's BASE dt0 is the same regime (~0.03 s)." | NUMERICS
- CLAIM-131 | :373-375 | "configurable dt0 floor (options.dtFloor, default 0.05 s = 2× the tiny-cell CFL)" | NUMERICS
- CLAIM-132 | :379-383 | "Bellinge 1D runs ~230k INTERNAL dynamic-wave steps (~0.5 s — stiffness; the stride API advances the internal step, not the routing step)" | NODE_CONTINUITY
- CLAIM-133 | :400-410 | "DT_FLOOR default 0.05 → 0.1 s … configurable per model with DT_FLOOR in [2D_OPTIONS]" | OPTIONS_DEFAULT
- CLAIM-134 | :413-417 | "WASM rebuild with SIMD128 + LTO… no -ffast-math → IEEE f64 intact" | OTHER
- CLAIM-135 | :430-441 | "1D knobs: MIN_SURFAREA 1.167 → 12.566 + HEAD_TOLERANCE 0.0015 → 0.005 + SKIP_STEADY_STATE YES; SKIP_STEADY_STATE never fired (bit-identical with/without); rain sampled per window" | OTHER
- CLAIM-136 | :446-449 | "the stride signals natural end with lifecycle code 6" | OTHER
- CLAIM-137 | :472 | "Bellinge declares MINIMUM_STEP 0.5" | OTHER
- CLAIM-138 | :474-475 | "the heads runSplit freezes into cplF[k*9+4] feed the couplingExchange kernel, which has no NaN guard — the 2D field was silently contaminated." | COUPLING
- CLAIM-139 | :485-490 | "the coupling window fills by TIME; a stride lands between MINIMUM_STEP and ROUTING_STEP; the overshoot is bounded to one internal step and setLatInflow(exch/dtBatch) uses the real dtBatch, so the delivered rate self-corrects." | COUPLING
- CLAIM-140 | :494-499 | "rain accumulates per window (rate·dt·area, same term as cellUpdate/cellUpdateLts/lazySources); continuity uses the engine convention (in − out − Δstored)/in." | RAINFALL
- CLAIM-141 | :504-508 | "verify-1d-split gate: fails if any coupled-node head becomes non-finite or routing continuity leaves ±10 %" | OTHER
- CLAIM-142 | :510-541 | "the marcher binds 16 storage buffers in one bind group; the spec baseline is 8; the limit is per-stage." | OTHER
- CLAIM-143 | :545-547 | "fixtures without VARIABLE_STEP: the engine default is adaptive (min 0.50 s, mean 57.14 s)" | OTHER
