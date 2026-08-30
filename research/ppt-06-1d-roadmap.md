# The 1D calculation scheme: how it works and where it's going

Narrative of the 1D engine as documented in `docs/explanation/` (main repo), plus the recent engine/frontend commits and the engine submodule pin. Sources are cited inline by their `docs/explanation/...` path. The worktree `LocalSWMM-network3d` (branch `website`) has **no** `docs/explanation/` — the docs live only in the main repo working tree (untracked by git; the docs were retired from git tracking in commit `f6844db`, "retire in-repo docs").

---

## 1. The default 1D scheme today

LocalSWMM runs the OpenSWMM dynamic-wave engine (`FLOW_ROUTING` default `DYNWAVE`) compiled to WASM. Defaults come from `SimulationOptions.hpp` and are transcribed in `hydraulics/12-options-and-defaults.md`:

| Option | Default |
|---|---|
| `FLOW_ROUTING` | `DYNWAVE` |
| `VARIABLE_STEP` | **0.75** (Courant-adaptive; official SWMM 5.x documents 0) |
| `SURCHARGE_METHOD` | `EXTRAN` |
| `NODE_CONTINUITY` | `EXPLICIT` (semi-implicit is opt-in) |
| `ANDERSON_ACCEL` | off |
| `HEAD_TOLERANCE` | 0.005 (project units, ≈ ft internally) |
| `MAX_TRIALS` | 8 |
| `INERTIAL_DAMPING` | `PARTIAL` |
| `MIN_SURFAREA` | 12.566 ft² |

**Per-step flow of the solve** (`notes/01-1d-engine-process.md`, matching `DWSolver::execute`, `DynamicWave.cpp:1026` in `hydraulics/06-dynamic-wave-solver.md`):

1. `dt` from the time-step controller; 2. runoff + infiltration; 3. assemble lateral inflows; 4. batch link geometry (`XSectBatch`); 5. link momentum kernels; 6. node depth updates; 7. **Picard convergence test** (head change ≤ 0.005 ft, max 8 trials, retry back to step 5); 8. snapshot to `.out`/`.rpt`.

**Momentum** (`hydraulics/07-link-momentum-kernel.md`): implicit (backwards-Euler) finite-difference form of the St. Venant momentum equation, six per-barrel contributions `dq1..dq6` (friction, pressure, two inertia, minor losses, evap/seep), updated as

$$q = \frac{q_{\mathrm{old}} - dq_2 + dq_3 + dq_4 + dq_6}{1 + dq_1 + dq_5},$$

with upstream weighting, Froude-based partial-inertia damping (`σ = clamp(2(1−Fr), 0, 1)`), velocity cap 50 ft/s, and `applyFlowLimits` (culvert inlet control, normal-flow limit, under-relaxation ω=0.5, flap gates). Force mains use a separate always-full kernel (Hazen–Williams / Darcy–Weisbach).

**Node continuity** (`hydraulics/08-node-continuity.md`): trapezoidal (Crank–Nicolson) volume change `ΔV = ½(ΔQ_net^{t-1} + ΔQ)·Δt`. Default `EXPLICIT` branches into
- free-surface update `Δy = ΔV/A_S` with the `A_min = 12.566 ft²` floor, and
- the `EXTRAN` surcharged perturbation `Δy = α·ΔQ/denom` with crown-proximity blend `exp(−15f)`.

The opt-in unified **semi-implicit** formulation (`NODE_CONTINUITY SEMI_IMPLICIT`) collapses both regimes into one C¹-smooth equation (`hydraulics/08-node-continuity.md`, derivation in `notes/03-semi-implicit-update-math.md`):

$$\Delta y = \frac{\Delta V}{A_S + \tfrac{\Delta t}{2}\sum \frac{dQ}{dH}},$$

where `Σ dQ/dH` is the equation's own damping. `notes/02-node-continuity-formulations.md` diagrams the two branches sharing the trapezoidal volume change. Flooding/ponding cap the depth at `y_max = d_full + d_sur` (non-ponding → overflow; ponding → constant-area storage above the rim).

**Surcharge** (`hydraulics/09-surcharge-methods.md`): all three methods add a fictitious slot `A = A_full + (y−y_full)·w_s` above the crown (hydraulic radius clamped to full); default is `EXTRAN` (dQ/dH perturbation), alternatives are the static Preissmann slot (Sjöberg 1982) and the dynamic slot (below).

**Stability & convergence** (`hydraulics/11-stability-and-time-stepping.md`): explicit element-by-element updates impose the Courant condition; the routing step is the min over links (`V/q·(L'/L)·Fr/(1+Fr)`), nodes (`0.25·y_crown/ẏ`), and virtual-junction pairs, scaled by the Courant factor, floored/clamped, and capped by `ROUTING_STEP`. A step fails only if a non-outfall node is still unconverged after `MAX_TRIALS`. Routing mass balance counts flooding, outfalls, evap/seep, and storage.

Structures (pumps, orifices, weirs, outlets, outfalls, dividers) are solved by `HydStructures.cpp` inside the Picard loop (`hydraulics/10-structures-and-boundaries.md`).

---

## 2. Engine modifications LocalSWMM adds on top of base OpenSWMM

Series: `docs/explanation/engine-modifications/` (index lists 9 articles; note **01 and 02 are referenced in the index but missing on disk** — `01-introduction-and-rewrite` and `02-semi-implicit-node-continuity` — content for the latter exists in `notes/02`, `notes/03`, `hydraulics/08`). One line each:

- **Anderson acceleration** (`ANDERSON_ACCEL`, `engine-modifications/03-anderson-acceleration.md`): depth-2 mixing of the two most recent Picard operator outputs (`α` clamped to [0,1], so always interpolation), gated by residual ≤ 20·ε_H, skipped at non-smooth nodes (EXTRAN-surcharged, active dynamic slot, near static-slot cut, weir/orifice at crown, pump ends, ponding edge), with a dual convergence criterion — measured reduction of ~25–50 % in attempt counts on strongly-coupled networks.
- **Dynamic Preissmann slot** (`SURCHARGE_METHOD DYNAMIC_SLOT`, `engine-modifications/04-dynamic-preissmann-slot.md`): transient-storage slot (Sharior, Hodges & Vasconcelos 2023) whose area is accumulated path-dependently (`A_s ← max(A_s + T_s·Δh_s, 0)`), top width driven by target celerity `DPS_CELERITY` (25 m/s) and a Preissmann number `P` that decays after pressurization and is smoothed spatially; avoids the "slot squeezing" energy amplification of the static slot; node heads stay on the free-surface formula and the CFL uses `c_p = c_pT/P`.
- **Virtual junctions** (`[VIRTUAL_JUNCTIONS]`, `engine-modifications/05-virtual-junctions.md`): sealed zero-storage junction chambers for slope breaks between two collinear identical conduits — removes the `A_min` artificial storage and the momentum break; heads follow a zero-storage continuity (flow-balance at convergence), pass-through pairs transmit momentum via upstream-weighted (Froude) averaging, optional `VIRTUAL_JUNCTION_MOMENTUM FULL` adds a convective correction; usage guidance: small-deflection slope breaks only.
- **Finite-volume routing** (`FLOW_ROUTING FV`, `engine-modifications/06-finite-volume-routing.md`): explicit, conservative Godunov-type 1D solver (HLL/HLLC, order 1 Godunov / 2 MUSCL–Hancock, MINMOD/VANLEER/SUPERBEE, cell floors ≥ `FV_MIN_CELLS` 4, internal CFL sub-stepping, algebraic nodes without chamber-area states, semi-implicit node–cell coupling, local time stepping `FV_LTS` up to 6 tiers, structures re-evaluated per substep by default, bit-for-bit identical CPU/OpenMP/GPU backends); solves transcritical flow and dry/wet natively where the dynamic wave struggles.
- **RDII decay** (`[RDII_DECAY]`, `engine-modifications/08-rdii-decay.md`): replaces the monthly constant `IA_Recov` recovery with temperature-dependent first-order exponential relaxation (`k_dep` depletion during rain, `k_0`/`k_T`/`T_ref`/`T_cong` recovery, optional rain/snow partition with degree-day melt); pairs without a row keep the legacy linear model and hot-start state is interchangeable.
- **2D module & coupling** (`engine-modifications/07-2d-module-and-coupling.md`): local-inertial shallow-water solver on an unstructured triangular mesh (activated by mere presence of a mesh), coupled to 1D nodes by a C¹-regularized orifice law (`ε = 0.02 m`), plus three regularizations (lid-covered-conduit smoothstep gate, dry/wet ramps, Jacobian `−dQ/dh_1D` spread into the node continuity denominator), live exchange at LTS level-0 cadence with a delivery queue, and ponding-area override from the 2D cell footprint.
- **Behavior / platform changes** (`engine-modifications/09-behavior-changes.md`): `VARIABLE_STEP` defaults 0.75 (official SWMM 5.x = 0; set 0 to reproduce); `HEAD_TOLERANCE`/`MIN_SURFAREA` unit-conversion fixes (factor 3.3–10.8 SI errors); conduit evap/seep recomputed per Picard iteration; a step converging on the last trial counts as converged; `SKIP_STEADY_STATE`; plus `CRS`, `ext_options`, `IGNORE_2D`, native GeoPackage, C API wrappers, WASM/WebGPU compilation, and a battery of manufactured-solution benchmarks.

The option surface is consolidated in `docs/reference/01-engine-options.md` — every extension is off by default except the behavior changes above (`NODE_CONTINUITY EXPLICIT`, `ANDERSON_ACCEL NO`, `SURCHARGE_METHOD EXTRAN`, `FLOW_ROUTING DYNWAVE`).

---

## 3. Roadmap / next steps implied by the docs

### What is experimental / opt-in
- All 1D extensions above are **opt-in options** with legacy defaults kept (`reference/01-engine-options.md`, `hydraulics/12-options-and-defaults.md`). The only shipped default that deviates from official SWMM is `VARIABLE_STEP 0.75`.
- The **WebGPU 2D backend** is explicitly "experimental" (`tutorials/01-getting-started.md`, `explanation/01-architecture.md`, `explanation/04-two-d-mesh-and-webgpu.md`): a WGSL re-implementation of the 2D local-inertial marcher with its own milestone roadmap (below).

### The explicit roadmap table (`explanation/04-two-d-mesh-and-webgpu.md`, "WebGPU roadmap status", from `WEBGPU_PLAN.md`)

| Milestone | Status |
|---|---|
| M0 harness, M1 global-dt marcher, M2 split coupling, M2.x vertex coupling + production worker | done |
| M3 boundary conditions + LTS v2 | partial — LTS v2 done; `NORMAL_FLOW` / `SPECIFIED_STAGE` **pending** |
| M4 renderDepths + UI WebGPU/WASM toggle | **pending** |
| M5 benchmark & hosting | **pending** |

Hard limits recorded: Apple Silicon/Metal (≤10 storage buffers) cannot run the backend (falls back to WASM); f32/f64 divergence in `max|Δdepth|` is accepted (statistical validation).

### 1D is the performance bottleneck — and the plan reflects it
`04-two-d-mesh-and-webgpu.md:96`: *"GPU 2D is fast (0.13 ms/substep) but the 1D dynamic wave is ~90 % of wall time in both backends, so the split is currently on par with the engine, not faster."* The `website`-branch history shows the 1D leg being tuned toward this:

- `bcd2e77` — "perf pass - DT_FLOOR default 0.1 (split 1.9x, continuity 0, +1.2mm drift validated)... **1D model knobs measured + rejected (plan updated)**" → the knobs that would speed up the 1D dynamic wave were measured and rejected (model fidelity), and the plan was updated accordingly.
- `b3a194c` — dt0 collapse root cause: "tiny mesh cells pin the CFL min in **both engines**" → `dtFloor 0.05`, `VARIABLE_STEP` replace fix.
- `fd4320c` — stop overriding the model's 1D time step (a former pin to fixed step "corrupted the 1D solve").
- `033ea6f` — rebuild WASM on upstream engine with the **FV solver** and `MINIMUM_STEP`; Bellinge 48h: no NaN/Inf, 1D routing continuity +2.2% w/ 2D.

### FV routing is being surfaced in the UI (main branch, recent)
The finite-volume routing option — the engine's most consequential 1D capability — is being wired end-to-end into the app:

- `2c8c4a7` feat(ui): add **Flow Routing dropdown** and **Advanced FV options**
- `18956f0` feat(parser): parse `FV_*` options and `[VIRTUAL_JUNCTIONS]`
- `a40d1aa` feat(exporter): emit `FV_*` options and `[VIRTUAL_JUNCTIONS]`
- `2844fd6` fix(exporter): prefix-based `FV_*` raw exclusion; engine-readable `VIRTUAL_JUNCTIONS` rows

So the trajectory for 1D: the finite-volume solver (with its LTS and algebraic nodes) is the intended escape hatch from the dynamic wave's 8-trial Picard iteration and the chamber-area millisecond-step limit — it "eliminates the millisecond step limit that a chamber area imposed on the whole model" (`engine-modifications/06-finite-volume-routing.md`).

### The semi-implicit + Anderson path is being hardened
Recent engine commits indicate active stabilization of the opt-in 1D numerics on main:
- `abf2e84` / `e4a4e2e` — "engine: fix **semi-implicit node-continuity sign** + wasm IOThread guard"
- `f7bafdb` — "engine: fix **report node-continuity double-count**, 64-bit 2D counters"
- `1a45c0d` — "chore(engine): apply final-review fixes (**AA ponded skip**, comment) + rebuild wasm"

### Documentation gaps / pending
- `explanation/engine-modifications/index.md` lists 9 articles but only **03–09 exist on disk**; `01-introduction-and-rewrite` and `02-semi-implicit-node-continuity` are missing (a `docs-review` slice-1 commit `b95af10` added 01–02 EN/ES, later retired with the docs move).
- The `notes/` series (`notes/index.md`) is complete for its four diagrams; the hydraulics series is complete (12 articles, `hydraulics/index.md`).

---

## Appendix A — git log: recent 1D-related commits

Main repo `/home/nekzoh/Dev/LocalSWMM` (`main`), most recent first:

```
2844fd6 fix(exporter): prefix-based FV_* raw exclusion; engine-readable VIRTUAL_JUNCTIONS rows
a40d1aa feat(exporter): emit FV_* options and [VIRTUAL_JUNCTIONS]
18956f0 feat(parser): parse FV_* options and [VIRTUAL_JUNCTIONS]
2c8c4a7 feat(ui): add Flow Routing dropdown and Advanced FV options
1a45c0d chore(engine): apply final-review fixes (AA ponded skip, comment) + rebuild wasm
e083548 chore(engine): bump openswmm-engine submodule to swmm6_rel 2026-08-17 sync
f7bafdb engine: fix report node-continuity double-count, 64-bit 2D counters; rebuild wasm
abf2e84 engine: fix semi-implicit node-continuity sign + wasm IOThread guard
0fbb6aa submodule: pin openswmm-engine with wasm compatibility fix
```

Worktree `/home/nekzoh/Dev/LocalSWMM-network3d` (branch `website`, last 40 commits — dominated by 3D/2D work); the 1D-relevant ones:

```
033ea6f experimental: rebuild WASM on upstream openswmm engine 2932a5b (FV solver, MINIMUM_STEP) ... Bellinge 48h verified ... 1D routing continuity +2.2% w/ 2D
bcd2e77 experimental: perf pass - DT_FLOOR default 0.1 (split 1.9x ...); 1D model knobs measured + rejected (plan updated)
b3a194c experimental: dt0 collapse root cause (tiny mesh cells pin the CFL min in both engines) — dtFloor 0.05, VARIABLE_STEP replace fix
fd4320c fix(split): stop overriding the model's 1D time step; real 2D mass balance
3540594 align(2d): solver defaults + marcher physics with engine manual (Ch9)
```

## Appendix B — engine submodule pin

- **Main repo** (`git submodule status`): `ea3e9cdcdab2b8bbc8e6c9f46cd7d870a6d79099 third_party/openswmm-engine (v5.1.14-1110-gea3e9cdc)` — the HydroCouple OpenSWMM fork at `swmm6_rel`, synced 2026-08-17 (commit `e083548`). This is the pin the WASM engine is built from.
- **Worktree** `website` branch: pins `ec280d2cb7d10fe6761ee89ba58ef3cf5fd87c58` but the submodule is **not checked out** (`-` prefix in `git submodule status`).
- Per `docs/how-to/03-build-from-source.md:109`, the submodule remote is `https://github.com/JoaquinAlvarado-py/openswmm.engine.git`; older `experimental`-branch pins are not Emscripten-buildable out of the box (`PluginFactory.cpp` uses `dlopen`/`dlsym`, no `__EMSCRIPTEN__` in its `#if` chain) — fixed by the cmake/wasm wrapper in `033ea6f`.