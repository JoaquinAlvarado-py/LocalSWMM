# OpenSWMM 1D Hydraulics Engine — Technical Reference (Reference Manual Chapters 1–4)

**Source.** `/home/nekzoh/LocalSWMM/third_party/openswmm-engine/docs/manuals/reference/hydraulics/sections/` — `Chapter1-Overview.md`, `Chapter2-HydraulicModel.md`, `Chapter3-DynamicWave.md`, `Chapter4-KinematicWave.md`, read completely. All equation, figure, and table numbers below are the numbers printed in the manual. Verbatim quotes are in quotation marks. Items the manual itself leaves ambiguous or internally inconsistent are flagged inline with `> **Flag:**` and collected in the closing section.

---

## 1. The node–link conceptual model and state variables

**Object model (Ch. 1 §1.2).** The conveyance portion of a drainage system is "a network of Nodes and Links. Nodes are points that represent simple junctions, flow dividers, storage units, or outfalls. Links connect nodes to one another with conduits (pipes and channels), pumps, or flow regulators (orifices, weirs, or outlets)." SWMM "is a distributed discrete time simulation model" (§1.4) that advances a state vector over a sequence of time steps, eqs. (1-1) `X_t = f(X_{t-1}, I_t, P)` and (1-2) `Y_t = g(X_t, P)`.

**State variables (Ch. 1, Table 1-3).** For Flow Routing the manual lists exactly three:

| Variable | Description |
|---|---|
| *H* | Hydraulic head of water at a node |
| *Q* | Flow rate in a link |
| *A* | Flow area in a link — "Inferred from *Q*" |

"All other quantities can be computed from these variables, external inputs, and fixed input parameters." Internally, "all calculations are carried out using feet as the unit of length and seconds as the unit of time" (Ch. 1 §1.5).

**Network components (Ch. 2 §2.1).**
- **Junction nodes (§2.1.1):** points where links join. "Excess water at a junction can become partially pressurized when connecting conduits are surcharged and can either be lost from the system or be allowed to pond atop the junction and subsequently drain back into the junction." Inputs: invert elevation, height to ground, optional additional pressure head accepted before flooding, ponded surface area when flooded.
- **Outfall nodes (§2.1.2):** terminal nodes; stage boundary conditions are critical or normal flow depth in the connecting conduit, a fixed stage, a tidal table, or a stage time series; optional flap gate.
- **Flow dividers (§2.1.3):** cutoff, overflow, tabular, or weir diversion.
- **Storage units (§2.1.4):** "the only type of node that can provide storage volume and possess surface area", described by a surface-area-vs-height function or table. "Unlike other nodes, storage nodes are not allowed to pressurize (i.e., they always maintain a free surface)."
- **Conduits (§2.1.5):** pipes/channels of arbitrary closed or open shape; the offset "is maintained as an elevation"; slope computed from end invert elevations and offsets (eqs. 2-1 `Δx = √(L² − Δy²)`, 2-2 `S₀ = Δy/Δx`); "SWMM does not allow a slope of 0. Therefore it imposes a minimum value of 0.001 ft on *Δy*", overrideable by a user minimum-slope setting; Manning's equation relates flow to depth/friction slope.
- **Pumps (§2.1.6), flow regulators — orifices, weirs, outlets (§2.1.7), control rules (§2.1.8).**

**Analysis methods (Ch. 2 §2.2).** "SWMM's hydraulics solves the equations of one-dimensional, gradually varied, unsteady flow throughout a node-link network." "The hydraulics of unsteady non-uniform flow is represented in SWMM by a pair of partial differential equations of conservation of mass and momentum known as the St. Venant equations. Simultaneous solution of these equations for each conduit, coupled with a conservation of volume at each node, provides information on the spatial and temporal variation of water levels and discharge rates." Two principal methods: **dynamic wave** (complete St. Venant; channel storage, backwater, entrance/exit losses, culvert flow, flow reversal, pressurized flow; "comes at a price of having to use small time steps to maintain numerical stability") and **kinematic wave** (continuity + uniform-flow rating; cannot account for backwater, losses, flow reversal, pressurization; much larger time steps), plus a steady-flow option. Table 2-1 compares features. Kinematic-wave applicability limits (five items, §2.2): (1) directed acyclic networks only; (2) junctions at most one outlet link, which must be a conduit; (3) divider nodes must have two outlet conduit links; (4) storage nodes may have any number of outlet links of any type; (5) upstream offsets ignored except at storage nodes.

**Boundary and initial conditions (Ch. 2 §2.3).** Boundary conditions: (1) hydraulic head at each outfall (required for dynamic wave only), (2) external inflow at nodes. Initial conditions: "The default is to set all these values to 0", with optional user initial heads/flows. "Any initial flow rate assigned to a conduit link is assumed to represent a uniform steady flow" — its depth is the Manning normal depth; from it an initial area, required for kinematic wave, is found. For dynamic wave, "if a non-storage, non-outfall node has not had an initial head assigned to it then it's initial head is set equal to the average elevation of the initial flow depths in the conduits that deliver flow into it."

---

## 2. Dynamic wave governing equations (Ch. 3 §3.1)

**St. Venant equations.** Continuity (3-1) and momentum (3-2), with *A* flow area, *Q* flow rate, *H = Z + Y* hydraulic head (*Z* = conduit invert elevation, *Y* = depth), *S_f* friction slope:

- Continuity: `∂A/∂t + ∂Q/∂x = 0` (3-1)
- Momentum: `∂Q/∂t + ∂(Q²/A)/∂x + gA·∂H/∂x + gA·S_f = 0` (3-2)

Assumptions: flow is one dimensional; pressure is hydrostatic; cos of bed-slope angle ≈ 1; "boundary friction can be represented in the same manner as for steady flow." Friction slope via Manning (3-3):

`S_f = (n/1.486)² · Q|U| / (A·R^{4/3})`

with *U = Q/A*, and "Use of the absolute value sign on the velocity term makes *S_f* a directional quantity (since *Q* can be either positive or negative) and ensures that the frictional force always opposes the flow."

**Combined momentum form.** Combining 3-1 with 3-2 (sidebar "Combining the Continuity and Momentum Equations": the convective term is rewritten `∂(Q²/A)/∂x = 2AU·∂U/∂x + U²·∂A/∂x`; continuity multiplied by *U* and substituted) yields the form the finite-difference solution actually uses (3-4):

`∂Q/∂t = 2U·∂A/∂t + U²·∂A/∂x − gA·∂H/∂x − gA·S_f` (3-4)

**Node-assembly continuity.** "Each 'node assembly' consists of the node itself and half the length of each link connected to it. Conservation of flow for the assembly requires that the change in volume with respect to time equal the difference between inflow and outflow" (3-5):

`∂V/∂t = (∂V/∂H)(∂H/∂t) = A_S·∂H/∂t = ΣQ` (3-5)

where *A_S* = node assembly surface area, *ΣQ* = net flow into the assembly (inflow − outflow, cfs), including externally imposed inflows. "A continuous water surface is assumed to exist between the water elevation at a node and in the conduits that enter and leave it. Two types of nodes are possible. Non-storage junction nodes are assumed to be points with zero volume and surface area while storage nodes (such as ponds and tanks) contain both volume and surface area." (Figure 3-1.)

The assembly surface area is the node's own storage surface area *A_SN* plus the surface area contributed by the connected links, Σ*A_SL* (each link contributes its half-length portion). Hence the nodal continuity equation (3-6):

`∂H/∂t = ΣQ / (A_SN + ΣA_SL)` (3-6)

"The flow depth at the end of a conduit connected to a node can be computed as the difference between the head at the node and the invert elevation of the conduit."

In short: **momentum is solved at links (3-4), continuity is solved at nodes (3-6); the two are coupled through the node heads acting as link boundary conditions and the link flows summed at nodes.** "Equations 3-4 and 3-6 provide a coupled set of partial differential equations that solve for flow *Q* in the conduits and head *H* at the nodes."

---

## 3. Dynamic wave solution method (Ch. 3 §3.2)

**Finite differences.** Spatial and temporal derivatives are replaced by (3-7)–(3-11): `∂A/∂x = (A₂−A₁)/L`, `∂H/∂x = (H₂−H₁)/L`, `∂A/∂t = ΔĀ/Δt`, `∂Q/∂t = ΔQ/Δt`, `∂H/∂t = ΔH/Δt`, where *ΔĀ = Ā^{t+Δt} − Ā^t*, *ΔQ = Q^{t+Δt} − Q^t*, *ΔH = H^{t+Δt} − H^t* (superscripts = time periods).

**Link momentum — finite-difference form (3-12):**

`ΔQ/Δt = 2Ū·ΔĀ/Δt + Ū²·(A₂−A₁)/L − gĀ·(H₂−H₁)/L − gη²·Q|Ū|/R̄^{4/3}` (3-12)

with *η = n/1.486* and *A, U, R* replaced by their conduit-length averages (overbars).

**Node continuity — finite-difference form (3-13):**

`ΔH/Δt = ΣQ / (A_SN + ΣA_SL)` (3-13)

**Time integration.** "Previous versions of SWMM used an explicit forward Euler method (or more precisely the two-step Modified Euler method)" — known values at time *t* solve for *Q* at *t+Δt*, then eq. 3-13 solves for *H*. "SWMM 5 uses an implicit backwards Euler method instead to provide improved stability (Ascher and Petzold, 1998)." Equation 3-12 is rewritten as (3-14):

`Q^{t+Δt} = ( Q^t + ΔQ_inertia + ΔQ_pressure ) / ( 1 + ΔQ_friction )` (3-14)

with

- Inertial term (3-14a): `ΔQ_inertia = 2Ū·(Ā^{t+Δt} − Ā^t) + Ū²·(A₂−A₁)/L·Δt`
- Pressure term (3-14b): `ΔQ_pressure = −gĀ·(H₂−H₁)/L·Δt`
- Friction term (3-14c): `ΔQ_friction = gη²·|Ū|·Δt / R̄^{4/3}`

"and now *H* and the quantities *A*, *Ā*, *Ū*, and *R̄* derived from it are all evaluated at the new time *t+Δt*."

**Node heads — trapezoidal form.** "The finite difference form of the nodal continuity equation 3-12 can be expressed as" (3-15a):

`H^{t+Δt} = H^t + ( (Δt/2)( ΣQ^t + ΣQ^{t+Δt} ) ) / ( (A_SN + ΣA_SL)^{t+Δt} )` for non-outfall nodes (3-15a)

`H^{t+Δt} = H_Outfall` for outfall nodes (3-15b)

Note: the **node-head update is trapezoidal** — the average of the net flows at *t* and *t+Δt* — while the **link-flow update is implicit backwards Euler**. The manual does not itself use the term "Crank–Nicolson"; the phrase "trapezoidal head update" appears in §3.5. *H_Outfall* "can be a constant value, a value extracted from a user-supplied time series, or the elevation of the critical or normal flow depth in the connecting conduit."

**Iterative solution (Picard / successive approximations).** "Equations 3-14 and 3-15 can be solved implicitly over a given time step *∆t* using functional iteration (also known as successive approximations or Picard's method)." The sidebar "Dynamic Wave Solution Procedure" gives the steps:

1. Let *Q^{last}*, *H^{last}* be the flows/heads at time *t* (user ICs at time 0).
2. Solve 3-14 for each link → *Q^{new}*, with *A, Ā, Ū, R̄* based on *H^{last}*.
3. Relax: `Q^{new} = (1−θ)·Q^{last} + θ·Q^{new}`.
4. Compute *H^{new}* at each node from 3-15, using *Q^{new}* for *Q^{t+Δt}* and *H^{last}* to evaluate *A_S^{t+Δt}*.
5. Relax: `H^{new} = (1−θ)·H^{last} + θ·H^{new}`.
6. If *H^{new}* is close enough to *H^{last}* at each node, stop with *Q^{new}*, *H^{new}*; otherwise set *H^{last}* = *H^{new}*, *Q^{last}* = *Q^{new}* and return to step 2.

Sidebar notes: "The relaxation factor *θ* is set to 0.5." "The convergence tolerance and maximum number of trials can be set by the user. Their default values are **0.005 feet and 8**, respectively." "For links whose end node heads have already converged, steps 2 and 3 can be skipped and *Q^{new}* can be set equal to *Q^{last}*."

"Because flows and heads are updated one conduit and node at a time and not simultaneously, the results at each time step are invariant to the order in which the conduits and links are evaluated. This allows Steps 2 and 4 of the solution procedure to be implemented using separate threads running in parallel on multi-processor computers."

---

## 4. Dynamic wave computational details (Ch. 3 §3.3)

### 4.1 Average cross-section properties (§3.3.1)

End flow depths from end heads (3-16):

`Y₁ = 0 for H₁ ≤ Z₁;  H₁ − Z₁ for Z₁ < H₁ ≤ Z₁ + Y_full;  Y_full for H₁ > Z₁ + Y_full` (3-16)

(analogously for *Y₂*). "Values of *Ā* and *R̄* are computed from the conduit's cross section geometry at the average flow depth Ȳ = (Y₁+Y₂)/2. ... The average velocity *Ū* is found by dividing the most current flow value *Q^{last}* by the average area *Ā*." Formulas for geometry are in Chapter 5.

**Froude number and upstream weighting.** "In addition, the average area and hydraulic radius used in the pressure and friction terms of equation 3-14 are upstream weighted to reflect how close a conduit's flow is to being supercritical. Supercritical flow is influenced only by upstream conditions (i.e., wave disturbances propagate only in the downstream direction)." Froude number (3-17):

`Fr = |Ū| / √( gĀ/W̄ )` (3-17)

(*W̄* = top water surface width at Ȳ; "Fr is set to 0 for closed conduits flowing full"). A factor *σ* (3-18):

`σ = 1 for Fr ≤ 0.5;  2(1−Fr) for 0.5 < Fr < 1;  0 for Fr ≥ 1` (3-18)

which modifies the average area and hydraulic radius in the pressure (3-14b) and friction (3-14c) terms (3-19), (3-20):

`Ā′ = A₁ + σ(Ā − A₁)` (3-19)
`R̄′ = R₁ + σ(R̄ − R₁)` (3-20)

where *A₁, R₁* are the area and hydraulic radius at the upstream flow depth *Y₁*.

### 4.2 Surface area calculations, Table 3-1, minimum area (§3.3.2)

"Under normal conditions the surface area that a conduit contributes to its upstream node (*A_SL1*) is the average top width of the water surface over the upstream half of the conduit times half of the conduit's length" (3-21):

`A_SL1 = ( ( W(Y₁) + W(Ȳ) ) / 2 ) · ( L / 2 )` (3-21)

with `Ȳ = (Y₁+Y₂)/2`; "A similar expression applies to the downstream surface area *A_SL2*."

Because of pipe-invert discontinuities at manholes, free-fall conditions, and dry conduit ends during filling/draining, adjustments to assigned depths and surface areas are needed (Figure 3-2, four cases). **Table 3-1 "Surface area adjustments for various dynamic wave flow conditions"** (transcribed; *E₁*/E₂ = upstream/downstream **node** invert elevations, *Z₁*/*Z₂* = upstream/downstream **conduit** invert elevations, *Y\** = smaller of critical depth and normal depth at the current conduit flow rate):

| Condition | Criteria | Adjustments |
|---|---|---|
| Upstream Dry | Y₁ = 0; Z₁ > E₁ | A_SL1 = 0 if H₂ ≤ Z₁; otherwise use Upstream Critical adjustment |
| Downstream Dry | Y₂ = 0; Z₂ > E₂ | A_SL2 = 0 if H₁ ≤ Z₂; otherwise use Downstream Critical adjustment |
| Upstream Critical | Q < 0; Z₁ > E₁; H₁ − Z₁ < Y* | Y₁ = Y*; H₁ = Y* + Z₁; A_SL1 = 0; A_SL2 = L·(W̄ + W₂)/2 |
| Downstream Critical | Q > 0; Z₂ > E₂; H₂ − Z₂ < Y* | Y₂ = Y*; H₂ = Y* + Z₂; A_SL2 = 0; A_SL1 = L·(W̄ + W₁)/2 |

Note 4 of Table 3-1: "Adjusted *H* values are only used in the flow updating Equation 3-14 and do not replace nodal head values." (Critical/normal-depth procedures are in Chapter 5.)

**Minimum surface area.** "Finally, to guard against the nodal head change formula 3-15 from becoming unbounded as surface area becomes vanishingly small, a global minimum surface area *A_Smin* is imposed as follows" (3-22):

`A_S = max( A_Smin, A_SN + ΣA_SL )` (3-22)

"Its default value is 12.56 sq ft (i.e., the area of a 4-ft diameter manhole) which can be overridden by the user. This is strictly a computational device and does not add volume to a junction node (where *A_SN = 0*) nor change it into a storage node."

### 4.3 Inertial damping (§3.3.3)

Two options. (a) Use the *σ* factor of 3-18 to damp the inertial term *ΔQ_inertia* in the flow updating formula 3-14 — "As seen by equation 3-18, the factor is 1 for Froude numbers up to 0.5, 0 for Froude numbers at 1 or higher, and varies linearly in between. The damping factor σ is computed and applied on a conduit by conduit basis." (Referenced to Fread et al. 1996, "Local Partial Inertia" technique.) (b) Ignore the inertial term completely — the "local inertial formulation" (de Almeida and Bates, 2013), dropping only the convective acceleration `∂(Q²/A)/∂x`, so *ΔQ_inertia = 0* everywhere. The manual is explicit that this "is not the same as the diffusion wave formulation which also drops the local acceleration term `∂Q/∂t` of the momentum equation as well."

### 4.4 Flow limitations (§3.3.4)

"Each time a new flow is computed using Equation 3-14 it is checked to see if it should be limited by the normal flow value for the upstream flow depth and conduit slope." Criteria (all must hold): (1) computed flow positive; (2) "The conduit is not flowing full."; (3) "The conduit does not fall into any of the categories listed in Table 3-1 (upstream / downstream dry or upstream / downstream critical)."; (4) "The water surface slope is less than the conduit's slope or the flow's Froude number based on upstream velocity and depth is greater than 1" — "The last criterion can be limited to just slope, just Froude number or either slope or Froude number as a program option." When all criteria hold the flow is limited to the Manning normal flow (3-23):

`Q_norm = ( 1.49 / n ) · A₁ · R₁^{2/3} · √S₀` (3-23)

(*S₀* = conduit slope). Two other limits: a user-assigned upper flow limit, and "If the conduit contains a flap gate and the computed flow is negative then the flow is set to 0."

### 4.5 Surcharge conditions — the EXTRAN algorithm (§3.3.5)

**Definition.** "SWMM defines a node to be in a surcharged condition when all conduits connected to it are full or when the node's water level exceeds the crown of the highest conduit connected to it (see Figure 3-3). It should be noted that surcharged (or pressurized) flow can occur in a closed conduit without either of its end nodes being surcharged."

When a node surcharges, "there is no more volume available in the conduits forming the node's assembly to absorb the difference between inflow and outflow at the node. Thus `∂V/∂t` in the flow continuity Equation 3-5 is 0 and the surcharged nodal continuity condition becomes" (3-24):

`ΣQ = 0` (3-24)

"By itself, this equation is insufficient to update nodal heads at the new time step since it only contains flows. In addition, because the flow and head updating equations for the system are not solved simultaneously, there is no guarantee that the condition will hold at the surcharged nodes after a flow solution has been reached."

**Perturbation (Newton) form (3-25), (3-26).** "To enforce the surcharge flow continuity condition, it can be expressed in the form of a perturbation equation":

`Σ[ Q + (∂Q/∂H)·ΔH ] = 0` (3-25)

"where *∆H* is the adjustment to the node's head that must be made to achieve a flow balance. Solving for *∆H* yields":

`ΔH = −ΣQ / Σ(∂Q/∂H)` (3-26)

"where the summations are made over all conduits that are connected to the node in question."

**The flow gradient (3-27).** "The gradient of flow in a conduit with respect to the head at either end node can be evaluated by differentiating the flow updating equation 3-14 resulting in":

`∂Q/∂H = ( −gĀ·Δt / L ) / ( 1 + ΔQ_friction )` (3-27)

"The numerator of *∂Q/∂H* has a negative sign in front of it because when evaluating ΣQ flow directed out of a node is considered negative while flow into the node is positive. It is computed for each link at the same time that the link's flow is updated at Step 2 of the iterative process described in Section 3.3. The surcharge equation 3-26 is analogous to the head updating formula used in the Hardy Cross method for pressurized water distribution networks (Bhave, 1991)."

**Surcharge head update (3-28).** "To accommodate node surcharging, Step 4 of the iterative process that updates a node's head is modified as follows. First the node is checked to see if it is in a surcharged state, i.e., that it is not a storage or outfall node and has *H^{last}* greater than the top of the highest connecting conduit *H_crown*. If it is not surcharged then Equation 3-15 is used as before to update its head. Otherwise the following modified form of Equation 3-26 is used to estimate the new head *H^{new}* for time *t + ∆t*":

`H^{new} = H^{last} + α·ΣQ^{new} / [ (1−β)·Σ(∂Q/∂H)^{last} + β·A_S^{last}/Δt ]` (3-28)

with *α* = 0.6 for upstream terminal nodes with only outflow links and 1.0 otherwise; *β* = exp(−15.0·f_H); *f_H* = (H^{last} − E)/((H_crown − E) − 1); *H_crown* = elevation of the crown of the node's highest connecting flowing conduit (ft); *E* = elevation of the node's invert (ft); *A_S^{last}* = surface area of the node the last time it was not surcharged (ft²).

Verbatim behavior notes: "The *α* factor is used to reduce oscillations in head at upstream terminal nodes that have only outflow links (Roesner et al., 1992). The *β* factor helps to reduce fluctuations in head when the node first begins to surcharge (Roesner et al., 1980). At low surcharge depths it makes the denominator in the head update formula be a weighted combination of the pure surcharge formula 3-26 and the surface area formula 3-15. By the time that the water level rises 25% above the highest conduit, the equation is 98% pure surcharge."

Data flow and relaxation: "The flow values used for *ΣQ* are the new flow estimates found from Step 3 of the solution procedure. The *∂Q/∂H* values are those that were last evaluated at Step 2. And finally, empirical testing has shown that more robust performance is obtained when under-relaxation is not applied to *H^{new}* at Step 5 of the solution procedure when surcharging occurs."

> **Flag (manual ambiguity in eq. 3-28):** With the printed *f_H = (H^{last}−E)/((H_crown−E) − 1)*, at the instant a node just surcharges (*H^{last} = H_crown*) one has *f_H = (H_crown−E)/((H_crown−E)−1) > 1*, so *β = exp(−15·f_H) ≈ 0* — the blend is effectively pure-surcharge form at *every* surcharge depth. That contradicts the accompanying text, which says β moderates the transition when the node "first begins to surcharge" and that "at low surcharge depths" the denominator is still a blend toward the surface-area form. A fractional-excess reading such as *f_H = (H^{last} − H_crown)/(H_crown − E)* would reproduce the text exactly (β = 1 at the crown; β = exp(−15·0.25) ≈ 2% at 25% excess, i.e. 98% pure surcharge). The manual does not reconcile the printed formula with the text.

### 4.6 Preissmann slot — static (§3.3.6)

"As an alternative to the surcharge algorithm described in the previous section, SWMM can utilize the Preissmann Slot Method (Cunge and Wegner, 1964) for handling pressurized flow in closed conduits. In this case the conduit's cross-section is assumed to have a thin open slot at its top which runs down its length. This permits the water level in the conduit to exceed its full depth while only slightly increasing its flow area. It thus becomes possible to compute a surface area contribution to the conduit's end nodes once it reaches full depth. As a result, SWMM is able to use its regular procedure for solving the open channel flow equations 3-14 and 3-15 for all flow conditions without having to resort to the surcharge algorithm."

Ideal celerity-based slot (3-29): `w_slot = gA / c²`, where *c* is the pressure-wave speed ("typically ranges from a few hundred to several thousand ft/sec"). SWMM uses "a modified version of a formula proposed by Sjőberg (1982)" (3-30):

`w_slot / W_max = 0.5423 · exp( −( Y/Y_full )^{2.4} )` (3-30)

"where *W_max* is the conduit's maximum width, *Y_full* is its full depth, and *Y* is depth of flow. This equation applies to *Y/Y_full* values between 0.985257 and 1.7. Below this range the slot is not used while above it the slot width relative to *W_max* is clamped at 0.01. The range's lower limit was chosen so that the width computed from equation 3-30 is the same as the width across a circular pipe at that flow depth. This helps produce a smooth transition between open channel and pressurized flow regimes."

"When the slot method is employed, equation 3-16 is modified so that *Y* is no longer limited by *Y_full*. When *Y* reaches the limit at which the slot formula applies, its resulting width is used to compute the surface area that a conduit contributes to its end nodes as described in Section 3.3.2. It also contributes to the conduit's flow area when it rises above the full depth. It is not used when computing the conduit's hydraulic radius."

### 4.7 Flooding and ponding (§3.3.7)

Each non-outfall node is assigned a maximum allowable head *H_max* by the user: "It consists of both a maximum free water surface elevation that can exist at the node plus an optional 'surcharge' depth that allows for pressurization." Examples: manhole → ground surface elevation; storage unit → elevation when full; pipe-fitting junction → top of highest pipe, with possibly a large surcharge depth to allow pressurization.

"Normally when the new head estimate *H^{new}* at a node computed at Step 5 of the iterative solution process exceeds *H_max* it is set equal to *H_max* and the node becomes flooded." Overflow rate = average net flow over the time step (3-31):

`Q_ovfl = 0.5 · ( ΣQ^t + ΣQ^{t+Δt} )` (3-31)

"This flow is then lost from the system, the same as the flow entering a terminal outfall node."

**Ponding.** "The option exists for a junction node with no surcharge depth (and thus always maintaining a free surface) to have excess flooded water pond atop the node (see Figure 3-4)." The user assigns a "ponded area" *A_P* that "creates a virtual storage area on top of the node and *H^{new}* is no longer limited to *H_max*". When *H^{new}* exceeds *H_max*, "the ponded node is treated as a normal storage node whose head is updated using the normal, non-surcharge formula Equation 3-15 with *A_SN = A_P*." Exception: "when the node transitions between having a head below *H_max* to a flooded head above *H_max* (or vice versa) within a time step" the updated head "is restricted to be just a small value above *H_max* (or below it in the opposite case) to avoid wide swings in head during the transition." Ponded water is not lost: "The ponded depth above the node will rise during periods of flow excess (i.e., inflow greater than outflow) and fall during periods of flow deficit." A larger ponded area gives smaller depth changes for a given flow excess/deficit.

### 4.8 Summary of special conditions (§3.3.8)

Seven items: (1) Froude-based upstream weighting of *Ā* and *R̄* in the pressure/friction terms of 3-14 (§3.3.1); (2) optional Froude-based inertial damping (§3.3.3); (3) surface-area modification for critical/dry conditions in 3-15 (Table 3-1, §3.3.2); (4) flow limited to Manning normal flow when warranted (§3.3.4); (5) if the Surcharge Algorithm is used, 3-15 is replaced by eq. 3-28 when a node is surcharged (§3.3.5); (6) if the Slot Method is used, no adjustment to 3-15 is necessary (§3.3.6); (7) a ponded node uses a virtual constant-area storage unit with eq. 3-15 above *H_max*; otherwise head is capped at *H_max* and excess inflow is lost (§3.3.7).

### 4.9 Dynamic Preissmann slot (§3.3.9) — OpenSWMM addition

A third surcharge treatment selected with `SURCHARGE_METHOD`: `EXTRAN` (default, the algorithm of §3.3.5), `SLOT` (static slot, §3.3.6), `DYNAMIC_SLOT`. Based on Sharior, Hodges & Vasconcelos (2023). "Under this method the slot's cross-sectional area evolves in time as an element of transient storage, and the modeler specifies the maximum pressure-wave celerity directly."

- Preissmann number (3-36): `P = c_pT / c_p` (ratio of target to current pressure celerity). "P equals 1 when a conduit has been pressurized long enough for its pressure waves to travel at the full target celerity, and exceeds 1 during the transition through the mixed-flow interface."
- Slot top width (3-37): `T_s = g·A_full / c_pT² · P²` — "reduces to the classical celerity-based slot width (compare Equation 3-29) when *P* = 1."
- Incremental stored slot area (3-38): `A_s ← max( A_s + T_s·Δh_s, 0 )`, with *h_s = max(Ȳ − Y_full, 0)*. "Each increment of slot storage is created at the slot width in force at the time it accumulates; previously stored contributions to *A_s* are never rewritten as *P* subsequently decays. This path-dependent accumulation is what prevents the energy amplification ('slot squeezing')..." If head falls below the crown while area remains, "the surcharge head is held at zero and the remaining area drains through subsequent negative increments, providing the depressurization hysteresis."
- While a slot is active: flow area = *A_full + A_s*; top width = *T_s*; surface area contributed to a surcharged end node = *T_s·L/4* ("the value Equation 3-21 produces for a uniform width *T_s*"); "The hydraulic radius remains at its full-conduit value so that, as with the static slot, the slot contributes storage but not friction." "Because the slot supplies a genuine surface area at every depth, nodal heads continue to be updated with the ordinary free-surface formula 3-15 at all times; the surcharge branch of Equation 3-28 is never invoked, and the piezometric head above the crown emerges naturally as invert + *Y_full* + *h_s*."
- Time evolution of *P* (3-39): `P̂₀ = max( c_pT/(α_s·c_g), 1 )`, `c_g = √(g·A_full/W_max)` (α_s = user surcharge shock parameter); exponential decay (3-40): `P̂(t) = 1 + (P̂₀ − 1)·exp( −10(t − t_s)/r )` (*t_s* = time conduit last surcharged, *r* = decay time scale); spatial smoothing once per routing step by averaging *P̂* over the conduits incident to each node and taking each conduit's working *P* as the mean of its two end-node averages (3-41): `P = max( (⟨P̂⟩₁ + ⟨P̂⟩₂)/2, 1 )`.
- Variable-time-step interaction (3-42): the Courant check for a surcharged conduit uses `c_p = c_pT/P`: `Δt ≤ L / (|Ū| + c_pT/P)`.
- Options: `DPS_CELERITY` (default 25.0, target celerity in m/s regardless of project unit system, converted internally), `DPS_ALPHA` (3.0; values below 2 raised to 2), `DPS_DECAY_TIME` (0.5 s). Implemented in `applyDPSGeometry`, `updateDPSState`, `spatialSmoothP`, `getLinkStep` in `DynamicWave.cpp`; option parsing in `SimulationOptions.hpp` / `OptionsHandler.cpp`.

### 4.10 Virtual junctions (§3.3.10) — OpenSWMM addition

Motivation: a conduit grade change must be split at a junction; an ordinary junction (a) floors surface area at *A_Smin* (3-22), adding artificial storage that "smears transients", and (b) breaks momentum transmission (the node acts as "a small stagnation volume"). A virtual junction removes both artifacts for two collinear conduits of identical cross-section meeting at a grade break. Declared in a `[VIRTUAL_JUNCTIONS]` section (name + invert elevation only); all other geometry is derived; in reports it "appears as an ordinary junction whose stored volume is identically zero." Eligibility rules (enforced at input processing): exactly two links, both conduits; identical cross-sections (shape, dimensions, shape-curve ref, number of barrels; Manning roughness may differ); both offsets at the node zero with continuous invert; no lateral inflow of any kind (external/DWF/RDII/subcatchment/LID/2D coupling); routing method is dynamic wave (or finite-volume, which consumes it as an ordinary interior face). Violations are input errors.

**Continuity treatment.** "A virtual junction is a sealed, zero-storage node. Its head is updated with the free-surface formula 3-15 using the natural half-link surface area contributed by its two conduits, without the minimum surface-area floor of Equation 3-22 — the floor is precisely the artificial storage the feature removes, while the natural link area is the correct linearization of the adjacent conduits' own storage response." When the natural area vanishes (dry pair, or fully surcharged pair with small slot width) the update "falls back to a pure flow-balance (zero-storage) form of the surcharge update, Equation 3-28 with *α* = 1 and no surface-area floor, including the *β* crown-proximity blending". At convergence `ΣQ = 0` at the node. "The node is sealed: its head may rise above the pipe crown without bound (like a manhole with a bolted cover), it can never flood or pond, and its committed volume and overflow are identically zero."

**Momentum treatment.** For a through pair (one conduit entering, one leaving), the downstream conduit's upstream-weighted area and hydraulic radius (3-19, 3-20) take the upstream conduit's mid-reach values as their upwind state — "carrying the advected momentum state across the node instead of restarting it." With `VIRTUAL_JUNCTION_MOMENTUM FULL` (default `BASIC`) an extra convective correction is added to *ΔQ_inertia* of both conduits (3-43):

`ΔQ_j = Δt·σ_j·( (Ū²Ā)_dn − (Ū²Ā)_up ) / Λ,   Λ = (L_up + L_dn)/2` (3-43)

with *σ_j* a damping factor of the form of 3-18 evaluated from the through-flow Froude number; the correction vanishes when the two conduits do not carry flow the same way through the node. Sag/peak pairs (both conduits into, or out of, the node) get the zero-storage continuity treatment but not the directional momentum coupling. The pair is always solved together (not frozen by the converged-node bypass); a pair-level Courant check `Λ/(|Ū| + c)` is added. A discrete momentum residual per through pair is accumulated at the end of every routing step (3-44): `R_j = (Q²/A)_up − (Q²/A)_dn + gĀ(Y_up − Y_dn)`, reported as max/mean in a Virtual Junction Summary. Modeling guidance: intended for small-deflection grade breaks; plan-view bends should remain regular junctions with loss coefficients. A long conduit may be subdivided with virtual junctions to increase spatial resolution "without accumulating the artificial nodal storage that the same subdivision with regular junctions would introduce."

---

## 5. Numerical stability, CFL, variable time step (Ch. 3 §3.4)

**Instability indicators.** "Numerical instability is characterized by oscillations in flow and water surface elevation that do not dampen out over time. Another indicator of numerical instability is a node which continues to 'dry up' on each time-step despite a constant or increasing inflow from upstream sources." Two Status Report metrics: overall flow continuity error ("If this number is greater than 5 to 10 percent then the cause may be numerical instability"); and the link Flow Instability Index (FII) — "counts the number of times that the flow value in a link is higher (or lower) than the flow in both the previous and subsequent time periods", normalized, ranging 0–150; the five highest-FII links are reported, but "the FII does not take into account the magnitude of the flow fluctuations."

**Courant condition.** "Stable explicit solutions of the St. Venant equations require that the time step be no longer than the time it takes for a dynamic wave to travel the length of the conduit (Cunge et al., 1980). This is known as the Courant-Friedrichs-Lewy (CFL) condition" (3-30 of §3.4):

`Δt ≤ L / |Ū + c|` (3-30)

with celerity (3-31 of §3.4):

`c = √( g·Ā/W̄ )` (3-31)

"An equivalent form of this condition" (3-32 of §3.4): `Δt ≤ (L/|Ū|)·(Fr/(1+Fr))·Cr`, *Fr* from eq. 3-17, *Cr* the Courant number ("adjustment parameter that determines how conservative (*Cr* < 1) or liberal (*Cr* > 1) one wishes to be in strictly meeting the CFL condition (*Cr* = 1)").

Why an implicit-but-elementwise scheme still obeys CFL: "Although the SWMM 5 solution method uses an iterative implicit procedure in time to update flows and heads, it does so one conduit and node at a time, not simultaneously. There is no spatial coupling between elements as would occur in an unconditionally stable implicit solution scheme. Thus the CFL condition would still apply but perhaps not as strictly (by allowing one to use a *Cr* value greater than 1)."

**Short-conduit lengthening.** "An option is available to artificially lengthen short conduits so that the CFL condition for a given user-supplied time step *∆t* is met" (3-33):

`L′ = max{ L, Δt·( √(g·Y_full) + Q_full/A_full ) }` (3-33)

with *Q_full* the Manning normal flow (eq. 3-23) at full depth and *A_full* the full-depth flow area. Slope and roughness are adjusted to preserve equal head loss for any given flow (3-34), (3-35): `S₀′ = S₀·√(L/L′)`, `n′ = n·√(L/L′)`. "The conduit lengthening option is applied to all conduits whenever the user supplies a non-zero value for the 'lengthening' time step to be used in equation 3-33. This time step does not have to be the same as the computational time step."

**Variable time step.** User supplies *Δt_min*, *Δt_max*, and a desired Courant number *Cr*; the next step is the smaller of (1) the smallest value of `(L/|Ū|)·(Fr/(1+Fr))·Cr` over "all conduits with non-negligible Fr", and (2) the smallest value of `0.25·(H_crown − E)/ΔH^t` over "all non-outfall nodes that are not surcharged". "The second condition guards against an excessive change in node head over a single time step. Both conditions are evaluated using the flow and head solutions found at time *t* (*ΔH^t* is the change in head found from the prior time step)." The result is clamped to [*Δt_min*, *Δt_max*]; the initial step at time 0 is *Δt_min*.

Worked example (§3.4, Figures 3-5 to 3-7): a 2,000 ft long, 2 ft × 2 ft rectangular conduit at 0.05% slope, n = 0.015, 1-hr sinusoidal inflow peaking at 10 cfs. Divided into 10 × 200 ft sections → estimated stable step ≈ 25 s; as a single 2,000 ft section → 250 s; a fixed 120 s step on the 10-section model is completely unstable, while 120 s as the upper bound of a variable step is stable (range 24–120 s, average 42 s).

> **Flag (manual equation numbering):** the numbers **3-30 and 3-31 are each used twice** with different content — (a) static Preissmann slot, §3.3.6: eq. 3-29 `w_slot = gA/c²`, eq. 3-30 `w_slot/W_max = 0.5423·exp(−(Y/Y_full)^{2.4})`; (b) §3.4: eq. 3-30 `Δt ≤ L/|Ū+c|`, eq. 3-31 `c = √(gĀ/W̄)`; and eq. 3-31 also appears in §3.3.7 as `Q_ovfl = 0.5(ΣQ^t + ΣQ^{t+Δt})`. Also, the §3.4 numbering skips the later OpenSWMM equations 3-36…3-45 in a way that makes cross-references in the text (e.g. "Equation 3-30" for the slot) ambiguous without section context.

---

## 6. Semi-implicit node continuity (Ch. 3 §3.5) — OpenSWMM addition

**Option.** `NODE_CONTINUITY`: `EXPLICIT` (default) = "The classic two-branch formulation of Sections 3.2 and 3.3.5"; `SEMI_IMPLICIT` = "The unified formulation of Equation 3-45." The two-branch scheme is discontinuous at the crown: "below the crown a node's head advances with the free-surface continuity formula 3-15, and above it the surcharge formula 3-28 takes over. The switch between the two occurs exactly at the crown elevation, so the head-update operator is discontinuous there." The semi-implicit alternative is "a single-branch formulation."

**Derivation (verbatim):** "The semi-implicit formulation recognizes that the flows entering the head update of Equation 3-15 themselves depend on the head being solved for. Linearizing the net nodal flow about the current head estimate using the flow gradients of Equation 3-27, `ΣQ^{t+Δt} ≈ ΣQ + Σ(∂Q/∂H)ΔH`, and carrying the correction into the trapezoidal head update yields a single equation used at every non-outfall node regardless of its surcharge state":

```
H^{t+Δt} = H^t + ( (Δt/2)·( ΣQ^t + ΣQ^{t+Δt} ) )
                  / ( max( A_S + (Δt/2)·Σ(∂Q/∂H),  A_Smin ) )        (3-45)
```

"where *A_S* is the node assembly surface area of Equation 3-22 and the flow derivatives are those computed during the flow update, exactly as in Section 3.3.5. When the surface area dominates the denominator the update reduces to the ordinary free-surface formula 3-15; as a node approaches and passes through surcharge the flow-derivative term takes on the role that the surcharge formula 3-28 plays in the explicit scheme, with the minimum surface area *A_Smin* bounding the denominator from below. The under-relaxation of Step 5 of the solution procedure and the ponding rules of Section 3.3.7 apply unchanged."

"The practical consequence is that the head-update operator has no branch at the crown: a node passes into and out of surcharge through one smooth expression." This matters most in combination with Anderson acceleration (§3.6, whose validity depends on smoothness), and "it is the recommended node continuity setting for models containing virtual junctions (Section 3.3.10)." Implemented in `setNodeDepth` of `DWSolver` (`src/engine/hydraulics/DynamicWave.cpp`); option in `SimulationOptions.hpp`, parsed in `OptionsHandler.cpp`.

**The crux for the sign question** (see the dedicated section at the end): Eq. 3-45 as printed places a **plus** sign before `(Δt/2)·Σ(∂Q/∂H)` in the denominator. Each individual `∂Q/∂H` from eq. 3-27 is **negative** (the numerator `−gĀΔt/L` carries an explicit minus), so the signed sum `Σ(∂Q/∂H)` is negative. Whether the printed `+` should be read as "add the signed (negative) sum" or "add the magnitude" is **not stated** in §3.5, and the two readings give algebraically opposite effective signs. Section 3.3.5 is itself split on this: eq. 3-26 uses the signed negative sum (with an explicit minus in front of *ΣQ*), while eq. 3-28 only behaves as its surrounding text describes if the flow-gradient sum is taken as a positive magnitude. The manual never reconciles these.

---

## 7. Anderson acceleration of the iterative solution (Ch. 3 §3.6) — OpenSWMM addition

Enabled with `[OPTIONS] ANDERSON_ACCEL YES` (default NO). Motivation: the successive-approximation procedure of §3.2 "is a fixed-point (Picard) iteration: each pass applies the same head-update operator to the latest head estimates until no head changes by more than the convergence tolerance. Fixed-point iteration converges linearly, and the relaxation factor *θ* = 0.5 that damps each update stabilizes the iteration without improving its rate. In networks with many tightly coupled nodes the solver can consume its full trial allotment on nearly every routing step even under mild conditions."

Let *G* = the complete head-update operator for a node ("the continuity solve of Equation 3-15, 3-28 or 3-45 together with the under-relaxation of Step 5"), *H_k* = head estimate entering iteration *k*. Iteration residual (3-46): `r_k = G(H_k) − H_k`; convergence declared when |r_k| is within the head tolerance. Anderson acceleration of depth two ("equivalently, Aitken's secant update") blends the two most recent operator outputs; mixing coefficient (3-47):

`α_k = min( 1, max( 0, r_k·(r_k − r_{k−1}) / (r_k − r_{k−1})² ) )`

and the accepted iterate (3-48): `H_{k+1} = (1 − α_k)·G(H_k) + α_k·G(H_{k−1})`. "Clamping *α_k* to the interval [0, 1] restricts the update to interpolation between two already-computed, already-bounded operator outputs... no extrapolated head can be produced." The blend is applied per node, beginning with the second trial of each routing step. Mixed heads are committed "through the same routine as an ordinary update, so the node's volume, overflow and rate of depth change ... always describe the head actually accepted." Claimed effect: "reduces trial counts by roughly 25 to 50 percent per routing step on networks that otherwise iterate to the trial limit."

Safeguards: a residual-magnitude gate applies the blend only when `|r_k| ≤ 20ε` (*ε* = head tolerance); a mixed head that would be negative (below node invert) is discarded in favor of the plain iterate; nodes at which *G* is known non-smooth are excluded from mixing for the current trial. **Table 3-2 exclusions:**

| Condition | Applies when | Reason |
|---|---|---|
| Surcharged node | `SURCHARGE_METHOD EXTRAN` with `NODE_CONTINUITY EXPLICIT` | The head update switches from Equation 3-15 to Equation 3-28 at the crown. |
| Active dynamic slot | `SURCHARGE_METHOD DYNAMIC_SLOT`; node touches a conduit with *A_s* > 0 | The slot geometry of Section 3.3.9 is rewritten each iteration. |
| Near the static slot cutoff | `SURCHARGE_METHOD SLOT`; node touches a closed conduit with 0.98 ≤ Ȳ/Y_full ≤ 1.02 | The slot width of Equation 3-30 engages abruptly at the crown cutoff. |
| Weir or orifice at its crown | Upstream hydraulic grade line at or above the structure crown; both end nodes | The flow equation switches discontinuously. |
| Pump end nodes | Always; both end nodes of every pump | Pump on/off status is discrete. |

Note: "surcharged junctions are excluded only under the `EXPLICIT` node continuity formulation, whose update switches branches at the crown; under `SEMI_IMPLICIT` (Section 3.5) the unified update of Equation 3-45 is smooth through the surcharge transition and surcharged junctions remain eligible for acceleration — one reason the two options pair well."

Convergence criterion with acceleration: "a node is counted as converged only when both the plain residual `|G(H_k) − H_k|` and the accepted movement `|H_{k+1} − H_k|` are within the head tolerance. Testing accepted movement alone would let a blend that happens to land near the previous iterate declare convergence while the underlying flow balance is still unsatisfied; with acceleration disabled the two tests coincide and the criterion reduces exactly to that of Section 3.2."

---

## 8. Kinematic wave analysis (Ch. 4)

### 8.1 Governing equations (§4.1)

"The kinematic wave model is derived from a simplified form of the St. Venant equations that combines the continuity equation with the uniform flow equation. It cannot model pressurized flow, reverse flow, or backwater effects." "Most applicable to steeply sloped conduits subjected to long duration inflow hydrographs that produce shallow flow with high velocity."

Starting from the same St. Venant equations (4-1 continuity, 4-2 momentum, identical to 3-1/3-2), writing *H = Z + Y* and `∂Z/∂x = −S₀` gives (4-3):

`∂Q/∂t + ∂(Q²/A)/∂x + gA·∂Y/∂x = gA·(S₀ − S_f)` (4-3)

"If one assumes that the terms on the left hand side of Equation 4-3 are negligible one is left with" (4-4):

`S₀ = S_f` (4-4)

"Having the conduit's bottom slope equal the friction slope implies that the fluid motion caused by gravity is balanced by the frictional resistance to flow." With Manning (4-5):

`Q = A·R^{2/3}·√S₀ / η` (4-5)

(*η = n/1.486*; *R* an implicit function of area *A* for the cross-section). Defining *β = √S₀/η* and *Ψ = A·R^{2/3}* (the "section factor", Chow 1959) gives (4-6):

`Q = β·Ψ(A)` (4-6)

"For some closed conduit shapes, such as circular pipes, the section factor achieves a maximum value at a less than full flow area ... resulting in a maximum flow that is larger than when the conduit flows full." (Figure 4-1.)

The kinematic governing equations are therefore **continuity (4-1) plus the rating curve (4-6)**; dependent variables *Q* and *A*; ICs for *Q* or *A* at time 0, and a boundary condition at *x = 0* for all *t*.

### 8.2 Solution method (§4.2)

"A weighted Wendroff implicit finite difference scheme (Smith, 1978)" discretizes the continuity equation (4-7):

`[ (1−θ)(A₁^{t+Δt} − A₁^t) + θ(A₂^{t+Δt} − A₂^t) ]/Δt + [ (1−φ)(Q₂^t − Q₁^t) + φ(Q₂^{t+Δt} − Q₁^{t+Δt}) ]/L = 0` (4-7)

Subscripts 1/2 = upstream/downstream ends; *θ, φ* weights chosen between 0.5 and 1. The equation is applied "conduit by conduit starting at the most upstream node and working downstream"; the only unknowns are *A₂^{t+Δt}* and *Q₂^{t+Δt}*, because with at most one outflow conduit per junction, *Q₁^{t+Δt}* is known from the sum of already-computed upstream *Q₂^{t+Δt}* values plus external inflows, and *A₁^{t+Δt}* is found from the inverse section factor at *Q₁^{t+Δt}/β*.

Substituting the Manning equation 4-6 into 4-7 gives a nonlinear equation in the single unknown *A₂^{t+Δt}* (4-8):

`f( A₂^{t+Δt} ) = β·Ψ(A₂^{t+Δt}) + C1·A₂^{t+Δt} + C2 = 0` (4-8)

with (4-9), (4-10):

`C1 = L·θ/(Δt·φ)`
`C2 = (L/(Δt·φ))·[ (1−θ)(A₁^{t+Δt} − A₁^t) − θ·A₂^t ] + ((1−φ)/φ)·(Q₂^t − Q₁^t) − Q₁^{t+Δt}`

Solved "using a combination of bisection and Newton-Raphson methods (Press et al., 1992) with both *θ* and *φ* set to 0.6." Bracketing: seek `[A_LOW, A_HIGH]` with *f* of opposite sign; for shapes with a section-factor maximum below *A_full* (e.g., circular) "these two areas are tried first" then `0 to A_max`; for monotonically increasing section factors, `0 to A_full`. Then the Appendix A "Newton-Raphson-Bisection Root Finding Method" is used, initial estimate *A₂^t*, tolerance *ε* = 0.1% of *A_full*, derivative `f′(A) = β·Ψ′(A) + C1`. "If `[A_LOW, A_HIGH]` does not form a valid bracket then *A₂^{t+Δt}* is set to 0 if both *f(A_LOW)* and *f(A_HIGH)* are positive and set to *A_full* if both are negative."

### 8.3 Computational details (§4.3)

**8.3.1 Order of network traversal (§4.3.1).** "At time *t* each conduit is examined in its topologically sorted order when updating it to time *t + ∆t*." "The topological sort is performed just once, prior to time 0, using Kahn's algorithm (Cormen et al, 2009) after all links have been oriented in the direction of positive slope (meaning that the inflow end is at higher elevation than the outflow end)." "Nodes with more than a single outflow link (such as divider and storage nodes) will have those links appearing consecutively in the sorted list." If a loop is detected, "the program is terminated with an error condition reported."

**8.3.2 Cross-section properties (§4.3.2).** Requires the section factor `AR^{2/3}`, its derivative, the flow depth (reporting only), and the **inverse section factor** (area for a given section factor) used for the upstream area at upstream flow (details in Ch. 5 §5.1.8).

**8.3.3 Flow divider nodes (§4.3.3).** "A flow divider node splits its inflow between two outlet conduits in a prescribed manner. It is only active for kinematic wave analysis and is treated as a regular junction node under dynamic wave analysis." Four types — cutoff (diverts all inflow above *q_MIN*), overflow (diverts above the non-diversion conduit's capacity `Q_full = β·Ψ(A_full)`), tabular, and weir. Weir divider diverted flow (4-11):

`Q_div = 0 for Q_in ≤ q_MIN;  q_MAX·f^{1.5} for q_MIN < Q_in ≤ q_MAX;  Q_MAX·√f for Q_in > q_MAX`

with `q_MAX = c_W·h_W^{1.5}` and `f = (Q_in − q_MIN)/(q_MAX − q_MIN)`. When a conduit's upstream node is a divider, *Q_div* is computed from total inflow *Q_in*; if the conduit is the node's diversion link its inflow *Q₁^{t+Δt}* = *Q_div*, otherwise *Q₁^{t+Δt}* = *Q_in − Q_div*.

**8.3.4 Storage nodes (§4.3.4).** Kinematic wave allows a storage node to have more than one outlet link of any type. The storage mass balance (4-12):

`dV_N/dt = Q_in − Q_out`

with trapezoidal time integration (4-13):

`V_N^{t+Δt} = V_N^t + 0.5(Q_in^t + Q_in^{t+Δt})·Δt − 0.5(Q_out^t + Q_out^{t+Δt})·Δt`

Re-grouped (4-14) with known quantities in (4-15):

`V_N^{t+Δt} = C_N − 0.5·Q_out^{t+Δt}·Δt`,   `C_N = V_N^t + 0.5(Q_in^t − Q_out^t + Q_in^{t+Δt})·Δt`

Because both *Q_out^{t+Δt}* and *V_N^{t+Δt}* depend on head *H*, eq. 4-14 "must be solved in implicit fashion using successive approximations." The sidebar "Updating a Storage Node": (1) H_last = elevation at time *t*; (2) compute outflow-link flows from H_last → Q_out; (3) `V_N = C_N − 0.5·Q_out·Δt`, clamped between 0 and full volume; (4) H from V_N via the surface-area-vs-depth curve; (5) `H^{new} = (1−θ)H^{last} + θ·H` with **θ = 0.55**; (6) stop if `|H^{new} − H^{last}| < 0.005 ft`; (7) else set H_last = H^{new} and return to step 2.

After all link flows at *t+Δt* are found, the storage head is updated once more (4-17), (4-18):

`V_N^{t+Δt} = V_N^t + Q̄_net·Δt`,   `Q̄_net = 0.5(Q_in^t + Q_in^{t+Δt}) − 0.5(Q_out^t + Q_out^{t+Δt})`

then *H^{t+Δt}* from the surface-area-vs-depth curve. For conduit outflow links, upstream flow follows eq. 4-6 from the upstream area; upstream depth (4-16): `Y₁ = 0 for H ≤ Z₁;  H − Z₁ for Z₁ < H ≤ Z₁ + Y_full;  Y_full for H > Z₁ + Y_full`. Non-conduit outlets use their own rating curves (e.g., orifice `Q₁ = c·√(H − Z₁)`).

**8.3.5 Nodal heads (§4.3.5).** "Kinematic wave analysis does not depend on or even define the hydraulic head that exists at nodes that are not storage units." For reporting, "the head at a non-storage node is arbitrarily set equal to the highest water elevation in the links that are connected to it" (downstream-end elevation for inflowing conduits, upstream-end for outflowing). "Kinematic wave analysis ignores the presence of any offset that an outflow conduit at a non-storage node has at its upstream end" and "also ignores any surcharge depth ... since neither conduits nor nodes are allowed to pressurize."

**8.3.6 Flooding and ponding (§4.3.6).** "Normally any excess inflow to a node under kinematic wave analysis over what the outflow links can handle will be lost from the system." For non-storage, non-terminal nodes (4-19): `Q_ovfl^{t+Δt} = max(0, Q̄_net)`. For storage nodes (4-20): `Q_ovfl^{t+Δt} = max(0, Q̄_net − (V_Nfull − V_N^t)/Δt)`. When *Q_ovfl* is non-zero the reported head is the full-depth elevation. Ponding: if the junction/divider's ponded-area parameter is non-zero, the ponded volume is tracked (4-21): `V_P^{t+Δt} = max(0, V_P^t + Q̄_net·Δt)`, reported overflow (4-22): `Q_ovfl^{t+Δt} = max(0, (V_P^{t+Δt} − V_P^t)/Δt)`, and the flow added to the node's inflow next period is `V_P^{t+Δt}/Δt`. Note that for kinematic wave the ponded area parameter "does not enter into any computations" — only the zero/non-zero flag matters.

### 8.4 Numerical stability (§4.4)

"The authors of the original version of SWMM's kinematic wave routine applied the techniques of O'Brien et al. (1951) to show that the method was unconditionally stable for any choice of *θ* and *φ* both greater than 0.5 (Metcalf and Eddy et al., 1971a). Smith (1978, p. 188) showed that the Wendroff implicit scheme using centered differences (*θ* = *φ* = 0.5) was also unconditionally stable." Because it is stable it does not use the variable time step option. "Although it is stable, it is still subject to numerical dispersion when the Courant number differs from 1 and to numerical diffusion (hydrograph attenuation) due to the discrete grid size (Ponce, 1991)." Example (§4.4, Figure 4-3): the Chapter-3 conduit solved at a 120 s step is stable under kinematic wave, whereas dynamic wave needed ≈ 25 s; "The DW solution should be considered the more accurate one."

---

## 9. Consolidated flags: what the manual itself leaves ambiguous or inconsistent

1. **Eq. 3-28's β-blend does not match its own text.** With the printed *f_H = (H^{last}−E)/((H_crown−E)−1)*, *β = exp(−15·f_H)* is ≈ 0 at every surcharge depth (see the flag after §4.5), so the denominator is pure surcharge form even at the crown. The text describes β as moderating the "first begins to surcharge" transition and says the denominator is a "weighted combination" at low surcharge depths. The two are inconsistent; a fractional-excess form reproduces the text.
2. **Equation numbering collisions.** (3-30) and (3-31) are each used twice with different content (static slot in §3.3.6; CFL/velocity in §3.4); (3-31) also denotes *Q_ovfl* in §3.3.7. See the flag after §5.
3. **Sign convention of Σ(∂Q/∂H) in the denominators.** Eq. 3-26 requires the signed (negative) sum; eqs. 3-28 and 3-45 behave as described only with the sum taken as a positive magnitude. The manual states the sign of the *individual* gradient (eq. 3-27, negative) but never fixes the sign of the *sum* in the denominators. This is the central ambiguity behind the project's semi-implicit sign question — fully unpacked below.
4. **Terminology.** The manual's own term for the node-head scheme is "trapezoidal" (§3.5: "the trapezoidal head update"); it never uses "Crank–Nicolson" anywhere in Chapters 1–4. "Semi-implicit" as a node-continuity label appears only in §3.5 (OpenSWMM addition). The link-flow update is separately described as implicit **backwards Euler** (eq. 3-14), so the overall scheme is not a single θ-method.

---

### Semi-implicit sign convention

**The claim under review.** The project asserts that the semi-implicit (Crank–Nicolson) node depth update should be `dH = dV / (A + 0.5*dt*sumdqdh)` with a **plus** sign, and that the engine code "currently has a minus." The task is to check the manual (primarily §3.3.5, eqs. 3-25/3-26/3-27, and §3.5, eq. 3-45).

**What the manual prints — the depth-update equation (§3.5, eq. 3-45), verbatim structure:**

`H^{t+Δt} = H^t + ( (Δt/2)( ΣQ^t + ΣQ^{t+Δt} ) ) / ( max( A_S + (Δt/2)Σ(∂Q/∂H),  A_Smin ) )` (3-45)

The **plus sign is printed in the manual** in front of `(Δt/2)Σ(∂Q/∂H)`. The manual states the flow derivatives in this equation are "the flow gradients of Equation 3-27" and "are those computed during the flow update, exactly as in Section 3.3.5."

**What the manual prints — the flow gradient (§3.3.5, eq. 3-27), verbatim structure:**

`∂Q/∂H = ( −gĀ·Δt / L ) / ( 1 + ΔQ_friction )` (3-27)

with this explicit sign statement, quoted verbatim: "The numerator of *∂Q/∂H* has a negative sign in front of it because when evaluating ΣQ flow directed out of a node is considered negative while flow into the node is positive."

**What the manual prints — the two equations that surround it (§3.3.5):**

`Σ[ Q + (∂Q/∂H)·ΔH ] = 0` (3-25)
`ΔH = −ΣQ / Σ(∂Q/∂H)` (3-26)
`H^{new} = H^{last} + α·ΣQ^{new} / [ (1−β)·Σ(∂Q/∂H)^{last} + β·A_S^{last}/Δt ]` (3-28)

**The sign bookkeeping.** By eq. 3-27, each individual `∂Q/∂H` is **negative** (the numerator carries an explicit minus; the manual's sentence explains it via the "out = negative, in = positive" convention of ΣQ). Therefore the signed sum `Σ(∂Q/∂H)` is negative. Two consistent readings of eq. 3-45's denominator are then possible:

- **Signed-sum reading** (Σ(∂Q/∂H) = the negative sum of the eq. 3-27 quantities): the printed denominator is `A_S + (Δt/2)·(negative sum)` = `A_S − (Δt/2)·|Σ(∂Q/∂H)|`. In terms of a positive magnitude, the printed equation is `A − 0.5·dt·|Σ|`.
- **Magnitude reading** (Σ(∂Q/∂H) := sum of magnitudes, positive): the printed denominator is `A_S + (Δt/2)·|Σ(∂Q/∂H)|` = `A + 0.5·dt·|Σ|`.

**The manual never states which reading applies to eq. 3-45.** §3.5 says only that the gradients come "from Equation 3-27" (whose signed value is negative) and that the denominator is "bounded from below" by *A_Smin*.

**Internal evidence within the manual for each reading:**
- Eq. 3-26 supports the **signed** reading: with `Σ(∂Q/∂H) < 0`, the explicit minus gives `ΔH = −ΣQ/(negative) = +ΣQ/|Σ(∂Q/∂H)|` — a head *rise* for net inflow, which is physically required. (The manual's sentence "Solving for *ΔH* yields" eq. 3-26 is only consistent if the sum is negative.)
- Eq. 3-28 and the §3.5 description support the **magnitude** reading: for eq. 3-28 to be a positive-denominator blend of "the pure surcharge formula 3-26 and the surface area formula 3-15" that "reduces fluctuations in head when the node first begins to surcharge", `Σ(∂Q/∂H)` in its denominator must be positive. Likewise §3.5's claim that in eq. 3-45 "the flow-derivative term takes on the role that the surcharge formula 3-28 plays" and that the term is bounded below by *A_Smin* only holds if the flow-gradient contribution to the denominator is positive, i.e. the **magnitude** reading.

So the manual is internally split: **eq. 3-26 uses the signed (negative) sum; eqs. 3-28 and 3-45 require the magnitude (positive) sum.** The sign statement attached to eq. 3-27 governs the individual gradients; the manual does not reconcile it with the denominator sums.

**Consequence for the project's specific claim.** Literally, the manual's eq. 3-45 prints **`A_S + (Δt/2)·Σ(∂Q/∂H)`** — a **plus** sign in front of the flow-gradient sum, matching the project's "should be `A + 0.5*dt*sumdqdh` with a plus" *if and only if* `sumdqdh` denotes `Σ(∂Q/∂H)` exactly as written. But because the manual's own eq. 3-27 makes each `∂Q/∂H` negative, that same printed plus is algebraically **`A − 0.5·dt·|Σ(∂Q/∂H)|`** when the gradient sum is translated into a positive magnitude. The manual does not resolve which convention `Σ(∂Q/∂H)` carries in eq. 3-45, so both of these statements are defensible readings of the printed equation:

- "the manual says plus" — true of the printed symbol in eq. 3-45;
- "the manual says minus" — true of the printed symbol once eq. 3-27's sign convention is substituted.

**Code context (factual).** In the current OpenSWMM source, `setNodeDepth` in `src/engine/hydraulics/DynamicWave.cpp` implements the SEMI_IMPLICIT branch as `denom = surf_area + 0.5 * dt * xnode_.sumdqdh[ui]` (line 3374) — a **plus**, not a minus — and the code comments (lines 3296, 3352–3361) state "The engine accumulates sumdqdh POSITIVE with dQ_net/dH = −sumdqdh", i.e. the flow-gradient sum is held as a positive magnitude. Under that mapping (Σ(∂Q/∂H) = −sumdqdh), the manual's literal eq. 3-45 becomes `A − 0.5·dt·sumdqdh` — i.e., the manual's *printed* plus sign, evaluated with eq. 3-27's signed gradients, is the opposite sign of the code's plus-on-a-positive-magnitude. The two coincide only under the magnitude reading of eq. 3-45, which the manual does not state. **The manual, taken at face value, therefore does not settle the plus/minus dispute: it prints `+ Σ(∂Q/∂H)` with `∂Q/∂H < 0` (eq. 3-27), and its own §3.3.5 equations are mutually inconsistent about the sign of the sum.** Whether the engine's expression is "correct" is outside the scope of this document; what can be stated on the manual's authority is the printed equation and the sign convention of its terms, as given above.
