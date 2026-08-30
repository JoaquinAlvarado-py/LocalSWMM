# Engine Study — Findings & Claim Audit (Consolidated)

**Date:** 2026-08-12
**Primary source:** `third_party/openswmm-engine/docs/manuals/` (the engine's own
Reference Manuals, Vol. I Hydrology / Vol. II Hydraulics / Vol. III Quality, plus
the User Manual and Application Manual), cross-checked against the engine source
under `third_party/openswmm-engine/src/`.

**Inputs produced by this study**

| File | What it is |
|---|---|
| `research/00-claims-inventory.md` | 137 engine-behavior claims extracted from the project's code + WEBGPU_PLAN.md |
| `research/01-hydraulics-ch1-4.md` | Deep study: model, dynamic wave, node continuity, surcharge, semi-implicit |
| `research/02-hydraulics-ch5-7.md` | Deep study: cross-sections, pumps, weirs/orifices, advanced features |
| `research/03-hydraulics-ch8-9-2d.md` | Deep study: explicit finite-volume solver, 2D overland, 1D–2D coupling |
| `research/04-hydrology.md` | Deep study: rain gages, runoff, infiltration, groundwater, snowmelt, RDII |
| `research/05-quality-user.md` | Deep study: quality model, LIDs, user-manual options |
| `research/06-audit-solver-numerics.md` | Verdicts on 72 solver/numerics/defaults claims |
| `research/07-audit-coupling-nodecont.md` | Verdicts on 79 coupling/rainfall/node-continuity/cross-section claims |

**Verdict tallies:** 149 claims audited — ~110 MATCH, 8 hard MISMATCH, ~10
AMBIGUOUS, the rest NOT_IN_MANUAL (engine-code or engineering decisions that
don't contradict the manual).

---

## The big picture

The **physics port is faithful.** The WebGPU marcher reproduces the engine's
face update (manual Eq 9-7), Perot θ-blend (9-9), Froude cap (9-10), positivity
budget β/3 (9-15), anti-symmetric flux booking (9-13), Perot cell discharge
(9-16), CFL step (9-17), LTS halving scheme (§9.5.6), tail/rebuild handling
(§9.5.8), coupling orifice law and its C¹-regularized square root (Eq 9-18,
9-27/28/29), the coupling area AUTO formula, and the co-advance architecture —
**all verbatim against the manual and the engine kernels.**

The damage is concentrated in **defaults the project emits** and a **handful of
mis-attributed engine internals.** The two project default-emitting sites
disagree with the manual (and with each other), so a run with project-emitted
`[2D_OPTIONS]` is **not** a default-engine run.

---

## Top findings that need action

### 1. Every numerical `[2D_OPTIONS]` default the project emits is wrong

Both `mesh2dInp.js`/`mesh2dExport.js` and the `couplingSplit.js` parser disagree
with the manual (Ch9 §9.11, Table 9-1) and with the engine's own
`SolverOptions2D.hpp:110-187`:

| Key | Manual & engine | couplingSplit.js | mesh2dInp/Export |
|---|---|---|---|
| THETA | 0.8 | **0.5** ✗ | **0.5** ✗ |
| CFL_NUMBER | 0.7 | **0.8** ✗ | **0.8** ✗ |
| FROUDE_MAX | 1.5 | **1.0** ✗ | **1.0** ✗ |
| LTS_TIERS | 4 | **1** ✗ | **1** ✗ |
| MAX_TIMESTEP | 10 s | 10 ✓ | **2** ✗ |
| H_MOVE | 0.003 m | 0.003 ✓ | **0.001** ✗ |
| COUPLING_SYNC | 0 | — | **1.0** ✗ |
| FLUX_DH_EPS | 0.004 m | — | **1e-6** ✗ |
| VFR_MIN_WET_FRAC | 0.01 | — | **0.1** ✗ |
| DRY_DEPTH | 0.001 | 0.001 ✓ | 0.001 ✓ |
| COUPLING_CD | 0.65 | 0.65 ✓ | 0.65 ✓ |
| LIMITER_EPSILON | 1e-6 | — | 1e-6 ✓ |

`LTS_TIERS 1` is the most consequential: it forces a single global dt where the
engine runs 4 tiers (up to 8× spread) — your "Avg Internal Step 0.2456 s" reading
only holds *because* the engine runs tiers 0–3. `COUPLING_SYNC 1` silently selects
the batched-exchange path the manual explicitly warns degrades exchange accuracy.

### 2. Cell characteristic length uses the rejected proxy (CLAIM-28)

`webgpuMarscher.js` computes `L_char = 2A/longest edge`. The manual (Eq 9-4,
§9.5.5) uses the operator-derived `L_char = √(2A / Σ_f ξ_f/d_n,f)`; the engine
explicitly replaced the 2A/ξ_max proxy because it **overstates the allowable dt by
√3** (`InertialEdges.cpp:99-109`, comment: "frictionless basins seiched at nominal
CFL ≥ 0.6"). The marcher must switch to Eq 9-4 to be CFL-correct.

### 3. Wetting hysteresis is a fixed ±1 mm, but the manual's is scaled (CLAIM-31/54)

Manual Eq 9-25: half-band `δ = min(1 mm, h_move/2)` — it **scales with H_MOVE**.
The project hardcodes `±0.001` in `seedActive` (marcher.wgsl). It coincides only at
the default H_MOVE = 0.003 (engine comment: "bit-identical at the default"). Any
model with H_MOVE < 2 mm deviates; H_OFF also misses the `max(0,·)` floor.

### 4. Storage FUNC area coefficients are NOT "ft² even in SI" (CLAIM-116) — MISMATCH

The claim in WEBGPU_PLAN.md is wrong for the current engine. The manual (UM AppD
FUNCTIONAL) says coefficients follow project units (m² in SI); engine source keeps
them in user units and converts per call (`Node.cpp:106-118`). If the split treats
a SI-model FUNC coefficient as ft², storage is mis-sized by (0.3048)².

### 5. "Two-window mean" coupling delivery is an artifact, not an engine property (CLAIM-17/118)

The engine's delivery is a **volume queue drained at a uniform rate**; `user_lat_flow`
is persistent and applied verbatim. The observed "mean of the last two windows"
(measured `set −1.0 → applied −0.5`) is an artifact of the split's per-window set
interacting with the stride/queue cadence, not an engine average. Rewrite the claim
as an observed equivalence, and re-derive the exact `setLatInflow` rate from the
queue model if the split's balance depends on it.

### 6. `DT_FLOOR` is a project fiction (CLAIM-33/126/131/133)

`DT_FLOOR` appears **nowhere in the manual** and **nowhere in the engine** (zero
hits). The project contradicts itself (0.05 vs 0.1 s) and emits a key the engine
treats as unknown. The f32 stability rationale is legitimate WebGPU engineering —
keep the guard, but document it as project-only and pick one default.

### 7. Vertex-coupled-point driving head: manual says stencil, live path collapses (CLAIM-9/127) — AMBIGUOUS

The manual (§9.7.1/§9.7.5) describes vertex-point heads via the stencil
(pseudo-Laplacian / depth-weighted mean); the engine's live marcher path collapses
every non-outfall vertex point to the **single lowest-bed incident cell**
(`vertex_idx = −1`, `SurfaceRouter2D.cpp:447-478`). The project's code is right
about the engine, but neither the manual nor the project explains the two coexist.
Resolve the attribution; the manual's general description contradicts the live path.

### 8. VARIABLE_STEP default: manual is stale vs this engine (CLAIM-143) — MISMATCH (documentation)

UM AppD says default 0 = fixed step. The engine defaults `variable_step = 0.75`
(adaptive). The claim sides with the engine, which is correct for this build — but
the manual contradicts it, and the project's "min 0.50 s" floor is consistent only
with UM AppD MINIMUM_STEP 0.5. Flag for upstream; don't "fix" the code.

### 9. The semi-implicit sign — already resolved

Your `semi-implicit-denominator-sign-bug-report.md` proposed changing
`surf_area − 0.5·dt·sumdqdh` → `surf_area + 0.5·dt·sumdqdh`. The manual (Vol II
§3.5, Eq 3-45) prints a literal **plus** before `Σ(∂Q/∂H)` but never fixes the
sign convention of that sum (Eq 3-27 defines each ∂Q/∂H as negative; Eq 3-26 needs
the signed negative sum). The engine has already been fixed to
`denom = surf_area + 0.5 * dt * sumdqdh` (`DynamicWave.cpp:3374`) with a comment
deriving `dH = dV / (A + 0.5·dt·sumdqdh)` for `sumdqdh > 0`. The bug report is
superseded; the manual is internally ambiguous on the sign, so the code's choice is
defensible. (Verify the report's proposed fix against the pinned submodule commit —
current HEAD `ec280d2c` already carries it.)

### 10. Velocity: q/h is right; "cell velocity is Perot discharge" conflates q with u (CLAIM-121) — AMBIGUOUS

The manual (§9.5.4, §14) is explicit: Eq 9-16's vector is a **specific-discharge**
(m²/s) vector, and velocity = q/h. Returning qx/qy from the marcher is correct;
**labeling it velocity** invites the very q/h inflation your own render gates guard
against. Keep dividing by (floored) depth at render time.

---

## Confirmations worth keeping

- **Coupling physics:** orifice law + C¹-regularized √, 2A→A crown ramp over 5 cm,
  capped-pipe smoothstep, source wet/dry Hermite ramp, β·V/dt drain cap, node-volume
  spill ledger, tier-0 cadence, faces→cells→coupling order, pinned coupling cells —
  all MATCH Ch9 §9.7 and the kernels. **Your M2 coupling port is sound.**
- **Rainfall:** `RAINFALL_MODE SYSTEM` = gage mean over all cells, lazy rain on
  inactive cells, per-cell rate·dt·area, the double-counting warning if subcatchments
  also deliver runoff — all MATCH. Note: NATURAL_NEIGHBOUR is the manual's *default*;
  the marcher's uniform-mean limitation is a documented project gap, not an error.
- **Node continuity / surcharge / ponding:** `nodeCanPond = allow_ponding || is_coupled`,
  ponded-area overwrite, MIN_SURFAREA 12.566 ft², HEAD_TOLERANCE 0.005 ft, the ±10%
  continuity band — all confirmed (the ponding override is engine code the manual
  doesn't document, not an error).
- **LTS / rebuild / tail / CFL / Froude / positivity** claims (21, 34-38, 40-52,
  55, 65, 67-73, 102-106, 109, 111, 119, 124, 125) — all MATCH to the letter.

## Manual-internal issues found (for upstream, not project bugs)

1. Eq 3-28's printed `f_H` makes β≈0 at every surcharge depth, contradicting its own text.
2. Eq 3-26/3-28/3-45 never fix the sign of `Σ(∂Q/∂H)` — the semi-implicit ambiguity above.
3. Eq 5-15 (§5.1.8) contradicts itself on `Ψ = Q√S₀/η` vs `Qη/√S₀`.
4. The `P′(A)` formulas for trapezoidal/triangular shapes are wrong.
5. Eq 9-30 and 9-31 are each reused for two unrelated equations.
6. UM AppD VARIABLE_STEP default (0) is stale vs the engine (0.75).
7. Vertex stencil: manual names Kumar et al. (2009); engine cites Jawahar & Kamath.

---

## Suggested next steps (pick one)

1. **Fix `[2D_OPTIONS]` emission** (highest leverage): align `mesh2dInp.js` /
   `mesh2dExport.js` / `couplingSplit.js` defaults with `SolverOptions2D.hpp`
   (THETA 0.8, CFL 0.7, FROUDE_MAX 1.5, LTS_TIERS 4, MAX_TIMESTEP 10, H_MOVE 0.003,
   COUPLING_SYNC 0, FLUX_DH_EPS 0.004, VFR_MIN_WET_FRAC 0.01) or stop emitting
   defaults entirely and let the engine take its own.
2. **Fix the marcher**: L_char → Eq 9-4; hysteresis δ → min(1 mm, h_move/2).
3. **Correct the claims docs**: CLAIM-116 (FUNC units), CLAIM-17/118 (queue
   artifact), CLAIM-133 (DT_FLOOR fiction), CLAIM-121 (q vs u), CLAIM-3/9/127
   (attributions).
4. **Update `CONTEXT.md`**: the "uniform rain film" entry is physically correct but
   should cite `RAINFALL_MODE SYSTEM`; the "q/h inflation" entry is exactly the
   manual's own §14 analysis.
