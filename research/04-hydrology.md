# OpenSWMM Hydrology — Technical Reference (from the official Reference Manual, Volume I)

Primary source: `/home/nekzoh/LocalSWMM/third_party/openswmm-engine/docs/manuals/reference/hydrology/sections/` — "SWMM 5 Reference Manual I — Hydrology", Chapters 1–7 plus Glossary. Equation/table/figure numbers cited below are those printed in the manual. Where a section or equation exists only in the 2D hydraulics volume (Reference Manual II, `hydraulics/sections/Chapter9-TwoDimensional.md`), it is cited explicitly and marked as NOT part of the hydrology volume.

---

## 1. Rain gages and rainfall representation (Ch. 2, §2.1–2.2)

### 1.1 The Rain Gage object
- "Within SWMM, the Rain Gage object is used to represent a source of precipitation data. Any number of Rain Gages may be used, data permitting, to represent spatial variability in precipitation patterns." (§2.1.1 Representation)
- Data for a gage comes either from a user-defined Time Series or from an external file. File formats: NCDC (DSI-3240 hourly, DSI-3260 15-min, plus several legacy layouts), Environment Canada (HLY03/HLY21 hourly, FIF21 15-min), and a standard user-prepared format. (§2.1.1, §2.2.1, §2.2.2)
- SWMM "should not be run with either daily average or storm-averaged precipitation data" (§2.1.1). Precipitation may include snowfall; rain vs snow is decided by a user-supplied dividing temperature (34–35 °F / 1–2 °C typical) — the **SNOTMP** of Ch. 6 (§2.1.1, §6.2.2).

### 1.2 Rainfall data types (INTENSITY / CUMULATIVE / VOLUME) and the gage interval
- §2.2.1 User-Supplied Data is the *only* place the hydrology volume describes the three rainfall types: "The user specifies the format in which the rainfall data were recorded **(as intensity, volume, or cumulative volume)**, the **time interval associated with each rainfall reading** (e.g., 15 minutes, 1 hour, etc.), the source of the data (the name of a Time Series object or name of a Rainfall file), and the ID name of the recording station." 
- **Gap / ambiguity to flag:** the hydrology volume *does not state the conversion rule* for the three types. §2.1.5 Eq. 2-12 merely says *I_raw* is "the precipitation intensity read from the gage's time series or file **(after conversion to intensity units)**" — the conversion semantics live in the SWMM 5 User's Manual, not in this reference volume. The reference volume only guarantees: (a) values are treated as **start-of-interval** quantities — "each rainfall intensity or depth is assumed to occur at the start of its associated date/time value and last for a period of time equal to the gage's recording interval" (§2.2.1); NCDC/Canadian end-of-interval files are automatically shifted back one interval by SWMM (§2.2.1, §2.2.2); and (b) data are stored internally as **rain depth per period** — the Rainfall Interface file stores "Rain depth (inches) (4-byte float)" per "time period with non-zero rainfall", and depth units are converted "to mm/hr before they are used for any runoff calculations" (§2.2.3, §2.2.2).
- The gage recording **interval in seconds** is a field in the Rainfall Interface file header (§2.2.3). Time series record only non-zero periods (§2.2.1, §2.2.3).
- The Rainfall Interface file is a binary file ("SWMM5-RAIN") collated from all external sources; timestamps are decimal days since Dec 31 1899 00:00 (§2.2.3).

### 1.3 How the rain rate is applied (constant within a step; no temporal interpolation)
- Ch. 1, §1.5 Interpolation and Units: "One exception to this convention [linear interpolation of reported values] is for **precipitation and infiltration rates. These remain constant within a runoff time step** and no interpolation is made when these values are used within SWMM's runoff algorithms or for reporting purposes. In other words, if a reporting time falls within a runoff time step the reported rainfall intensity is the value associated with the start of the runoff time step."
- Ch. 3, §3.4 Computational Scheme for Runoff, step 1: the runoff time step is chosen as the wet or dry step and "If necessary, reduce the time step to the next time at which either rainfall or evaporation changes." §3.5: "If the wet time step is not an integer fraction of or is larger than the rainfall interval, SWMM will automatically reduce the time step **so that the rainfall intensity remains constant over the adjusted time step**."
- So: rainfall is a **step function** — constant over each gage interval, sampled at the start of each runoff step, never interpolated in time, and never held constant across an intensity change.

### 1.4 Precipitation scaling factors (gage-level and subcatchment-level) — §2.1.5
Two multiplicative levels of scaling adjust precipitation:
- Gage level — Eq. 2-12: `I_g = SF_g · f_R,m · I_raw` where `SF_g` is the gage rainfall scale factor (corrects measurement bias), `f_R,m` the monthly rainfall adjustment factor (§2.7, default 1.0), `I_raw` the raw intensity. The gage also has a **snow catch factor `SCF_g`** (only applied to snowfall; physical basis in Ch. 6 §6.2.2). Co-gages sharing a time series: the secondary gage's precipitation is the primary's value rescaled by the ratio of the two gages' scale factors.
- Subcatchment level — Eqs. 2-13/2-14: for subcatchment `j` served by gage `g`:
  - `P_rain,j = I_g · φ_R,j`
  - `P_snow,j = I_g · SCF_g · φ_S,j`
  - `φ_R,j` and `φ_S,j` are subcatchment rain and snowfall scale factors (spatial adjustments: orographic gradients, canopy interception, drifting). They compose multiplicatively with `SCF_g`, never override it. Note the gage `SF_g` applies to **both** rain and snow fractions via `I_g`, while `SCF_g` applies only to the snow fraction.
- The scaling pipeline is applied *at the gage* (Eq. 2-12) and *per subcatchment* (Eqs. 2-13/2-14), i.e. each subcatchment receives one gage's intensity, uniformly over its area, times the two scale factors. All factors default to 1.0 and must be positive.
- **Two documented limitations** (§2.1.5): (1) RDII unit hydrographs (Ch. 7) are driven directly from the rain gage, so the gage-level factor affects RDII but the subcatchment-level factors do not; (2) rainfall injected through the runtime API is an absolute value and is deliberately **not** scaled by any factor.
- §2.7 monthly `[ADJUSTMENTS]`: `RAIN` multiplies every gage's precipitation (part of Eq. 2-12), `TEMP` adds a monthly offset (Eq. 2-16), `EVAP` multiplies the evaporation rate (Eq. 2-17), `CONDUCT` multiplies the conductivity used by the infiltration methods of Ch. 4 (Eq. 2-18).

---

## 2. Spatial rainfall variation and the "nearest gage" mechanism (Ch. 2, §2.1.4)

- The manual's mechanism for spatial variability is **one gage assigned to one subcatchment**: "SWMM accounts for the spatial variability of rainfall by allowing the user to define any number of Rain Gage objects along with their individual data sources, and **assign any rain gage to a particular SWMM Subcatchment object** (i.e., land parcel) from which runoff is computed." (§2.1.4)
- **Thiessen is explicitly NOT a built-in engine feature in the 1D hydrology volume.** The manual discusses it only to reject it: "If multiple gages are available, this is a much better procedure than is the use of **spatially averaged (e.g., Thiessen weighted) data**, because averaged data tend to have short-term time variations removed (i.e., rainfall pulses are 'lowered' and 'spread out')." (§2.1.4) There is no natural-neighbour, inverse-distance or any other interpolation option described anywhere in the hydrology volume.
- For radar data: the manual describes *preparing* the data outside the engine — either "use a separate Rain Gage object for each grid cell ... and assign the **nearest cell** as the subcatchment's source of rainfall data", or build a **weighting matrix W** (`w_ij` = fraction of subcatchment `i`'s area inside grid cell `j`) and precompute `I_t = W·R_t`, written to a user-prepared rainfall file (§2.1.4). Both are **data preparation workflows**, not runtime engine interpolation.
- Moving storms: with multiple gages, "rainfall in one part of the basin may be different from rainfall in another part of the basin" — the only spatial-interaction effect the hydrology volume admits is that subcatchments under different gages respond to different hyetographs (§2.1.4).

**Conclusion for the 1D hydrology volume:** rain is applied *per subcatchment* as a single gage's intensity (uniform over the subcatchment, × scale factors). There is no spatial interpolation, no areal averaging, no subcatchment-to-cell disaggregation, and no concept of 2D mesh cells anywhere in Reference Volume I. (See §9 below for where 2D rain actually lives.)

---

## 3. Surface runoff — the nonlinear reservoir model (Ch. 3)

### 3.1 Conceptual model and governing equations
- §3.2 Governing Equations: the subcatchment is an idealized **rectangular plane of uniform slope S and width W** draining to one outlet (Figure 3-1), modeled as a **nonlinear reservoir** (Figure 3-2) with inflow from precipitation + snowmelt, losses to evaporation and infiltration, and ponded depth `d` on the surface. Water above the **depression storage depth `d_s`** becomes runoff `q`. First published by Chen and Shubinski (1971).
- Mass balance, Eq. 3-1 (fluxes in ft/s = cfs/ft²):
  `∂d/∂t = i − e − f − q`
  with `i` = rainfall + snowmelt rate, `e` = surface evaporation, `f` = infiltration, `q` = runoff, all per unit area.
- Manning-based outflow. Assuming uniform flow in a rectangular cross-section of width `W` and height `d − d_s` (so `A_x = W(d−d_s)`, `R_x = d−d_s`), Eq. 3-2 → Eq. 3-3 → per-unit-area Eq. 3-4:
  `Q = (1.49/n) S^{1/2} R_x^{2/3} A_x`  (3-2)
  `Q = (1.49/n) W S^{1/2} (d − d_s)^{5/3}`  (3-3)
  `q = [1.49 W S^{1/2} / (A n)] (d − d_s)^{5/3}`  (3-4)
- Substituting into 3-1 gives the governing ODE, Eq. 3-5:
  `∂d/∂t = i − e − f − α (d − d_s)^{5/3}`,  with  `α = 1.49 W S^{1/2} / (A n)`  (3-6)
- Eq. 3-5 applies only when `d > d_s`; when `d ≤ d_s` runoff is zero and `∂d/∂t = i − e − f` (Eq. 3-7). Depression storage is an "initial abstraction" (surface ponding, interception by flat roofs and vegetation, surface wetting) — §3.2, §3.8.7.

### 3.2 Subcatchment partitioning (pervious/impervious; %Zero-Imperv) — §3.3
- `Percent Imperviousness` splits each subcatchment into a pervious subarea and an impervious subarea, each solved separately with Eq. 3-5 and its own ponded-depth state `d`.
- The impervious area is further split by `% Zero-Imperv` into (A2) impervious with depression storage and (A3) impervious with **no** depression storage (immediate runoff). Three subareas total: A1 pervious, A2 impervious with storage, A3 impervious without storage (Figure 3-3, Figure 3-4). All impervious area is assumed directly connected (DCIA) to the outlet (§3.3, §3.8.3).
- Conventions (§3.3): same precipitation and evaporation for every subarea; snowmelt varies by subarea (Ch. 6); infiltration `f = 0` for A2 and A3; per-area depression storage `d_s` (A3's is 0 by definition); per-area Manning `n` (pervious vs impervious); **same `W` and `S` for all subareas**.
- The `α` per subarea (Eqs. 3-8, 3-9):
  `α_P = 1.49 W S^{1/2} / (A_1 n_P)`  (pervious A1)
  `α_I = 1.49 W S^{1/2} / ((A_2 + A_3) n_I)`  (both impervious A2, A3)
  The same `α_I` for both impervious subareas follows from the idealized geometry: `W_2/A_2 = W_3/A_3 = W/(A_2+A_3)` (§3.3).

### 3.3 Computational scheme — §3.4 (box: "Computational Scheme for Runoff")
1. Step selection: no precipitation, snowmelt or runoff anywhere → **dry time step**, else **wet time step**; reduce the step to the next rainfall/evaporation change (§3.4, §3.5).
2. For each subcatchment retrieve current `i` and `e` from Ch. 2 sources.
3. For each subarea:
   a. if snowmelt is active, adjust `i` for accumulation (decrease) or melt (increase) — Ch. 6;
   b. available moisture `d_a = i·Δt + d`; limit `e ≤ d/Δt`;
   c. if pervious, compute `f` by the Ch. 4 method (and reduce it if the groundwater routine saturates the soil — Ch. 5); else `f = 0`;
   d. if `(e+f)·Δt ≥ d_a`: `d = 0`, `q = 0`; else rainfall excess `i_x = i − e − f`;
   e. if `d + i_x·Δt ≤ d_s`: update `d ← d + i_x·Δt`, `q = 0`; else solve Eq. 3-5 for `d` and `q` (below).
4. Total subcatchment runoff `Q = Σ_{j=1..3} q_j A_j`.
- Solving Eq. 3-5 (steps a–c): (a) if `d < d_s` and `i_x > 0`, the sub-step to fill storage is `Δt_x = Δt − (d_s − d)/i_x`, set `d = d_s`; else `Δt_x = Δt`; (b) integrate `∂d/∂t = i_x − α d_x^{5/3}` (with `d_x = d − d_s` for `d > d_s`, else 0) using a **fifth-order Runge–Kutta routine with adaptive step control** (Press et al., 1992); (c) `q = α d_x^{5/3}`. Initial ponded depth on every subarea is 0.
- **Evaporation ordering note:** `d_a` is available moisture; evaporation is capped at `d/Δt` (step 3b), so standing water and surface wetting are evaporated before infiltration in the ordering of 3d.

### 3.4 Overland flow re-routing (the runoff routing between pervious/impervious) — §3.6
Three re-routing schemes (Huber, 2001):
1. fraction of A2+A3 (impervious) runoff routed onto A1 (pervious) — e.g. roofs → lawns;
2. fraction of A1 runoff routed onto A2 — e.g. lawns → sidewalks;
3. total subcatchment runoff routed onto another subcatchment (buffer strips, riparian zones).
Schemes 1 and 2 are mutually exclusive; scheme 3 combines with either. Re-routed flow "is distributed **uniformly** over the downstream subarea or subcatchment, **in the same manner as rainfall**," and is delayed at least one time step (§3.6).
- Implementation by adding to `i` (§3.6): receiving subcatchments get `Q_r/A` added to each subarea's precipitation rate, where `Q_r` is the previous step's routed inflow; internally, pervious `i` gets `f(q_2 A_2 + q_3 A_3)/A_1` (scheme 1) or impervious-with-storage `i` gets `q_1 A_1/A_2` (scheme 2).
- Because the nonlinear reservoir has no within-subcatchment spatial variation, outflow cannot be directed onto only the pervious part of a downstream subcatchment — split the downstream subcatchment instead (§3.6).
- Reported subcatchment runoff is only the flow that actually exits (e.g. if 100% impervious runoff is routed to pervious, the reported runoff is the pervious-area runoff only) (§3.6).

### 3.5 Time step considerations — §3.5
- Wet step ≤ time of concentration; typically an integer fraction of the rainfall interval (5-min rain → 1, 2.5 or 5 min steps; 1-hr rain → 10–15 min steps). Very small parcels/LID may need < 1 min. Dry step can be hours to a day.
- Hydraulic routing uses a separate, much smaller step; runoff hydrographs are linearly interpolated to feed routing (§3.5, §1.5).

### 3.6 The runoff-coefficient approximation — §3.10.1
- §3.10 Approximating Other Runoff Methods shows how SWMM reproduces the simple runoff-coefficient method `Q = C i A` (Eq. 3-16), and with infiltration `Q = [C i + (1−C) max(0, i−f)] A` (Eq. 3-17).
- Recipe: %imperv = 100C; %Zero-Imperv = 0; equal depression storage both areas; any slope/width; **Manning n = 0** on both areas; Horton with `f_0 = f_∞` (= very large for Eq. 3-16, = f for Eq. 3-17). "When the Manning roughness n is 0, **SWMM bypasses Equation 3-1 and simply converts all rainfall excess at each time step into instantaneous runoff**." (§3.10.1)
- SCS-CN runoff-volume approximation: %imperv = 0, CN infiltration method, pervious depression storage = Ia, pervious n = 0; SCS volume equations `R = (P − Ia)²/(P − Ia + S)`, `S = 1000/CN − 10` (Eqs. 3-18, 3-19) are reproduced closely (worked example: CN 80, 4-in/4-hr storm → 2.04 in SCS vs 1.98 in SWMM with n=0; 1.67 in with n=0.1) (§3.10.2).

---

## 4. Infiltration (Ch. 4)

Four methods: Horton, Modified Horton (Akan), Green-Ampt, Curve Number (§4.1). All parameters depend on soil type / Hydrologic Soil Groups A–D (Table 4-1, §4.1).

### 4.1 Horton — §4.2
- Governing equation (Eq. 4-1): `f_p = f_∞ + (f_0 − f_∞) e^{−k_d t}` — infiltration *capacity*, ft/s, with `f_0` initial (t=0), `f_∞` minimum (t=∞), `k_d` decay coefficient (sec⁻¹).
- Actual infiltration is the lesser of capacity and rainfall: `f(t) = min[f_p(t), i(t)]` (Eq. 4-2).
- Because capacity decays with time even in light rain, SWMM uses the **integrated form** (Eq. 4-3): `F(t_p) = ∫₀^{t_p} f_p dt = f_∞ t_p + (f_0 − f_∞)/k_d (1 − e^{−k_d t_p})`. True cumulative infiltration (Eq. 4-4): `F(t) = ∫₀^t min[f_p, i] dτ`. `F` is advanced by actual infiltration each step; then Eq. 4-5 (same as 4-3, `t_p` unknown) is solved for the new equivalent time `t_p`, and Eq. 4-1 gives the new capacity.
- Optional `F_max` caps total infiltrated volume; beyond it the surface behaves as impermeable (§4.2.1).
- **Recovery** (§4.2.2): during dry periods (no precipitation, no ponded water) capacity regenerates along a hypothetical drying curve, Eq. 4-6: `f_p = f_0 − (f_0 − f_∞) e^{−k_r(t − t_w)}`. The projected time origin `t_w` (Eq. 4-8), the new capacity (Eq. 4-9), the re-started equivalent time `t_p1` (Eq. 4-10) combine into the closed-form update (Eq. 4-11): `t_p1 = (1/k_d) ln[1 − e^{−k_r Δt}(1 − e^{−k_d t_pr})]`. Manual admits this is purely empirical with no ET dependence (§4.2.2).
- **Computational scheme** (§4.2.3 box): available rate `i_a = i + d/Δt`; if `i_a = 0` update `t_p` via the recovery map and set `f = 0`; else compute cumulative `F_p`, `F_1` from the integrated form (with the large-`t_p` shortcut `F_p = f_∞ t_p + (f_0−f_∞)/k_d`, `F_1 = F_p + f_0 Δt` when `t_p ≥ 16/k_d`), cap both at `F_max`; average capacity `f_p = (F_1 − F_p)/Δt`; if `t_1 > 16/k_d` or `f_p < i_a` advance `t_p ← t_p + Δt`, else solve `F_p + f_p Δt = f_∞ t_p + (f_0−f_∞)/k_d (1−e^{−k_d t_p})` by Newton–Raphson; finally `f = min[f_p, i_a]`.
- Parameters: `f_0`, `f_∞` (≈ K_s), `k_d` (typical 3–6 hr⁻¹, est. 4), `k_r` derived from a user-supplied drying time `T_dry` via the 98%-recovery convention — Eq. 4-13 `0.02(f_0−f_∞) = (f_0−f_∞)e^{−k_r T_dry}` → Eq. 4-14 `k_r = −ln(0.02)/T_dry = 3.912/T_dry`, with `T_dry = 3.125/√K_s` days (Eq. 4-12). (Tables 4-2…4-6 give parameter values; §4.2.4.)

### 4.2 Modified Horton (Akan) — §4.3
- Same decay equation (Eq. 4-15) but the **state variable is cumulative excess infiltration `F_e`**, not time on the curve. Rearranging the integrated form gives Eq. 4-19: `f_p = f_0 − k_d F_e`, where `F_e = Σ (f_i − f_∞)Δt_i` (accumulation of infiltration *in excess of* the minimum rate, which is assumed to percolate away). Claimed more accurate for low rainfall intensities (§4.3.1).
- Recovery: `F_er = F_e e^{−k_r t}` (Eq. 4-25, derived from Eqs. 4-20–4-24) — exponential decay of the excess volume at the same `k_r` as ordinary Horton.
- **Computational scheme** (§4.3.3 box): `i_a = i + d/Δt`; if `i_a = 0`: `F_e ← F_e e^{−k_r Δt}`, `f = 0`; else if `F_e ≥ F_max`: `f_p = 0`, else `f_p = max(f_0 − k_d F_e, f_∞)`; `f = min(f_p, i_a)`; if `f > f_∞`: `F_e ← min(F_e + (f − f_∞)Δt, F_max)`.

### 4.3 Green-Ampt — §4.4
- Two-zone conceptualization: wetted zone at saturation `θ_s` above an unwetted zone at `θ_i`; sharp wetting front with capillary suction head `ψ_s` (Figure 4-5). Darcy velocity in the wetted zone (Eq. 4-26): `f_p = K_s[(d + L_s + ψ_s)/L_s]`. With `L_s = F/θ_d`, `θ_d = θ_s − θ_i` the moisture deficit, and `d` small, this becomes the saturated-condition capacity (Eq. 4-27): `f_p = K_s[1 + ψ_s θ_d / F]`.
- Prior to surface saturation, capacity equals rainfall: `f_p = i` (Eq. 4-28). Saturation is reached when `F ≥ F_s` where (Eq. 4-29) `F_s = K_s ψ_s θ_d / (i − K_s)` — with no `F_s` computed when `i ≤ K_s`. During saturated flow `f = f_p` (Eq. 4-30). Capacity asymptotes to `K_s` (Figure 4-6).
- For long steps the integrated form is used (Eq. 4-31): `F = K_s + ψ_s θ_d ln(1 + F/(ψ_s θ_d))`. **Flag:** the printed Eq. 4-31 is missing the time variable — the first term reads `K_s` where the correct integrated form is `F = K_s·t + ψ_s θ_d ln(1 + F/(ψ_s θ_d))`. The next equation confirms the intended form: Eq. 4-32 `F_2 = C + ψ_s θ_d ln(F_2 + ψ_s θ_d)` with `C = K_s Δt + F_1 − ψ_s θ_d ln(F_1 + ψ_s θ_d)`, solved numerically for `F_2`; average capacity `f_p = (F_2 − F_1)/Δt` (§4.4.1).
- **Recovery** (§4.4.2) — all derived from `K_s`:
  - upper-layer thickness (in) Eq. 4-33: `L_u = 4√K_s` (in/hr);
  - upper-zone moisture deficit `θ_du` tracked continuously: during wet steps `θ_du ← θ_du − fΔt/L_u` (Eq. 4-34, floor 0); during dry steps `θ_du ← θ_du + k_r θ_dmax Δt` (Eq. 4-35, ceiling `θ_dmax`);
  - recovery constant (hr⁻¹) Eq. 4-36: `k_r = √K_s/75`; full recovery time `1/k_r = 75/√K_s` hr = `3.125/√K_s` days;
  - minimum inter-event time (hr) Eq. 4-37: `T_r = 0.06/k_r = 4.5/√K_s`. After `≥ T_r` dry hours, the two-stage process re-starts with `θ_d = θ_du` and `F = 0`.
- Parameters: `K_s`, `ψ_s`, `θ_dmax`. Estimation guidance: Rawls et al. (1983) Table 4-7 (per soil class); suction–conductivity regression Eq. 4-38 `ψ_s = 3.237 K_s^{−0.328}` (R² ≥ 0.9); `θ_dmax` = effective porosity `φ_e = φ − φ_r` for dry antecedent conditions (§4.4.4). `S = d_wt θ_dmax` links storage to water-table depth (Eq. 4-39).

### 4.4 Curve Number — §4.5
- Classic event form (Eq. 4-40, inches): `Q = P²/(P + S_max)`, with `S_max = 1000/CN − 10` (Eq. 4-41). The initial-abstraction term `P − Ia` of the formal SCS method is **omitted** because SWMM already accounts for interception/depression storage separately via its depression-storage parameter `d_p` (§4.5.1). SWMM's version is an **incremental form accounting only for infiltration losses** (§4.5).
- Cumulative infiltration `F = P − P²/(P + S_max)` (Eq. 4-42). Incremental application over a step: `P_2 = P_1 + iΔt` (Eq. 4-43), `F_2 = P_2 − P_2²/(P_2 + S_e)` (Eq. 4-44), `f = (F_2 − F_1)/Δt` (Eq. 4-45); `S_e` is the storage capacity at the start of the rainfall event. During dry gaps inside an event, infiltration is held at the previous period's rate; re-routed overland flow is **not** included in `i` (§4.5.1).
- **Recovery** (§4.5.2): a storage state `S` (initially `S_max`) is reduced by `fΔt` during infiltration and regenerated as `S ← S + k_r S_max Δt` (Eq. 4-46). New events start (P = F = 0, `S_e = S`) only after `T_r` dry hours, `T_r = 0.06/k_r` (Eq. 4-47). **Flag:** the manual says "through Equation 4-25 which is repeated here," but the equation it means is Green-Ampt's Eq. 4-37 `T_r = 0.06/k_r`; Eq. 4-25 in this manual is the Modified-Horton recovery `F_er = F_e e^{−k_r t}`. A mis-citation.
- **Computational scheme** (§4.5.3 box): on rain (`i > 0`): if `T ≥ T_r` a new event begins (`P_1 = F_1 = 0`, `S_e = S`); `T = 0`; `P_2 = P_1 + iΔt`; `F_2 = P_2 − P_2²/(P_2 + S_e)`; `f_p = (F_2 − F_1)/Δt`; advance `P_1, F_1`. On no rain: `T ← T + Δt`, `f_p = f` (previous). If `f_p > 0`: `f = min[f_p, i + d/Δt]`, `S ← max[S − fΔt, 0]`; else `S ← min[S + k_r S_max Δt, S_max]`.
- Parameters: `CN` and drying time `T_dry`; `k_r = 1/(24 T_dry)` (Eq. 4-48, hr⁻¹); `T_r` from Eq. 4-47. CN adjustments for antecedent moisture: Eqs. 4-49/4-50 `CN_I = 4.2 CN_II/(10 − 0.058 CN_II)`, `CN_III = 23 CN_II/(10 − 0.13 CN_II)`; use AMC I for long-term runs (§4.5.4). Tabulated CNs (Table 4-9) **lump pervious+impervious** — the subcatchment should be modeled as fully pervious (§4.5.4). `T_dry = 3.125/√K_s` (Eq. 4-51).

---

## 5. Groundwater (Ch. 5)

### 5.1 Two-zone model and equations
- Each subcatchment analyzed independently; subsurface = an **unsaturated upper zone** (moisture `θ`) above a **saturated lower zone** (moisture `φ`, porosity), water table at depth `d_L`; unsaturated depth `d_U = E_G − E_B − d_L` (§5.2, Figure 5-1).
- Fluxes (§5.2): `f_I` surface infiltration (Ch. 4 infiltration × pervious fraction `F_perv`); `f_EU` upper-zone ET (fraction of unused surface evaporation `e·F_perv`); `f_U` percolation upper→lower (function of `θ`, `d_U`); `f_EL` lower-zone ET (function of `d_U`); `f_L` deep percolation (function of `d_L`); `f_G` lateral groundwater seepage to a conveyance node (function of `d_L` and node water-surface elevation).
- Mass conservation (Eqs. 5-1…5-4): `∂V_U/∂t = f_UZ = f_I − f_EU − f_U`; `∂V_L/∂t = f_LZ = f_U − f_EL − f_L − f_G`.
- Zone coupling (Eq. 5-5): `(φ − θ) ∂d_L/∂t = ∂V_L/∂t` — the saturated zone's expansion absorbs moisture `θ` from the unsaturated zone. Hence Eq. 5-6 `∂d_L/∂t = f_LZ/(φ − θ)` and, via `V_U = θ d_U` (Eq. 5-7) and `∂d_U/∂t = −∂d_L/∂t` (Eq. 5-8), Eq. 5-9:
  `∂θ/∂t = [θ f_LZ + (φ − θ) f_UZ] / [(φ − θ)(E_G − E_B − d_L)]`.
- Eqs. 5-6 and 5-9 are integrated with a **fifth-order Runge–Kutta routine with adaptive step size** over each runoff time step; initial conditions `d_L = d_L0`, `θ = θ_0` (§5.2, §5.4). Constraints: infiltration ≤ available pore volume (`f_I Δt ≤ d_U(φ−θ) + f_U Δt`; excess is returned to the surface as a reduced infiltration rate), `θ_WP ≤ θ ≤ φ`, `d_L ≤ E_G − E_B` (§5.2).

### 5.2 Flux terms (§5.3)
- **f_I** (§5.3.1): `f_I = f × F_perv`; capped at `f_Imax = d_U(φ−θ)/Δt + f_U` (Eq. 5-10); if capped, the runoff routine's infiltration rate is reduced to `f_I/F_perv`.
- **f_EU** (§5.3.2): Eq. 5-11 `f_EU = min(e_max − e_s, UEF × e_max)` with `e_max = e·F_perv`, surface evaporation `e_s = min(e, d_a/Δt)/F_perv` (Eq. 5-12). `f_EU = 0` when `θ < θ_WP` or when `f_I > 0`. (The scheme order is surface evaporation → upper-zone ET → lower-zone transpiration.)
- **f_EL** (§5.3.3): Eq. 5-13 `f_EL = (1 − UEF) e_max (DEL − d_U)/DEL`, constrained to `[0, e_max − e_s − f_EU]`.
- **f_U** (§5.3.4 Percolation): from Darcy's law for unsaturated flow (Eqs. 5-14…5-17); because `θ` is uniform in the upper zone, `f_U = K(θ)` (Eq. 5-18) with `K(θ) = K_s e^{−(φ−θ)HCO}` (Eq. 5-19) → final form Eq. 5-20 `f_U = K_s e^{−(φ−θ)HCO}`; **zero below field capacity** `θ_FC`. (Note: the manual numbers *both* the percolation section and the deep-percolation section "5.3.4" — duplicate numbering; §5.3.4 Deep Percolation is the second.)
- **f_L** (§5.3.4 Deep Percolation): Eq. 5-21 `f_L = DP d_L/(E_G − E_B)`, `DP` a recession coefficient; bounded in `[0, DP]`.
- **f_G** (§5.3.5): the general groundwater-discharge equation (Eq. 5-22):
  `f_G = A1 (d_L − h*)^{B1} − A2 (h_SW − h*)^{B2} + A3 d_L h_SW`
  `h_SW` = height of surface water above the bottom of the groundwater zone; `h*` = reference height (defaults to the receiving node's invert); A1/B1 groundwater flow coefficient/exponent; A2/B2 surface-water flow coefficient/exponent; A3 surface–groundwater interaction coefficient. Coefficients are unit-adjusted (input as cfs/ac or cms/ha; converted internally to cfs/ft²). Negative `f_G` = bank storage into the aquifer, except when `A3 ≠ 0` (unidirectional flow models). Also custom user-defined flux equations for `f_G` and `f_L` (§5.3.6).
- Standard cases from Eq. 5-22 (§5.5.4): linear reservoir without interaction `f_G = A1(d_L − h*)` (Eq. 5-28; A1>0, B1=1, A2=A3=0); with interaction `f_G = A1(d_L − h_SW)` (Eq. 5-29; A1=A2>0, B1=B2=1, A3=0); Dupuit–Forcheimer lateral seepage (Eqs. 5-30…5-32, → A1 = −A3 = 2K_s/L², A2=0, B1=2, h*=0); Hooghoudt tile drainage (Eqs. 5-33…5-38, A1=16K_s/L², B1=2, A2=A1·D_e·b_0, B2=0, A3=A1·(D_e/b_0), h*=b_0).
- **Computational scheme** (§5.4 box): compute `f_Umax = d_U(φ−θ_FC)/Δt`; `e_s`; initial `f_U` (Eq. 5-19, ≤ f_Umax); `f_Imax`; `f_G` bounds (cannot release more than stored `f_Gmax = d_L φ/Δt`; cannot accept more than storable or than the node can release); RK5 integration of `∂θ/∂t` and `∂d_L/∂t` (in the box these appear with `φ` in place of `(φ−θ)` in the denominators — a consistency discrepancy with Eqs. 5-6/5-9 to flag); clamp `θ` to `[θ_WP, φ − XTOL]`, `d_L` to `[0, E_G−E_B−XTOL]` (XTOL=0.001); re-evaluate `f_G` at the updated `d_L` and pass `f_G×A` as lateral inflow to the receiving node.
- Parameter estimation: soil moisture limits `φ, θ_FC, θ_WP` (Tables 5-1…5-5, HELP tables; Saxton–Rawls regressions Table 5-7; `φ = 1 − ρ_b/ρ_s` Eq. 5-23); percolation `K_s, HCO, DP` (`K_s = 76(φ−θ_FC)^{(3−λ)}` Eq. 5-24, `λ = 0.262 ln(θ_FC/θ_WP)`; Campbell power law Eq. 5-25; `HCO = 0.48(%Sand) + 0.85(%Clay)` Eq. 5-26, Table 5-9); ET `UEF` (= CET) and `DEL` (= DET) (§5.5.3, Table 5-10); discharge constants A1…A3 (§5.5.4). Note: §5.5.3 introduces `CET`/`DET` as alternative names for `UEF`/`DEL` (§5.3.2/5.3.3).
- Numerical example (§5.6): a pervious subcatchment under a 2-in, 6-hr storm; groundwater adds a delayed extended recession limb on the outlet hydrograph.

---

## 6. Snowmelt (Ch. 6)

- All snow depths are tracked as **depth of water equivalent** (in w.e.); internally converted to feet of water equivalent (§6.2.1). Snowfall is precipitation when `T_a ≤ SNOTMP`; otherwise rainfall (§6.2.2). The gage **Snow Catch Factor SCF** corrects snowfall under-catch (Anderson's wind-speed curves, Figure 6-1) (§6.2.2).
- Subcatchment partitioning for snow (Figure 6-2): three snow surfaces — SA1 pervious, SA2 **plowable** impervious (streets, sidewalks, parking), SA3 remaining (non-plowable) impervious. After melt, net precipitation over SA2+SA3 is redistributed between the runoff impervious subareas (with/without depression storage); pervious snow result feeds pervious runoff directly (§6.2.3).
- **Snow redistribution/removal** (§6.2.5): when `WSNOW > WEPLOW`, instantaneous redistribution fractions `F_imp` (→SA3), `F_perv` (→SA1), `F_sub` (→another subcatchment's pervious area), `F_out` (out of watershed; tabulated in continuity), `F_imelt` (→ immediate melt, treated as rainfall). Fractions may sum to < 1 (residual snow remains). No pollutants transferred with snow (§6.2.5).
- Snow has **no effect on infiltration** or other surface parameters; heat transfer ceases once water becomes "net runoff" (surface water doesn't refreeze) (§6.2.5).
- **Melt equations** (§6.3.2):
  - Rain periods (rain `i > 0.02 in/hr`, 0.51 mm/hr): heat-balance equation, Eq. 6-1 (in/hr):
    `SMELT = (0.001167 + 7.5γU_A + 0.007i)(T_a − 32) + 8.5 U_A (e_a − 0.18)`
    with `γ = 0.000359 P_a` (Eq. 6-2), `P_a = 29.9 − 1.02(z/1000) + 0.0032(z/1000)^{2.4}` (Eq. 6-3), wind factor `U_A = 0.006 U` (Eq. 6-4), saturation vapor pressure `e_a = 8.1175×10⁶ exp(−7701.544/(T_a + 405.0265))` (Eq. 6-5).
  - Dry periods: degree-day / temperature-index, Eq. 6-6: `SMELT = DHM (T_a − Tbase)`. `DHM` varies seasonally sinusoidally, min Dec 21, max Jun 21 (Eq. 6-7): `DHM = (DHMAX+DHMIN)/2 + (DHMAX−DHMIN)/2 · sin(π/182 (day − 81))`. Different `Tbase`, `DHMIN`, `DHMAX` per snow surface (street salting lowers `Tbase`; rooftops may use lower `Tbase`).
- **Cold content** (§6.3.3): before melt, the pack must be "ripened" (cold content reduced to 0). Antecedent temperature index updated as `ATI ← ATI + TIPM_t (T_a − ATI)` (Eq. 6-8) with 6-hour weighting `TIPM_t = 1 − (1−TIPM)^{Δt/6}` (Eq. 6-9), ATI ≤ Tbase, and ATI = T_a during snowfall. Cold-content change (Eq. 6-10): `ΔCC = RNM × DHM × (ATI − T_a) × Δt` (in w.e.); during melt, `ΔCC = −SMELT × RNM × Δt` with equal reduction in SMELT (Eq. 6-11). `RNM` (negative melt ratio, typical 0.6) and `TIPM` (typical 0.5) are watershed-wide constants.
- **Areal depletion** (§6.4): only a fraction `ASC` of each surface is snow covered. Continuity `WSNOW·A_T = WS·AS` (Eq. 6-12) and `AWESI = WSNOW/SI = (WS/SI)·ASC` (Eq. 6-13); actual depth `WS = (AWESI/ASC)·SI` (Eq. 6-14), `SI` = depth at 100% cover. New snow: `SNEW = AWE + SNO/SI` (Eq. 6-15); cover stays 100% until 25% of new snow melts, `SBWS = AWE + 0.75(SNO/SI)` (Eq. 6-16), then a temporary linear ADC returns to the original curve (Figure 6-4). Melt reduces `ΔWSNOW = SMELT × ASC × Δt` (Eq. 6-17); cold-content changes are also scaled by `ASC` (Eq. 6-18). ADCs are user curves of ASC vs depth ratio (0.0–0.9; ASC=1 at ratio 1.0), one pervious + one impervious curve watershed-wide (Table 6-3); may have ASC>0 at ratio 0 but not AWE>0 at ASC=0 (§6.7).
- **Net runoff** (§6.5): snow pack has a **free-water holding capacity** `FWFRAC × WSNOW`; free-water depth `FW` must exceed it before liquid runoff leaves the pack. Net equivalent precipitation input to the surface (Eq. 6-19): `RI = ASC × SMELT + (1.0 − ASC) × i`. `RI` replaces the external rainfall in subsequent overland-flow and infiltration calculations. `F_imelt` melt is added; when `WSNOW < 0.001 in`, remaining snow+free water is converted to immediate melt and added to Eq. 6-19.
- **Computational scheme** (§6.6 box, 12 steps): compute `DHM`; if `T_a ≤ SNOTMP`, `WSNOW ← WSNOW + i·SCF·Δt`; plow redistribution when `WSNOW > WEPLOW` (immediate melt `IMELT = F_imelt·WSNOW/Δt`); convert thin packs to melt; compute `ASC` from ADCs; compute `SMELT` (heat-balance if `T_a > SNOTMP` and `i > 0.02 in/hr`, else degree-day if `T_a ≥ Tbase`, else 0); scale by `ASC`; update cold content (limiting `COLDC ≤ 0.007·WSNOW·(Tbase − ATI)`); melt reduces `COLDC` and `SMELT`; update `WSNOW` and `FW` (rain adds to FW: `FW ← FW + (SMELT + i_RAIN)Δt`); release `ΔFF = FW − FWFRAC×WSNOW` as runoff when positive; compute `RI = SMELT + IMELT + i_RAIN·(1 − ASC)` per surface and feed back to runoff subareas — `i = RI[SA1]` for A1 and `i = (RI[SA2]·A_S2 + RI[SA3]·A_S3)/A_imperv` for both impervious runoff subareas.
- Snow-covered-area scheme (§6.6, second box): four cases — no snow (ASC=0); WSNOW ≥ SI (ASC=AWE=1); snowfall during step (temporary linear ADC via `AWE`, `SBA`, `SBWS`); WSNOW < SI no snowfall (original ADC, or temporary ADC between `AWE` and `SBWS`: `ASC = SBA + (1−SBA)·(AWESI − AWE)/(SBWS − AWE)`).

---

## 7. RDII — Rainfall Dependent Inflow and Infiltration (Ch. 7)

- RDII is a **separate external inflow category** entering the conveyance system at designated nodes, computed **independently** of surface runoff/infiltration/snowmelt/groundwater. Uses the **RTK unit hydrograph method** (CDM-Smith / East Bay MUD) — up to three triangular unit hydrographs per node ("sewershed"), one per response class (short-term inflow, medium inflow+infiltration, long-term infiltration) (§7.1, §7.2, Figure 7-1, 7-4).
- Unit hydrograph parameters (§7.2): `R` = fraction of rainfall volume entering the sewer (= area under the UH); `T` = time from rainfall onset to UH peak; `K` = ratio of recession time to time-to-peak; `Q_peak` = peak ordinate per unit area. Also initial-abstraction parameters `IA_max` (capacity), `IA_0` (capacity used at start), `IA_r` (recovery rate during no-rain periods).
- **Convolution** (Eq. 7-1): `Q_t = Σ_{j=1..t} U_{t−j+1} P_j` — the UH replicated for each rain period, offset in time and scaled by that period's rainfall depth. Total RDII volume into the system = composite ordinate × sewershed area. A separate `Q_t` is computed per UH (per response) and summed.
- UH ordinates (Eqs. 7-2…7-8): `U_j = f_j Q_peak`; `Q_peak = 2R/(T + KT)` (area under a triangle = R); `U_j = 2R f_j/(T + KT)`; with `τ_j = (j − 0.5)Δτ` (midpoint convention, `Δτ` = rain recording interval) and `f_j = τ_j/T` for `τ_j ≤ T`, `f_j = 1 − τ_{j−T}/(KT)` for `T < τ_j ≤ T+KT`, `f_j = 0` beyond.
- Initial abstraction: rainfall applied to the convolution is reduced by the remaining abstraction capacity; capacity regenerates at `IA_r` during dry periods (§7.2). §7.3's promised "sidebar" computational scheme is **missing from the manual** — the text ends with "...are described in the sidebar shown below" and no sidebar follows. Flag this gap.
- RDII time series are computed **before** the simulation and written to an RDII interface file (node, date, time, flow; only non-zero entries; reporting step in the header) — accessed during flow routing (§7.3, Figure 7-10).
- Parameters must come from flow monitoring; RTK have no generic values (§7.4). The `[HYDROGRAPHS]` section supports monthly parameter sets; `ALL` vs month-specific ordering rules and warning 13 are documented (§7.4).
- **Exponential-decay initial abstraction model** (§7.6, a newer addition): alternative to the linear `IA_r` model. Available abstraction decays exponentially with rainfall depth: `IA_avail^{t+Δt} = IA_avail^t e^{−k_dep ΔP}` (Eq. 7-9); net rain passed to convolution `P_net = max(0, ΔP − (IA_avail^t − IA_avail^{t+Δt}))` (Eq. 7-10); recovery is first-order, temperature-dependent: `d IA_avail/dt = k_rec(T)(IA_max − IA_avail)` (Eq. 7-11), integrated as `IA_avail^{t+Δt} = IA_max − (IA_max − IA_avail^t) e^{−k_rec(T)Δt}` (Eq. 7-12), with `k_rec(T) = 0` if `T < T_freeze`, else `k_0 + k_T e^{θ_rec(T − T_ref)}` (Eq. 7-13). Parameters in `[RDII_DECAY]` (Table 7-2). Optional degree-day snow partition (§7.6.3): `M = min(SWE, DDF(T − T_snow)Δt)` (Eq. 7-14). If no temperature source, `k_rec` is evaluated at `T_ref` (warning issued). This model subsumes the linear model for small deficits (`IA_r ≈ k_rec(T)(IA_max − IA_avail)` near full capacity) (§7.6.2).

---

## 8. Subcatchment aggregation and key parameters (Ch. 3, §3.8)

- **Area** (§3.8.2): no upper/lower bounds; chosen by land use, drainage divides, homogeneous slope/soil.
- **Imperviousness** (§3.8.3): `% Imperviousness` = directly-connected impervious area (DCIA). Sensitive parameter; land-use table (Table 3-1) and EIA regressions (Table 3-2, Southerland 2000). Non-effective impervious area (e.g. roofs draining to lawns) should be routed via overland-flow re-routing (§3.6, §3.8.3).
- **Width** (§3.8.4): physical width of overland flow on the idealized rectangle; `α` (Eq. 3-6) = `1.49 W S^{1/2}/(A n)`, so width is the usual calibration parameter (slope and n fixed). Estimates: `W ≈ A / (avg max overland flow length)`; `W = L + 2L(1−Z)` with skew factor `Z = A_m/A` (Eqs. 3-10, 3-11, DiGiano et al. 1977); Guo–Urbonas shape-factor method (Eq. 3-12 `Y = 2X(1.5−Z)(2K−X)/(2K−1)`, `X = A/L²`, `W = YL`). Width changes shape (storage effect, faster/slower time-to-peak), not volume (except via infiltration time on pervious areas) (Table 3-6).
- **Slope** (§3.8.5): average slope along the overland flow path; path-length-weighted average, or the "hydrologically dominant slope"; Guo–Urbonas equivalent-plane slope `S_o L/(A/YL + YL)`.
- **Manning n** (§3.8.6): Table 3-5 (Crawford & Linsley, Engman, Yen values).
- **Depression storage** (§3.8.7): pervious values must be filled and are replenished by infiltration+evaporation; impervious storage is depleted by evaporation only. Calibration regressions: `d_S = 0.303 S^{0.49}` (Eq. 3-14, Kidd), `d_S = 0.136 − 0.032S` (Eq. 3-15, Viessman & Lewis); typical pervious 0.10 in (2.5 mm). Most sensitive for small storms (Table 3-6).
- **Sensitivity** (Table 3-6): area, imperviousness → volume and peak; width/slope → shape (increase → higher earlier peaks); roughness → inverse of width; depression storage → moderate, only for shallow storms. Losses are relatively less important for large storms — "for flooding the land surface behaves more and more like an impervious surface" (§3.8.8).
- Subcatchment discretization (§3.7): drainage boundaries from topography **and** sewer plans (pipes may drain opposite the surface gradient); parcel-level detail possible; coarser = more aggregation decisions.

---

## 9. Rainfall spatial distribution — dedicated findings section

**Does the hydrology volume describe how a "mean gage rate" or uniform rain is distributed over space? Does it apply rain to 2D cells?**

- **No in Reference Volume I (hydrology).** The hydrology manual's only spatial mechanism is gage→subcatchment assignment (nearest-gage style): each subcatchment receives the full intensity of its single assigned gage, uniform over the subcatchment, times scale factors (§2.1.4, §2.1.5). The manual explicitly *discourages* spatially averaged (Thiessen) data in the 1D context (§2.1.4). There is **no interpolation scheme, no areal weighting, no "mean gage rate", and no 2D mesh** anywhere in Chapters 1–7.
- **The "uniform rain film" concept lives entirely in Reference Volume II (hydraulics), Ch. 9 "Two-Dimensional Overland Flow Analysis", §9.8 "Rainfall and evaporation on the mesh"** (file `hydraulics/sections/Chapter9-TwoDimensional.md`). Rain reaches the 2D mesh from the project's rain gages, mapped by the `RAINFALL_MODE` option:
  - **`NATURAL_NEIGHBOUR`** (default): interpolates the *located* gages onto every cell centroid — natural-neighbour (Laplace) weights inside the convex hull of gage positions, inverse-distance weighting with power 2 outside it; weights built once (static geometry). Degenerate fallbacks: one gage → uniform everywhere; two/collinear gages → inverse distance; no located gage → the `SYSTEM` mean.
  - **`SYSTEM`**: "applies the **arithmetic mean of all gages uniformly**" — this is precisely the project's "uniform rain film / all 2D cells get the mean gage rate" assumption, as documented in the engine manual.
  - **`NONE`**: no rain on the mesh. The manual is explicit that `NONE` is "a modelling decision," not an optimization: if subcatchments already convert the storm to runoff and deliver it to nodes, rain on the mesh **double-counts the same storm** (§9.8; also §9.1: "unless RAINFALL_MODE says otherwise the mesh receives the same rainfall the subcatchments do, and both would deliver it").
- **1D hydrology does not apply rain to 2D cells.** The 1D runoff engine (Ch. 3) produces subcatchment runoff that enters nodes; water reaches the mesh only via (a) the mesh's own `RAINFALL_MODE` rainfall, and (b) 1D→2D surcharge spill ("surcharge" coupling). The 2D continuity equation, Eq. 9-1 `∂h/∂t + ∇·q = i − e + s`, includes rainfall intensity `i` as a direct per-cell source; the mesh has **no infiltration** ("Water on the surface leaves by flowing away, evaporating, or entering the network. Losses to the ground must be represented through the subcatchments" — §9.12; also §9.1).
- So the hydrology volume is silent on 2D rain; the "uniform rain film" behavior is a **2D-module property** (`RAINFALL_MODE=SYSTEM`) documented in the hydraulics volume, with the "all cells get the mean gage rate" semantics being the arithmetic mean of all project rain gages applied uniformly to every mesh cell.

---

## 10. Ambiguities and defects flagged in the manual itself

1. **Rainfall data-type conversions absent** — §2.2.1 lists INTENSITY/VOLUME/CUMULATIVE as selectable formats but gives no conversion rule; §2.1.5 Eq. 2-12 assumes the value is already "after conversion to intensity units." Conversion semantics are left to the User's Manual.
2. **Green-Ampt integrated equation typo** — Eq. 4-31 prints `F = K_s + ψ_s θ_d ln(1 + F/(ψ_s θ_d))`; the time variable is missing. Eq. 4-32 (with `C = K_s Δt + …`) confirms the intended form `F = K_s t + ψ_s θ_d ln(1 + F/(ψ_s θ_d))`.
3. **CN mis-citation** — §4.5.2 says `T_r` comes "through Equation 4-25 which is repeated here," but the equation referenced is Green-Ampt's Eq. 4-37 (`T_r = 0.06/k_r = 4.5/√K_s`), not Eq. 4-25 (`F_er = F_e e^{−k_r t}`, Modified Horton).
4. **Duplicate section numbers in Ch. 5** — both percolation and deep percolation are labeled "5.3.4."
5. **Groundwater RK5 scheme inconsistency** — the §5.4 computational-scheme box writes `∂θ/∂t = [θ f_LZ + φ f_UZ] / [φ(E_G − E_B − d_L)]` and `∂d_L/∂t = f_LZ/φ`, using porosity `φ` where the governing Eqs. 5-6/5-9 use the deficit `(φ − θ)`.
6. **RDII sidebar missing** — §7.3 promises a computational-scheme sidebar ("described in the sidebar shown below") that is not present in the markdown.
7. **Chapter 7 RDII (§7.3) sidebar missing; RDII files** — RDII is precomputed and stored in an interface file, but the step-by-step generation procedure is not given (see #6).
8. **Section ordering / equation numbering oddity in Ch. 2** — §2.1.5 (equations 2-12…2-15) is physically located before §2.4/§2.5 (equations 2-1…2-11), so equation numbers are not monotonic in document order.
9. **Figure cross-reference** — §2.4 text refers to "Figure 2-2" for sinusoidal temperature interpolation; the figure caption reads "Figure 2-1."
10. **Duplicate §3.8.7** — the "Depression Storage" section heading appears twice in Ch. 3 (identical text).
11. **No 2D rainfall in the hydrology volume** — an intentional split, but a reader relying on Volume I alone would conclude SWMM has no spatial rainfall interpolation; the `RAINFALL_MODE` semantics (nearest → natural-neighbour/Laplace, uniform-mean, none) are only in Reference Volume II Ch. 9 §9.8.
12. **Horton recovery is empirical** — the manual itself notes recovery has no ET dependence and is "somewhat unsatisfactory" (§4.2.2); same caveat for Green-Ampt recovery (§4.4.2).

---

## 11. One-paragraph summary

Per the official Reference Manual Volume I (hydrology), rainfall is gage-driven: each Rain Gage supplies a time series or file in intensity/volume/cumulative-volume format at a stated recording interval, values are start-of-interval depths converted to intensity, held constant within each runoff time step (no temporal interpolation, Ch. 1 §1.5; Ch. 3 §3.4/§3.5), optionally scaled by a gage-level factor and a monthly adjustment (Eq. 2-12), then a per-subcatchment rain/snow split with subcatchment scale factors (Eqs. 2-13/2-14); spatial variability is captured only by assigning one whole gage per subcatchment, with Thiessen-type averaging explicitly discouraged (§2.1.4) — there is no built-in spatial interpolation and no 2D concept anywhere in the hydrology volume. Surface runoff is a nonlinear reservoir per subarea (A1 pervious, A2/A3 impervious, split by %Zero-Imperv) governed by ∂d/∂t = i − e − f − α(d−d_s)^{5/3} (Eqs. 3-1…3-9), solved by 5th-order RK with adaptive stepping, with the three subareas' outflows summed; infiltration offers Horton (integrated-form capacity with empirical recovery, Eqs. 4-1…4-14), Modified Horton tracking cumulative excess volume (Eqs. 4-15…4-25), Green-Ampt with a two-zone wetting front and K_s-derived recovery (Eqs. 4-26…4-39), and an incremental Curve-Number method tracking a regenerating storage state (Eqs. 4-40…4-51); groundwater is a two-zone unsaturated/saturated model with percolation f_U = K_s e^{−(φ−θ)HCO} and the A1/B1/A2/B2/A3 lateral-discharge equation (Ch. 5), snowmelt uses a temperature-index/heat-balance melt with cold content, areal depletion curves and free-water routing (Ch. 6), and RDII is a precomputed RTK triangular-unit-hydrograph convolution (Eqs. 7-1…7-8) with optional linear or exponential-decay initial abstraction (Eqs. 7-9…7-14). Critically for this project: the "uniform rain film" (all 2D cells receiving the mean gage rate) is **not** a hydrology-volume mechanism — it is the 2D module's `RAINFALL_MODE=SYSTEM` option (arithmetic mean of all gages applied uniformly to every mesh cell), documented only in Reference Volume II, Ch. 9 §9.8, where the manual warns that rain on the mesh double-counts the storm when subcatchments already deliver its runoff to the network (`NONE` exists for that reason); the hydrology volume never applies rain to 2D cells at all.
