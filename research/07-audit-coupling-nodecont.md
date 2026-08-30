# Claim Audit — COUPLING / RAINFALL / NODE_CONTINUITY / SURCHARGE / CROSS_SECTION / RENDERING / OTHER

**Scope.** Verdicts on the LocalSWMM engine-behavior claims in
`00-claims-inventory.md` with IDs 1, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
20, 30, 39, 53, 56, 57, 58, 59, 60, 61, 62, 63, 64, 74, 76, 77, 78, 79, 80, 81, 85,
86, 87, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 107, 110, 112, 113, 114,
115, 116, 117, 118, 120, 122, 123, 127, 129, 132, 134, 135, 136, 137, 138, 139, 140,
141, 142, 143.

**Evidence base.** Findings files 01 (Ch1–4), 02 (Ch5–7), 03 (Ch8–9, 2D — primary),
04 (hydrology), 05 (quality + user manual); cross-checked against the engine source:
`src/engine/2d/coupling/NodeCoupling.cpp`, `src/engine/2d/solver/ExplicitInertialSolver.cpp`,
`src/engine/2d/SurfaceRouter2D.cpp`, `src/engine/2d/api/Api2D.cpp`,
`src/engine/hydraulics/DynamicWave.cpp`, `src/engine/core/SWMMEngine.cpp`,
`src/engine/core/SimulationContext.hpp`, `src/engine/core/SimulationOptions.hpp`,
`src/engine/core/openswmm_engine_impl.cpp`, `src/engine/core/openswmm_nodes_impl.cpp`,
`src/engine/hydrology/Gage.cpp`, `src/engine/input/PostParseResolver.cpp`,
`src/engine/hydraulics/Node.cpp`, and the raw manuals (Ch9-TwoDimensional.md,
UM AppD, UM AppB).

**Citation scheme.** `Ch9 §x.y` = Reference Vol. II hydraulics Ch. 9 (2D); `Ch3 §x.y`
= Ch. 3 (Dynamic Wave); `UM AppD/AppB` = User's Manual appendices; `SIM: file:line` =
engine source.

---

## Verdict list

```
V 1    | MATCH           | Co-advance (frozen 1D heads, 2D advance over the window, exchange volumes to the 1D side via a uniform-rate delivery queue) is exactly the engine design; the split's stride/GPU replication is project engineering on top of it | Ch9 §9.7.3, §9.7.5 (Fig 9-1)
V 3    | NOT_IN_MANUAL   | Node indexing by INP parse order is engine convention the manuals never state | SIM: input/handlers/NodesHandler.cpp (parse order)
V 5    | MATCH           | Crown ft→m conversion is the documented 1D-feet/2D-SI coupling factor (h_1D = 0.3048×head, crown = 0.3048×(z_inv+D_full)) | Ch9 §9.7.4, §9.7.5
V 6    | MATCH           | crown = invert + fullDepth is the manual's coupling crown z_cr | Ch9 §9.7.5 (z_cr = 0.3048(z_inv + D_full))
V 7    | MATCH           | AUTO coupling area = clamp(1.25×A_conduit,max, 0.05, 2.0) m² exactly; the claim's "circular-pipe" qualifier is narrower than the manual's "largest conduit connected" (any shape) | Ch9 §9.7.5
V 8    | MATCH           | COUPLING_CD default 0.65; area default 1.0 in mesh units (m² for SI) | Ch9 §9.11, §9.7.5
V 9    | AMBIGUOUS        | Manual documents vertex-coupled-point driving heads via stencil reconstruction (wet-masked depth-weighted mean / pseudo-Laplacian); the engine's LIVE marcher path collapses every non-outfall vertex point to the single lowest-bed incident cell — the manual never mentions the collapse | Ch9 §9.7.1/§9.7.5 vs SIM: SurfaceRouter2D.cpp:447-478
V 10   | NOT_IN_MANUAL   | "Coupled nodes pond-capable regardless of ALLOW_PONDING" is engine code; the manual gates ponding on the ponding option + nonzero ponded area (A_P) only | SIM: DynamicWave.cpp:2874-2878 (nodeCanPond); Ch3 §3.3.7, UM Ch8
V 11   | MATCH           | RAINFALL_MODE SYSTEM = arithmetic mean of all gages applied uniformly; mm/hr→m/s is the engine's unit conversion; NN-not-modelled is a project limitation | Ch9 §9.8
V 12   | NOT_IN_MANUAL   | The three conversion formulas are the engine's implementation; the reference hydrology volume (§2.2.1) lists the types but explicitly defers conversion to the User's Manual, which (AppB) defines only the semantics (rate / depth-per-interval / cumulative) | UM AppB (Rain Gage); SIM: Gage.cpp:26-45, 204-226
V 13   | MATCH           | Uniform rate = mean over gages, mm/hr→m/s — matches SYSTEM mode; clamp ≥0 is engine detail | Ch9 §9.8; SIM: SurfaceRouter2D.cpp:1063-1084
V 14   | MATCH           | Exchange delivered via a queue drained at a uniform rate over the batch span is documented; the "60 s cadence equivalence" is project measurement | Ch9 §9.7.1, §9.7.5 step 2
V 15   | MATCH           | Rain enters each cell as rate·dt·area — the source term Δt·A·(i−e+s) of the cell update | Ch9 §9.5.4 Eq 9-14, §9.8
V 16   | NOT_IN_MANUAL   | computeNodeCouplingQ has no NaN/Inf guard — confirmed; a diverged 1D solve would propagate | SIM: NodeCoupling.cpp:168-265
V 17   | NOT_IN_MANUAL   | The uniform-volume queue delivery is documented, but the "per-window rate = MEAN of the last two windows" is NOT corroborated by current source: user_lat_flow is persistent and applied verbatim, and the queue drains a volume at a uniform rate over coupling_delivery_remaining | Ch9 §9.7.1; SIM: SWMMEngine.cpp:5691-5775, 5819-5824
V 20   | NOT_IN_MANUAL   | (in − out − Δstored)/in matches MassBalance2D::error() exactly (verified vs swmm_2d_get_continuity_error); but the engine returns 0.0 (not NULL) when total_in ≤ 0, and the denominator includes init_storage | SIM: SimulationContext.hpp:1043-1049
V 30   | MATCH           | Coupling cells pinned to tier 0 = forced active — the manual documents pinning of cells carrying a coupling point | Ch9 §9.5.6
V 39   | MATCH           | Live junction exchange evaluated at tier-0 cadence | Ch9 §9.7.1; SIM: ExplicitInertialSolver.cpp:621
V 53   | MATCH           | Inactive cells integrate rain lazily as pure storage, applied at rebuild | Ch9 §9.5.7; SIM: ExplicitInertialSolver.cpp:223-234
V 56   | MATCH           | Exchange runs after the cell phase (faces → cells → coupling) at tier-0; Q>0 drains 2D→1D, Q<0 spills — engine order and signs match | Ch9 §9.5.8, §9.7.1; SIM: ExplicitInertialSolver.cpp:675-695, 616-656
V 57   | NOT_IN_MANUAL   | Exchange fires only on active cells (engine `!cell_active_[ci]` skip) — undocumented but consistent with the pinned-active rule | SIM: ExplicitInertialSolver.cpp:627
V 58   | MATCH           | effectiveArea ramps A → 2A over a 5 cm band above the crown | Ch9 §9.7.1 (Eq 9-29a); SIM: NodeCoupling.cpp:48-54
V 59   | MATCH           | Orifice law Q = Cd·Aeff·sign(Δh)·√(2g)·φ with C¹-regularized √ for |Δh| < 0.02 m | Ch9 §9.7.1 (Eq 9-18, 9-27a/b)
V 60   | MATCH           | Capped-pipe gate: Q ×= ct²(3−2ct), ct = clamp((h_max−crown)/0.05, 0, 1) | Ch9 §9.7.1 (Eq 9-28/9-29a); SIM: NodeCoupling.cpp:251-254
V 61   | MATCH           | Source-side wet/dry Hermite ramp keyed on depth relative to DRY_DEPTH; vertex points use stencil-max depth (depth_2d_avail) | Ch9 §9.7.1 (Eq 9-29b), §9.7.5; SIM: NodeCoupling.cpp:222-263
V 62   | MATCH           | 2D→1D drain capped at β·V_cell/dt (β = exchange_beta 0.8) | Ch9 §9.7.5 (Eq 9-30a); SIM: ExplicitInertialSolver.cpp:635-637
V 63   | MATCH           | 1D→2D spill drawn against a per-node stored-volume budget (node_drawn_ ledger) | Ch9 §9.7.5 (Eq 9-30b); SIM: ExplicitInertialSolver.cpp:638-648
V 64   | MATCH           | Exchange applied to the point's cell, volume floored at 0, ∫Q dt accumulated per point | Ch9 §9.7.1/§9.7.5; SIM: ExplicitInertialSolver.cpp:650-654
V 74   | MATCH           | Mass-balance export fields are exactly the manual's 2D mass-balance block and the engine's MassBalance2D struct | Ch9 §9.9; SIM: SimulationContext.hpp:1014-1050
V 76   | NOT_IN_MANUAL   | Velocity rendered only above a 1 mm depth gate — rendering decision; DRY_DEPTH default 1 mm is manual-confirmed | Ch9 Table 9-1
V 77   | NOT_IN_MANUAL   | Depth-gated + magnitude-clamped rendering is consistent with the manual's own q/h-inflation analysis | Ch9 §14
V 78   | NOT_IN_MANUAL   | Engine elapsed time from swmm_engine_step/stride is decimal days — confirmed | SIM: SWMMEngine.cpp:1056
V 79   | NOT_IN_MANUAL   | A naturally-completing stride writes elapsed_time = 0 even though state reflects run end — confirmed | SIM: openswmm_engine_impl.cpp:52-64; SWMMEngine.cpp:941-951
V 80   | MATCH           | COUPLING_CD default 0.65 | Ch9 §9.11
V 81   | NOT_IN_MANUAL   | Plate-carrée constants (111320 m/°lat, cos(lat) for °lng) are the project's mesh projection choice; the manuals don't cover mesh projection | SIM: mesh2dInp.js
V 85   | MATCH           | COUPLING_CD 0.65, COUPLING_AREA DEFAULT | AUTO — both in the manual | Ch9 §9.11, §9.7.5
V 86   | MATCH           | RAINFALL_MODE NATURAL_NEIGHBOUR | SYSTEM | NONE | Ch9 §9.8
V 87   | AMBIGUOUS        | If read as an engine claim ("2D only SI") it contradicts §9.7.4 (meshes authored in project display units, scaled to SI on load, US included); if read as a LocalSWMM-emitter limitation it is accurate | Ch9 §9.7.4
V 90   | MATCH           | COUPLING_AREA / RAINFALL_MODE / REPORT_2D option set and defaults | Ch9 §9.11
V 91   | NOT_IN_MANUAL   | Row layout "IDX NODE CD AREA" and the area-column rule are the project writer's convention; the manual says a row with no area defaults to 1.0 even under DEFAULT — the claim's "area only when ≠AUTO" is not the manual's rule | Ch9 §9.7.5
V 92   | NOT_IN_MANUAL   | 5 mm render mask is a rendering decision (uniform-rain film scale, CONTEXT.md) | SIM: view2d.js
V 93   | NOT_IN_MANUAL   | Velocity gate 0.05 m/s / clamp 5 m/s are rendering constants | SIM: view2d.js
V 94   | MATCH           | v = q/depth is the manual's own velocity definition (q = h·u); the 5 m/s clamp is a rendering guard | Ch9 §9.2, §14
V 95   | NOT_IN_MANUAL   | Per-frame p99 color normalization (capped 1.5×p99) is a rendering decision | SIM: view2d.js
V 96   | NOT_IN_MANUAL   | Completion marker with elapsedMs=0 — confirmed engine stride behavior on natural completion | SIM: openswmm_engine_impl.cpp:52-64
V 97   | NOT_IN_MANUAL   | Masked thin-film cells (uniform-rain film) — rendering decision per CONTEXT.md | SIM: results.js
V 98   | MATCH           | Continuity-error tiers map the manual's 5–10% concern band ("greater than 5 to 10 percent" / "such as 10 percent") | Ch3 §3.4; UM Ch8
V 99   | NOT_IN_MANUAL   | Engine sets coupled→can_pond and overwrites ponded_area with the 2D footprint (confirmed); the manual documents ponding generally, not this override | SIM: DynamicWave.cpp:2874-2878; SurfaceRouter2D.cpp:480-586; Ch3 §3.3.7
V 100  | MATCH           | COUPLING_SYNC batch is clamped between one routing step and 60 s — 60 s is the documented max span | Ch9 §9.7.3
V 101  | NOT_IN_MANUAL   | Browser hosting via the exported C API with no entry point is a project build fact | SIM: wasm/openswmm2d_exports.cpp
V 107  | MATCH           | Co-advance design: 1D heads read, 2D advances the batch, exchange volumes → delivery queue → uniform 1D lateral inflow | Ch9 §9.7.3, §9.7.5
V 110  | MATCH           | SYSTEM = uniform gage-mean rain (documented); the pending_dt_ batch-timing clause is engine internals, not in the manual | Ch9 §9.8
V 112  | NOT_IN_MANUAL   | pending_dt_ accumulation and the [0, 60.5] first-batch claim are engine internals the manuals don't cover | SIM: engine 2D advance bookkeeping
V 113  | MATCH           | couplingExchange is a faithful port of computeNodeCouplingQ + the fireCells live-exchange block — every element is documented and code-confirmed | Ch9 §9.7.1, §9.7.5; SIM: NodeCoupling.cpp:168-265, ExplicitInertialSolver.cpp:616-656
V 114  | MATCH           | The engine forces coupling cells active/pinned (pin_t0_) | Ch9 §9.5.6; SIM: ExplicitInertialSolver.cpp:107-112
V 115  | NOT_IN_MANUAL   | coupled_node → can_pond (commitNodeDepthState/nodeCanPond) and ponded_area overwrite are engine code; the manual is silent | SIM: DynamicWave.cpp:2874-2878; SurfaceRouter2D.cpp:480-586
V 116  | MISMATCH         | The manual says storage FUNC area coefficients follow project units — ft² for US, m² for SI (Area = A0 + A1·Depth^A2, "(ft2 or m2)"); the claim asserts they are read as ft² even in SI. Engine source keeps coefficients in user units, converting per call | UM AppD (FUNCTIONAL); SIM: PostParseResolver.cpp:623-625, Node.cpp:106-118
V 117  | NOT_IN_MANUAL   | The 1D-only stride vs engine co-advance discrepancy is a project measurement | SIM: WEBGPU_PLAN.md
V 118  | NOT_IN_MANUAL   | "set_lateral_inflow applies the MEAN of the last two SET values (set −1.0 → applied −0.5)" is NOT corroborated: user_lat_flow is a persistent value applied verbatim each step; the observed half-rate is an artifact of the queue/stride interaction, not an explicit average | SIM: openswmm_nodes_impl.cpp:301-317, SWMMEngine.cpp:5819-5824
V 120  | NOT_IN_MANUAL   | Final-frame tSec=0 (engine END state) and the two-window sum are stride/frame artifacts | SIM: openswmm_engine_impl.cpp:52-64
V 122  | MATCH           | Vertex stencil scatter (upwind-HGL weights, geometric fallback) + vertexHeadAt reconstruction are documented | Ch9 §9.7.1, §9.7.5; SIM: NodeCoupling.cpp:69-88, 156-163
V 123  | NOT_IN_MANUAL   | The split's per-window gage mean in place of NATURAL_NEIGHBOUR is a project limitation; NN is the manual's default | Ch9 §9.8
V 127  | AMBIGUOUS        | Same tension as claim 9: manual's stencil-based vertex-point heads vs the engine's live-path single-lowest-bed-cell collapse (vertex_idx = −1) — the manual does not describe the collapse | Ch9 §9.7.1/§9.7.5 vs SIM: SurfaceRouter2D.cpp:447-478
V 129  | NOT_IN_MANUAL   | Stride-count/landing-offset measurement (50 vs 51 windows → −12% exchange) | SIM: WEBGPU_PLAN.md
V 132  | NOT_IN_MANUAL   | Bellinge ~230k internal steps and the stride-advances-internal-step behavior are measurements, not manual content | SIM: WEBGPU_PLAN.md
V 134  | NOT_IN_MANUAL   | WASM SIMD128 + LTO, no -ffast-math build flags are project engineering | SIM: WEBGPU_PLAN.md
V 135  | MATCH           | Knob defaults match: MIN_SURFAREA 12.566 ft² (1.167 m²), HEAD_TOLERANCE 0.005 ft (0.0015 m); SKIP_STEADY_STATE + "never fired" + rain-per-window are project settings/measurements | UM Ch8, UM AppD (MIN_SURFAREA, HEAD_TOLERANCE)
V 136  | NOT_IN_MANUAL   | "Natural end = lifecycle code 6" is an engine API detail the manuals don't number | SIM: engine stride API
V 137  | NOT_IN_MANUAL   | Bellinge declaring MINIMUM_STEP 0.5 is an input-file fact | SIM: WEBGPU_PLAN.md
V 138  | NOT_IN_MANUAL   | Frozen 1D heads fed to a guard-less coupling kernel (no NaN check) — confirmed; the contamination incident is a measurement | SIM: ExplicitInertialSolver.cpp:616-656, NodeCoupling.cpp:168-265
V 139  | NOT_IN_MANUAL   | Time-filled windows, MINIMUM_STEP/ROUTING_STEP landing, self-correcting rate — engine timing details | SIM: WEBGPU_PLAN.md
V 140  | MATCH           | Rain per window = rate·dt·area (Eq 9-14 source term); continuity uses the engine convention (in − out − Δstored)/in | Ch9 §9.8, §9.5.4 Eq 9-14; SIM: SimulationContext.hpp:1043-1049
V 141  | NOT_IN_MANUAL   | verify-1d-split gate (±10% routing continuity) is a project test harness | SIM: WEBGPU_PLAN.md
V 142  | NOT_IN_MANUAL   | WebGPU bind-group/buffer limits are browser-API facts, not manual content | SIM: WEBGPU_PLAN.md
V 143  | MISMATCH         | The manual states VARIABLE_STEP default 0 = no variable stepping ("If the safety factor is 0 (the default), then no variable time step is used"); the claim asserts the engine default is adaptive. The engine source defaults variable_step = 0.75, so this is a manual↔engine default discrepancy that the claim sides with the engine on | UM AppD:180 vs SIM: SimulationOptions.hpp:173
```

---

## TOP MISMATCHES (10 most important discrepancies)

1. **CLAIM-143 — VARIABLE_STEP default: manual says fixed, engine is adaptive.**
   UM AppD states "If the safety factor is 0 (the default), then no variable time step
   is used" — i.e. the documented default is fixed-step. The engine source defaults
   `variable_step = 0.75` (`SimulationOptions.hpp:173`), so an unconfigured model runs
   adaptive by default, exactly as the claim asserts. The claim is true of the engine
   but directly contradicts the manual's documented default. This is the manual being
   stale relative to this engine build — the single most consequential discrepancy
   because it changes routing-step semantics (and the "min 0.50 s" floor is, however,
   manual-consistent: UM AppD MINIMUM_STEP default 0.5).

2. **CLAIM-116 — storage FUNC area coefficient units (CROSS_SECTION).**
   The claim asserts "storage-node FUNC area coefficient is read as ft² even in SI
   units." UM AppD (FUNCTIONAL) says the coefficients follow project units — ft² for
   US, m² for SI. Engine source confirms the manual: `a0/a1/a2` are kept in **user
   units** and converted per call (`Node.cpp:106-118`, `PostParseResolver.cpp:623-625`).
   The claim is wrong for the current engine and contradicts the manual. If the split
   treats a SI-model FUNC coefficient as ft² it will mis-size storage by (0.3048)².

3. **CLAIM-9 / CLAIM-127 — vertex-point driving head: manual says stencil, live path
   uses a single cell (COUPLING).**
   The manual (§9.7.1/§9.7.5) states vertex-coupled points form their 2D head from a
   stencil: wet-masked depth-weighted mean under VFR, pseudo-Laplacian under FLAT, and
   drains take the max depth over the vertex stencil. The engine's live marcher path
   instead collapses every non-outfall vertex point to a **single lowest-bed incident
   cell** with `vertex_idx = −1` (`SurfaceRouter2D.cpp:447-478`), so the exchange head
   is a cell head, not the stencil reconstruction. The collapse is accurate engine
   behavior but the manual never documents it, and the manual's general description
   contradicts it. Not a functional error (the single cell is the deepest, most
   representative), but the code and manual describe different coupling heads.

4. **CLAIM-87 — "2D simulation currently only supports SI units (meters)."**
   The manual (§9.7.4) says the mesh is "authored in the project's display length
   units (scaled to SI on load for US projects)" — the engine itself accepts US-unit
   meshes. Read as an engine-capability claim the statement overstates; it is only
   accurate scoped to the LocalSWMM emitter, which chooses SI. As written it can
   mislead.

5. **CLAIM-17 / CLAIM-118 — the "two-window mean" of the coupling delivery.**
   The engine's documented and coded delivery is a **volume queue drained at a uniform
   rate** over the delivery span (`SWMMEngine.cpp:5691-5775`; the manual §9.7.1 says
   the same). The claimed "per-window rate = mean of the last two windows' exchs" and
   "set_lateral_inflow applies the mean of the last two SET values (set −1.0 →
   applied −0.5)" is **not** an explicit mechanism anywhere in the source: `user_lat_flow`
   is a persistent value applied verbatim (`openswmm_nodes_impl.cpp:301-317`,
   `SWMMEngine.cpp:5819-5824`). The half-rate observation is an artifact of how the
   split's per-window set interacts with the queue/step cadence. The claim should be
   rewritten as an observed equivalence, not an engine property.

6. **CLAIM-91 — coupling-map row format and the AREA column.**
   The manual says "a vertex row that authors no area defaults to 1.0 in mesh area
   units" (§9.7.5) — the AREA column is optional even under DEFAULT. The claim's rule
   ("area column only when COUPLING_AREA ≠ AUTO") is the project writer's convention,
   not the manual's; under AUTO the engine derives the area from the largest conduit,
   under DEFAULT omission means 1.0. A reader following the claim would wrongly believe
   DEFAULT rows require the column.

7. **CLAIM-20 — continuity error edge cases.**
   `(in − out − Δstored)/in` is correct and matches `MassBalance2D::error()` (verified
   against `swmm_2d_get_continuity_error`), but two details differ: the engine returns
   **0.0**, not NULL, when `total_in ≤ 0`, and the denominator **includes
   `init_storage`** (so a run seeded with stored water has a smaller error fraction than
   the claim's bare "in" implies). Cosmetic for the viewer, but the NULL claim is
   engine-inaccurate.

8. **CLAIM-12 — rain-format conversion formulas are undocumented.**
   The reference hydrology volume (§2.2.1) lists INTENSITY/VOLUME/CUMULATIVE but
   explicitly leaves conversion to the User's Manual, and UM AppB defines only the
   *semantics* (rate / depth-per-interval / cumulative depth) — no formulas. The
   claimed formulas are the engine's implementation (`Gage.cpp:26-45`: VOLUME →
   `v/interval·3600`, CUMULATIVE → `(v−prev)/interval·3600`, INTENSITY as-is), which
   match algebraically. Correct engine behavior, but "the hydrology manual defines
   these" would be wrong.

9. **CLAIM-10 / CLAIM-99 / CLAIM-115 — coupled-node ponding override is engine code,
   not manual.**
   All three are confirmed in source (`nodeCanPond` = `allow_ponding || is_coupled`,
   `DynamicWave.cpp:2874-2878`; ponded_area overwritten with the median-dual 2D
   footprint, `SurfaceRouter2D.cpp:480-586`), and claim 99's replication recipe
   (ALLOW_PONDING YES + `setPondArea` with the cell area) is exactly right. But nothing
   in the manual (§3.3.7, Eq 3-31, A_P; UM Ch8 "Allow Ponding") says a coupled node
   ponds regardless of the option — the manual only documents the generic ponding
   contract. Any reader validating the split against the manual alone cannot derive
   this.

10. **CLAIM-7 — "max incident circular-pipe area" is narrower than the manual.**
    The AUTO formula clamp(1.25·A_max, 0.05, 2.0) is exactly right, but the manual
    defines A_max as the "full-flow area of the largest conduit connected to the node"
    (§9.7.5) for **any** shape; the engine uses `links.xsect_a_full` (all conduit
    shapes). The claim's "(πd²/4)" circular-only parenthetical understates the code —
    a node coupled beside a box culvert or arch would derive a different area than the
    claim implies.
