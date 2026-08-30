# OpenSWMM Water Quality Engine & User-Manual Technical Reference

A deep study of the OpenSWMM engine's water quality and usage manuals. Primary sources:

- Reference (Volume III, Water Quality): `docs/manuals/reference/quality/sections/Chapter1-Overview.md` … `Chapter6-LowImpactDevelopmentControls.md`, `Glossary.md`
- User's Manual: `docs/manuals/user/manual/Chapter1.md` … `Chapter13.md`, `AppendixD.md` (`[OPTIONS]`), `AppendixE.md`
- Application Manual: `docs/manuals/application/application.md`

Citation scheme used below: **QR §x.y, Eq z-n / Table z-n** = Quality Reference manual; **UM §x.y / UM Ch8 "Dynamic Wave Options"** = User's Manual; **UM AppD** = User's Manual Appendix D; **UM AppE** = User's Manual Appendix E.

---

## 0. Status of each source document

| Source | Content status |
|---|---|
| QR Ch1 Overview | Complete, substantive |
| QR Ch2 Urban Runoff Quality | Complete, substantive |
| QR Ch3 Pollutant Buildup | Complete, substantive |
| QR Ch4 Surface Washoff | Complete, substantive |
| QR Ch5 Transport & Treatment | Complete, substantive (includes a modern-engine section 5.4.4 not in EPA's original manual) |
| QR Ch6 LID Controls | Complete, substantive (includes modern-engine additions 6.2.10/6.2.11) |
| QR Glossary | Complete |
| UM Ch1–Ch13 | UI manual; engine substance is concentrated in Ch2 (tutorial), Ch3 (conceptual/computational model), Ch8 (options + troubleshooting), Ch9 (reporting), Ch11 (files), Ch13 (C API), plus AppD/AppE |
| UM Ch4 Main Window, Ch5 Projects, Ch6 Working with Objects, Ch7 Working with Map, Ch10 Printing/Copying, Ch12 Add-in Tools | UI-only, no engine substance (one line each in §4 below) |
| Application Manual | **Stub.** All 7 chapters (Site Drainage, Detention Pond, Water Quality, LID, Continuous Simulation, CSO, Real-Time Control) are marked *"Content is under development."* No worked examples exist. |

---

# 1. The Water Quality Model (Quality Reference Volume III)

## 1.1 Overview: what the water-quality module does

The engine tracks, for any number of user-defined constituents, the following processes (QR §1.3 "Regarding water quality…", bullet list):

- dry-weather pollutant buildup over land uses;
- pollutant washoff from land uses during storms;
- direct contribution of rainfall deposition (wet deposition);
- reduction in buildup by street cleaning;
- reduction in washoff loads by BMP removal factors;
- entry of DWF and user-specified external inflows at any node;
- routing of constituents through the drainage system;
- concentration reduction by treatment at nodes and by natural processes (first-order decay) in pipes/channels.

### Requirements on a valid pollutant (QR §2.3.1)
1. Expressible as a concentration of mass (or organism number) per volume of water.
2. Masses additive: concentration of a mixture of two equal volumes equals the sum of concentrations.

This *excludes* pH, conductivity, turbidity, and color (log/derived quantities). Any number of pollutants may be defined (QR §1.3).

### Pollutant object properties (QR §2.3.1)
Units (mg/L, μg/L, counts/L); Rain Concentration; Groundwater Concentration; I/I (inflow/infiltration) Concentration; DWF Concentration; first-order Decay Coefficient (units 1/days); Snow-Only flag; and the **Co-Pollutant / Co-Fraction** pair. Co-pollutants ("potency factor") only apply to buildup/washoff, *not* to rain/groundwater/I-I/DWF/external-inflow concentrations (QR §2.3.1, "Co-Pollutant" bullet). Co-fraction can exceed 1 (it must honor the two constituents' units).

### Pollutant sources (QR §2.2)
Precipitation (wet deposition), surface runoff (buildup/washoff), dry weather flow, lateral groundwater flow (constant concentration assigned), RDII (constant concentration), and external time-series inflows. External inflow concentration at time t = (baseline value) × (baseline pattern factor) + (scale factor) × (time series value at t) (QR §2.2 "External Inflows"). That concentration × flow = external mass inflow rate; the same expression can instead be used as a time-varying mass loading with no flow needed.

### State variables (QR Ch1, Table 1-3)
Water-quality states kept by the engine: `t_sweep` (time since last street sweep, user-supplied initial), `m_B` (buildup mass on surface), `m_P` (pollutant mass ponded on subcatchment, init 0), `c_N` (node concentration), `c_L` (link concentration). The whole engine solves the discrete state-transition pair X_t = f(X_{t−1}, I_t, P), Y_t = g(X_t, P) (QR §1.4, Eq 1-1/1-2) on a routing time step; runoff is sub-stepped to catch up to each routing step boundary (QR §1.4, Fig 1-5).

### Interpolation & units (QR §1.5)
Linear interpolation for time series and reported results, **except** rainfall and infiltration rates, which stay constant within a runoff time step (no interpolation; reported intensity = value at the start of the runoff step). Internally everything is in feet and seconds; all inputs/outputs follow the US/SI choice implied by flow units (QR Table 1-4: buildup mass/acre vs mass/hectare; concentration mg/L, μg/L, or counts/L in both systems).

---

## 1.2 Pollutant Buildup (QR Ch3)

### 1.2.1 Governing equations (QR §3.2, Eq 3-1a/b/c)

Buildup is normalized per unit subcatchment area **or** per unit curb length (choice varies by pollutant–land-use pair; `[B]` = the chosen units). Three function forms:

- **Power:** `b = Min(Bmax, K_B·t^N_B)` (Eq 3-1a). `K_B` = rate constant `[B]·days^−N_B`, `N_B` = time exponent, should be ≤ 1; N_B = 1 gives linear buildup. N_B = 0 with K_B = Bmax gives constant ("instantaneous") buildup.
- **Exponential:** `b = Bmax·(1 − e^(−K_B·t))` (Eq 3-1b). `K_B` now has units days⁻¹; e.g. K_B = 0.33 day⁻¹ ⇒ 7 days to reach 90% of max.
- **Saturation:** `b = Bmax·t/(K_B + t)` (Eq 3-1c). `K_B` = half-saturation constant (days to reach half of maximum buildup).

Inverse forms (days of buildup-equivalent time, used to continue buildup across storms) are Eq 3-2a/b/c. The buildup bookkeeping after a storm is: find the time t1 that corresponds to the remaining buildup b1, then advance along the curve by the dry interval Δt to get the new available buildup (QR §3.2, Fig 3-4).

Buildup constants vary **by land use**, not by subcatchment (QR §3.3). Total mass: `m_B = b·N·f_LU`, where N = area or curb length of the subcatchment and f_LU = fraction of the subcatchment in that land use (QR §3.2, boxed equation after Eq 3-1).

### 1.2.2 Computational steps (QR §3.3)
Run each runoff time step, per subcatchment, after surface runoff is computed:
1. If runoff > 0.001 in/hr → wet step, no buildup addition (buildup is instead reduced by washoff, Ch4).
2. If the pollutant is snow-only and snow depth < 0.001 in → no buildup.
3. Normalize m_B by f_LU·A (or f_LU·L).
4. Invert the buildup function (Eq 3-2) to find equivalent buildup time t.
5. Add the runoff step length to t and re-evaluate Eq 3-1 for the new normalized buildup.
6. Denormalize to m_B.

Initial buildup: either user-specified initial buildup mass/area, or an antecedent-dry-days value evaluated through Eq 3-1 (QR §3.3, items 1–2). Note the UM equivalent: the "Antecedent Dry Days" entry in the Dates options (UM Ch8 "Antecedent Dry Days") exists precisely for this.

### 1.2.3 Street cleaning (QR §3.4)
Parameters: SS1/SS2 (start/end month-day of sweeping season, study-area-wide), SSI (days between sweepings, per land use), SS0 (days since last swept at start), SSA (fraction of buildup available for removal, per land use), SSE (fraction of available buildup removed, per pollutant–land-use). No sweeping if rainfall > 0.001 in/hr, or > 0.05 in snow on plowable impervious area, or SSI = 0, or too few days elapsed. Otherwise `m_B = m_B·(1 − SSA·SSE)` (QR §3.4, step 3). Pitt (1979) removal-efficiency tables (QR Table 3-4) show sweeping typically removes <10% of dissolved constituents, up to 50%+ of solids for aggressive vacuum programs.

---

## 1.3 Surface Washoff (QR Ch4)

### 1.3.1 Governing equations (QR §4.2)

Three empirical washoff functions; all are mass-depletion-limited where buildup is modeled. `w` = washoff rate, `q` = runoff rate per unit area (in/hr) over the *whole* subcatchment (pervious + impervious), `Q` = volumetric runoff (cfs).

- **Exponential washoff** (QR §4.2.1): `w = K_W·q^N_W·m_B` (Eq 4-7, mass/hr), derived from Sartor–Boyd flush data `m_B(t)=m_B(0)e^(−kt)` (Eq 4-3) with `k = K_W·q^N_W` (Eq 4-6). The exponent N_W was added to the original formulation because `k = K_W·q` forced concentration to decay monotonically: substituting gives c = K_W·m_B/A (Eq 4-5), always decreasing. N_W makes the response follow runoff better. Burdoin's classic K_W = 4.6 in⁻¹ corresponds to 0.5 in of runoff in 1 h washing off 90% of the load; Sonnen (1980) gives a theoretical range 0.052–6.6 in⁻¹.
- **Rating curve washoff** (QR §4.2.2): `w = K_W·Q^N_W` (Eq 4-8, mass/sec) with `Q = q·f_LU·A` (Eq 4-9). No source limitation unless combined with buildup; can be combined with buildup to cap total removable mass.
- **EMC washoff** (QR §4.2.3): `w = K_W·q·f_LU·A` (Eq 4-10), K_W = EMC concentration converted to flow units (e.g., if EMC in mg/L and flow in cfs, K_W = EMC × 28.3 L/ft³). Constant in-storm concentration; load proportional to runoff.

Units of K_W per model are in QR Table 4-1. **Important subtlety (QR §4.2.4, §4.2.5 note 5):** the runoff rate q used in all washoff functions is the runoff computed for the whole subcatchment *before* any internal pervious↔impervious re-routing. If internal routing is on, the reported outflow (Q_out) is lower than the q used in the washoff equations.

### 1.3.2 Wet deposition & runon — the ponded-surface mixing (QR §4.2.5)

Pollutant loads from direct rainfall and upstream runon are *not* simply added to buildup washoff; they are routed through the ponded surface water. A mass balance over the ponded volume (QR Eq 4-11):

```
d(V_ponded·C_ponded)/dt = Q_runon·C_runon + Q_ppt·C_ppt − C_ponded·(Q_infil + Q_out)
```

with the ponded-volume balance Eq 4-12. Notes in QR §4.2.5:
1. Applied to the whole subcatchment, not per-sub-area.
2. Precip/infiltration/evaporation rates converted from in/hr to cfs via subcatchment area.
3. Infiltration removes a proportional mass of every constituent.
4. **Evaporation removes volume but not mass → concentration increases.**
5. Q_out can be less than the Q_runoff used in the buildup washoff functions (internal routing).
6. Only unknown is C_ponded (flow rates/volumes known from the runoff pass).

Total outflow load W_out = W_washoff + W_ponded, concentration C_out = W_out/(28.3·Q_out) (Eq 4-16/4-17, mass/L). Requires the extra state variable m_P = V_ponded·C_ponded per pollutant per subcatchment (QR §4.2.5).

### 1.3.3 BMP removal (QR §4.2.6)
- Buildup washoff is reduced per land use: `W_washoff = Σ_j w_jp·(1 − R_jp)` (Eq 4-13).
- Ponded (rainfall/runon) load uses an area-weighted average removal `R_avg,p = Σ R_jp·A_j / Σ A_j` (Eq 4-14), so `W_ponded = Q_out·C_ponded·(1 − R_avg,p)` (Eq 4-15).
- Typical swale/filter-strip removals in QR Table 4-2 (TSS 60–83%, TP 29–45%, metals 35%).

### 1.3.4 Computational sequence (QR §4.3)
Three phases per subcatchment per runoff step: (1) compute buildup-washoff rate per pollutant–land-use; skip if q < 0.001 in/hr or buildup exhausted; reduce buildup m_Bjp −= w_jp·Δt; apply BMP factor; sum over land uses; add co-pollutant contributions `W_p += f_pk·W_k` (QR §4.3.1 step 3). (2) rainfall/runon: V_ponded = d1·A + (Q_ppt+Q_runon)·Δt; M_ponded = m_P + (Q_ppt·C_ppt + W_runon)·Δt; C_ponded = M/V; end-of-step mass m_P = C_ponded·d2·A (infiltration & evaporation losses implicit via d2); W_ponded = Q_out·C_ponded·(1−R_avg) (QR §4.3.2). (3) combine and convert to concentration (Eq 4-16/4-17). If outflow goes to another subcatchment it becomes that subcatchment's W_runon next step; if to a node, it feeds quality routing (QR §4.3.3).

### 1.3.5 Parameter guidance (QR §4.4)
N_W ~ 1.1–2.6 in rivers/sediment yield, most near 2; good first guess 1.5–2.5; dissolved constituents with decreasing concentration at higher flow use N_W < 1 (concentration ∝ Q^(N_W−1)); N_W = 1 = constant concentration. K_W between 1 and 10 (US units) gives concentrations in observed urban range. Both are calibration parameters. Hysteresis: exponential washoff gives lower loads on the hydrograph recession limb (buildup depleted) — QR Fig 4-4.

---

## 1.4 Transport and Treatment (QR Ch5)

### 1.4.1 The advection-dispersion equation (QR §5.2.1, Eq 5-1)

```
∂c/∂t = −∂(u·c)/∂x + ∂/∂x(D·∂c/∂x) + r(c)
```

Advection + longitudinal dispersion + reaction. Boundary conditions: at a volume-less junction, instantaneous flow-weighted average of inflows:

`c_Nj = (Σ_{i→j} c_L2i·q_2i + W_j) / (Σ_{i→j} q_2i + Q_j)` (Eq 5-2)

where c_L2i/q_2i are the end-of-link concentrations/flows and W_j, Q_j an external source's mass & flow. Storage nodes (completely mixed) obey a full CSTR mass balance (Eq 5-3).

### 1.4.2 The tanks-in-series / CSTR model (QR §5.2.2)

Rather than solving the PDE, SWMM treats each conduit and storage node as a **completely mixed reactor** ("box model", same approach as EPA WASP / QUASAR). General CSTR:

`d(V·c)/dt = C_in·Q_in − c·Q_out − V·r(c)` (Eq 5-4)

The pre-SWMM 5 analytical solution (Medina et al. 1981) for constant inflow and first-order reaction is Eq 5-5, but it exhibits numerical problems (drying elements → volume→0; rapid volume loss → negative decay coefficient α).

**SWMM 5's mixing equation (the one actually used) is the simple algebraic form (QR §5.2.2, Eq 5-6):**

```
c(t+Δt) = [ c(t)·V(t)·e^(−K1·Δt) + C_in·Q_in·Δt ] / ( V(t) + Q_in·Δt )
```

i.e., the reactor's new concentration = (old mass after decay + mass of inflow) ÷ (old volume + inflow volume). It approximates Eq 5-5 for small steps and is *more physically correct* for a step input (Fig 5-3 shows Eq 5-5 producing physically impossible >100 mg/L while Eq 5-6 does not). Justification for using it: the quality routing step equals the flow routing step, typically < 1 min (QR §5.2.2). **This is the governing equation for all in-network quality transport.**

### 1.4.3 Computational steps (QR §5.3)
Each flow-routing step, after hydraulics are solved, per pollutant:
1. **Node mass loads:** accumulate subcatchment runoff, DWF, external loads, groundwater/RDII loads, plus mass from links entering each node (= Q_L2(t+Δt)·c_L(t)).
2. **New node concentrations:** volume-less nodes get the flow-weighted mixture (Eq 5-2); storage nodes get Eq 5-6 with C_in = cumulative mass inflow ÷ cumulative flow.
3. **New link concentrations:** Eq 5-6 per conduit with C_in = the newly computed upstream node concentration, Q_in = Q_L1(t+Δt). Links with no volume (pumps, regulators, dummy conduits) get c_L(t+Δt) = upstream node concentration (i.e., no mixing).

Special cases:
- **Evaporation:** mass stays behind; concentration scaled by multiplier `f_evap = 1 + V_evap(t)/V(t)` (Eq 5-7) applied to c_N or c_L before steps 2/3.
- **Dynamic Wave routing:** a conduit has one flow rate; the volume change implied by differing end depths is reconciled by adjusting the upstream inflow `ΔQ_L1 = V_L(t+Δt) + V_losses(t) − V_L(t)` (Eq 5-8).
- **Steady Flow routing:** inflow fully replaces contents (no mixing): `c_L(t+Δt) = f_evap·c_N(t+Δt)·exp(−K1·Δt)` (Eq 5-9).

### 1.4.4 Treatment at nodes (QR §5.4)

Treatment applies at any node, after step 2 (mixture computed) and before outflow to downstream links. Two general forms (Eq 5-10/5-11):
- Concentration-based: `c(t+Δt) = c(C, R, H)`
- Removal-based: `c(t+Δt) = (1 − r(C, R, H))·C_in(t+Δt)`

Available hydraulic variables (QR §5.4.2): FLOW, DEPTH, AREA, DT (routing step, sec), **HRT** (hydraulic residence time of a storage node, hours), updated each step as `θ(t+Δt) = (θ(t) + Δt)·V(t)/(V(t) + Q_in·Δt)` (Eq 5-12).

Enforcement rules (QR §5.4.2): treated concentration clamped to [0, pre-treatment]; fractional removal ≤ 1; removal function evaluates to 0 with no inflow; a treatment expression at a storage node **overrides** the global first-order decay (K1 → 0); co-pollutants do not inherit co-treatment.

Worked expression examples (QR §5.4.3): `c = 10` (EMC), `r = 0.85` (constant removal), `r = 0.75*R_TSS` (co-removal), STEP-based concentration-dependent removal, `c = C_X − 0.02*(C_X^1.5)*DT` (n-th order kinetics), the k-C* wetland model `r = STEP(C_X−20)*((1−exp(−0.02*HRT/DEPTH))*(1−20/C_X))` (Eq 5-13/5-14), and gravity settling `c(t+Δt) = C* + (c(t)−C*)·exp(−k·Δt/d)` (Eq 5-17; worked as a dry-detention-pond TSS example, QR Fig 5-4).

**Modern engine (§5.4.4):** expressions in the `[TREATMENT]` section are `R = <expr>` or `C = <expr>`, parsed once at init into postfix tokens (shunting-yard) and evaluated by a stack machine every routing step. Variables (Table 5-4): **C** (inflow concentration for R=, nodal concentration before treatment for C=), **Q** (legacy name FLOW), **D** (legacy DEPTH), **AREA**, **V** (stored volume — new), **DT**, **HRT**. Functions (Table 5-5): exp, log/ln (0 for x≤0), sqrt (0 for x<0), abs, sgn, step (1 if x>0 else 0), min, max. Guarded evaluation: div-by-zero → 0; results clamped as §5.4.2. Co-pollutant refs `C_pollutant`/`R_pollutant` are recognized by the grammar but **not compiled** and reported as unsupported. Removed mass is booked to the quality mass balance as "reacted mass" (so treatment losses appear in the continuity report). C API: `swmm_treatment_set/get/clear`, `swmm_treatment_validate_expression`. Implementation: `src/engine/quality/Treatment.cpp`, `QualitySolver::applyTreatment()` in `src/engine/quality/QualityRouting.cpp`.

---

# 2. LID Controls (QR Ch6 + UM Ch3)

## 2.1 What an LID control is in the model

An LID control is a *landscaping practice* attached to the **Subcatchment** object; it is not a node/link. Each control is assigned a **fraction of the subcatchment's impervious area** whose runoff it captures (QR §6.1). Supported types (QR §6.1 table): bio-retention cells, rain gardens (bio-retention without the gravel layer), green roofs, infiltration trenches, continuous permeable pavement, block pavers, rain barrels/cisterns, rooftop disconnection, vegetative swales. Bio-retention/trench/permeable pavement may have underdrains, an impermeable liner (K3S = 0), and (trenches/pavement) clogging. LID captures the reduction in runoff *volume*; **SWMM does not compute water-quality transformations inside the unit** (QR §6.1, §6.4 — see 2.5).

## 2.2 Conceptual (layered) model (UM §3.4 "LID Representation"; QR §6.2)

Layers, defined per-unit-area (so replicate units of one design can be merged): **Surface**, **Pavement**, **Soil** (also serves as the sand bedding layer under pavement), **Storage** (gravel bed, or the barrel itself), **Drain system** (slotted underdrain pipes / barrel valve / roof gutter), **Drainage mat** (green roofs). Layer assignment per LID type is UM Table 3-3 (bio-retention: surface+soil(+storage+drain); rain garden: surface+soil; green roof: surface+soil+drainage mat; permeable pavement: surface+pavement(+soil)+storage(+drain); infiltration trench: surface+storage(+drain); rain barrel: storage+drain; roof disconnection: surface+drain; vegetative swale: surface only).

### The generic bio-retention cell (QR §6.2.1)
Three continuity equations per unit area, all fluxes in ft/sec:

- **Surface:** `φ1·∂d1/∂t = i + q0 − e1 − f1 − q1` (Eq 6-1)
- **Soil:** `D2·∂θ2/∂t = f1 − e2 − f2` (Eq 6-2)
- **Storage:** `φ3·∂d3/∂t = f2 − e3 − f3 − q3` (Eq 6-3)

where i = direct rain, q0 = captured runon, q1 = surface overflow, q3 = underdrain outflow, e = ET per layer, f1 = surface infiltration into soil, f2 = soil percolation, f3 = bottom exfiltration into native soil; φ1 = surface void fraction (freeboard not filled by vegetation), θ2 = soil moisture (vol/vol), φ3 = storage void fraction, D2 = soil thickness, D3 = storage thickness, D1 = surface freeboard.

Flux closures:
- **f1 (Green–Ampt):** `f1 = K2S·(1 + (φ2−θ20)(d1+ψ2)/F)` (Eq 6-4), only after the soil top saturates; K2S = saturated K of the *engineered soil*, θ20 = moisture at top of soil, ψ2 = wetting-front suction head, F = cumulative infiltration. Initial θ20 ≈ residual/wilting point.
- **ET (Eq 6-5..6-7):** cascades from surface down; each layer gets min(potential ET remaining, water available / Δt); e2 stops at wilting point θWP; e3 = 0 when soil saturated; e2 and e3 = 0 during infiltration (f1>0).
- **f2 (Darcy):** `f2 = K2S·exp(−HCO(φ2−θ2))` for θ2 > θFC, else 0 (Eq 6-8). Same percolation expression as the groundwater module. HCO = percolation decay constant; θFC = field capacity.
- **f3:** simply `K3S`, the user-supplied saturated K of the native soil beneath the unit; K3S = 0 ⇒ impermeable bottom (Eq 6-8 discussion).
- **q3 (underdrain):** power law `q3 = C3D·h3^η3D` (Eq 6-9); head h3 computed from storage depth above the drain offset D3D, extended when layers are full (4-branch expression, QR §6.2.1). η3D = 0.5 reproduces the orifice equation; C3D = 0 ⇒ no underdrain. Treated as a *maximum potential* rate, limited by available water.
- **q1 (surface overflow):** `q1 = max[(d1 − D1)/Δt, 0]` (Eq 6-10) — ponding above freeboard overflows immediately.
- **Flux limits (Eq 6-11..6-15):** sequential min-limits ensure moisture stays within [θWP, φ2] in soil, [0, D3] in storage, [0, D1] on surface; when both soil and storage saturate, all sub-surface fluxes are constrained to a common value (QR §6.2.1, "When the unit becomes completely saturated…").

The full bio-retention cell uses **15 user parameters**: 2 surface (φ1, D1), 7 soil (φ2, θFC, θWP, K2S, ψ2, HCO, D2), 3 storage (φ3, K3S, D3), 3 underdrain (C3D, η3D, D3D) (QR §6.2.1). Soil parameters are the same vocabulary as the hydrology module's infiltration/GW models.

### Other LID types (flux equations differ per type)
- **Rain garden** (no storage layer): Eq 6-16/6-17; f2 additionally limited by min(drainable soil water, K3S of underlying native soil).
- **Green roof** (drainage mat): Eq 6-18..6-20; no q0 (direct rain only), no f3 (impermeable membrane). Surface runoff and mat flow use Manning uniform-flow forms (Eq 6-21, 6-22) with slope S1, outflow-face width W1, area A1; setting any of n1/S1/W1 = 0 reverts to instantaneous overflow (Eq 6-10).
- **Infiltration trench** (surface + storage): Eq 6-23/6-24 with `f1 = i + q0 + d1/Δt` (Eq 6-25); φ1 omitted (no vegetation); limits Eq 6-26..6-28.
- **Permeable pavement** (pavement layer, optional sand layer, storage): Eq 6-29..6-32; block pavers add F4 = fraction of surface area taken by impermeable blocks (0 for continuous); e4 (Eq 6-33), f4 nominal = K4 (pavement permeability), head on underdrain grows when all layers saturate (Eq 6-35); 7 flux adjustments (Eq 6-36..6-43).
- **Rain barrel** (single storage layer): `∂d3/∂t = f1 − q1 − q3` (Eq 6-44), no rain input, no evaporation (covered); drain is the orifice (η3D=0.5, C3D = 0.6(A3/A1)√2g, Eq 6-45); inflow limited by empty storage (Eq 6-47), overflow = rejected runoff (Eq 6-48); optional drain-delay (valve closed during rain, opens N hours after rain stops).
- **Rooftop disconnection** (single surface layer): `∂d1/∂t = i − e1 − q1 − q3` (Eq 6-49); q3 = min(q1, q3max) = roof-drain flow (Eq 6-50); q3max is user-supplied cfs/ft² of roof; q1 is the overflow.
- **Vegetative swale** (surface only, *variable surface area*): `A1·∂d1/∂t = (i+q0)A − (e1+f1)A1 − q1A` (Eq 6-51), geometry Eq 6-52..6-54, Manning outflow Eq 6-55, hydraulic radius Eq 6-56. This is the one LID whose wetted area varies with depth; infiltration f1 is taken from the subcatchment's pervious-area infiltration.

### Clogging (QR §6.2.9)
Linear loss of conductivity with cumulative inflow volume, after Siriwardene (2007)/Lee (2015): `K(t) = K(0)·(1 − Q(t)·V_void/CF)` (Eq 6-57), Q(t) = cumulative inflow per unit area (Eq 6-58). For trenches K3S (Eq 6-59); for pavement K4 (Eq 6-60). CF = number of layer void-volumes that completely clog the layer; CF = 0 ⇒ no clogging. Long-term phenomenon (months+). CF4 estimate from years-to-clog (Eq 6-76).

### Modern-engine additions
- **Underdrain valve control (§6.2.10):** optional two-threshold hysteresis valve on any underdrain; q3 = ω_v·C3D·h3^η3D (Eq 6-77) with ω_v = 1 when h3 ≥ h_open, 0 when h3 < h_close; zero thresholds = permanently open. Combines with rain-barrel drain delay.
- **Rain barrel capture & exfiltration (§6.2.11):** covered/uncovered flag (uncovered admits direct rain); optional storage-layer K3S gives bottom exfiltration `∂d3/∂t = f1 − f3 − q1 − q3` (Eq 6-78). Clogging reduction is applied uniformly to all storage-based types (bio-retention, trench, pavement, barrels) whenever CF ≠ 0. Pavement "regeneration" exists but is only settable programmatically (defaults to zero).

## 2.3 Deployment: how LIDs intercept the runoff path (QR §6.3; UM §3.4)

Two placement modes:
1. **LID(s) inside an existing subcatchment** — each receives a fraction of the runoff generated by the subcatchment's *impervious* area. LIDs in a subcatchment act **in parallel** (no in-series chaining of controls within one subcatchment); the user must adjust %Impervious/Width after displacing area with LID (UM §3.4, worked example: 40% impervious with 75% of that to pavement → 14.3%).
2. **LID fills its own subcatchment** — inflow = direct rain + runon from upstream subcatchments (or underdrain flow from upstream LIDs routed onto it); this allows series/treatment-train layouts. A full-subcatchment LID overrides the subcatchment's normal surface properties.

The captured inflow (partial-area case): `q0 = q_imp·F_out·R_LID` (Eq 6-61), where q_imp = total impervious runoff rate, F_out = fraction of impervious runoff routed to the outlet (accounts for overland re-routing; =1 with none), and **R_LID = capture ratio = impervious area directly connected to the unit ÷ LID unit area**. Runon from upstream subcatchments is first spread uniformly over pervious+impervious, then the impervious portion is offered to the LIDs.

Outflow destinations (QR §6.3, Fig 6-6): default → parent subcatchment's outlet; underdrain flow → its own destination; or whole outflow → back onto the subcatchment's pervious area (typical for rain barrels).

## 2.4 Solution of the LID equations (QR §6.4)

Per runoff time step, after non-LID runoff and before groundwater: (1) determine inflow i+q0; (2) evaluate flux terms — ET top-down, then other fluxes bottom-up; (3) integrate continuity; (4) merge outflows into subcatchment totals.

Compact form with moisture vector x = [φ1d1, D2θ2, φ3d3, D4(1−F4)θ4] and net-flux vector Γ: `∂x/∂t = Γ(x(t))` (Eq 6-62). Discretized with the **trapezoidal method** (Ω = 0.5), Eq 6-63, solved by fixed-point iteration (Eq 6-64) with stopping tolerance 0.00328 ft = 1 mm. Setting Ω = 0 gives the **explicit Euler** method (Eq 6-65). **Numerical testing: Euler works for all types except vegetative swales, which need the trapezoidal (Ω=0.5) form for acceptable continuity errors.** Physical bounds enforced per layer (θWP ≤ θ2 ≤ φ2, 0 ≤ d3 ≤ D3, etc.). Initial soil/storage moisture = user-specified % of saturation; other layers start at 0.

**Water quality interface (QR §6.4, Eq 6-66/6-67):** the unit does not transform concentrations; washoff concentration is computed exactly as if no LID existed and is assigned to LID outflows. Two exceptions:
- LIDs cover only part of the subcatchment and a pollutant has nonzero rain concentration → outflow concentration is the flow-weighted blend of non-LID washoff load and direct rainfall load on the LID area (Eq 6-66).
- LID occupies the whole subcatchment → outflow concentration = inflow-stream concentration mixed with rain load on the unit (Eq 6-67).

So LID pollutant removal is purely volumetric: a fully-captured storm has 100% effective load removal. UM §3.4 additionally notes that drain-carrying LID units may have a **per-pollutant removal percentage assigned to underdrain discharge**. The Status Report has an **LID Performance Summary** water balance (inflow, infiltration, evaporation, surface runoff, drain flow, initial/final storage, in inches over LID area), and optionally a full flux time series to a file (UM §3.4, QR §6.4 note; UM §9.2 "LID Performance" table adds a flow-continuity-error column).

## 2.5 Parameter values (QR §6.5)
Typical ranges per type in QR Tables 6-2..6-7 (e.g., bio-retention: soil thickness 24–48 in, porosity 0.45–0.6, FC 0.15–0.25, WP 0.05–0.15, K2S 2.0–5.5 in/hr, ψ2 2–4 in, HCO 30–55, storage thickness 6–36 in, storage void 0.2–0.4, capture ratio 5–15). Worked soil example (85% sand/5% clay/5% OM): φ2=0.52, FC=0.15, WP=0.08, K2S=4.7 in/hr, HCO=39.3, ψ2 = 3.23·K2S^−0.328 = 1.9 in (Table 6-3). Underdrain sizing options (QR §6.5.8): capacity-limited (η3D=0, C3D = N_pipe·Q_full/A_LID via Manning Eq 6-70/6-71), slot-inlet-limited (η3D=0.5, C3D = 0.6√(2g)·A_slot/A_LID, Eq 6-72/6-73, geometry Eq 6-74), or outlet-orifice-limited (Eq 6-75); unit conversion factors (×43 200 to in/hr; ×12 471 to in^0.5/hr).

## 2.6 Numerical example (QR §6.6)
1-in Philadelphia storm on a bio-retention cell (24-in soil, 12-in gravel, 6-in berm, capture ratio 19). Storage capacity estimate: 6 + 24·(0.52−0.08) + 12·0.4 = 21.36 in of unit storage ⇒ 21.36/20 = 1.07 in over the whole catchment; storm fully captured. The response is dissected into 5 phases — wetting (soil fills to FC, ~5 h), filling (percolation exceeds exfiltration, storage fills ~3 h), saturation (soil K limited by 0.4 in/hr exfiltration; ponding), draining (surface ponding gone ~16.5 h; storage drains over ~15 h), drying (soil drains to FC, then ET to wilting point). Adding an oversized underdrain at the top of the storage layer prevents ponding and carries ~14% of storm volume — showing the unit is no longer "fully capturing" runoff when drained to a sewer. Good worked-behavior reference for validating LID physics against.

---

# 3. The User Manual: what it actually says about the engine

## 3.1 The simulation model (UM Ch3 "Computational Methods")

- **Surface runoff** = nonlinear reservoir per subcatchment; inflow = precipitation + upstream runon; outflows = infiltration, evaporation, runoff; outflow by Manning's equation when depth exceeds depression storage d_s (UM §3.4 "Surface Runoff", Fig 3-11).
- **Infiltration**: 5 models — Classic Horton, Modified Horton (state variable = cumulative excess infiltration rather than curve time; better under low intensities), Green-Ampt (sharp wetting front), Modified Green-Ampt (does not deplete top-layer deficit under low early intensities), SCS Curve Number. (UM §3.3, §3.4 "Infiltration".)
- **Groundwater**: two-zone (unsaturated + saturated) aquifer model with fluxes fI, fE, fU, fEL, fL, fG; mass balance updates water-table depth and upper-zone moisture (UM §3.4 "Groundwater", Fig 3-12).
- **Snowmelt**: heat-budget (rain periods) and degree-day (no-rain) melt, areal depletion, plowable-area redistribution (UM §3.4 "Snowmelt").
- **Flow routing**: Saint-Venant; three options — Steady (pure translation, no storage/backwater/reversal/pressurization, dendritic only, time-step insensitive), Kinematic (continuity + momentum with water-surface slope = bed slope; max flow = full normal flow; dendritic only; stable at ~1–5 min steps), Dynamic Wave (full Saint-Venant + nodal continuity; backwater, pressurization, reversal, loops; needs steps ~30 s or less; **SWMM can automatically reduce the user's maximum step to maintain stability**) (UM §3.4 "Flow Routing").
- **Water quality routing**: conduits are CSTRs; concentration found by integrating conservation of mass with average step values; storage nodes same; volume-less nodes emit the mixture concentration; first-order decay applies when K1 ≠ 0 (UM §3.4 "Water Quality Routing"). This matches QR Eq 5-6.
- **Ponding & pressurization**: ponding at nodes under Steady/Kinematic = stored excess volume; under Dynamic Wave = constant surface area pond; surcharge depth on a junction allows pressurization up to an added depth (ponding takes precedence if both set; ponding not allowed at storage nodes) (UM §3.4 "Ponding and Pressurization").

## 3.2 Simulation Options (UM Ch8 "Setting Simulation Options")

Option categories: General, Date, Time Step, Dynamic Wave Routing, Interface File, Reporting, Events (UM Ch8).

### General page
- **Process Models**: per-process on/off switches (groundwater, RDII, snowmelt, routing, quality, rainfall). Disabled if no objects need the process.
- **Infiltration Model** (default, global; per-subcatchment override allowed).
- **Routing Model**: Steady / Kinematic / Dynamic Wave.
- **Allow Ponding** (requires non-zero node Ponded Area).
- **Minimum Conduit Slope** (default none; hard floor of 0.001 ft elevation drop when computing slope).

### Date page
Start/End/Report-start analysis dates; Start/End Sweeping dates; **Antecedent Dry Days** (used to seed initial buildup). (UM Ch8 "Date Options".)

### Time Steps page
- Reporting step; **Wet weather runoff step** (rain, ponded water, or active LIDs); **Dry weather runoff step** (≥ wet step; essentially just buildup during dry periods); **Control Rule step** (0 = every routing step); **Routing step** in decimal seconds — "Dynamic Wave routing requires a much smaller time step than the other methods" (UM Ch8 "Time Step Options").
- **Steady Flow Periods / Skip Steady Flow Periods**: a step counts as steady when (a) % diff between total system inflow and outflow < **SYS_FLOW_TOL** (default 5%) and (b) % diff between current and previous lateral inflow at all points < **LAT_FLOW_TOL** (default 5%) (UM Ch8; UM AppD remarks for SKIP_STEADY_STATE, SYS_FLOW_TOL, LAT_FLOW_TOL). Skipping keeps reusing the last computed flows — speed at the cost of accuracy.

### Dynamic Wave page (UM Ch8 "Dynamic Wave Options" — engine-relevant, quoted in full essence)
- **Inertial Terms**: KEEP (full inertial terms always) / DAMPEN (reduce inertial terms near critical flow, ignore in supercritical) / IGNORE (drop entirely → Diffusion Wave solution). ↔ INERTIAL_DAMPING NONE/PARTIAL/FULL (AppD; default **PARTIAL**).
- **Define Supercritical Flow By**: water-surface-slope only / Froude number only / both. ↔ NORMAL_FLOW_LIMITED SLOPE/FROUDE/BOTH (AppD; default **BOTH**; both = "checks for either condition", the recommended third choice).
- **Force Main Equation**: Hazen-Williams vs Darcy-Weisbach for Circular Force Main sections (AppD FORCE_MAIN_EQUATION; default **H-W**).
- **Surcharge Method**: **EXTRAN** (classic SWMM surcharge algorithm — update nodal heads when all connecting links are full) vs **SLOT** (Preissmann slot — adds a virtual top width to full pipes so the normal head update continues) (AppD SURCHARGE_METHOD; default **EXTRAN**).
- **Use Variable Time Steps** + safety/adjustment factor: the variable step is computed to **satisfy the Courant condition within each conduit**; typical safety factor 75%; bounded below by Minimum Variable Step and above by the fixed routing step (UM Ch8; AppD VARIABLE_STEP, default 0 = no variable stepping).
- **Minimum Variable Time Step**: default 0.5 s (AppD MINIMUM_STEP).
- **Time Step for Conduit Lengthening**: conduits are artificially lengthened so full-flow wave travel time ≥ this step (Courant criterion); lower value → fewer conduits lengthened; 0 = none; ratio of artificial-to-actual length reported in the Summary Report's Flow Classification table (UM Ch8; AppD LENGTHENING_STEP, default 0).
- **Minimum Nodal Surface Area**: floor used when computing head changes; 0 ⇒ default 12.566 ft² (1.167 m²) = area of a 4-ft manhole (UM Ch8; AppD MIN_SURFAREA).
- **Head Convergence Tolerance**: max head difference between successive trials; default 0.005 ft (0.0015 m) (UM Ch8; AppD HEAD_TOLERANCE).
- **Maximum Trials per Time Step**: default 8 (UM Ch8; AppD MAX_TRIALS).
- **Number of Parallel Threads**: default 1 (UM Ch8; AppD THREADS).

**NODE_CONTINUITY: not present anywhere in the user manual.** The `[OPTIONS]` vocabulary in UM AppD ends at THREADS. The option exists only in the *hydraulics reference* (`reference/hydraulics/sections/Chapter3-DynamicWave.md`, `EXPLICIT` default = the classic two-branch formulation; a slot/other option relates to the dynamic-slot operator). So the user manual offers no user-facing knob for node-continuity formulation; the dynamic-wave solver internals (and any NODE_CONTINUITY behavior) live in the hydraulics reference manual, not the user manual. **Integration options:** the user manual names none — no integrator choice is exposed; the only numerics levers are the ones above (variable step, inertial damping, surcharge method, lengthening, tolerances/trials). (The QR Ch6 LID section does expose the integration method for LIDs — trapezoidal Ω=0.5 vs Euler — but as a fixed, internally-selected choice, not a user option.)

### Troubleshooting & stability (UM Ch8 "Troubleshooting Results")
- **Excessive continuity errors**: continuity error = % difference between (initial storage + total inflow) and (final storage + total outflow) system-wide. "If they exceed some reasonable level, such as 10 percent, then the validity of the analysis results must be questioned." Most common causes: **computational time steps too long, or conduits too short**. The Status Report also lists the nodes with the largest *individual* flow continuity errors (UM Ch8; UM §9.1).
- **Unstable routing results**: Dynamic Wave (and to a lesser extent Kinematic) are *explicit* → possible oscillation. SWMM does not flag it automatically. Mitigations: reduce routing step; use variable time step with smaller factor; **ignore inertial terms**; **lengthen short conduits** (UM Ch8, bullet list). Suggest reporting step ≤ 1 min for screening.
- **Flow Instability Index (FII)**: the Status Report lists the 5 links with the highest FII. FII counts the number of times a link's flow is higher/lower than both its neighbors ("turns"), normalized against the expected turns of a random series; range 0–150 (UM Ch8). Worked example: FII 100 at 30-s fixed step dropped to stable with variable steps (Fig 8-1).
- Common fatal errors: unknown-ID references; file errors; layout violations (outfall = 1 link; divider = 2 outlets; one dummy link per node; Kinematic: one outflow link per junction and regulators can't be a non-storage node's outlet; Dynamic Wave: ≥ 1 outfall) (UM Ch8). E.g., ERROR 138: Node has initial depth > max depth (UM AppE).

## 3.3 Reporting of results (UM §9.1, §9.2; QR consistency)

Status Report contents (UM §9.1): simulation options summary; errors/warnings; input summary (optional); rainfall-file summary; control actions (optional); **system-wide mass continuity errors for runoff quantity and quality, groundwater flow, conveyance flow and water quality**; nodes with highest individual flow continuity errors; **conduits that most often limited the routing time step (variable-step runs)**; links with highest FII; nodes with highest non-convergence frequency; routing-step range and % steady-state.

Summary Report tables (UM §9.2): Subcatchment Runoff (incl. runoff coefficient = runoff/precipitation; totals in inches), LID Performance (per-LID water balance + flow continuity error), Groundwater, Subcatchment Washoff (total mass washed off per pollutant), Node Depth/Inflow (incl. per-node flow balance error %), Node Surcharge, Node Flooding, Storage Volume (incl. % lost to evaporation and seepage), Outfall Loading (incl. total pollutant mass discharged), Street Flow, Link Flow, Flow Classification (Dynamic Wave only: conduit lengthening ratio; fraction of steps in each flow regime — dry/subcritical/supercritical/critical at ends; % inlet-controlled for culverts), Conduit Surcharge, Link Pollutant Loads (total mass per pollutant over the simulation), Pumping. Note: summary results are computed at **every computational step, not just reporting steps** (UM §9.2 note). Time-series viewable variables are listed in UM Table 9-1 (node concentration "after any treatment applied at the node").

Tutorial numbers to sanity-check against (UM Ch2): a run reported runoff and routing continuity errors of −0.39% and +0.03%; switching from Kinematic to Dynamic Wave raised conduit C2 peak flow from 3.52 to 4.04 cfs and eliminated flooding (UM §2.5). Water-quality continuity tables (Runoff Quality Continuity and Quality Routing Continuity) appear once pollutants are defined; initial buildup from 5 antecedent dry days was 47.5 lb TSS with 47.9 lb washed off (UM §2.6).

## 3.4 Interface files, hot start, and the v6 engine (UM Ch11, Ch13, AppD)

- **Hot start file** saves full hydrologic/hydraulic/quality state — ponded depth+quality per subcatchment, buildup, infiltration state, snow pack, GW zone state, node depth/lateral inflow/quality, link flow/depth/setting/quality. **LID hydrologic state is NOT saved** (UM §11 "Hot Start Files"). Used to skip the initial numerical instabilities of Dynamic Wave (warm up with base/DWF flows) and to split long runs.
- **Runoff / rainfall / RDII / routing interface files** enable splitting large models and re-using runoff results (UM §11).
- **C API / OpenSWMM 6** (UM Ch13): reentrant `SWMM_Engine` handle; lifecycle `CREATED→OPENED→INITIALIZED→STARTED→[RUNNING]→ENDED→CLOSED` (programmatic build path via `swmm_engine_new` → BUILDING → `swmm_finalize_model`); step callback loop; hot start via `swmm_hotstart_save/apply`; **`MassBalance` Python class exposing `runoff_error` and `routing_error` (%)** (UM §13.5.5); plugin SDK for input/output/report/state-IO (UM §13.8); CSV rain files (USER_CSV, §13.9); extension options in `[OPTIONS]` (unknown keys stored upper-cased in an extension map, retrievable via `swmm_options_get_ext`, §13.10; CRS is a standard v6 key). Note `IGNORE_QUALITY`, `IGNORE_ROUTING` etc. exist as `[OPTIONS]` switches (AppD).
- **`[REPORT]` section** (AppD): `CONTINUITY YES/NO` (default YES — continuity checks reported), `FLOWSTATS`, `CONTROLS`, per-object selections, and `LID <Name> <Subcatch> <Fname>` to dump a detailed LID performance time series to a file.

## 3.5 UI-only chapters (no engine substance — one line each)
- UM Ch4 Main Window: menus, toolbars, browser, property editor, preferences — pure UI.
- UM Ch5 Working with Projects: open/save/defaults, units selection, calibration data registration — UI; only engine-relevant items are unit-system rules (US vs SI chosen by flow units; concentration and Manning's n always metric) (UM §5.5).
- UM Ch6 Working with Objects: add/select/edit/delete/convert/copy objects — pure UI.
- UM Ch7 Working with the Map: map themes, backdrop, dimensions, legends, queries — pure UI.
- UM Ch10 Printing & Copying: printer setup, clipboard, export — pure UI.
- UM Ch12 Add-in Tools: registering external tools via `$INPFILE`/`$OUTFILE` macros — UI/legacy integration, no engine content.
- UM Ch1 Introduction: high-level capability list (mirrors QR §1.1–1.3) and installation instructions; no new equations. UM Ch11 (files) and Ch13 (C API) are substantive and covered in §3.4.

---

# 4. Application Manual

**All seven chapters are placeholders**: Chapter 1 Site Drainage Design, Chapter 2 Detention Pond Design, Chapter 3 Water Quality Analysis, Chapter 4 LID Controls, Chapter 5 Continuous Simulation, Chapter 6 Combined Sewer Overflow Analysis, Chapter 7 Real-Time Control — every one reads *"Content is under development."* There are **no worked examples or behaviors** to extract. (The manual credits Lewis A. Rossman's original EPA SWMM 5 Applications Manual, which is not included here.) Any worked-example content for this study must come from the QR's internal examples (treatment §5.4.3/Fig 5-4; LID §6.6) and the UM tutorial (§2.5/§2.6), which are documented above.

---

# 5. Ambiguities and gaps flagged

1. **NODE_CONTINUITY**: absent from the user manual's option vocabulary (UM AppD ends at THREADS). Mentioned only in the hydraulics reference (`EXPLICIT`, the default two-branch formulation). Not user-exposed; do not look for it in the UI manual.
2. **Integration scheme for dynamic wave**: not documented in the user manual at all (no option named, no method named). Only stability controls (variable step, inertial damping, lengthening, tolerances, trials). The LID integrator (trapezoidal vs Euler) is engine-internal, selected per LID type.
3. **Infiltration model count**: consistent — five models listed everywhere (UM §3.3, UM §3.4 "Infiltration", UM Ch8, AppD INFILTRATION): Classic Horton, Modified Horton, Green-Ampt, Modified Green-Ampt, SCS Curve Number.
4. **Surcharge method default**: UM Ch8 does not state the default; UM AppD states SURCHARGE_METHOD default = EXTRAN (the text also references a `DYNAMIC_SLOT` variant in the hydraulics reference not present in the user manual).
5. **FII semantics**: the user manual defines the index (turns vs random expectation, 0–150) but not the normalization formula precisely.
6. **LID water quality**: concentration is not transformed by LIDs; only volumetric reduction. The underdrain pollutant-removal percentage mentioned in UM §3.4 is not present in the QR's LID chapter (QR §6.4 says only volumetric), and QR §6.4's two exceptions (Eq 6-66/6-67) cover rain-load blending. Treat the UM's "removal % on underdrain discharge" as a UI/input-file feature not covered by the QR equations.
7. **Co-pollutant treatment expressions**: legacy `C_pollutant`/`R_pollutant` references are recognized but not compiled by the modern engine (QR §5.4.4) — a behavior gap between the QR §5.4.3 examples and current engine capabilities.
8. **Hot start excludes LID state** (UM §11) — a real limitation to remember when splitting runs.
9. **Dry weather step**: UM Ch8 says the dry runoff step "must be greater or equal" to the wet step; AppD/WARNING 06 says the dry step is increased to the wet step if violated — consistent.
10. **Wet-weather runoff step definition** includes "when LID controls are still infiltrating or evaporating runoff" (UM Ch8) — LIDs therefore force wet (small) runoff steps even after rain stops, which is why the LID tracer-bullet step sizes matter for runtime.

---

# 6. One-paragraph summary

The OpenSWMM water-quality module (Quality Reference Vol. III) is a buildup–washoff–CSTR system: pollutants build up on land uses via power/exponential/saturation functions (Eq 3-1), are washed off by exponential (w = K_W·q^N_W·m_B), rating-curve, or EMC functions (Eq 4-7/4-8/4-10), are blended through the subcatchment's ponded surface water with precipitation/runon in a mass balance (Eq 4-11) and BMP-removal factors, and are then routed through the conveyance network where every conduit and storage node is a completely mixed reactor updated by the simple algebraic mixing equation c(t+Δt) = [c(t)V(t)e^(−K1Δt) + C_inQ_inΔt]/(V(t)+Q_inΔt) (Eq 5-6), with node treatment via C=/R= expressions evaluated by a compiled stack machine (v6 §5.4.4). LID controls are per-unit-area, vertically layered flow-balance devices (surface/soil/storage + optional drain/mat/pavement layers; Green-Ampt infiltration, Darcy percolation, power-law underdrains, ET cascades, clogging) solved with a trapezoidal/Euler integrator, that intercept a capture ratio of the subcatchment's impervious runoff and remove pollutants only by volume reduction, never by concentration change. The user manual is almost entirely UI, but its engine substance lives in Ch3 (nonlinear-reservoir runoff, 5 infiltration models, 3 routing methods), Ch8 (the Dynamic Wave options page: inertial damping KEEP/DAMPEN/IGNORE = NONE/PARTIAL/FULL, NORMAL_FLOW_LIMITED, EXTRAN vs Preissmann-slot surcharge, Courant-constrained variable time steps with a 0.5-s floor, conduit lengthening, MIN_SURFAREA 12.566 ft², head tolerance 0.005 ft, 8 max trials, plus Skip-Steady-State tolerances), and its troubleshooting guidance (continuity errors = (initial storage + inflow) vs (final storage + outflow), >10% suspect, "too-long steps or too-short conduits"; explicit-method instability fixes: smaller step, variable step, ignore inertia, lengthen conduits; Flow Instability Index 0–150). NODE_CONTINUITY appears nowhere in the user manual (hydraulics reference only), no dynamic-wave integrator is user-exposed, and the Application Manual is an empty stub — all seven chapters marked under development, so no worked examples exist beyond the QR's own bio-retention (§6.6) and detention-pond (§5.4.3) demonstrations and the UM tutorial numbers.
