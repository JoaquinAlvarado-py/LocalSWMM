# OpenSWMM 2D Overland Solver — Technical Reference

Source: `third_party/openswmm-engine/docs/manuals/reference/hydraulics/sections/Chapter8-FiniteVolume.md` (1D explicit finite-volume, 1355 lines) and `Chapter9-TwoDimensional.md` (2D overland, 1468 lines). Read in full. All equation/figure/table numbers below are the manual's own. Section headings are quoted verbatim from the chapters.

**Key fact up front:** the 2D solver is **not** the Chapter 8 solver. Chapter 8 documents the *1D* Godunov/HLL finite-volume method for conduits (`FLOW_ROUTING FV`). Chapter 9 documents the *2D* cell-centred finite-volume **local-inertial** solver on an unstructured triangular mesh — a completely different scheme (staggered-face explicit update, not a Riemann solver). Both are live code paths, and the 2D one is the subject of this reference. Chapter 8 is summarized in §12 because the 2D module couples to the 1D network it routes.

---

## 1. Governing equations of 2D overland flow

### 1.1 Continuity — depth-averaged, with sources (Eq. 9-1)

Chapter 9 §9.2 "Governing equations". Depth-averaged mass conservation over a surface of bed elevation $z(x,y)$ and free surface $\eta = z + h$, with unit-width discharge $\mathbf{q} = h\mathbf{u}$ (m²/s):

$$\frac{\partial h}{\partial t} + \nabla \cdot \mathbf{q} = i - e + s \tag{9-1}$$

where $i$ is rainfall intensity, $e$ the evaporation rate and $s$ the exchange with the 1D network, all as velocities normal to the surface. (§9.2, Eq. 9-1.)

### 1.2 Momentum — the local-inertial (inertial-wave) approximation (Eq. 9-2)

The momentum equation solved is the **local-inertial (inertial-wave) approximation of Bates et al. (2010)**:

$$\frac{\partial \mathbf{q}}{\partial t} + g\,h\,\nabla\eta + \frac{g\,n^{2}\,\lvert\mathbf{q}\rvert\,\mathbf{q}}{h^{7/3}} = 0 \tag{9-2}$$

with $g = 9.80665$ m/s² and $n$ Manning's roughness. Compared with the full shallow-water momentum equation, **the convective acceleration term $\nabla\cdot(\mathbf{q}\mathbf{q}/h)$ is dropped**; everything else — local acceleration, pressure gradient written as a free-surface slope, and bed friction — is retained. (§9.2, Eq. 9-2.)

This is "the single most consequential modelling decision in the chapter." Retaining $\partial\mathbf{q}/\partial t$ separates it from the diffusive wave (which has no inertia); dropping the convective term costs the Bernoulli terms: no drawdown over a crest, no stable hydraulic jump position, no fully supercritical profile. (§9.2.) Per de Almeida and Bates (2013), the approximation is accurate for subcritical flow over gentle slopes at Froude numbers below ~0.5, degrading progressively as $Fr \to 1$. Because nothing in (9-2) limits the velocity a steep slope can generate, a Froude clamp supplies the limit numerically (§9.5.1).

**Note the momentum variable is $\mathbf{q}$ — the unit-width discharge (specific discharge, m²/s) — not velocity.** The equation is written entirely in $q$. See §14.

### 1.3 The 1D analogue (for contrast, Ch. 8)

Chapter 8 solves the *conservation form* of the 1D St. Venant equations (§8.2, Eqs. 8-1, 8-2):

$$\frac{\partial A}{\partial t} + \frac{\partial Q}{\partial x} = q_{L} \tag{8-1}$$

$$\frac{\partial Q}{\partial t} + \frac{\partial}{\partial x}\left( \frac{Q^{2}}{A} + gI_{1} \right) = gI_{2} + gA\left( S_{0} - S_{f} \right) \tag{8-2}$$

with $I_1$ the first moment of the wetted area about the free surface, tabulated as the antiderivative of $A$:

$$I_{1}(h) = \int_{0}^{h}{(h - \eta)\,T(\eta)\,d\eta} = \int_{0}^{h}{A(\eta)\,d\eta} \tag{8-3}$$

$I_2$ vanishes for prismatic sections (every SWMM conduit). Pressure and convective terms live *inside* the flux divergence — that placement is what gives the scheme exact conservation. (§8.2.)

---

## 2. The explicit finite-volume scheme (2D)

### 2.1 Discretization structure (§9.5)

"Cell-centred finite-volume method with a staggered face variable: cells hold volume, faces hold the unit-width discharge $q$ normal to the face, positive from $L$ to $R$." Time integration explicit, with per-cell local time stepping. (§9.5.)

### 2.2 Face momentum update — the de Almeida & Bates / local-inertial face law (Eq. 9-7)

Each face integrates (9-2) along its own normal over its own step $\Delta t_f$ (§9.5.1, Eq. 9-7):

$$q^{n+1} = \frac{\hat{q} - g\,h_{f}\,\Delta t_{f}\,S}{1 + g\,\Delta t_{f}\,n_{f}^{2}\,\lvert\mathbf{q}_{f}\rvert / h_{f}^{7/3}} \tag{9-7}$$

with the free-surface slope (§9.5.1, Eq. 9-8):

$$S = \frac{\eta_{R} - \eta_{L}}{d_{n}} \tag{9-8}$$

where $d_n$ is the face-normal centroid separation (Eq. 9-3, §9.3):

$$d_{n} = \max\left( \lvert (\mathbf{x}_{R} - \mathbf{x}_{L})\cdot\hat{\mathbf{n}} \rvert,\ 0.3\,\lvert \mathbf{x}_{R} - \mathbf{x}_{L}\rvert \right) \tag{9-3}$$

(the 0.3 floor keeps near-degenerate slivers from producing an unbounded slope).

Three details of (9-7) carry weight (§9.5.1):

1. **Friction is semi-implicit.** $q^{n+1}$ in the numerator, $\lvert\mathbf{q}\rvert$ from the previous state in the denominator — unconditionally stable; friction can only shrink $q$ toward zero, never overshoot through it. An explicit friction term would impose a step limit $\sim h^{7/3}/n^2$, "unusable on thin films, which is where most of the cells are."

2. **The friction magnitude is the flow vector, not the face-normal component** (Eq. 9-24):

$$\lvert\mathbf{q}_{f}\rvert = \max\!\left( \lvert q_{f} \rvert,\ \left\lvert \tfrac{1}{2}(\mathbf{q}_{L} + \mathbf{q}_{R}) \right\rvert \right) \tag{9-24}$$

so a face whose cell reconstruction lags its own discharge never under-damps. The vector at the face is the mean of the two incident cells' Perot-reconstructed discharge vectors (§9.5.4, Eq. 9-16). With $\theta = 1$ the cell vectors are not allocated at all and the update uses $\hat{q} = q_f$, $\lvert\mathbf{q}_f\rvert = \lvert q_f \rvert$ — exactly the original Bates et al. (2010) scheme. The friction exponent is evaluated as $h^{7/3} = h^{2}\sqrt[3]{h}$ rather than through `pow()`.

3. **$\hat{q}$ is a lateral average, not $q$ itself** (§9.5.1, Eq. 9-9):

$$\hat{q} = \theta\,q_{f} + (1-\theta)\,\tfrac{1}{2}\left( \mathbf{q}_{L} + \mathbf{q}_{R} \right)\cdot\hat{\mathbf{n}} \tag{9-9}$$

$\theta = 1$ recovers original Bates et al. (2010) (no numerical diffusion, prone to checkerboard in thin films on steep faces); $\theta < 1$ blends in neighbouring cells' reconstructed discharge — the weighted formulation of de Almeida et al. (2012). **Default `THETA` = 0.8.**

Finally the result is Froude-clamped (§9.5.1, Eq. 9-10):

$$\lvert q^{n+1} \rvert \le Fr_{max}\,h_{f}\sqrt{g\,h_{f}} \tag{9-10}$$

`FROUDE_MAX` defaults to 1.5. This is the steep-face guard: with no convective term there is nothing in (9-2) to arrest acceleration down a steep face, so the supercritical limit is imposed rather than resolved. (§9.5.1; §9.12 "The Froude clamp is a numerical device… Results that sit on the clamp should not be regarded as physically meaningful.")

### 2.3 The face firing order (§9.5.1)

As coded, one face firing over its step $\Delta t_f$ proceeds in fixed order:

1. evaluate the face depth (§9.5.2) and **wall the face if $h_f \le$ `DRY_DEPTH`, zeroing its momentum**;
2. form $\hat{q}$ by (9-9) and the friction magnitude by (9-24);
3. zero the free-surface difference if it lies below the $10^{-12}$ m deadband (§9.5.3) and form the slope (9-8);
4. apply (9-7) then the clamp (9-10);
5. rescale by the positivity share (9-15) where it binds;
6. book $\pm\Delta M$ by (9-13).

The **stored face discharge is the post-clamp, post-rescale value**, so the momentum a face carries always matches the mass it moved.

### 2.4 Face flow depth and wet/dry handling (§9.5.2)

The depth in (9-7) is a property of the face and decides when water may cross.

**`FACE_RECONSTRUCTION MEAN`** (default), Eq. 9-11:

$$h_{f} = \max(\eta_{L}, \eta_{R}) - \max(z_{c,L}, z_{c,R}) \tag{9-11}$$

$h_f \le$ `DRY_DEPTH` makes the face a wall for that substep and its momentum is zeroed. This is the standard "flow depth above the higher bed" rule — but the bed is the higher *centroid* elevation. A thin crest resolved as a line of high vertices (levee, kerb, road crown) has its height diluted by ~a third when averaged into flanking centroids, so water crosses it early. (§9.5.2.)

**`FACE_RECONSTRUCTION VFR_FACE`** uses the exact mean depth of the driving surface over the wetted portion of the shared edge against the edge's **true endpoint elevations** $z_{lo} \le z_{hi}$ (Begnudelli and Sanders, 2007, Eq. 14), Eqs. 9-12a–c:

$$h_{f} = 0, \quad \eta \le z_{lo} \tag{9-12a}$$

$$h_{f} = \frac{(\eta - z_{lo})^{2}}{2(z_{hi}-z_{lo})}, \quad z_{lo} < \eta \le z_{hi} \tag{9-12b}$$

$$h_{f} = \eta - \tfrac{1}{2}(z_{lo}+z_{hi}), \quad \eta > z_{hi} \tag{9-12c}$$

with $\eta = \max(\eta_L, \eta_R)$. The quadratic branch matches value and slope at both joins, so overtopping onset is $C^1$ and the flux does not jump when the waterline crosses the edge. **The gate (9-12a) is the substantive part**: a cell holding water pooled below the whole shared edge conveys nothing across it. Embankments hold to their real crest; drainage no longer strands water on slopes. (§9.5.2.)

### 2.5 Well-balancedness (§9.5.3)

Writing the pressure gradient as the free-surface slope (9-8) makes the C-property **structural**: at rest $\eta_L = \eta_R \Rightarrow S = 0$ exactly, and (9-7) with $\hat{q} = q = 0$ returns zero for any bed whatsoever. A dry neighbour standing higher gives $h_f \le 0$ and the face is a wall — no uphill creep. One numerical guard: closure round-trip noise of order 1 ulp is amplified by the square-root character of the friction balance ($\Delta\eta \sim 10^{-16}$ m sustains $q \sim 10^{-6}$ m²/s); a slope below $10^{-12}$ m is set to exactly zero, after which the friction denominator decays $q$ geometrically. Measured $10^{-16}$ relative error on the SWASHES lake-at-rest cases (§9.10). (§9.5.3.)

### 2.6 The cell update, conservation and positivity (§9.5.4)

A face firing books the **identical** volume transfer into a per-side accumulator (§9.5.4, Eq. 9-13):

$$\Delta M = q^{n+1}\,\xi\,\Delta t_{f}, \qquad \text{acc}_{L} \mathrel{-}= \Delta M, \quad \text{acc}_{R} \mathrel{+}= \Delta M \tag{9-13}$$

and a cell firing gathers and clears its own side of each incident accumulator (§9.5.4, Eq. 9-14):

$$V^{n+1} = V^{n} + \sum_{f} \text{acc}_{f,i} + \Delta t_{c}\,A\,(i - e + s) \tag{9-14}$$

after which $\eta$ and $\bar{h}$ are recomputed through the closure (§9.4). Because both sides of a face are written from the **same floating-point product**, conservation is exact by construction — including across a local-time-stepping tier interface. $\sum_i V_i + \sum_f (\text{acc}_{L,f}+\text{acc}_{R,f})$ is an invariant of the face phase, asserted directly with `OPENSWMM_2D_MARCHER_CHECK`. (§9.5.4.)

**Positivity is enforced at face cadence, not by a post-hoc clamp.** A cell has at most three outgoing faces, so capping each exporting face at a share $\beta/3$ of its exporting cell's volume bounds total export at $\beta V$ per cell step with no cross-face coordination (§9.5.4, Eq. 9-15):

$$\lvert q^{n+1}\rvert\,\xi\,\Delta t_{f} \le \frac{\beta}{3}\,\frac{V_{exp}}{2^{\,k_{exp} - k_{f}}} \tag{9-15}$$

$\beta$ is `exchange_beta` (0.8). The tier ratio matters: an exporting cell republishes its volume only at its own firings, and a finer face fires $2^{k_{exp}-k_f}$ times in between, so without dividing the share the repeated takes would drain the cell. When a face is rescaled the *same* rescaled flux updates both sides — the cap costs nothing in conservation. A zero floor at the cell update remains as a backstop; with the caps in place it does not engage. (§9.5.4.)

### 2.7 The cell discharge (velocity) vector — Perot reconstruction (Eq. 9-16)

The cell's discharge vector — needed for the friction magnitude and the $\theta$ blend — is reconstructed at the cell's own cadence from its face fluxes by the Perot (2000) formula (§9.5.4, Eq. 9-16):

$$\mathbf{q}_{i} = \frac{1}{A_{i}}\sum_{f} s_{f}\,q_{f}\,\xi_{f}\,\left( \mathbf{x}_{f} - \mathbf{x}_{i} \right) \tag{9-16}$$

with $s_f = \pm 1$ the outward orientation of face $f$ for cell $i$ and $\mathbf{x}_f$ the edge midpoint. **This is a specific-discharge vector (m²/s), not a velocity.** (§9.5.4.)

### 2.8 Wetting cases and the wetted-edge face gate (Fig. 9-2)

Figure 9-2 (§9.5.9) sketches the geometry the wet/dry rules act on: the three wetting cases of the planar-bed cell (§9.4.1) — waterline below $z_2$ (wetted subtriangle at the low vertex), waterline between $z_2$ and $z_3$ (dry corner at the high vertex), fully submerged — each annotated with $z_1, z_2, z_3, \eta$ and the wetted region; plus an edge-profile inset showing the shared-edge endpoint beds $z_{lo}, z_{hi}$ and the three branches of the face-depth relation (blocked, partially submerged, fully submerged). (Fig. 9-2 caption.)

How a dry cell wets (§9.5.9): activation thresholds carry hysteresis (§9.5.9, Eq. 9-25):

$$h_{on} = h_{move} + \delta, \qquad h_{off} = \max(0,\ h_{move} - \delta), \qquad \delta = \min(0.001,\ h_{move}/2) \tag{9-25}$$

A dry cell gains water in one of three ways:

1. **Distributed sources (rainfall)** accumulate lazily as pure storage; the cell joins the active set at the first rebuild whose census finds its depth at or above $h_{on}$.
2. **A concentrated source** — a nonzero coupling flux — activates the cell at the next rebuild regardless of depth, as does membership in the pinned set.
3. **A neighbouring active cell** activates it through the one-ring halo, after which the shared face joins the face lists; the first term to act on the newly wet cell is the mass transfer (9-13), driven by the slope term of (9-7) integrated from $q=0$ — the friction denominator is near unity at $q=0$, so **the initial specific discharge after one face step is $-g\,h_f\,\Delta t_f\,S$**. (§9.5.9.)

A front advances at most one cell ring per rebuild period (four macro cycles); "this is not a practical restriction" because a fast front implies a small $\Delta t_0$ through (9-17), so the rebuild period shrinks with the front's own time scale, and the halo guarantees an active receiving cell. (§9.5.9.)

---

## 3. Quantities solved for: volume, depth, discharge, velocity

The manual is explicit (§9.5, §9.4, §9.5.4, §9.5.8):

- **Cells hold the conserved variable: volume $V$ (m³), not depth.** Depth is a *derived cell-mean*: $\bar{h} = V/A$. (§9.4.)
- **Faces hold the unit-width discharge $q$ (m²/s, i.e. specific discharge) normal to the face**, positive $L \to R$. This is the staggered prognostic face variable. (§9.5, §9.5.8 "The prognostic state per face is the discharge $q$ and the two pending-transfer accumulators".)
- **The cell "velocity" field is the Perot-reconstructed specific-discharge vector $\mathbf{q}_i$ (m²/s)** of Eq. 9-16, allocated only when $\theta < 1$. (§9.5.4, §9.5.8.)
- **Velocity is never a primary solved variable.** Where the manual uses a velocity it writes it as $q$ divided by depth: the CFL augmentation $\lvert\mathbf{u}_i\rvert = \lvert\mathbf{q}_i\rvert/h_i$ (§9.5.5). See §14.

So the solver's own prognostic state is {cell volume, face specific discharge}. Depth and velocity are both derived. The per-cell *reported* results (§9.9) are "depth, free-surface elevation, velocity, gradients, maximum-depth and maximum-velocity envelopes, cumulative volume and a per-cell continuity residual" — derived fields refreshed on a report-scale cadence, because "the six full-mesh passes cost several times the solver's own advance on a large mesh."

---

## 4. Cell-centre vs vertex quantities; render vs physical depth fields

- **Bed elevation is carried at the vertices** (§9.3). A cell's centroid elevation $z_c$ is the mean of its three vertex elevations; the cell bed is the plane through them. "Nothing in the solver reads a cell-constant bed." Local edge $e$ is opposite vertex $e$, so both incident cells compute the same endpoint elevations — which is what makes the face depth antisymmetric and the flux conservative. (§9.3.)
- **Cell-level physical depth** is $\bar{h} = V/A$ (cell mean), with $\eta$ from the closure (§9.4). Vertex-level depth is not a solver quantity.
- **Two distinct vertex reconstructions exist and must not be confused** (§9.9, verbatim):

> "The **solver** field is the pseudo-Laplacian stencil of Kumar et al. (2009), built once from cell-centre geometry with Lagrange multipliers enforcing linear exactness; dry cells contribute their bed elevations, which the solver relies on. The **rendering** field is a wet-masked, depth-weighted mean of the incident wet cells' free surfaces, with a wetted-contact gate so that a cell votes at a corner only where its water actually reaches it. Interpolating the solver field for display would drag water surfaces up dry banks and down into thin films; interpolating the rendering field in the solver would break the active-set logic."

  (§9.9.) So yes — there is an explicit **render-field vs solver-field split**, and it is exactly a "render depths" concept: the rendering field is built for display, wet-masked and depth-weighted, and is deliberately *never* used by the solver. Coupling and outfall heads read the solver's live state directly, "never these derived fields." (§9.9.)

- **The rendering reconstruction uses the exact (unregularized) VFR closure**: with $\varepsilon = 0$ — "used by the rendering reconstruction" — a dry cell returns $\eta = z_1$ instead of the tangent-line value (§9.4.1, case 4).

---

## 5. Numerical parameters

### 5.1 2D solver constants — Table 9-1 (SI units) (§9.5.9)

| Constant | Value | Origin | Role |
|---|---|---|---|
| `DRY_DEPTH` | 0.001 m | `[2D_OPTIONS]` | Face-wall depth, friction depth floor, evaporation taper scale, coupling ramp scale, CFL census cutoff |
| `H_MOVE` | 0.003 m | `[2D_OPTIONS]` | Flux-activation depth |
| $\delta$ | $\min(0.001\ \text{m},\ h_{move}/2)$ | derived | Activation hysteresis half-band |
| $\varepsilon$ | 0.01 | `VFR_MIN_WET_FRAC` | Wetted-fraction floor of the VFR closure |
| slope deadband | $10^{-12}$ m | fixed | Free-surface differences treated as exactly zero |
| flat-relief guard | $10^{-9}$ m | fixed | Cell or edge relief below which the geometry is flat |
| $\beta$ | 0.8 | fixed | Positivity and exchange availability fraction (`exchange_beta`) |
| rebuild cadence | 4 macro cycles | fixed | Active-set and tier refresh period |

Other key `[2D_OPTIONS]` defaults (§9.11): `CFL_NUMBER` 0.7, `MAX_TIMESTEP` 10 s, `THETA` 0.8, `FROUDE_MAX` 1.5, `LTS_TIERS` 4, `CELL_CLOSURE FLAT`, `FACE_RECONSTRUCTION MEAN`, `COUPLING_CD` 0.65, `COUPLING_AREA DEFAULT`, `COUPLING_SYNC` 0, `RAINFALL_MODE NATURAL_NEIGHBOUR`, `FLUX_DH_EPS` 0.004 m, `LIMITER_EPSILON` $10^{-6}$, `REPORT_2D YES`.

### 5.2 Hysteresis of wetting thresholds (§9.5.7, §9.5.9, Eq. 9-25)

Entering cells need $h_{on} = h_{move} + \delta$; active cells persist to $h_{off} = \max(0, h_{move}-\delta)$, with $\delta = \min(1\ \text{mm}, h_{move}/2)$. **The band scales with `H_MOVE`** — "a fixed ±1 mm band made `H_MOVE` $=10^{-4}$ require 1.1 mm to activate, ten times the requested threshold, which freezes wetting fronts in place." (§9.5.7.)

### 5.3 CFL, activation threshold, Froude cap

- **CFL:** `CFL_NUMBER` $\alpha$ = 0.7 in Eq. 9-17; a **true Courant fraction** — $\alpha = 1$ is the linear stability limit on any mesh, default 0.7 is a uniform 30 % margin. A raster of squares recovers classical $c\Delta t/\Delta x \le 1/\sqrt2$; a union-jack pair of right triangles gets $0.408\,\Delta x$. The geometric proxy $2A/\xi_{max}$ would overstate by $\sqrt3$. (§9.5.5.)
- **H_MOVE / activation:** §5.2 above.
- **Froude cap:** `FROUDE_MAX` = 1.5 on the face discharge (Eq. 9-10). §14.
- **Flux limiter:** the manual mentions `LIMITER_EPSILON` (output-gradient limiter regularization) but the 2D solver's flux limiter is the *positivity share* (9-15), not a slope limiter. (The Ch. 8 1D solver has `FV_LIMITER` MINMOD/VANLEER/SUPERBEE for MUSCL, §8.9, and FCT/Zalesak for scalar transport, §8.8.)
- **θ:** `THETA` 0.8 (Eq. 9-9).
- **Positivity budget:** $\beta$ = 0.8, cap (9-15).
- **The friction depth floor:** no separate floor exists — the face-wall test guarantees $h_f >$ `DRY_DEPTH` = 1 mm before (9-7), so $h_f^{7/3} \ge 10^{-7}$ m$^{7/3}$ and the semi-implicit denominator is always finite. (§9.5.9.)

### 5.4 The 1D solver's dry-state constants — Table 8-1 (US units, Ch. 8)

| Constant | Value | Role |
|---|---|---|
| $h_{dry}$ | $10^{-7}$ ft (≈ 3×10⁻⁸ m) | Depth at or below which a cell is dry: velocity and discharge zeroed, no celerity in the step census. |
| $A_{dry}$ | $10^{-12}$ ft² | Area floor for the $v = Q/A$ division and wet/dry tests written on areas. |
| $\eta_{dead}$ | $10^{-12}$ ft | Free-surface difference below which second-order reconstruction treats a face as exactly level. |

(§8.5.8, Table 8-1.) Note these are the *1D* solver's constants, in US units; the 2D solver uses the SI `DRY_DEPTH`/`H_MOVE` pair of Table 9-1.

---

## 6. Time stepping

### 6.1 Per-cell stable step (§9.5.5, Eq. 9-17)

$$\Delta t_{i} = \alpha \frac{L_{char,i}}{\sqrt{g h_{i}} + \lvert \mathbf{u}_{i}\rvert} \tag{9-17}$$

with $\alpha =$ `CFL_NUMBER` (0.7), and the base step of a macro cycle $\Delta t_0 = \min_i \Delta t_i$, further capped by `MAX_TIMESTEP` (10 s). Only active cells wetter than `DRY_DEPTH` enter the census — "a film the solver will not move imposes no constraint" — and a fully quiescent active set falls back to $\Delta t_0 =$ `MAX_TIMESTEP`. The advective augmentation $\lvert\mathbf{u}_i\rvert = \lvert\mathbf{q}_i\rvert/h_i$ is evaluated from the Perot vector when depth exceeds $10^{-6}$ m and $\theta < 1$, taken as zero otherwise. (§9.5.5.)

$L_{char}$ is the **operator-derived** length of Eq. 9-4 (§9.3):

$$L_{char} = \sqrt{\frac{2A}{\sum_{f} \xi_{f}/d_{n,f}}} \tag{9-4}$$

derived from the worst (odd–even) mode of the face-coupling operator, whose eigenvalue is $\lambda = 2(gh/A)\sum_f \xi_f/d_{n,f}$; the explicit update is linearly stable for $\Delta t \le 2/\sqrt{\lambda}$, which is exactly (9-4) divided by the celerity. This makes $\alpha$ a true Courant fraction. (§9.5.5.)

$\Delta t_0$ is re-minimized every macro cycle; it may be tightened at any time but growth requires a tier rebuild. (§9.5.5.)

### 6.2 Local time stepping (LTS) (§9.5.6)

Power-of-two tiers: $k = \min(K-1, \lfloor \log_2(\Delta t_i/\Delta t_0) \rfloor)$, capped at `LTS_TIERS` (default 4 → 8× spread; up to 8 → 128×). A macro cycle is $2^{K-1}$ base substeps; tier $k$ fires every $2^k$ substeps with $\Delta t = 2^k \Delta t_0$. Within a substep all due faces fire first, then all due cells — faces read the surfaces their incident cells published at those cells' last firings. (§9.5.6.)

- **A face belongs to the finer of its two incident cells' tiers**, integrating at the sharper side's rate, reading the coarser side's surface frozen since it last fired — safe without interpolation, conservative via (9-13). (§9.5.6.)
- **Cells whose forcing changes at the fastest cadence are pinned to tier 0** regardless of Courant number: boundary cells and cells carrying a 1D coupling point. (§9.5.6.)

### 6.3 The active set and lazy integration (§9.5.7)

Most of a rain-on-grid mesh is not flowing. A cell is flux-active only above `H_MOVE` (3 mm) with hysteresis (§5.2). Two rules complete the set: **a face flows only when both incident cells are active** (a one-sided face would export into a cell whose update never runs — measured as an 18 % basin loss when allowed); a **one-ring halo** around the active set guarantees an advancing front always has an active receiving cell. (§9.5.7.)

Inactive cells are not skipped, they are integrated **lazily**: rainfall and held coupling accumulate as pure storage over the whole interval since the last synchronization, in one pass, "because a cell below `H_MOVE` has no face flux by construction." A rainfall rate as such never activates a cell — activation follows only from accumulated depth crossing the threshold at a rebuild — whereas a nonzero coupling flux activates its cell immediately. The active set and tiers are rebuilt every four macro cycles (rebuild is $O(n_{cells})$ and dominated everything else when run per routing step on a large mesh). (§9.5.7.)

### 6.4 The substep algorithm (§9.5.8)

One solver advance over a window $[t, t+\Delta t]$:

1. Reset per-advance ledgers: boundary accumulators, coupling accumulators $\int Q\,dt$, per-node spill budget.
2. Loop until the window is filled:
   - Every fourth macro cycle, **rebuild**: settle pending face accumulators into cells; integrate lazy sources on inactive cells; reseed the active set (hysteretic threshold + pinned cells); grow the one-ring halo; recompute the CFL census and $\Delta t_0$; assign tiers with pinned/coupled cells forced to $k=0$; set each face's tier to the finer of its cells; zero the momentum of any face with an inactive side. Between rebuilds only re-minimize $\Delta t_0$.
   - Empty active set → stride to the end of the window (lazy tier keeps accumulating).
   - $\Delta t_0 \leftarrow \min(\Delta t_0, \text{remaining})$; if a full macro cycle overshoots the window, settle accumulators, collapse every active cell to tier 0, finish the window with single global substeps (the **tail**); a rebuild is forced afterwards.
   - Run the macro cycle: for each base substep $s$, fire faces of every due tier ($s \bmod 2^k = 0$) with $\Delta t_f = 2^k\Delta t_0$ in the §9.5.1 order, then fire due cells with $\Delta t_c = 2^k\Delta t_0$ — each cell gathers and clears its own side of every incident accumulator, applies its sources, floors volume at zero, reruns the closure, refreshes its Perot vector (9-16). Tier-0 cell firings additionally integrate the boundary edges (§9.6) and the live junction exchange (§9.7).
3. Land any remaining lazy sources at the window end.
4. Publish the flux picture: interior faces re-limit $q$ against the published surfaces (the update's own clamp used the depths it saw; the subsequent cell pass moved them) and write $\pm q\,\xi$ into both edge slots; boundary slots carry the window-mean applied flux so the router's booking recovers the exact applied volume.

Face and cell passes are OpenMP-parallel with static scheduling and are race-free and bit-identical to serial for any thread count; boundary and coupling loops are serial. (§9.5.8.)

### 6.5 The co-advance batch with the 1D solver (Fig. 9-1, §9.7.3)

By default the two domains **co-advance every routing step**: the 2D solver advances over exactly $[t, t+\Delta t]$, exchange volumes reach the 1D side with at most one routing step of lag. `COUPLING_SYNC` batches the 2D advance over a longer span (clamped between one routing step and 60 s) — a wall-clock lever for large meshes, "trading accuracy for speed: the held-exchange error grows with the span." (§9.7.3.)

Figure 9-1 flow: 1D routing step completes (node heads current) → pending span reaches the sync batch → save state and seed withdrawal budgets → accumulate outfall discharge and inject as batch-rate source → refresh rainfall, forcing overrides, boundary values → marcher advance over the batch span → {rebuild due? settle accumulators/lazy sources/active set/tiers/dt0, else tighten dt0} → macro cycle of base substeps → fire due faces (depth, blend, update, clamp, positivity, book ΔM) → fire due cells (gather, sources, closure, Perot) → tier-0 firings (boundary edges, live junction exchange) → batch span filled? → book junction/outfall/boundary ledgers into the 2D mass balance → queue exchange volumes for uniform delivery to 1D lateral inflow → clear one-shot forcings, reset window accumulators. (Fig. 9-1.)

### 6.6 Ch. 8 1D solver time stepping (for contrast)

The 1D FV solver substeps internally per routing step; each substep bounded by $\Delta t \le \alpha\,\Delta x/(|v|+c)$ with $\alpha =$ `FV_CFL` (Eq. 8-14; default 0.5, §8.9). Boundary ghosts enter the census (pressurized manhole ghost at slot celerity). Steps are re-checked after being taken (post-step census, accept only if the new stable limit ≥ half the step taken; on rejection roll back and retry at 0.9× the post-step limit, ≤8 retries, never below the 0.001 s floor). `FV_TIME_INTEGRATION` EULER or RK2 (Heun SSP). Local time stepping (`FV_LTS`, default on) with tiers $k_i = \lfloor\log_2(\Delta t_i/\Delta t_0)\rfloor$ (Eq. 8-15), macro cycle $2^{K-1}$ base substeps, `FV_LTS_MAX_TIERS` 6 (64×). (§8.5.5–8.5.6, Fig. 8-1.) The 2D solver has its own, separate LTS (§9.5.6).

---

## 7. 1D–2D coupling

### 7.1 Junction exchange — the orifice law (Eq. 9-18) (§9.7.1)

`[2D_VERTEX_NODE_MAP]` / `[2D_TRIANGLE_NODE_MAP]` associate a mesh vertex or cell with a SWMM node, a discharge coefficient $C_d$ (default `COUPLING_CD`, 0.65) and an exchange area. Exchange is an orifice law on the head difference (§9.7.1, Eq. 9-18):

$$Q = C_{d}\,A_{eff}\,\mathrm{sign}(\Delta h)\,\sqrt{2g}\ \varphi\!\left(\lvert\Delta h\rvert\right), \qquad \Delta h = h_{2D} - h_{1D} \tag{9-18}$$

positive draining the surface into the network. Three regularizations (§9.7.1):

1. **A bounded square root** (Eqs. 9-27a/b, §9.7.5): $dQ/d\Delta h \to \infty$ as $\Delta h \to 0$ is exactly the regime a fill-and-spill manhole hovers in. Below $\varepsilon_o = 0.02$ m, $\varphi$ is a $C^1$ quadratic matching $\sqrt{x}$ in value and slope at the join:
   $$\varphi(x) = \sqrt{x}\ (x \ge \varepsilon_o), \qquad \varphi(x) = \frac{3x}{2\sqrt{\varepsilon_o}} - \frac{x^{2}}{2\varepsilon_o^{3/2}}\ (0 \le x < \varepsilon_o)$$
2. **A capped-pipe gate** (Eq. 9-28, 9-29a): a manhole with its lid on exchanges only when the higher of the two heads reaches the crown $z_{inv}+D_{full}$; a Hermite smoothstep over a 5 cm band above the crown opens the exchange, and the effective area transitions smoothly from inlet area to twice it:
   $$A_{eff} = A\left[ 1 + \min\!\left( 1,\ \frac{h_{max} - z_{cr}}{0.05} \right) \right], \qquad Q \leftarrow Q\,\sigma\!\left(\mathrm{clamp}\!\left( \frac{h_{max}-z_{cr}}{0.05}, 0, 1 \right)\right), \quad \sigma(t) = t^2(3-2t)$$
3. **Source-side wet/dry ramps** (Eq. 9-29b): $Q$ multiplied by a smoothstep on the source side's depth relative to `DRY_DEPTH`: $Q \leftarrow Q\,\sigma(\mathrm{clamp}(d_{src}/h_{dry}, 0, 1))$. A drain self-limits to zero as the cell empties, a spill as the node empties. "This replaces a held-flux availability cap and is what makes the exchange stable inside the solver's inner loop."

The exchange is evaluated **live, at tier-0 cadence**, against current 2D heads and the routing step's 1D heads, and $\int Q\,dt$ accumulated exactly per point. Two hard caps (§9.7.5, Eqs. 9-30a/b): a drain may take at most $\beta$ of the source cell's volume per substep; a spill draws against a per-node budget of the node's stored volume for the whole advance — "so the same water cannot spill twice within a routing step." (§9.7.1.)

### 7.2 Coupling area (COUPLING_AREA) (§9.7.5)

Each coupling point carries node index, $C_d$, exchange area $A$, and (for outfalls) the flap-gate flag. A vertex row with no area defaults to 1.0 in mesh area units (scaled to m² with the mesh). With `COUPLING_AREA AUTO`, unauthored areas are derived at resolve time as:

$$\mathrm{clamp}(1.25 \times A_{conduit,max},\ 0.05,\ 2.0)\ \text{m}^2$$

where $A_{conduit,max}$ is the full-flow area of the largest conduit connected to the node. A vertex-coupled point records the first triangle incident on its vertex as its host cell; that cell is **pinned to tier 0** (§9.5.6). (§9.7.5.)

### 7.3 How the 2D head at a coupling point is formed (§9.7.1, §9.7.5)

**The 2D head at a coupling point is not simply a cell head.** Vertex-coupled points use a **wet-masked, depth-weighted mean of the incident cells' free surfaces under the VFR closure** — "a manhole vertex is commonly carved below the surrounding terrain, and a geometric average over incident cells would read dry-cell bed elevations as a water surface and pin the exchange at a phantom head from the first step." The driving head $h_{2D}$ is: the wet-masked depth-weighted stencil mean under VFR, the **pseudo-Laplacian vertex head under `FLAT`**, and the cell head for centroid coupling. For a drain ($Q > 0$) the source depth $d_{src}$ is the maximum depth over the vertex stencil; for a spill it is the node depth. (§9.7.1, §9.7.5.)

### 7.4 How coupling affects 1D node continuity — the head sensitivity (Eq. 9-19) (§9.7.1, §9.7.5)

Under dynamic wave routing the exchange would otherwise be a zero-sensitivity explicit source in the node continuity equation, churning the Picard iteration. The head sensitivity (§9.7.1, Eq. 9-19):

$$G = -\frac{\partial Q}{\partial h_{1D}} = C_{d}A_{eff}\sqrt{2g}\ \varphi'\!\left(\lvert\Delta h\rvert\right)\cdot(\text{gate})\cdot(\text{ramp}) \ \ge\ 0 \tag{9-19}$$

is scattered into the node's $\sum dQ/dH$ denominator each iteration (converted by $f_{Q,2D\to1D} \times f_{L,1D\to2D}$). "The gate and ramp derivatives are deliberately dropped so the term can only be positive — a pure damping contribution, never a destabilizing one." (§9.7.1.) Exchange volumes reach the 1D side through the lateral-inflow **delivery queue**, drained at a uniform rate over the batch span rather than as a single-step pulse. (§9.7.1, §9.7.5 step 2.)

### 7.5 Outfalls (§9.7.2)

Bidirectional. Outward: the node's net discharge for the routing step is accumulated and injected into 2D cells as a constant-rate source over the subcycle; withdrawals are capped by a per-cell budget seeded from batch-start state. Inward: the 2D surface acts as **dynamic tailwater** — the 2D stage at the coupling point is cached and the outfall boundary condition becomes $\max(h_{standard}, h_{2D})$, applied inside the dynamic-wave iteration so it survives every Picard pass. Flap gates honoured. **The outfall wet/dry gate is keyed on depth in excess of `DRY_DEPTH`, not on depth**: a draining cell comes to rest at a film at/below `DRY_DEPTH` which the solver treats as immovable, so a ramp keyed on depth alone would read ≈1 at the resting film and pin the outfall at a tailwater it can never drain below. (§9.7.2.)

### 7.6 One routing step, in order (§9.7.5)

1. **Pre-routing:** for every coupled outfall, cache the 2D stage (head of the deepest cell in the vertex stencil, converted to feet) and a wet/dry factor $\sigma(\mathrm{clamp}((d_{2D}-h_{dry})/h_{dry}, 0, 1))$; outfall boundary logic applies $\max(h_{standard}, h_{2D})$ inside every dynamic-wave iteration, blending by the cached factor, honouring flap gates.
2. **1D routing:** each coupled junction's $G$ (9-19) scattered into the node's $\sum dQ/dH$ every iteration; previous batch's junction exchange volumes drain from the delivery queue as uniform lateral inflow over the batch span.
3. **Post-routing:** pending span joins the batch; when it reaches the sync span, the co-advance batch fires — save state, accumulate outfall $Q_{net} = (Q_{in}-Q_{out})\times f_{Q,1D\to2D}$ and inject as a constant-rate `coupling_flux` source scattered over the vertex stencil with upwind-HGL weights (downhill cells for a source, uphill for a sink), refresh rainfall/evaporation/forcing on a 30 s cadence, advance the marcher (junction exchange live at tier-0 cadence against 1D heads frozen at batch start), book the ledgers, move volumes to the delivery queue. (§9.7.5.)

### 7.7 Units (§9.7.4) — a silent-and-severe trap

**The 2D solver runs internally in SI** (metres, m³, m³/s, $g=9.80665$). **The 1D engine always computes internally in feet, for every project.** The 1D↔2D coupling factors are therefore always the feet–metres conversion, independent of `FLOW_UNITS`. The mesh is authored in the project's display length units (scaled to SI on load for US projects). An earlier version tied coupling factors to `FLOW_UNITS`, collapsing them to 1.0 on metric projects and leaving every coupled head off by 3.28× and every exchanged volume off by 35×. (§9.7.4.)

---

## 8. Boundary conditions (§9.6)

Boundary edges (claimed by only one triangle) default to no-flux walls. `[2D_BOUNDARY_CONDITIONS]` assigns any of five types per edge:

| Type | Parameter | Meaning |
|---|---|---|
| `WALL` | — | Zero flux (default) |
| `NORMAL_FLOW` | bed slope $S$ | Manning outflow $q = h^{5/3}\sqrt{S}/n$ per metre of edge |
| `SPECIFIED_STAGE` / `TS_STAGE` | head, or time series | Prescribed free-surface elevation |
| `SPECIFIED_FLOW` / `TS_FLOW` | discharge per metre, or time series | Prescribed unit discharge, outward positive |
| `RATING_CURVE` | curve name | Stage → unit discharge lookup, resolved each step from the boundary cell's stage |

Time series and curve names resolved to registry indices once, evaluated every routing step. Prescribed stages share the mesh's vertical datum; prescribed flows scale with `FLOW_UNITS`. (§9.6.)

**A stage boundary is integrated with the interior momentum law, not with a conductance**: the ghost state holds $\eta = \eta_{bc}$ with a zero-gradient discharge, sitting across the edge at the centroid-to-edge distance $2A/(3L)$, and (9-7) is applied exactly as to an interior face. The earlier collapsed-Manning treatment was a "diffusive-wave law grafted onto an inertial interior" whose conductance saturated the clamp and floated every boundary-driven steady case one head jump of order $v^2/2g$ above its stage. A per-substep equilibrium clamp remains as a backstop (one substep may move a cell at most to the prescribed stage); exchange is clamped in **volume** space and the booked flux re-derived from the applied change, so what is reported is exactly what was applied. Cumulative boundary volume is tracked per edge, outward positive, and enters the 2D mass balance. (§9.6.)

---

## 9. Rainfall and evaporation (§9.8)

- `RAINFALL_MODE NATURAL_NEIGHBOUR` (default): natural-neighbour (Laplace) weights inside the convex hull of gages (weight = length of shared Voronoi facet ÷ distance to the gage; reproduces a linear rainfall field exactly), inverse-distance (power 2) outside; Delaunay by Bowyer–Watson; weights static, built once. Fallbacks: one gage everywhere, two/collinear by inverse distance, none to the `SYSTEM` mean.
- `SYSTEM`: arithmetic mean of all gages uniformly.
- `NONE`: no rain on the mesh. **"`NONE` is not an optimization, it is a modelling decision"** — if subcatchments already deliver runoff, rain on the mesh double-counts the storm.
- Evaporation: project demand rate as a sink, tapered by a smoothstep below `DRY_DEPTH` (Eq. 9-26, §9.5.9):

$$e_{eff} = e \cdot \sigma\!\left( h/h_{dry} \right), \qquad \sigma(t) = \min(1, t)^{2}\left( 3 - 2\min(1, t) \right) \tag{9-26}$$

with $e_{eff}=0$ for $h \le 0$ or $e \le 0$ — "a drying cell cannot evaporate more water than it holds, and negative demand is treated as zero rather than as a condensation source." Rainfall on inactive cells integrates in a single lazy pass; result floored at zero volume.
- **No infiltration on the mesh** (§9.1, §9.12).

---

## 10. Reporting, output and the two vertex fields (§9.9)

- The 2D domain carries its own mass balance block (SI volumes): Initial Stored Volume, Rainfall Inflow, 1D→2D Spill Inflow, Outfall Inflow, Boundary Inflow, 2D→1D Drain Outflow, Outfall Withdrawal, Boundary Outflow, Evaporation Loss, Final Stored Volume, Continuity Error. Every term booked from the volume actually applied — "after every cap, clamp and rescale." (§9.9.)
- A 2D Solver Statistics block reports cumulative substeps, face-kernel evaluations, mean/last internal step, min/mean/max active-cell fraction over rebuild samples, and occupancy share of each LTS tier (the diagnostics for the active set and LTS). (§9.9.)
- Per-cell results — depth, free-surface elevation, velocity, gradients, max-depth and max-velocity envelopes, cumulative volume, per-cell continuity residual — refreshed on a **report-scale cadence**, not every routing step, because the six full-mesh passes cost several times the solver's own advance. Coupling/outfall heads read live state directly, never these derived fields. (§9.9.)
- **Two vertex reconstructions** — solver pseudo-Laplacian (Kumar et al. 2009) vs rendering wet-masked depth-weighted mean with wetted-contact gate — see §4. (§9.9.)
- With `OUTPUT_FILE`, results go to an HDF5 file following CF-1.11 / UGRID-1.0 conventions: mesh topology, node/face coordinates, bed elevations, roughness written once; time-varying depth, head, velocity, gradient fields appended. Opens directly in ParaView/QGIS. (§9.9.)

---

## 11. Verification against SWASHES (§9.10)

The solver is verified against the SWASHES compilation with independently implemented reference formulas; relative $L^1$ depth error and mass-balance error over the run:

| Case | rel. $L^1$ depth error | mass error |
|---|---|---|
| Lake at rest, immersed bump | $6.3\times10^{-11}$ | $-7\times10^{-14}$ % |
| Lake at rest, emerged bump | $1.4\times10^{-16}$ | 0 |
| Subcritical flow over a bump | 0.67 % | $-6\times10^{-13}$ % |
| MacDonald 1000 m, subcritical | 2.0 % | $2\times10^{-11}$ % |
| Transcritical, no shock | 27 % (baseline) | $-7\times10^{-13}$ % |
| Transcritical with shock | 12 % (baseline) | $-8\times10^{-13}$ % |
| Stoker wet-bed dam break | 6.2 % (baseline) | $-1\times10^{-12}$ % |
| Ritter dry-bed dam break | 10 % (baseline) | $-3\times10^{-12}$ % |
| Thacker planar 1D / radial 2D / planar 2D | 78 % / 29 % / 43 % (baseline) | ~$10^{-13}$ % |
| MacDonald supercritical | 19 % (expected failure) | $-2\times10^{-13}$ % |

Observations: well-balancedness exact (both lake-at-rest at rounding, including the emerged-bump wetting/drying case); mass conservation exact to $10^{-11}$ % or better through wetting, drying, positivity rescaling and boundary clamping; accuracy degrades exactly where the local-inertial approximation does. The subcritical-bump free surface is *dead flat over the crest* where the analytic solution dips — the dip is $\Delta(v^2/2g)$ and there is no $q^2/h$ term to produce it; the residual 0.7 % is that dip and nothing else. The supercritical MacDonald channel "never steadies at all, and develops a roll-wave-like unsteadiness" — "If your problem looks like that case, this is not the solver for it." (§9.10.)

---

## 12. Chapter 8 (1D explicit FV) — condensed reference

Not the 2D solver, but coupled to it and worth having on record for the WebGPU project.

- **Governing equations:** conservation-form 1D St. Venant, Eqs. 8-1/8-2, state $\mathbf{U}=[A,Q]^T$. (§8.2.)
- **Mesh:** each conduit split into $n = \max(n_{min}, \lceil L/\Delta x_{target}\rceil)$ equal cells (Eq. 8-4; `FV_MIN_CELLS` 4, `FV_CELL_LENGTH` 0). Uses Courant-lengthened `mod_length`. No AMR. One cell/conduit is "not a supported operating point" (artificial bed step of half the conduit's fall). (§8.3.)
- **Pressurized flow:** static Preissmann slot folded into $A(h),T(h),R(h)$ — no regime-switching logic. $T_{slot} = gA_{full}/c_{slot}^2$ (Eq. 8-5, `FV_SLOT_CELERITY` 100 ft/s), tapered mouth via smoothstep $\varphi(s)=s^2(3-2s)$ (Eqs. 8-6/8-7). The solver carries $A$ and inverts to $h$ by Brent's method (hot kernel, 87 % of solver time). (§8.4.)
- **Interface flux:** HLL (Eq. 8-11) on hydrostatically reconstructed states (Audusse 2004; $z^*=\max(z_L,z_R)$, $h_K^*=\max(0,\eta_K-z^*)$, $v_K^*=v_K$, $Q^*=A(h^*)v$, Eqs. 8-8/8-9), with a still-water correction $F_K^c = F + [0,\ g(I_1(h_K)-I_1(h_K^*))]^T$ (Eq. 8-10). Davis signal speeds (Eq. 8-21), dry-bed estimates $v\mp2c$ (Eq. 8-23), supersonic branches (Eq. 8-22). Deliberately HLL, not HLLC, for the hydraulics (HLLC broke pressurized/part-full interfaces, drove flow backwards). (§8.5.1–8.5.3.)
- **Friction:** semi-implicit Manning $Q^{n+1}=Q^*/(1+g\Delta t\,(n/\phi)^2|v|/R^{4/3})$ (Eq. 8-13); force mains use their own law (Eq. 8-24); local losses as equivalent friction slope (Eq. 8-25). **Positivity:** outgoing flux of an over-drafted volume scaled by $\lambda=\min(1,\ V/(\Delta t\sum F_{out}))$ (Eq. 8-26) — identical scaled flux updates both neighbours, so conservation is untouched. (§8.5.4.)
- **Time stepping:** internal substeps, $\Delta t \le \alpha\,\Delta x/(|v|+c)$ (Eq. 8-14), $\alpha=$ `FV_CFL` 0.5, post-step census retry; LTS with power-of-two tiers (Eq. 8-15), `FV_LTS_MAX_TIERS` 6. (§8.5.5–8.5.6.)
- **Wet/dry (Ch. 8):** $h_{dry}=10^{-7}$ ft, $A_{dry}=10^{-12}$ ft², $\eta_{dead}=10^{-12}$ ft (Table 8-1); dry cells zero discharge and velocity; dry-bed Riemann states; shorelines seeded from the wet end's free surface (Eq. 8-27). (§8.5.8.)
- **Node coupling (Ch. 8):** ghost state from node head $h_g=\max(0,H-z_f)$, $v_g=v_{int}$ (transmissive; Eq. 8-28), same Riemann solver as interior faces. Semi-implicit node coupling (default) via $\Delta H = \Delta t(\sum F+q_{lat})/(A_s+\Delta t\sum\sqrt{gAT})$ (Eq. 8-18) with flux redistribution $\Delta Q_f=-s_f\sqrt{gA_gT_g}\,\Delta H$ (Eq. 8-29). Node time-step bound (Eq. 8-32). (§8.6.)
- **Reporting:** link discharge is the length-weighted *time mean* over the routing step; depth/volume instantaneous. (§8.7.)
- **Options** in §8.9 table (`FV_BACKEND` CPU/OMP/CUDA/HIP/SYCL, `FV_MIN_PARALLEL_CELLS` 20000).

---

## 13. Key figures referenced

- **Figure 8-1** (Ch. 8): substep workflow of the 1D explicit FV solver, including the post-step census retry and local time stepping.
- **Figure 8-2** (Ch. 8): wet/dry and exception handling in one 1D face flux evaluation (bed resolution → reconstruction → dry tests → HLL → flap gate / culvert cap → Audusse corrections → positivity scan).
- **Figure 8-3** (Ch. 8): hydrostatic reconstruction at a wet/dry front — advancing front vs emerged bank acting as a wall (placeholder).
- **Figure 8-4** (Ch. 8): node ghost-state construction at a coupling face (placeholder).
- **Figure 9-1** (Ch. 9): one 1D–2D co-advance batch and the explicit marcher's substep loop within it.
- **Figure 9-2** (Ch. 9): the three wetting cases of a planar-bed triangular cell and the wetted-edge face gate (placeholder).

---

## 14. Velocity vs specific discharge

**The manual's answer is unambiguous: the 2D solver's flow variable is specific discharge $q$ (unit-width discharge, m²/s), and velocity is always a derived $q/h$.**

Evidence, in order of strength:

1. **The momentum equation is written in $q$.** Eq. 9-2: $\partial\mathbf{q}/\partial t + gh\nabla\eta + gn^2|\mathbf{q}|\mathbf{q}/h^{7/3} = 0$, with §9.2 defining $\mathbf{q} = h\mathbf{u}$ ("unit-width discharge $\mathbf{q} = h\mathbf{u}$ (m²/s)"). The unknown being integrated is $q$, not $u$.
2. **The face state is a specific discharge.** §9.5: "faces hold the unit-width discharge $q$ normal to the face." §9.5.8: "The prognostic state per face is the discharge $q$."
3. **The cell state is a specific-discharge vector.** Eq. 9-16 (Perot): $\mathbf{q}_i = \frac{1}{A_i}\sum_f s_f q_f \xi_f (\mathbf{x}_f - \mathbf{x}_i)$ — a reconstruction of the unit-width discharge vector at the cell centroid, in m²/s. The friction magnitude (9-24) and the $\theta$ blend (9-9) use these vectors.
4. **Where the manual needs a velocity it divides by depth.** The CFL augmentation (Eq. 9-17) is $\lvert\mathbf{u}_i\rvert = \lvert\mathbf{q}_i\rvert/h_i$ — explicitly "the advective augmentation" evaluated "from the Perot vector" (§9.5.5). The boundary condition table (§9.6) writes the Manning outflow as $q = h^{5/3}\sqrt{S}/n$ per metre — again specific discharge.
5. **The Froude cap is a cap on $q$ (equivalently on $u$).** Eq. 9-10 bounds $\lvert q^{n+1}\rvert \le Fr_{max}\,h_f\sqrt{gh_f}$. Since $q = h\,u$, this is exactly $|u| \le Fr_{max}\sqrt{gh_f}$ — a face-velocity cap in disguise. The manual states the clamp's role directly (§9.5.1): "the supercritical limit must be imposed rather than resolved." **So yes: the solver Froude-caps its face fluxes, and that cap limits face velocity to $Fr_{max}\sqrt{gh_f}$.** Because the *stored* face discharge is the post-clamp value (§9.5.1, firing step vi), and because the cell Perot vector and all derived velocity fields are built from face $q$, the velocity a visualization would compute as $q/h$ is capped at the face level at the time of update. CONTEXT.md's "q/h inflation" note is therefore consistent with the manual: the artifact is a *rendering/frame-time* depth-floor problem, not a solver physics effect.
6. **The 1D solver is the same pattern.** Ch. 8 stores $A$ and $Q$ per cell and derives $v = Q/A$ ("the velocity they need was formed as $Q/A$ with $A > A_{dry}$ guaranteed", §8.5.8; "$Q^* = A(h^*)v$", §8.5.1). Ch. 9's 2D $q$ is the depth-integrated 2D analogue of Ch. 8's $Q$.

**Bottom line for the visualization project:** velocity = flux ÷ depth in both solvers. The reported per-cell "velocity" field (§9.9) is a derived field. A viewer that computes $u = q/h$ at a frame from cell depth must floor depth well above `DRY_DEPTH` (1 mm) — the manual's own physics threshold — to avoid the $q/h$ explosion in films, because the Froude cap bounds $q$ by $1.5\,h\sqrt{gh}$, which still leaves $u \propto \sqrt{h}$ near-zero-depth divergence when $h$ is only microns. The 2D `FLAT` cell-mean depth and the rendering vertex field (§9.9) are the two available depth representations; the rendering field is the one designed for display.

---

## 15. Ambiguities / loose ends in the manual

1. **Two different dry-depth concepts, two different unit systems, two different solvers.** Ch. 8's dry state is $h_{dry} = 10^{-7}$ ft (≈3×10⁻⁸ m) with $A_{dry} = 10^{-12}$ ft² and $\eta_{dead} = 10^{-12}$ ft (Table 8-1, US units) — far below the Ch. 9 $DRY_DEPTH$ = 1 mm. These are genuinely different numbers for genuinely different schemes (1D Godunov vs 2D local-inertial), but the identical-sounding names ($h_{dry}$ in §8.5.8, `DRY_DEPTH`/`h_dry` in §9.5.9 and §9.7.5) are easy to conflate. The 1D solver's $h_{dry}$ is a division-guard; the 2D solver's `DRY_DEPTH` is a physical face-wall threshold.
2. **`FV_CFL` default stated only in the options table.** §8.5.5 refers only to "$\alpha$ = `FV_CFL`"; the value 0.5 appears in §8.9. (The 2D `CFL_NUMBER` 0.7 is in both §9.5.5 and §9.11.)
3. **Equation numbering is out of order in the source text.** Ch. 8 presents Eqs. 8-1…8-18 out of numerical sequence (8-19 appears in §8.4.3, 8-20/8-21 in §8.5.3, 8-24/8-25/8-26 in §8.5.4, 8-27 in §8.5.8, 8-30 in §8.6.4, 8-31/8-32 in §8.6.5). This is Doxygen placement, not an error, but a reader citing equation numbers should verify against section context.
4. **The friction magnitude floor (9-24) is stated once, tersely.** "its magnitude is floored at the face's own discharge" — the purpose (first firing after a front arrives, or immediately after activation) is given but the derivation of the $\sqrt{2}$/45° face statement in §9.5.1 is compressed.
5. **`FLUX_DH_EPS` is documented in the options table but not in §9.6.** The options table (§9.11) says it is the "head-gradient floor of the diffusive boundary flux. 0 restores the bare $\sqrt{\ }$" — a residue of the *retired* diffusive boundary treatment that §9.6 says was replaced by integrating stage boundaries with the inertial law. The manual does not explain why a key for a removed formulation remains.
6. **"Velocity" reporting vs "specific discharge" is never reconciled explicitly.** §9.9 reports per-cell "velocity" as a derived result and §9.5.5 uses $|u_i| = |q_i|/h_i$, but nowhere does the manual say in one sentence "velocity := q/h for the reported field"; it is implicit in $\mathbf{q} = h\mathbf{u}$ (§9.2). A reader must assemble this from the equations.
7. **`FROUDE_MAX` unit detail.** Eq. 9-10 is written as a bound on $\lvert q^{n+1}\rvert$ (m²/s) — the manual never states that this is equivalent to a velocity bound $|u| \le Fr_{max}\sqrt{gh_f}$; that equivalence is a derived fact (§14).
8. **The 1D→2D batch uses 1D heads "frozen at batch start"** (§9.7.5 step 4), yet §9.7.3 claims exchange "reaches the 1D side with at most one routing step of lag." For the default `COUPLING_SYNC` 0 the two statements are consistent (batch = one routing step); with `COUPLING_SYNC` > 0 the "frozen heads for the batch" caveat is acknowledged in §9.12 but the lag statement is not restated with the qualifier.
9. **Fig. 8-3, 8-4 and 9-2 are placeholders.** The manual explicitly marks them "placeholder to be replaced by a final drawing"; the current repo ships `figure8-3-placeholder.png` etc. Any implementation relying on these figures must instead use the detailed prose in §8.5.8, §8.6.1 and §9.5.9.
