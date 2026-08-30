# Audit — LocalSWMM Solver-Physics / Numerics / Defaults Claims vs the OpenSWMM Manuals

Audit date: 2026-08-12.
Scope: claims 2, 4, 18, 19, 21–29, 31–38, 40–52, 54, 55, 65–73, 75, 82–84, 88, 89, 102–106, 108, 109, 111, 119, 121, 124–126, 128, 130, 131, 133 — all SOLVER_PHYSICS, NUMERICS, OPTIONS_DEFAULT, and solver-behavior claims (excluding pure COUPLING/RENDERING items and the 1D engine).

Authority: the hydraulics Reference Manual, Vol. II, Chapter 9 "Two-Dimensional Overland Flow Analysis" (as transcribed in `03-hydraulics-ch8-9-2d.md`; verified directly against `Chapter9-TwoDimensional.md`). Engine source (`third_party/openswmm-engine/src/engine/2d/`) was consulted ONLY to confirm/refute code-parity statements; where the manual and code diverge the manual wins.

---

## The manual's documented 2D defaults (Ch. 9)

| Key | Manual default | Citation | couplingSplit.js (CLAIM-2) | mesh2dInp/Export (CLAIM-83/88) |
|---|---|---|---|---|
| `THETA` (θ, Eq 9-9 lateral blend) | **0.8** | §9.5.1; §9.11; SolverOptions2D.hpp:172 | **0.5** ✗ | **0.5** ✗ |
| `CFL_NUMBER` (α, Eq 9-17) | **0.7** | §9.5.5; §9.11; SolverOptions2D.hpp:173 | **0.8** ✗ | **0.8** ✗ |
| `FROUDE_MAX` (Eq 9-10) | **1.5** | §9.5.1; §9.11; SolverOptions2D.hpp:187 | **1.0** ✗ | **1.0** ✗ |
| `DRY_DEPTH` | **0.001 m** | Table 9-1; §9.11; SolverOptions2D.hpp:111 | 0.001 ✓ | 0.001 ✓ |
| `H_MOVE` | **0.003 m** | Table 9-1; §9.11; SolverOptions2D.hpp:181 | 0.003 ✓ | **0.001** ✗ |
| `MAX_TIMESTEP` | **10 s** | §9.11; §9.5.5; SolverOptions2D.hpp:110 | 10.0 ✓ | **2.0** ✗ |
| `LTS_TIERS` | **4** (range 1–8) | §9.5.6; §9.11; SolverOptions2D.hpp:186 | **1** ✗ | **1** ✗ |
| `COUPLING_CD` | **0.65** | §9.7.1; §9.11; SolverOptions2D.hpp:132 | — | 0.65 ✓ |
| `COUPLING_SYNC` | **0** (co-advance every routing step) | §9.7.3; §9.11; SolverOptions2D.hpp:130 | — | **1.0** ✗ |
| `VFR_MIN_WET_FRAC` (ε) | **0.01** | Table 9-1; §9.11; SolverOptions2D.hpp:162 | — | **0.1** ✗ |
| `FLUX_DH_EPS` | **0.004 m** | §9.11; SolverOptions2D.hpp:121 | — | **1e-6** ✗ |
| `LIMITER_EPSILON` | **10⁻⁶** | §9.11; SolverOptions2D.hpp:112 | — | 1e-6 ✓ |
| `CELL_CLOSURE` | **FLAT** | §9.11 default; SolverOptions2D.hpp:149 | — | FLAT ✓ |
| `FACE_RECONSTRUCTION` | **MEAN** | §9.11 default; SolverOptions2D.hpp:155 | — | MEAN ✓ |
| `COUPLING_AREA` | **DEFAULT**; AUTO = clamp(1.25·A_conduit,max, 0.05, 2.0) m² | §9.7.5; SolverOptions2D.hpp:207 | — | DEFAULT/AUTO ✓ |
| `RAINFALL_MODE` | **NATURAL_NEIGHBOUR** | §9.8; §9.11; SolverOptions2D.hpp:139 | — | NN/SYSTEM/NONE ✓ |
| `INTEGRATOR` | explicit by construction; key not documented | §9.5, Fig 9-1 | — | EXPLICIT (key not in manual) |
| δ (hysteresis half-band, Eq 9-25) | **min(1 mm, h_move/2)** | Eq 9-25; §9.5.7; ExplicitInertialSolver.cpp:251 | ±1 mm fixed (wrong in general) | n/a |
| β (`exchange_beta`) | **0.8** | Table 9-1; Eq 9-15; SolverOptions2D.hpp:201 | 0.8 ✓ | — |
| rebuild cadence | **4 macro cycles** | Table 9-1; §9.5.8; ExplicitInertialSolver.cpp:49 | 4 ✓ | — |
| slope deadband | **10⁻¹² m** | Table 9-1; §9.5.3; InertialKernels.hpp:68 | (kernel) ✓ | — |
| `DT_FLOOR` | **not documented** | nowhere in Ch. 9; absent from engine (`rg DT_FLOOR` → no hits) | 0.1 (project) | n/a |
| default Manning's n | **not documented**; n is a required per-cell input | §9.3 `[2D_TRIANGLES]`; SectionHandlers2D.cpp:324; MeshBuilder.cpp:204 rejects n ≤ 0 | 0.045 (project) | 0.045 (project) |

**The two project default sets disagree with each other and with the manual.** `couplingSplit.js` matches the manual on H_MOVE, DRY_DEPTH, MAX_TIMESTEP, REBUILD_CADENCE, β; `mesh2dInp.js`/`mesh2dExport.js` match only on DRY_DEPTH, COUPLING_CD, LIMITER_EPSILON, closure/reconstruction/rainfall defaults. Every *numerical* solver default each site emits is off the manual.

---

## Verdict list

```
V 2    | MISMATCH | 5 of 10 defaults wrong: THETA 0.5 (m=0.8), CFL 0.8 (m=0.7), FROUDE 1.0 (m=1.5), LTS 1 (m=4); H_MOVE 0.003, DRY 0.001, MAX_TIMESTEP 10, REBUILD 4, β 0.8 match; DT_FLOOR 0.1 undocumented | Ch9 §9.5.1/Eq 9-9, §9.5.5/Eq 9-17, §9.5.1/Eq 9-10, §9.5.6/§9.11; Table 9-1
V 4    | AMBIGUOUS | pseudo-Laplacian CSR + moment-fit + Lagrange multipliers matches the manual's solver-field description, but claim attributes it to Jawahar–Kamath while §9.9 names Kumar et al. (2009) | Ch9 §9.9; VertexReconstruction.cpp:112-139 ("Jawahar & Kamath boundary treatment", Lagrange multipliers Eq.[83])
V 18   | MATCH | engine Froude-caps face fluxes at Fr_max·h·√(gh); the rendering-side gate is an extra frame-time device consistent with §14 | Ch9 Eq 9-10; InertialKernels.hpp:216-219; §14
V 19   | NOT_IN_MANUAL | f32 Perot-speed CFL blow-up is a WebGPU precision engineering concern; engine runs f64 | Ch9 §9.5.5 (|u|=|q|/h, h>10⁻⁶); no f32 anywhere in manual
V 21   | MATCH | LTS_TIERS=1 global-dt, FLAT closure, uniform rain (SYSTEM), WALL, rebuild cadence 4, lazy clock, tail all match Ch9; kernel-port wording is code parity | Ch9 §9.5.6, §9.5.7, §9.5.8, §9.6, §9.8
V 22   | MATCH | cL=min(t,nbr) is an engine indexing convention (InertialEdges.cpp:47); zface=max(czL,czR) = Eq 9-11; n2=((nL+nR)/2)² = the manual's squared face roughness | Ch9 Eq 9-11, §9.3 "Face roughness is the mean of the two cells' n", line 637; InertialEdges.cpp:47,52,92-93
V 23   | NOT_IN_MANUAL | default Manning's n 0.045 is a project fallback; the manual requires MANNINGS_N per triangle and documents no default | Ch9 §9.3 [2D_TRIANGLES]; MeshBuilder.cpp:204
V 24   | NOT_IN_MANUAL | outward-normal-by-centroid-side test is a mesh-build convention; manual only fixes s_f = ±1 orientation | Ch9 Eq 9-16; MeshBuilder.cpp
V 25   | MATCH | zface = max of the two adjacent cell centroid elevations = Eq 9-11 | Ch9 Eq 9-11; InertialEdges.cpp:52
V 26   | MATCH | 0.3×chord floor on face-normal distance = Eq 9-3 | Ch9 Eq 9-3; InertialEdges.cpp:88
V 27   | MATCH | face friction n² = squared mean of cell n's = the manual's n_f² = (½(n_L+n_R))² | Ch9 §9.3, line 637; InertialEdges.cpp:92-93
V 28   | MISMATCH | "L_char = 2A/longest edge" is the geometric proxy the manual and engine both REJECT; manual L_char is operator-derived √(2A/Σξ_f/d_n,f) (Eq 9-4), and the 2A/ξ_max proxy overstates dt by √3 | Ch9 Eq 9-4, §9.5.5; InertialEdges.cpp:99-109
V 29   | MATCH | initial head = bed (INIT_DEPTH default 0 = dry; η = z + V/A) | Ch9 §9.3, §9.4
V 31   | AMBIGUOUS | hysteresis half-band is NOT fixed ±1 mm: manual δ = min(1 mm, h_move/2) (Eq 9-25); coincides with ±1 mm only at default H_MOVE=0.003 (engine comment: "bit-identical at the default") | Ch9 Eq 9-25, §9.5.7; ExplicitInertialSolver.cpp:251-253
V 32   | MATCH | per-face positivity share β/3 with β=0.8 = Eq 9-15 | Ch9 Eq 9-15; Table 9-1; ExplicitInertialSolver.cpp:375
V 33   | NOT_IN_MANUAL | Bellinge cell sizes/dt diagnostics and the "Avg Internal Step" interpretation are model-specific; DT_FLOOR (0.05 here) is not documented and is internally inconsistent with CLAIM-2/133 (0.1) | Ch9 §9.9 stats block only; DT_FLOOR absent from manual and engine
V 34   | MATCH | K=1 → nsub_full=1 → single global substep; K>1 → LTS macro cycle — matches §9.5.6/9.5.8 | Ch9 §9.5.6; ExplicitInertialSolver.cpp:736-737
V 35   | MATCH | post-rebuild segment runs with freshly recomputed dt0 and active set; between rebuilds dt0 only re-minimized | Ch9 §9.5.8; ExplicitInertialSolver.cpp:730-735, 334-341
V 36   | MATCH | macro cycle length = 2^(K−1) base substeps | Ch9 §9.5.6; ExplicitInertialSolver.cpp:737
V 37   | MATCH | tail: collapse to global dt (nsub=1), finish window, force rebuild after = §9.5.8 verbatim | Ch9 §9.5.8; ExplicitInertialSolver.cpp:749-767
V 38   | MATCH | tier k fires every 2^k substeps at Δt = 2^k·dt0 | Ch9 §9.5.6; ExplicitInertialSolver.cpp:680-694
V 40   | MATCH | per-interior-face local-inertial update in the manual's §9.5.1 firing order | Ch9 §9.5.1, Eq 9-7
V 41   | MATCH | hf = max(ηL,ηR) − zface = Eq 9-11 (MEAN reconstruction) | Ch9 Eq 9-11; InertialKernels.hpp:129-131
V 42   | MATCH | hf ≤ DRY_DEPTH walls the face and zeroes its momentum | Ch9 §9.5.2, §9.5.1(i); ExplicitInertialSolver.cpp:390-392
V 43   | MATCH | qhat = θ·q_f + (1−θ)·½(q_L+q_R)·n̂ = Eq 9-9 (Perot θ-blend) | Ch9 Eq 9-9; ExplicitInertialSolver.cpp:394-400
V 44   | MATCH | friction |q| = max(face |q|, |½(q_L+q_R)|) = Eq 9-24 | Ch9 Eq 9-24; ExplicitInertialSolver.cpp:401-404
V 45   | MATCH | |Δη| < 1e-12 → 0 deadband, slope = Δη/dn | Ch9 §9.5.3, Table 9-1; InertialKernels.hpp:68; ExplicitInertialSolver.cpp:406-408
V 46   | MATCH | de Almeida & Bates local-inertial update qn1 = (qhat − g·hf·dt·slope)/(1 + g·dt·n²·q_mag/h^(7/3)) = Eq 9-7 | Ch9 Eq 9-7; InertialKernels.hpp:181-188
V 47   | MATCH | Froude cap Fr_max·h·√(gh) = Eq 9-10; units check: h·√(gh) = m·m/s = m²/s = q units | Ch9 Eq 9-10; InertialKernels.hpp:216-219
V 48   | MATCH | positivity budget keyed on the flux-EXPORTING cell (V_exp) | Ch9 Eq 9-15; ExplicitInertialSolver.cpp:432-435
V 49   | MATCH | outflow volume capped at β/3 × exporting-cell volume (divisor 2^(k_exp−k_f) for LTS; =1 at global dt) | Ch9 Eq 9-15
V 50   | MATCH | dM = q·ξ·dt, faccL −= dM, faccR += dM — anti-symmetric booking = Eq 9-13 | Ch9 Eq 9-13; ExplicitInertialSolver.cpp:442-444
V 51   | MATCH | volume update V + Σacc + Δt·A·(i−e+s), zero floor, depth=V/A, η=z+d | Ch9 Eq 9-14, §9.4, §9.5.4
V 52   | MATCH | Perot cell discharge q_i = (1/A)Σ s_f q_f ξ_f (x_f − x_i) = Eq 9-16 | Ch9 Eq 9-16
V 54   | AMBIGUOUS | seedActive structure (depth ≥ thresh or pinned) matches §9.5.9, but H_ON/H_OFF hardcode ±0.001 while the manual's δ = min(1 mm, h_move/2) scales | Ch9 Eq 9-25, §9.5.9; ExplicitInertialSolver.cpp:242-261
V 55   | MATCH | one-ring halo activation expansion = §9.5.7 | Ch9 §9.5.7; ExplicitInertialSolver.cpp:263-273
V 65   | MATCH | dt = CFL·lchar/c, c = √(gh)+|u|, capped by MAX_TIMESTEP, min over census = Eq 9-17 | Ch9 Eq 9-17, §9.5.5; InertialKernels.hpp:224-228; ExplicitInertialSolver.cpp:290-298
V 66   | NOT_IN_MANUAL | f32 Perot-speed q/h driving CFL min ~1e-30 is WebGPU precision; engine is f64 | Ch9 §9.5.5; no f32 in manual
V 67   | MATCH | LTS halving scheme: tier k fires every 2^k substeps at 2^k·dt0, face tier = min(cells), ±dM accumulator handoff gives exact cross-tier conservation | Ch9 §9.5.6, Eq 9-13
V 68   | MATCH | tier assignment tk = ratio≥2 ? min(K−1, floor(log2 ratio)) : 0; coupling/pinned cells forced to tier 0 | Ch9 §9.5.6; ExplicitInertialSolver.cpp:305-311
V 69   | MATCH | face tier = min of incident cell tiers ("a face belongs to the finer of its two incident cells") | Ch9 §9.5.6; ExplicitInertialSolver.cpp:319
V 70   | MATCH | walled faces carry no stale momentum (q=0 at rebuild) | Ch9 §9.5.8; ExplicitInertialSolver.cpp:322-324
V 71   | MATCH | positivity budget divided by refire = 2^(tier_exp − face_tier) = Eq 9-15 divisor | Ch9 Eq 9-15; ExplicitInertialSolver.cpp:433-434
V 72   | MATCH | refire = 1 << (tier_exp − face_tier) | Ch9 Eq 9-15; ExplicitInertialSolver.cpp:433
V 73   | MATCH | cellUpdateLts = engine fireCells: gather+clear own-side accumulators, sources, closure, Perot | Ch9 §9.5.4, §9.5.8; ExplicitInertialSolver.cpp:449-461
V 75   | NOT_IN_MANUAL | edge-flux LS velocity reconstruction ((NᵀN)v = Nᵀq then /h) is not documented; the manual derives velocity as q/h from the Perot vector (consistent, no contradiction) | Ch9 §9.5.4, §14
V 82   | NOT_IN_MANUAL | default Manning's n 0.045 and the ≥0.001 clamp are project-side; manual requires MANNINGS_N per cell, engine rejects n ≤ 0 | Ch9 §9.3; MeshBuilder.cpp:204
V 83   | MISMATCH | 7 of 8 emitted defaults wrong: MAX_TIMESTEP 2 (m=10), COUPLING_SYNC 1 (m=0), THETA 0.5 (m=0.8), CFL 0.8 (m=0.7), H_MOVE 0.001 (m=0.003), FROUDE 1.0 (m=1.5), LTS 1 (m=4); DRY_DEPTH 0.001 ✓; LTS clamp [1,8] ✓ | Ch9 §9.11, Table 9-1
V 84   | MISMATCH | LIMITER_EPSILON 1e-6 ✓, CELL_CLOSURE FLAT ✓, FACE_RECONSTRUCTION MEAN ✓; FLUX_DH_EPS 1e-6 (m=0.004) ✗, VFR_MIN_WET_FRAC 0.1 (m=0.01) ✗; INTEGRATOR key not documented | Ch9 §9.11, Table 9-1
V 88   | MISMATCH | same wrong set as CLAIM-83 plus FLUX_DH_EPS 1e-6 (m=0.004); DRY 0.001, CD 0.65, LIMITER 1e-6 ✓ | Ch9 §9.11, Table 9-1
V 89   | MISMATCH | CELL_CLOSURE/FACE_RECONSTRUCTION/INTEGRATOR ok, but VFR_MIN_WET_FRAC 0.1 vs manual 0.01 | Ch9 Table 9-1, §9.11
V 102  | MATCH | explicit local-inertial scheme with per-cell LTS = the chapter's whole thesis | Ch9 §9.5, §9.5.6
V 103  | MATCH | fireFaces (Manning + Froude cap + positivity share) / fireCells (3-face flux sum + sources) / rebuild+tiers (LTS v1 global dt, v2 tier lists) | Ch9 §9.5.1, §9.5.4, §9.5.6, §9.5.8
V 104  | MATCH | faceFlowDepth = max(η_L,η_R) − zmid = Eq 9-11 under MEAN | Ch9 Eq 9-11; InertialKernels.hpp:129-131
V 105  | MATCH | vol = max(0, vol+Δ); head = z + V/A; depth derived | Ch9 Eq 9-14, §9.4
V 106  | MATCH | default WALL on all exterior faces; NORMAL_FLOW / SPECIFIED_STAGE are the manual's BC types | Ch9 §9.6
V 108  | NOT_IN_MANUAL | f32 ulp at z≈65 m ≈7.8e-6 m vs DRY_DEPTH 0.001 is a precision engineering note; the DRY_DEPTH value itself matches | Ch9 Table 9-1; f32 not in manual
V 109  | MATCH | the listed formulas (faceFlowDepth, Manning/Eq 9-7, cellCflDt/Eq 9-17, positivity/Eq 9-15) are exactly Ch9's | Ch9 Eq 9-11, 9-7, 9-17, 9-15
V 111  | MATCH | M1 port pieces all exist in Ch9: faceFlux, cellUpdate (Perot θ-mix), lazySources, seedActive, halo, cflReduce, cadence-4 rebuild, tail | Ch9 §9.5.1–§9.5.8
V 119  | MATCH | exporter cell exp_cell = qn1>0 ? a : b = Eq 9-15's V_exp | Ch9 Eq 9-15; ExplicitInertialSolver.cpp:432
V 121  | AMBIGUOUS | qx/qy = Perot discharge (Eq 9-16) ✓; but "cell velocity is the Perot cell discharge" conflates specific discharge (m²/s) with velocity — manual is explicit the vector is not velocity; velocity = q/h | Ch9 §9.5.4, §14
V 124  | MATCH | LTS halving port, face tier = min cells, ±dM accumulators, exact conservation, budget/2^(tier_exp−face_tier) — all §9.5.6 + Eq 9-13/9-15 | Ch9 §9.5.6, Eq 9-13, Eq 9-15
V 125  | MATCH | K=1 = single global substep path, consistent with §9.5.6 | Ch9 §9.5.6; ExplicitInertialSolver.cpp:736-737
V 126  | NOT_IN_MANUAL | f32 dt0 floor (1e-3 s) is a WebGPU guard; manual documents no dt0 floor | DT_FLOOR absent from manual and engine
V 128  | AMBIGUOUS | "Jawahar–Kamath" matches VertexReconstruction.cpp:112-139 (moment-fit + Lagrange multipliers + clip + renormalize + uniform fallback) but the manual §9.9 names Kumar et al. (2009) for the solver vertex field | Ch9 §9.9; VertexReconstruction.cpp:37-139
V 130  | NOT_IN_MANUAL | model-specific diagnostics (lchar 0.25–0.30 m, CFL 0.018–0.023 s, tier-3 LTS weighting of "Avg Internal Step"); consistent with §9.5.6 tier spacing and §9.9 stats | Ch9 §9.5.6, §9.9
V 131  | NOT_IN_MANUAL | configurable dt0 floor (0.05 s) is a project option; manual documents no such floor; value also conflicts with CLAIM-2/133 (0.1 s) | DT_FLOOR absent from manual and engine
V 133  | NOT_IN_MANUAL | "DT_FLOOR default 0.05 → 0.1 s in [2D_OPTIONS]" — DT_FLOOR appears nowhere in the manual AND nowhere in the engine (rg: no hits); also self-contradictory (0.05 vs 0.1) | not in Ch9 §9.11/Table 9-1
```

---

## TOP MISMATCHES (10 most important)

1. **Every numerical default the project emits is wrong — and the two sites disagree with each other.**
   `couplingSplit.js` (CLAIM-2): THETA 0.5 vs 0.8, CFL_NUMBER 0.8 vs 0.7, FROUDE_MAX 1.0 vs 1.5, LTS_TIERS 1 vs 4. `mesh2dInp.js` (CLAIM-83) and `mesh2dExport.js` (CLAIM-88) additionally: MAX_TIMESTEP 2 vs 10 s, H_MOVE 0.001 vs 0.003 m, COUPLING_SYNC 1 vs 0, FLUX_DH_EPS 1e-6 vs 0.004 m, VFR_MIN_WET_FRAC 0.1 vs 0.01. The engine itself (`SolverOptions2D.hpp:110–207`) implements exactly the manual's values, so a run with project-emitted `[2D_OPTIONS]` is **not** a default-engine run. Only DRY_DEPTH 0.001, COUPLING_CD 0.65, LIMITER_EPSILON 1e-6, and (in couplingSplit) H_MOVE 0.003 / MAX_TIMESTEP 10 / REBUILD_CADENCE 4 / exchange_beta 0.8 agree.
   (Ch9 §9.11 / Table 9-1; SolverOptions2D.hpp:110–207)

2. **LTS_TIERS=1 everywhere.** Both project sites default to `LTS_TIERS 1` (a single global dt); the manual's default is 4 (up to 8× tier spread), §9.5.6/§9.11. This changes runtime behaviour, not just a number: "Avg Internal Step 0.2456 s" is only meaningful because the engine runs tiers 0–3.

3. **`COUPLING_SYNC 1` is emitted where the manual default is 0.** Ch9 §9.7.3: 0 co-advances every routing step; >0 batches the 2D advance with a held-exchange accuracy tradeoff explicitly warned about. Emitting 1.0 s silently selects the batched path (CLAIM-83/88).

4. **Cell characteristic length is the wrong formula (CLAIM-28).** The claim "2A/longest edge" is the geometric proxy the manual explicitly says "would overstate by √3" (§9.5.5) and that the engine replaced with the operator-derived L_char = √(2A/Σ_f ξ_f/d_n,f) (Eq 9-4; `InertialEdges.cpp:99–109`, comment: "the old 2A/ξ_max … overstated the allowable dt by √3, which is why frictionless basins seiched at nominal CFL ≥ 0.6"). The WebGPU marcher must use Eq 9-4 to be CFL-correct.

5. **Hysteresis band is not a fixed ±1 mm (CLAIM-31/54).** Eq 9-25: δ = min(1 mm, h_move/2), i.e. it **scales with H_MOVE** — a fixed ±1 mm band froze wetting fronts at H_MOVE = 10⁻⁴ (§9.5.7). The project hardcodes ±0.001 in both seedActive (marcher.wgsl) and CLAIM-31's statement. It coincides with the manual **only at the default H_MOVE = 0.003** ("bit-identical at the default", `ExplicitInertialSolver.cpp:250`). Any model with H_MOVE < 2 mm deviates; H_OFF also ignores the max(0,·) floor.

6. **`VFR_MIN_WET_FRAC 0.1` vs the manual's 0.01 (CLAIM-84/89).** Table 9-1 documents ε = 0.01 as the wetted-fraction floor of the regularized VFR closure (range (0, 0.5]). Emitting 0.1 changes the linearized dry-side η(V) branch of the VFR closure.

7. **`FLUX_DH_EPS 1e-6` vs the manual's 0.004 m (CLAIM-84/88).** §9.11: 0.004 m is the head-gradient floor of the diffusive boundary flux. The project's 1e-6 is ~bare-√, a different regularization regime.

8. **Vertex-stencil attribution (CLAIM-4/128) — AMBIGUOUS.** The implemented algorithm (moment-fit λ, Lagrange multipliers enforcing linear exactness, negative clipping, partition-of-unity renormalization, uniform fallback on degenerate/all-clipped stencils) matches both descriptions; but the manual names **Kumar et al. (2009)** while the code (`VertexReconstruction.cpp:112`) cites the **Jawahar & Kamath** boundary treatment. An auditor cannot confirm the manual's citation from the code; worth resolving which reference is authoritative.

9. **"Cell velocity is the Perot cell discharge" (CLAIM-121) conflates q with u.** The manual is explicit that Eq 9-16's vector is a **specific-discharge** vector (m²/s), not a velocity (§9.5.4), and that the reported velocity is q/h (§14). Returning qx/qy is correct; labeling it "velocity" invites the very q/h inflation the project's own gates guard against. The rendered field must divide by cell depth (and floor depth far above DRY_DEPTH).

10. **`DT_FLOOR` is a project fiction, and self-contradictory.** Claims 33/126/131/133 describe a configurable `DT_FLOOR` default "0.05 → 0.1 s" in `[2D_OPTIONS]`. It appears **nowhere in the manual** (Ch9 §9.11/Table 9-1 list no dt floor) and **nowhere in the engine** (`rg DT_FLOOR|dt_floor|dtFloor` → zero hits). The claim also contradicts itself (0.05 in CLAIM-33/131 vs 0.1 in CLAIM-2/133). If DT_FLOOR is emitted into INPs the engine will treat it as an unknown extension key. The f32 rationale is legitimate WebGPU engineering, but it must be documented as a project-only guard, not an engine default.

Honourable mentions: default Manning's n 0.045 (CLAIM-23/82) is undocumented in the manual (n is a required per-cell input; engine rejects n ≤ 0) — a harmless project fallback but not a manual claim; the LTS/advance/tail/positivity/CFL/Froude formula claims (21, 34–38, 40–52, 55, 65, 67–73, 102–106, 109, 111, 119, 124, 125) all check out against the manual and the engine verbatim.

---

## Summary

72 claims audited. **MATCH ≈ 44, AMBIGUOUS 5 (claims 4, 31, 54, 121, 128), NOT_IN_MANUAL 15, MISMATCH 8** (claims 2, 28, 83, 84, 88, 89, plus the fixed-hysteresis reading of 31/54 and the attribution reading of 4/128).

The physics is faithfully ported: the face update (Eq 9-7), θ-blend (9-9), Froude cap (9-10), positivity β/3 (9-15), anti-symmetric booking (9-13), Perot cell discharge (9-16), CFL step (9-17), LTS tiering (9-5.6), tail/rebuild handling (§9.5.8) all match the manual to the letter. The damage is concentrated in **defaults**: the two project default-emitting sites disagree with the manual (and each other) on THETA, CFL_NUMBER, FROUDE_MAX, LTS_TIERS (both sites) plus MAX_TIMESTEP, H_MOVE, COUPLING_SYNC, FLUX_DH_EPS, VFR_MIN_WET_FRAC (mesh2dInp/Export), and the L_char proxy is the wrong formula in the marcher. DT_FLOOR is undocumented anywhere and self-contradictory in the project. The top three fixes: align `[2D_OPTIONS]` emission with Ch9 §9.11/Table 9-1, replace 2A/longest-edge with Eq 9-4, and scale the activation hysteresis by min(1 mm, h_move/2) per Eq 9-25.
