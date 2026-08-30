# OpenSWMM Hydraulics Components — Technical Reference (Manual Chapters 5–7)

**Sources (read completely, line by line):**
- `third_party/openswmm-engine/docs/manuals/reference/hydraulics/sections/Chapter5-CrossSection.md` (1187 lines)
- `.../Chapter6-PumpsRegulators.md` (975 lines)
- `.../Chapter7-AdvancedFeatures.md` (1540 lines)

All equation, figure and table numbers refer to the manual **exactly as printed** (equation
numbers `(x-y)` tag the block following them). Units are US customary throughout (ft, cfs, sec).
Anything ambiguous, misnumbered, or internally inconsistent is flagged inline as **[ERR]** and
collected in the "Manual ambiguities & errata" subsection at the end of each part.

---

# PART 1 — Cross-Section Geometry (Chapter 5)

## 1.1 The geometry functions and constants (§5, intro)

Hydraulic procedures in Chapters 3 and 4 require these cross-section functions:

| Function | Meaning |
|---|---|
| `A(Y)` | flow area as a function of flow depth |
| `W(Y)` | top width as a function of flow depth |
| `R(Y)` | hydraulic radius as a function of flow depth |
| `Y(A)` | flow depth as a function of flow area |
| `Ψ(A)` | section factor as a function of flow area |
| `Ψ′(A)` | derivative of section factor with respect to area |
| `A(Ψ)` | flow area as a function of section factor |

and these full-depth constants: `A_full` (area at full depth), `W_max` (maximum width),
`R_full` (hydraulic radius at full depth), `Ψ_full` (section factor at full depth),
`Ψ_max` (maximum section factor), `A_max` (area at which Ψ = Ψ_max).

### 1.1.1 The section factor (Eq. 5-1) and its derivative (Eqs. 5-2, 5-3)

$$\Psi(A) = A\,{R(A)}^{2/3}$$

With the exception of the parabolic shape, the derivative with respect to area is:

$$\Psi'(A) = \left(\tfrac{5}{3} - \tfrac{2}{3}P'R\right)R^{2/3}$$

where `P′` and `R` are evaluated at the desired value of `A`. **`P′(A)` is the derivative of the
wetted perimeter with respect to area.** For parabolic (and several composite) shapes the
derivative uses the central-difference formula:

$$\Psi'(A) = \frac{\Psi(A + \Delta A) - \Psi(A - \Delta A)}{2\Delta A}, \qquad \Delta A = 0.001\,A_{full}$$

(0.1% of full cross-section area).

## 1.2 Standard conduit shapes (§5.1)

SWMM recognizes: five open-channel shapes (rectangular, trapezoidal, triangular, parabolic,
power-law), four closed pipes (circular, rectangular, ellipsoid, arch), seven older masonry
sewer shapes, and four composite shapes.

### 1.2.1 Open channel shapes (§5.1.1)

**Table 5-1 — A(Y), W(Y), R(Y):**

| Shape | `A(Y)` | `W(Y)` | `R(Y)` |
|---|---|---|---|
| Rectangular (width b) | `bY` | `b` | `bY/(b+2Y)` |
| Trapezoidal (bottom width b, side slope s = run/rise) | `(b+sY)Y` | `b+2sY` | `((b+zY)Y)/(b+2Y√(1+s²))` **[ERR: `z` vs `s`]** |
| Triangular (side slope s) | `sY²` | `2sY` | `sY/(2√(1+s²))` |
| Parabolic (top width b at full depth Y_full) | `(4/3)Y√(cY)` | `2√(cY)` | `2A(Y)/(c(xt+ln(x+t)))`, `c=b²/(4Y_full)`, `x=2√(Y/c)`, `t=√(1+x²)` |

**Table 5-2 — Y(A), R(A), P′(A):**

| Shape | `Y(A)` | `R(A)` | `P′(A)` |
|---|---|---|---|
| Rectangular | `A/b` | `A/(b+2A/b)` | `2/b` |
| Trapezoidal | `√(b²+4sA)/(2s)` | `A√(1+s²)/(b+Y(A))` | `2√(1+s²)/(b²+4sA)` **[ERR: missing √ on denominator]** |
| Triangular | `√(A/s)` | `A/(2Y(A)√(1+s²))` | `√(1+s²)/(sA)` **[ERR: see errata]** |
| Parabolic | `(3A/(4√c))^(2/3)` | `2c(xt+ln(x+t))`, `x=2√(Y(A)/c)`, `t=√(1+x²)` | not used (uses Eq. 5-3) |

The section factor of all open shapes is Eq. 5-1; the derivative is Eq. 5-2 except for parabolic,
which uses Eq. 5-3.

**Power-law shape** (Eq. 5-4): `y = α x^(1/γ)` where x = horizontal distance from the
centerline, y = vertical distance, 1/γ = exponent, α = a constant; the user supplies 1/γ, the
full depth `Y_full`, and the top width `b` when full (Fig. 5-1). The parabolic shape is a special
case with 1/γ = 2. Re-expressed as water-surface width vs depth (Eq. 5-5): `W = cY^γ` with
`c = b/Y_full^γ` and full area `A_full = bY_full/(γ+1)`.

**Table 5-3 — power-law shape properties:**

| Property | Expression |
|---|---|
| `c` | `b/Y_full^γ` |
| `A(Y)` | `c Y^(γ+1)/(γ+1)` |
| `W(Y)` | `c Y^γ` |
| `P(Y)` | `2 Σᵢ √(Δxᵢ² + Δy²)`, `Δy = 0.02 Y_full`, `N = Y/Δy`, `Δxᵢ = (c/2){(iΔy)^γ − ((i−1)Δy)^γ}` (curved sides approximated by 50 line segments) |
| `R(Y)` | `A(Y)/P(Y)` |
| `Y(A)` | `[(γ+1)A/c]^(1/(γ+1))` |
| `R(A)` | `A/P(Y(A))` |
| `Ψ(A)` | `A R(A)^(2/3)` |
| `Ψ′(A)` | central difference with `ΔA = 0.001 A_full` |

### 1.2.2 Closed (covered) rectangular shape (§5.1.2)

`A(Y)`, `W(Y)`, `Y(A)` are identical to the open rectangular shape. `R(Y)` and `Ψ(A)` are the
same as the open shape up to the point the conduit becomes full, at which point the wetted
perimeter must include the top width — introducing a discontinuity. **To avoid this, a maximum
section factor is deemed to occur at 97% full, after which Ψ decreases linearly to the fully-full
value** (Eqs. 5-6, 5-7):

$$\Psi_{full} = A_{full}\left(\frac{A_{full}}{P_{full}}\right)^{2/3}, \qquad
\Psi_{\max} = 0.97\,A_{full}\left(\frac{0.97\,A_{full}}{P_{\max}}\right)^{2/3}$$

with `A_full = bY_full`, `P_full = 2(b + Y_full)`, `P_max = b + 2(0.97 Y_full)`.

Below 97% full the open-rectangular formulas hold. Above 97% full (Eqs. 5-8…5-11):

$$R(Y) = \frac{A(Y)}{P(Y)}, \qquad P(Y) = 2Y + b + b\frac{\left(\frac{Y}{Y_{full}} - 0.97\right)}{0.03}$$

$$\Psi(A) = \Psi_{\max} - \frac{(\Psi_{\max} - \Psi_{full})\left(\frac{A}{A_{full}} - 0.97\right)}{0.03}, \qquad
\Psi'(A) = \frac{\Psi_{full} - \Psi_{\max}}{0.03\,A_{full}}$$

### 1.2.3 Circular shape (§5.1.3)

Analytical trig formulas exist (French, 1985) but are slow, so **SWMM uses lookup tables based on
Chow (1959)** — five tables of 51 equally spaced values of the normalized variable
(`N = 51`; index `i = (Y/Y_full)(N−1)` or `i = (A/A_full)(N−1)` rounded down), linearly
interpolated between entries `i` and `i+1`, then multiplied by a normalizing factor:

| Table | Content |
|---|---|
| `A_tbl` | `A/A_full` vs `Y/Y_full` |
| `W_tbl` | `W/W_max` vs `Y/Y_full` |
| `R_tbl` | `R/R_full` vs `Y/Y_full` |
| `Y_tbl` | `Y/Y_full` vs `A/A_full` |
| `Ψ_tbl` | `Ψ/Ψ_full` vs `A/A_full` |

Full-flow normalizing factors (**Table 5-4**): `A_full = 0.7854 Y_full²`, `W_max = Y_full`,
`R_full = 0.25 Y_full`, `Ψ_full = A_full R_full^(2/3)`.

The section-factor derivative is read directly from `Ψ_tbl` (Eq. 5-12):

$$\Psi'(A) = \left(\Psi_{tbl}[i+1] - \Psi_{tbl}[i]\right)(N-1)\left(\frac{\Psi_{full}}{A_{full}}\right)$$

**Analytical functions below 4% of A_full (sidebar "Analytical Functions for Circular Cross
Sections").** For added accuracy `Y`, `Ψ`, and `Ψ′` are computed analytically for areas below 4%
of `A_full`. The central angle θ (radians) subtended by the water surface relates to area by
`A = A_full(θ − sinθ)/(2π)`, solved by Newton-Raphson:
1. Initial guess: `θ₀ = 0.031715 − 12.79384 α + 8.28479√α` with `α = A/A_full`.
2. `Δθ = (2πα − (θ − sinθ))/(1 − cosθ)`.
3. `θ = θ + Δθ`; repeat step 2 until `|Δθ| ≤ 0.0001`.

Then, with θ known:

- **Flow depth:** `Y = Y_full (1 − cos(θ/2))/2`
- **Section factor:** `Ψ = Ψ_full (θ − sinθ)^(5/3)/(2π θ^(2/3))`
- **Wetted perimeter:** `P = θ Y_full / 2`
- **Perimeter derivative:** `P′ = 4/(Y_full (1 − cosθ))`
- **Hydraulic radius:** `R = A/P`
- **Section-factor derivative:** `Ψ′ = [5/3 − (2/3)P′R] R^(2/3)`

### 1.2.4 Ellipsoid and arch shapes (§5.1.4)

Defined by **rise** = full depth `Y_full` and **span** = maximum width `W_max` (Fig. 5-4).
Vertical and horizontal ellipsoids are the same shape rotated 90°. SWMM ships 23 standard
ellipsoid sizes (American Concrete Pipe Association, 2011) and 102 standard arch sizes (American
Iron and Steel Institute, 1999), tabulated in Appendixes D and E. For user-supplied custom
rise/span (**Table 5-5**):

| Property | Ellipsoid | Arch |
|---|---|---|
| `A_full` | `1.2692 Y_full²` | `0.7879 Y_full W_max` |
| `R_full` | `0.3061 Y_full` | `0.2991 Y_full` |

Tables `A_tbl`, `W_tbl`, `R_tbl` hold `N = 26` equally spaced values of `Y/Y_full`;
A/W/R vs Y by linear interpolation × normalizing factor. **Y(A) uses a bisection on `A_tbl`**
to find `i` with `A_tbl[i] ≤ A/A_full ≤ A_tbl[i+1]`, then interpolates the depth from that
position. **[ERR: the promised depth-interpolation expression is missing — the text then prints
only Eq. 5-15, which is a central-difference Ψ′(A) formula; see errata.]**

### 1.2.5 Older masonry sewer shapes (§5.1.5)

Seven closed shapes from Metcalf & Eddy (1914) and Davis (1952): **Basket Handle, Egg,
Horseshoe, Catenary, Gothic, Semi-Circular, Semi-Elliptical** (Fig. 5-5). Table-entry counts
(**Table 5-6**):

| Shape | `A_tbl` | `R_tbl` | `W_tbl` | `Y_tbl` | `Ψ_tbl` |
|---|---|---|---|---|---|
| Basket Handle / Egg / Horseshoe | 26 | 26 | 26 | 51 | 51 |
| Catenary / Gothic / Semi-Circular / Semi-Elliptical | — | — | 21 | 51 | 51 |

Geometric parameters (**Table 5-7**); `Ψ_full = A_full R_full^(2/3)` always:

| Shape | `A_full` | `R_full` | `W_max` | `Ψ_max` |
|---|---|---|---|---|
| Basket Handle | `0.7862 Y_full²` | `0.2464 Y_full` | `0.944 Y_full` | `1.06078 Ψ_full` |
| Egg | `0.5105 Y_full²` | `0.1931 Y_full` | `0.667 Y_full` | `1.065 Ψ_full` |
| Horseshoe | `0.8293 Y_full²` | `0.2538 Y_full` | `Y_full` | `1.077 Ψ_full` |
| Catenary | `0.70277 Y_full²` | `0.23172 Y_full` | `0.9 Y_full` | `1.05 Ψ_full` |
| Gothic | `0.6554 Y_full²` | `0.2269 Y_full` | `0.84 Y_full` | `1.065 Ψ_full` |
| Semi-Circular | `1.2697 Y_full²` | `0.2946 Y_full` | `1.64 Y_full` | `1.06637 Ψ_full` |
| Semi-Elliptical | `0.785 Y_full²` | `0.242 Y_full` | `Y_full` | `1.045 Ψ_full` |

For shapes without `A_tbl`, `A(Y)` is found by **inverse lookup on `Y_tbl`** (the ellipsoid/arch
bisection method). For shapes without `R_tbl`, `R(Y)` is derived as `R = (Ψ/A)^(3/2)` after
computing `A(Y)` then `Ψ(A)`. `Ψ′(A)` uses Eq. 5-15 (central difference).

### 1.2.6 Composite shapes (§5.1.6)

**Sediment-filled circular.** A circular section partially filled with *immobile* sediment to a
specified depth `Y_btm` (constant — SWMM does not model sediment transport). Depth available for
flow is `Y_full − Y_btm`. Compute `A_btm`, `W_btm`, `R_btm` for the full circular shape
(diameter `Y_full`) at depth `Y_btm`; `P_btm = A_btm/R_btm`. Then (**Table 5-8**):

| Property | Expression |
|---|---|
| `A(Y)` | `A(Y+Y_btm) − A_btm` |
| `W(Y)` | `W(Y+Y_btm)` |
| `R(Y)` | `[A(Y+Y_btm) − A_btm] / [A(Y+Y_btm)/R(Y+Y_btm) − P_btm + W_btm]` |
| `Y(A)` | `Y(A+A_btm) − Y_btm` |
| `Ψ(A)` | `A R(ΔY)^(2/3)`, `ΔY = Y(A+A_btm) − Y_btm` |
| `Ψ′(A)` | central difference, `ΔA = 0.001(A_full − A_btm)` |

**Rectangular–triangular.** Triangular bottom of height `Y_btm` (side slope `s = b/(2Y_btm)`)
below a closed rectangular top of width `b` and height `Y_full − Y_btm`. Below `Y_btm` (area
`A_btm = bY_btm/2`) use the open-triangular formulas; above, the closed-rectangular approach.
Full properties: `A_full = b(Y_full − Y_btm/2)`,
`R_full = A_full/(2Y_btm√(1+s²) + 2(Y_full−Y_btm) + b)`, `Ψ_full = A_full R_full^(2/3)`.
Above 98% full the linear-ramp device (perimeter/area/Ψ) is applied with
**`Ψ_max = 0.98 A_full R(0.98A_full)^(2/3)`** and a linear ramp over the top 2% (**Table 5-9**).

**Rectangular–round.** Closed rectangular top (width `b`, total height `Y_full`) above a rounded
bottom of radius `r`. **Table 5-10** parameters:
`θ = 2 sin⁻¹(b/2r)`, `Y_btm = r(1 − cos(θ/2))`, `A_btm = (r²/2)(θ − sinθ)`,
`A_full = b(Y_full − Y_btm) + A_btm`,
`R_full = A_full/{rθ + 2(Y_full−Y_btm) + b}`, `Ψ_full = A_full R_full^(2/3)`,
`R_max = 0.98A_full/{rθ + 2(0.98A_full−A_btm)/b}`, `Ψ_max = 0.98A_full R_max^(2/3)`.
**Table 5-11** gives all functions piecewise over regions `Y ≤ Y_btm`, `A ≤ A_btm`,
`A_btm < A ≤ 0.98A_full`, `A > 0.98A_full` (circular-shape functions in the bottom region, a
linear Ψ ramp in the top 2%).

**Modified basket handle.** Reverse of rectangular–round: rectangular bottom (width `b`) below a
rounded top of radius `r`. (Eq. 5-14) `θ = 2 sin⁻¹(b/2r)`;
(Eq. 5-15) `Y_btm = Y_full − r(1 − cos(θ/2))`; `A_btm = bY_btm`;
(Eq. 5-16) `A_full = A_btm + r²/(2(θ − sinθ))`. Below `Y_btm`/`A_btm` use the open-rectangular
functions; above, **Table 5-12** applies (circular-shape functions mirrored from the top).

### 1.2.7 Area at maximum flow (§5.1.7)

Kinematic-wave analysis needs the area `A_max` corresponding to the depth where the section
factor (hence Manning flow) peaks. **Table 5-13** gives `A_max/A_full` for closed shapes; for
open shapes `A_max = A_full`:

| Shape | ratio | Shape | ratio |
|---|---|---|---|
| Rectangular | 0.97 | Circular | 0.9756 |
| Elliptical | 0.96 | Arch | 0.92 |
| Basket Handle | 0.96 | Egg | 0.96 |
| Horseshoe | 0.96 | Catenary | 0.98 |
| Gothic | 0.96 | Semi-Circular | 0.96 |
| Semi-Elliptical | 0.98 | Rectangular-Triangular | 0.98 |
| Rectangular-Round | 0.98 | Modified Basket Handle | 0.96 |

### 1.2.8 Area from section factor — A(Ψ) (§5.1.8)

Kinematic wave needs the area `A` for a given normal flow rate `Q` from its section factor
**[ERR: the manual prints `Ψ = Q√S₀/η` here; Eq. 5-35 in §5.6.2 prints `Ψ = Qη/√S₀`. The two
forms are mutually inconsistent; the Eq. 5-35 form is the one consistent with the Manning
equation `Q ∝ Ψ√S₀`]**.

- **Circular + the seven masonry shapes:** reverse lookup on `Ψ_tbl` (Eq. 5-17). Locate the
  interval bracketing `Ψ*/Ψ_full`. Because these are closed shapes the `Ψ/Ψ_full` values increase
  to a peak at index `i_max` then decrease. If `Ψ*/Ψ_full` lies between `Ψ_tbl[i_max]` and
  `Ψ_tbl[N]`, the descending tail of the table is examined; otherwise a bisection search between
  index 0 and `i_max` finds the interval `[i*, i*+1]` bracketing it. Then:

$$A^{*} = \frac{A_{full}}{(N-1)}\left(i^{*} + \frac{\Psi^{*} - \Psi_{tbl}[i^{*}]}{\Psi_{tbl}[i^{*}+1] - \Psi_{tbl}[i^{*}]}\right)$$

- **All other shapes:** Newton-Raphson-Bisection (Appendix A) on
  `f(A) = Ψ(A) − Ψ* = 0` (Eq. 5-18), derivative = the shape's `Ψ′(A)`. If the shape is closed
  with `A_max < A_full` and `Ψ_full ≤ Ψ* ≤ Ψ_max`, the search interval is `[A_full, A_max]`;
  otherwise `[0, A_max]`. Convergence criterion: 0.01% of `A_full`.

## 1.3 Custom conduit shapes (§5.2)

A user-supplied **Shape Curve** specifies how width varies with height, both normalized by the
full height, so one curve serves conduits of differing sizes (Fig. 5-7). `A_tbl`, `W_tbl`, and
`R_tbl` are pre-computed at 51 equally spaced vertical values (0–1). Each depth segment of size
1/50 = 0.02 forms a trapezoid whose area accumulates into `A_sum` and whose side-wall length
accumulates into `P_sum`; segments that straddle a shape-curve vertex are split into additional
trapezoids at the vertices. Table entries: `A_tbl = A_sum`, `R_tbl = A_sum/P_sum`,
`W_tbl` = the segment's top width.

Normalizing factors (Eqs. 5-19…5-22):

$$A_{full} = A_{tbl}[50]\,Y_{full}^{2}, \qquad R_{full} = R_{tbl}[50]\,Y_{full}, \qquad
W_{\max} = \max_{0\le i\le 50} W_{tbl}[i]\cdot Y_{full}, \qquad
A_{\max} = \max_{0\le i\le 50}\left(A_{tbl}[i]\,R_{tbl}[i]^{2/3}\right) Y_{full}^{2}$$

Tables are used like the ellipsoid/arch tables (§5.1.4) to evaluate `A(Y), W(Y), R(Y), Y(A),
Ψ(A), Ψ′(A)`; `A(Ψ)` by Newton-Raphson-Bisection (§5.1.8).

## 1.4 Irregular natural channels (§5.3)

The cross section is a **transect**: measurement stations x with bed elevations y, from the top
of the left bank (looking downstream) to the top of the right bank (Fig. 5-8). One transect
represents the channel along its whole length, so long non-uniform channels should be split into
more uniform segments. Optional overbank areas may carry a different Manning's n; each overbank
boundary must coincide with a transect station.

Construction:
1. Find the lowest and highest stations; `Y_full` = their elevation difference. Add a station at
   each end if needed so both ends sit at the highest elevation. Re-base all elevations to the
   lowest station.
2. Build `A_tbl`, `W_tbl`, `R_tbl` at 51 depths `Y = k·Y_full/50` (`k = 0…50`; entry 0 is zero).

**Sidebar "Computing Geometry Table Entries for Irregular Cross Sections" (algorithm).** For each
depth `Y = k·Y_full/50`, walk the transect accumulating per-compound-segment area `A_sum`,
wetted perimeter `P_sum`, and total flow **conductance**
`K = Σ (1.486/nᵢ)·A_sum·(A_sum/P_sum)^(2/3)`. A compound segment ends at station `i` when
`y_i > Y` (an emerging bank or valley) or when `n_i ≠ n_{i+1}` (roughness change); its sum is then
flushed into K. Partial submergence of a segment: `α = (Y − min(y_{i-1},y_i))/Δy`,
`a = α²wΔy/2`, `w = αw`, `p = αp`; full submergence: `a = w(Y − (y_{i-1}+y_i)/2)`. The hydraulic
radius entry is backed out of the total conductance using the **main-channel** roughness `n_C`:

$$R_{tbl}[k] = \left(\frac{n_C K}{1.486\,A_{tbl}[k]}\right)^{3/2}$$

Normalizing: `A_full = A_tbl[50]`, `W_max = W_tbl[50]`, `R_full = R_tbl[50]`; additionally
`W_tbl[0] = W_tbl[1]` (no width is computed at zero depth).

**Meander modifier.** Ratio of the meandering main-channel length to the overbank length
surrounding it. SWMM uses the shorter overbank length in its calculations and increases the main
channel Manning's n by `√(meander modifier)` to give an equivalent friction head loss over the
shortened main-channel length.

## 1.5 Street cross-sections (§5.4)

A street/roadway cross section is a special case of the irregular channel (§5.3). One-sided
(Fig. 5-10): a road surface of slope `S_x` extending a distance `T_crown` to a curb of height
`H_curb`, plus optional depressed gutter (width `W`, depth `a` below the normal curb height) and
optional backing section (`T_back`, `S_back`). A two-sided street mirrors the one-sided section
across the crown. Tables of area/width/hydraulic radius are built at 50 equal depth increments
with the §5.3 transect procedure; roughness must be supplied for the road surface and, if
present, the backing surface.

## 1.6 Storage unit geometry (§5.5)

Surface area `A` and volume `V` vs surface depth `Y` are related by `A = dV/dY` and
`V = ∫A dY`, so specifying either suffices. SWMM uses surface area and offers three forms:
standard shapes, a functional power law, and a tabular storage curve.

### 1.6.1 Standard storage shapes (§5.5.1)

Surface area is a quadratic function of height (Eq. 5-23):

$$A = a_0 + a_1 Y + a_2 Y^2$$

Coefficients by shape (**Table 5-14**):

| Shape | a0 | a1 | a2 | Dimensions |
|---|---|---|---|---|
| Elliptical Cylinder | `(π/4)LW` | 0 | 0 | L major axis, W minor axis |
| Elliptical Paraboloid | 0 | `(π/4)LW/H` | 0 | L, W, H = paraboloid height |
| Elliptical Cone | `(π/4)LW` | `πWZ` | `π(W/L)Z²` | L, W bottom axes, Z = side slope (run/rise) along major axis |
| Rectangular Pyramid | `LW` | `2(L+W)Z` | `4Z²` | L, W bottom dims, Z = wall slope (same for each face) |

Integrating Eq. 5-23 over depth gives the volume (Eq. 5-24):

$$V = a_0 Y + \frac{a_1}{2}Y^2 + \frac{a_2}{3}Y^3$$

Depth-from-volume: cylinder `Y = V/a_0`; paraboloid `Y = √(2V/a_1)`; cone/pyramid solve the
cubic numerically by Newton-Raphson-Bisection (Appendix A) over `[0, Y_full]`, initial estimate
`Y = V/a_0`, convergence tolerance 0.001 ft, derivative given by Eq. 5-23.

Input keywords in `[STORAGE]`: `CYLINDRICAL`, `CONICAL`, `PARABOLIC` (alias `PARABOLOID` also
accepted), `PYRAMIDAL`, each followed by the three dimensions in Table 5-14 order (the elliptical
cylinder's third dimension is unused). Constraints: `L > 0`, `W > 0`, `Z ≥ 0` (cone and pyramid),
`H > 0` (paraboloid). Raw dimensions are retained alongside derived coefficients so a model
written back to file reproduces the exact shape rather than a functional equivalent. **If a node
is assigned both a storage curve (§5.5.3) and a shape, the curve takes precedence.** Implementation
notes: dimension validation and coefficient formulas live in `src/engine/data/StorageGeometry.hpp`
(`storage_shape_coeffs`), shared by the `[STORAGE]` parser
(`src/engine/input/handlers/NodesHandler.cpp`), the input writer, and the editing API; the
quadratic relation 5-23, cubic integral 5-24, and the closed-form and Newton depth inversions are
evaluated in `src/engine/hydraulics/Node.cpp`.

### 1.6.2 Functional storage shapes (§5.5.2)

Power law (Eq. 5-25): `A = c₀ + c₁ Y^c₂` with user-supplied `c₀`, `c₁`, `c₂`. Volume (Eq. 5-26):

$$V = c_0 Y + \frac{c_1}{c_2 + 1}Y^{c_2 + 1}$$

Depth from volume solves (Eq. 5-27) `f(Y) = V − (c₀Y + (c₁/(c₂+1))Y^(c₂+1)) = 0` by
Newton-Raphson-Bisection over `[0, Y_full]`, initial estimate `Y = V/(c₀+c₁)`, tolerance 0.001 ft,
derivative `f′(Y)` given by Eq. 5-25.

Representable shapes:
- Vertical sides, constant area (cylinders, rectangular prisms, irregular outlines): `c₀` = base
  area, `c₁ = c₂ = 0`.
- Open trapezoidal channel with vertical ends: `c₀ = WL`, `c₁ = 2ZL`, `c₂ = 1` (W = bottom width,
  L = channel length, Z = side slope).
- Open parabolic channel with vertical ends: `c₀ = 0`, `c₁ = WLH^0.5`, `c₂ = 1` (W = top width,
  L = length, H = full height) **[ERR: parabolic surface area grows as Y^0.5, so `c₂ = 1` looks
  like a typo for 0.5]**.
- Elliptical paraboloid: `c₀ = 0`, `c₁ = A/H`, `c₂ = 1` (A = surface area at height H).

### 1.6.3 Tabular storage shapes — storage curves (§5.5.3)

A **Storage Curve** is a series of user pairs `(Y_i, A_i)` of surface area vs surface depth
(Fig. 5-11). The first point should be the area of the unit's base at depth 0; otherwise zero
area at the base is assumed. The curve is extrapolated outward to meet the unit's maximum depth
if needed.

**Volume from depth** — trapezoidal rule (Eq. 5-28), where `n` = largest data-point index with
`Y_n ≤ Y` and `A` = area at depth `Y` interpolated from the curve:

$$V = \frac{1}{2}\left\{\sum_{i=1}^{n} (Y_i - Y_{i-1})(A_i + A_{i-1})\right\} + \frac{1}{2}(Y - Y_n)(A + A_n)$$

(Equivalent to the widely used Average-End-Area method, except the area at the desired depth is
interpolated from the storage curve first rather than converting the area curve to a volume curve
and interpolating directly.)

**Depth from volume** (Eq. 5-29): sum the volumes of each curve segment from 0 until the
accumulated volume `V_sum` exceeds the target `V`; let the segment start index be `i`, then

$$Y = Y_i + \frac{\sqrt{A_i^2 + 2\alpha(V - V_{sum})} - A_i}{\alpha}, \qquad
\alpha = \frac{A_{i+1} - A_i}{Y_{i+1} - Y_i}$$

## 1.7 Critical and normal depths (§5.6)

Needed by dynamic wave whenever (1) a conduit connects to a free outfall node, or (2) a
discontinuity exists between the conduit water level and the connecting node's water level
(a free-fall condition).

### 1.7.1 Critical depth (§5.6.1)

Critical depth is the depth where specific energy is minimum for a given Q, i.e. Froude number
`Fr = 1` (Chow, 1959). From that condition (Eq. 5-30): `Fr = U/√(gA/W) = 1`. With `U = Q/A`, at
the critical depth `Y_C` (Eq. 5-31):

$$\frac{A(Y_C)^3}{W(Y_C)} = \frac{Q^2}{g}$$

**Explicit formulas for simple shapes (Table 5-14 — duplicate table number, see errata):**

| Shape | Y_C | Remarks |
|---|---|---|
| Rectangular | `(Q²/(gb²))^(1/3)` | b = width (French, 1985) |
| Triangular | `(2Q²/(gs²))^(1/5)` | s = side slope (French, 1985) |
| Parabolic | `(27αQ²/(32g))^(1/4)` | perimeter `y = αx²` (Swamee, 1993) |
| Power law | `((1+γ)³ α^(2γ) Q²/(4g))^(1/(3+2γ))` | perimeter `y = αx^(1/γ)` (Swamee, 1993) |

Other shapes require a root-finding solution of (Eq. 5-32):
`f(Y) = A(Y)³/W(Y) − Q²/g = 0`. Because analytical derivatives are unavailable for most shapes,
derivative-free methods are used:
- **Interval enumeration** — full depth divided into `N = 25` equal intervals. Starting from the
  integer part of `N·Y_C/Y_full`, compute `Q₀ = √(gA(Y)³/W(Y))` at the interval depth and walk up
  (or down) until the bracketing interval is found, then linearly interpolate within it.
- **Ridder's method** (Appendix B; Press et al., 1992).

Selection: interval enumeration is used when the section's `A_full` divided by a circular
section's area at the same full depth is between 0.5 and 2.0, with the initial estimate from the
circular approximation (French, 1985) (Eq. 5-33):

$$Y_C = 1.01\,\frac{(Q^2/g)^{0.25}}{Y_{full}^{0.26}}$$

Otherwise Ridder's method solves Eq. 5-32 with a convergence tolerance of 0.001 ft and an initial
bracket `[Y₁, Y₂]` built from `Y₀` (the Eq. 5-33 estimate) and `Y₁/₂ = 0.5Y_full` by comparing
`Q(Y) = √(gA(Y)³/W(Y))` against the target Q (the bracketing algorithm steps are spelled out in
the manual). **[ERR: the bracket text says "let … Y₀ be the value computed by Equation 5-31
above", but Eq. 5-31 is the `A³/W = Q²/g` relation, not the Y approximation; it should reference
Eq. 5-33.]**

### 1.7.2 Normal depth (§5.6.2)

Normal depth is the depth producing uniform flow Q. With Manning's equation (Eq. 5-34):

$$A(Y_N)R(Y_N)^{2/3} = \frac{Q\eta}{\sqrt{S_0}}, \qquad\text{i.e.}\qquad
\Psi = \frac{Q\eta}{\sqrt{S_0}}$$

(Eq. 5-35; η = Manning roughness in US units, S₀ = conduit slope). Solution chain (Eq. 5-36):
compute Ψ from Eq. 5-35, invert to area `A` via §5.1.8, then evaluate depth via the shape's
`Y(A)`:

$$Y_N = Y\left(A\left(\Psi = \frac{Q\eta}{\sqrt{S_0}}\right)\right)$$

## 1.8 Manual ambiguities & errata — Chapter 5

1. **[ERR]** §5.1.1, Table 5-1 trapezoidal `R(Y)`: the numerator prints `(b + zY)Y` (a stray
   variable `z`) while everything else uses the side slope `s`. Same quantity, inconsistent
   symbol.
2. **[ERR]** §5.1.1, Table 5-2 trapezoidal `P′(A)` prints `2√(1+s²)/(b²+4sA)`. The analytical
   derivative of `P = b + 2Y√(1+s²)` with `Y = (√(b²+4sA) − b)/(2s)` is `2√(1+s²)/√(b²+4sA)` —
   the square root of the discriminant is missing in the printed denominator.
3. **[ERR]** §5.1.1, Table 5-2 triangular `P′(A)` prints `√(1+s²)/(sA)`. For `P = 2Y√(1+s²)` and
   `Y = √(A/s)`, dP/dA = `√(1+s²)/√(sA)` — the printed expression differs.
4. **[ERR]** §5.1.4 end: the ellipsoid/arch depth-interpolation expression for `Y(A)` is missing.
   The text promises it ("the desired depth Y is interpolated from this position in the table
   using the following expression with N = 26"), but only Eq. 5-15 is printed — a central
   difference `Ψ′(A)` formula — and the `(5-15)` tag is reused later in §5.1.5 and §5.1.6.
5. **[ERR]** §5.1.4/5.1.5/5.1.6 cross-references: the text cites "section 5.2.1 / 5.2.2 /
   5.2.3 / 5.2.4 / 5.2.5" for subsections that are actually in §5.1 (open shapes, closed
   rectangular, circular, ellipsoid/arch, masonry shapes). §5.2 is "Custom Conduit Shapes".
   Ambiguous.
6. **[ERR]** §5.1.8 vs §5.6.2: the section factor for a given normal flow is printed as
   `Ψ = Q√S₀/η` (§5.1.8) and as `Ψ = Qη/√S₀` (Eq. 5-35). Mutually inconsistent. The Eq. 5-35
   form is dimensionally consistent with `Q = (1.486/n)A R^(2/3)√S₀`; the §5.1.8 form is wrong
   (Q appears multiplied by √S₀ instead of divided).
7. **[ERR]** Table 5-14 is numbered twice in Chapter 5: once for standard storage shapes (§5.5.1)
   and again for critical-depth formulas (§5.6.1).
8. **[ERR]** §5.6.1 Ridder's bracket construction references "Equation 5-31 above" for the
   initial Y₀ estimate; should be Eq. 5-33.
9. **Ambiguous** §5.1.3: the analytical low-area sidebar is invoked "for added accuracy" below 4%
   of `A_full`, but the exact switchover/continuity between table interpolation and the analytical
   forms for `Y`, `Ψ`, `Ψ′` is unspecified (e.g., whether `Ψ′` is continuous across the 4% point).
10. **Ambiguous** §5.1.2, Eq. 5-9: `P(Y) = 2Y + b + b((Y/Y_full − 0.97)/0.03)` — as printed the
    added top-width term is `b ×` (a dimensionless ramp that is 0 at 97% and 1 at 100% full); the
    manual leaves that reading implicit.

---

# PART 2 — Pumps and Regulators (Chapter 6)

## 2.1 Pumps (§6.1)

Pumps are **links with a pre-defined relationship between flow rate Q and head H (or a suitable
surrogate)**, defined by a user-supplied **Pump Curve**. A pump's inlet node is typically a
storage node (a wet well); the exception is an inline booster pump inside a force main under
dynamic wave. **"Whenever a pump link is encountered in either the dynamic wave or kinematic wave
methods its new flow is found directly from its pump curve using whatever values were last
computed for nodal heads and volumes."**

### 2.1.1 Pump curve types (**Table 6-1**)

| Type | Description | Notes |
|---|---|---|
| **Type1** | Series of constant flow rates applying over a corresponding series of **volume intervals** at the pump's inlet node | A single point = operating point of a constant-flow positive-displacement pump; multiple points model speeds / parallel pumps |
| **Type2** | Like Type1, but fixed flow levels vary over **depth intervals** at the inlet node | |
| **Type3** | Centrifugal characteristic curve at nominal impeller speed, piecewise linear; **flow is a function of the head difference** between inlet and outlet nodes | Fixed speed |
| **Type4** | Variable-speed in-line pump; **flow varies continuously with inlet-node depth** | Positive-displacement w/ continuous speed control, or pump lifting to ~fixed elevation |
| **Type5** | Variable-speed version of Type3; the head-vs-flow curve **shifts position with speed setting** | |
| *(Ideal)* | No curve; flow = inflow rate into its inlet node; must be the inlet node's **only outflow link**; mainly for preliminary design | |

### 2.1.2 Flow determination & lookup rules (§6.1)

- **Type1/2:** the curve is searched step-wise for the **first point whose volume (or depth)
  exceeds the volume (or depth) at the pump's inlet node**; the pump flow = the flow associated
  with that point.
- **Type3/5:** find the pair of adjacent data points that bracket the **head difference between
  the outlet and inlet nodes**, then linearly interpolate a flow for the given head difference.
- **Type4:** same interpolation, but using the **water level at the pump's inlet node**.
- Pump flow is **not allowed outside the minimum/maximum values of its curve** and is **not
  allowed to be negative**.

**Type5 speed shifting.** A relative speed setting `ω` (1.0 = original user-supplied curve). By
the pump affinity laws (Sanks et al., 1998), a point `(H, Q)` on the original curve maps to
`(ω²H, ωQ)` on the speed-adjusted curve. For **all other pump types**, only the flow found from
the original curve is multiplied by the speed setting.

**Speed control.** Speed settings change during a run via control rules; e.g., `ω = 1` when the
wet-well level is above a startup depth and `ω = 0` below a shutoff depth.

**Pump-flow cap (Eq. 6-1).** The adjusted pump flow must not drop the inlet-node water level
below 0 over the current time step. If the inlet node is a storage node, the pumping rate cannot
exceed:

$$Q_{\max} = Q_{in} + \frac{V_N}{\Delta t}$$

where `Q_in` = most recently computed total inflow to the node, `V_N` = node volume at the start
of the time step, `Δt` = current time step. For a **non-storage** inlet node under dynamic wave,
Eq. 3-15a is used with the current pumping rate to estimate the end-of-step inlet head; if that
head is below the node's invert elevation, the pumping rate is set equal to the node's current
inflow.

### 2.1.3 Additional computational details (§6.1)

1. **Virtual wet well.** If a Type1 (flow vs volume) pump's inlet node is not a storage node, it
   is assigned a virtual wet well whose volume varies linearly with depth up to the highest
   volume on the pump curve at full node depth. The normal non-storage node methods still update
   the water level, but the virtual wet well volume at that level is what determines the pumping
   rate. Eq. 6-1 also limits the flow to what the node can release.
2. **Dynamic wave:**
   a. Pumps contribute **no surface area** to the node-link assemblies at their inlet and outlet
      nodes.
   b. For Type3/4/5 curves, the `∂Q/∂H` term used for a surcharged node is the **negative of the
      slope of the curve line segment** on which the pumping rate lies; for the other types it is
      zero (their segments have zero slope).
   c. **No under-relaxation** is applied to consecutive pump flows at Step 3 of the iterative
      solution of §3.2.
3. **Power consumption (Eq. 6-2).** Energy in kilowatt-hours over a time step `Δt`:

$$Kwh = 0.7457\left(H_2 - H_1\right)\frac{Q\left(\frac{\Delta t}{3600}\right)}{8.814}$$

Heads in ft, Q in cfs, Δt in sec. Wire-to-water efficiency is **not** included. Totals are
reported per pump in the Pumping Summary Report, along with % time online and % time operating at
the lower/upper end of the pump curve.

## 2.2 Orifices (§6.2)

Orifices are regularly shaped, submerged openings with flow proportional to the square root of
the head across the opening. Uses: regulation of flow out of detention ponds/storage, sluice
gates in channels, diverting flow from interceptor sewers to overflow structures, storm-drain
inlet modeling.

### 2.2.1 Representation (§6.2.1)

An orifice is a **link between two nodes**. The opening is oriented in a **vertical plane**
(side orifice) or **horizontal plane** (bottom orifice) and can be elevated above the inlet
node's invert (Fig. 6-1). For kinematic wave the inlet node **must be a storage node** (the only
node with a true hydraulic head); for dynamic wave it can be any node. Properties: height of the
opening above the upstream-node invert; opening shape (circular or rectangular); opening
dimensions (diameter, or height + width); discharge coefficient; optional flap gate preventing
reverse flow. The **setting** = the fraction of full height that remains open (e.g., a sluice
gate); an optional parameter is the time to fully close/open the orifice.

### 2.2.2 Flow rate for a submerged inlet (Eq. 6-3)

Torricelli's equation (Brater et al., 1996):

$$Q = C_d A_O \sqrt{2gH_e}$$

- **Discharge coefficient `C_d`:** most commonly 0.6; **0.4 recommended for ragged-edge orifices**
  (FHWA, 2009). Brater et al. (1996) review experiments showing 0.59–0.67 depending on shape,
  size, and effective head.
- **Area of opening `A_O`:** depends on the setting. Let `ω` = setting at the end of the previous
  routing step and `ω*` = target setting from the last control-rule activation. If close/open
  time `Δt_O` = 0, `ω = ω*`. Otherwise with `Δω = ω* − ω`, `ω` updates as (**Table in §6.2.2**,
  Eq. 6-4):

| Condition | Value |
|---|---|
| `Δt/Δt_O < Δω` | `ω + sgn(Δω)·Δt/Δt_O` |
| otherwise | `ω*` |

`A_O` is then computed with the Chapter 5 geometry functions for a circular or rectangular
section at fraction `ω` of its full height.
- **Effective head `H_e`:** let `H₁` = most recently computed head at the nominal upstream node,
  `H₂` at the nominal downstream node. For kinematic wave, `H₁` = storage water-surface elevation
  and `H₂` = the downstream node's invert elevation. **If `H₁ < H₂` and there is no flap gate,
  the head values are reversed** (so `H₁` holds the higher value) and the computed flow is
  opposite to the nominal downstream direction. With `Z_O` = elevation of the bottom of the
  opening and `Y_full` = its full height:

  **Side orifice (Eq. 6-5):**

  | Condition | `H_e` |
  |---|---|
  | `H₂ < Z_O + ωY_full/2` | `H₁ − (Z_O + ωY_full/2)` |
  | otherwise | `H₁ − H₂` |

  **Bottom orifice (Eq. 6-6):**

  | Condition | `H_e` |
  |---|---|
  | `H₂ ≤ Z_O` | `H₁ − Z_O` |
  | otherwise | `H₁ − H₂` |

  (Fig. 6-2 illustrates the side-orifice head determination.)

### 2.2.3 Flow rate for an unsubmerged inlet (weir behavior) (§6.2.3)

When the inlet water level is below the top of a side opening, or below a threshold for a bottom
opening, the orifice behaves like a weir and Eq. 6-3 no longer applies (Fig. 6-3). SWMM computes
a **threshold head `H*`** and an **equivalent weir coefficient and crest length** for use with
the standard rectangular weir formula.

**Side orifices.** Weir behavior occurs when the inlet level is below the top of the opening
(Eq. 6-7):

$$H^{*} = Z_O + \omega Y_{full}$$

When `H₁ < H*` the flow is given by the general weir formula (Eq. 6-8):

$$Q = C_W L \left(H_1 - Z_O\right)^{1.5}$$

Equating Eq. 6-8 with the orifice equation 6-3 at `H₁ = H*` and solving for `C_W·L` (Eq. 6-9):

$$C_W L = \frac{C_d A_O \sqrt{g}}{\omega Y_{full}}$$

**Bottom orifices.** The threshold is where the orifice and weir equations give equal flow
(Eq. 6-10):

$$C_d A_O \sqrt{2g}\,(H^{*} - Z_O)^{0.5} = C_W L (H^{*} - Z_O)^{1.5}$$

so (Eq. 6-11):

$$H^{*} = Z_O + \frac{C_d A_O \sqrt{2g}}{C_W L}$$

`C_W` is set to the commonly cited sharp-crested value **3.33 ft^0.5/sec** (Mays, 2001) and `L`
to the circumference of the opening (Eq. 6-12):

| Opening | `L` |
|---|---|
| circular | `π ω Y_full` |
| rectangular | `2(b + ω Y_full)` (b = fixed width) |

Below `H*`, bottom-orifice flow uses Eq. 6-8 with `C_W = 3.33` and `L` from Eq. 6-12.

**Tailwater submergence correction (Eq. 6-13).** When the general weir equation 6-8 is used and
the downstream head `H₂` is above the bottom of the orifice opening `Z_O`, the flow is multiplied
by the submergence factor (same Villemonte form used for weirs, §6.3):

$$f_S = \left[1 - \left(\frac{H_2}{H_1}\right)^{1.5}\right]^{0.385}$$

### 2.2.4 Flap-gate head-loss adjustment (§6.2.4)

An empirical formula from 1930s Iowa State University experiments (published by Armco, 1978)
(Eq. 6-14):

$$\Delta H = \frac{4U^2}{g}\exp\left(-1.15\,\frac{U}{\sqrt{H_e}}\right)$$

`ΔH` = head loss added by the flap gate (ft), `U` = velocity through the orifice = `Q/A_O`
(ft/sec). Flow is first computed without this loss; `ΔH` is then subtracted from `H_e`, and the
flow is recomputed with the adjusted effective head.

### 2.2.5 Dynamic wave considerations (§6.2.5)

An orifice has no length and should contribute zero surface area to a node. But older SWMM
represented an orifice as an equivalent pipe that did contribute; for backward compatibility SWMM
5 assigns a surface area `A_SL` (**Eq. 6-15**):

| Orifice type | `A_SL` |
|---|---|
| side | `W(Y_O)·L_O` |
| bottom | `A(ω Y_full)` |

where:
- `Y_O` = depth of flow through the orifice (ft) = `min(H₁ − Z_O, ωY_full)`
- `L_O` = equivalent conduit length (ft) = `max(2Δt_max√(gY_full), 200)`, with `Δt_max` = the
  user-assigned maximum time step (sec)
- `W(Y)`, `A(Y)` evaluated with Chapter 5 formulas for a circular or closed-rectangular section

Half of `A_SL` is assigned to each end node, provided the node is not a storage unit and its head
is above the orifice opening.

**dQ/dH for surcharged nodes (cf. §3.3.5):**
- Submerged headwater (Eq. 6-3 in use), Eq. 6-16: `dQ/dH = 0.5·Q/H_e`
- Unsubmerged headwater (Eq. 6-8 in use), Eq. 6-17: `dQ/dH = 1.5·Q/(H₁ − Z_O)`

### 2.2.6 Summary of orifice computations (§6.2.6)

**At the start of a time step:**
1. If the setting has not reached its target, or the target changed via control rules, update the
   setting using Eq. 6-4.
2. If the setting changed, compute `A_O`. For side orifices compute `H*` (Eq. 6-7) and `C_WL`
   (Eq. 6-9). For bottom orifices compute `L` (Eq. 6-12), `H*` (Eq. 6-11), and set the equivalent
   weir constant to `3.33·L`.

**For each flow iteration within a time step:**
1. Take `H₁` (upstream) and `H₂` (downstream); for kinematic wave `H₂` = downstream invert.
2. If `H₁ < H₂`, reverse so `H₁` is the higher head (reverse flow will occur). If the orifice has
   a flap gate, or `H₁` is below the opening, set flow to 0.
3. If unsubmerged upstream (`H₁ < H*`), use Eq. 6-8 plus tailwater submergence correction
   Eq. 6-13; otherwise compute `H_e` via Eq. 6-5 (side) or Eq. 6-6 (bottom) and use Eq. 6-3.
4. Flap gate: reduce `H_e` by the Eq. 6-14 loss and repeat the flow calculation. **[ERR: the
   manual says "repeat the flow calculation of step 2"; it means step 3.]**
5. If reverse flow, make the computed flow negative.
6. Dynamic wave: assign surface area via Eq. 6-15 and `dQ/dH` via Eq. 6-16 (submerged) or
   6-17 (unsubmerged).

## 2.3 Weirs (§6.3)

**Transverse weir:** a barrier with a cut-out placed across a conduit, perpendicular to flow.
**Side weir:** a cut-out along the side wall, parallel to flow. Weir flow is proportional to the
height of water above the crest raised to a power > 1. Weirs normally maintain a free surface
above them (unlike orifices).

### 2.3.1 Representation (§6.3.1)

A weir is a link between two nodes; kinematic wave requires a storage inlet node. Properties:
crest height above the upstream-node invert; orientation (transverse or side flow); opening shape
and dimensions; number of end contractions; effective weir coefficient; optional flap gate.
**Figure 6-4** shapes: suppressed rectangular (opening spans the whole channel), contracted
rectangular, triangular, trapezoidal; **only rectangular is allowed for side weirs**. Sharp-crested
vs broad-crested classification depends on crest thickness. **Setting `ω`** = the fraction of the
full height remaining open after the crest is moved (downward-opening weir gate or inflatable
dam). At `ω = 1` the crest is at its lowest position (full opening height available); at `ω = 0`
no opening height remains (no flow). At intermediate settings the crest elevation equals its
lowest value plus `(1 − ω)Y_full`.

### 2.3.2 Transverse weirs (§6.3.2)

**General equations** (Brater et al., 1996):
- Rectangular (Eq. 6-18): `Q = C_W L_e H_e^(3/2)`
- Triangular (Eq. 6-19): `Q = C_W tan(θ/2) H_e^(5/2)` (`θ` = slot angle)
- Trapezoidal = rectangular + two half-triangular (Featherstone and Nalluri, 1982)
  (Eqs. 6-20a–c): `Q = Q_R + Q_T`, `Q_R = C_WR L_e H_e^(3/2)`, `Q_T = C_WT s H_e^(5/2)`, where
  `s` = side-wall slope (run/rise) and `C_WR`, `C_WT` = coefficients for the rectangular and
  triangular portions.

**Effective head (Eq. 6-21):**

$$H_e = H_1 - \left(Z_W + (1-\omega)Y_{full}\right)$$

`H₁` = the higher of the heads at the weir's end nodes; `Z_W` = crest elevation when fully open
(`ω = 1`); `Y_full` = full opening height. If `H₁` corresponds to the downstream node, reverse
flow occurs (flow = 0 if a flap gate is present). Flow = 0 if `H_e ≤ 0`.

**Effective crest length (Eq. 6-22)** — reduced by end contractions (Mays, 2001):

$$L_e = L - 0.1\,n\,H_e$$

`n` = 1 if the weir is away from one side wall, 2 if away from both, 0 if it occupies the entire
conduit width.

**Partial setting of triangular weirs.** With `ω < 1` a triangular opening becomes trapezoidal;
use the trapezoidal equations with `C_WR = C_WT` = the original coefficient, `s = tan(θ/2)`, and
(Eq. 6-23):

$$L_e = 2s(1-\omega)Y_{full}$$

Eq. 6-23 is also used for a trapezoidal weir with `ω < 1`.

**Weir coefficient `C_W`:**
- Sharp-crested rectangular: **3.33 ft^1/2/sec** (Mays, 2001). For `H_W/L > 1/3` the coefficient
  varies with head and weir sizing/placement (Bureau of Reclamation, 2001); the
  **Kindsvater-Carter** method expresses this as (Eq. 6-24):

$$C_W = c_1\left(\frac{H_W}{Z_W}\right) + c_2$$

with `c1`, `c2` depending on `L/b` (crest length / full width of the containing section),
**Table 6-2** (units ft^1/2/sec):

| L/b | c1 | c2 |
|---|---|---|
| 0.2 | −0.0087 | 3.152 |
| 0.4 | 0.0317 | 3.164 |
| 0.5 | 0.0612 | 3.173 |
| 0.6 | 0.0995 | 3.178 |
| 0.7 | 0.1602 | 3.182 |
| 0.8 | 0.2376 | 3.189 |
| 0.9 | 0.3447 | 3.205 |
| 1.0 | 0.4000 | 3.220 |

- **Broad-crested behavior** occurs when the ratio of water level above the crest to the crest
  thickness exceeds a limit: 1–2 (Brater et al., 1996), 15 (French, 1985), 2–20 (Bureau of
  Reclamation, 2001). **Table 6-3** (Brater & King, 1976) gives broad-crested coefficients as a
  function of head (rows 0.2–5.5 ft) and crest breadth (columns 0.5–15 ft): above a ratio of
  about 2 the weir behaves sharp-crested with coefficient 3.32; below 0.5 the coefficient
  approaches 2.63.
- Triangular weir standard `C_W` = **2.5 ft^1/2/sec** (Mays, 2001); Figure 6-5 (Brater & King,
  1976) shows the range is small, 2.5–2.8.

### 2.3.3 Rectangular side weirs (§6.3.3)

Side-weir flow is spatially varied with decreasing discharge; rigorous distributed-coefficient
approaches are too complex for SWMM, so the **empirical Engels equation** (Metcalf & Eddy, Inc.,
1972) is used (Eq. 6-25):

$$Q = C_W L_e^{0.83} H_e^{1.67}$$

(Q cfs; `L_e`, `H_e` ft; `C_W` ft^1/2/sec). **[Manual note: previous SWMM versions used an
incorrect form with the exponent on `L_e` equal to 1.0.]** Eq. 6-25 applies to **positive**
(forward) flow; for **reverse flow** the standard rectangular weir equation 6-18 is used. `C_W` =
3.32 in the original Engels equation; Brunner (2014) notes side-weir coefficients should be lower
than transverse values, suggesting **1.5–2.6** for weirs modeling levees or roadways along
natural channels.

### 2.3.4 Submerged weir flow (§6.3.4)

Submergence occurs when the downstream water level `H₂` is above the crest elevation `Z_W`
(Fig. 6-6). The flow from the free-flow equation is then adjusted by the **Villemonte factor**
(Villemonte, 1947) (Eq. 6-26):

$$f_S = \left[1 - \left(\frac{H_2}{H_1}\right)^n\right]^{0.385}$$

where `n` is the exponent on head in the weir flow equation: **3/2** for transverse rectangular
(Eq. 6-18), **1.67** for side weirs (Eq. 6-25), **5/2** for triangular (Eq. 6-19). For
trapezoidal weirs separate submergence factors are computed for the rectangular portion
(`Q_R`, Eq. 6-20b, n = 3/2) and the triangular portion (`Q_T`, Eq. 6-20c, n = 5/2).

### 2.3.5 Surcharged weir flow (§6.3.5)

SWMM weirs assume the top of the flow opening reaches the top of the housing structure. In an
open channel the highest head the weir can see is `ωY_full` (with `ω` = current setting). If the
structure encloses the weir from above (e.g., in a sewer pipe), the upstream head can exceed the
crown and the weir becomes **surcharged** (Fig. 6-6), acting as an orifice. Its flow is the
equivalent of Eq. 6-3 (Eq. 6-27):

$$Q = C_d A_O \sqrt{2gH_e} = C_O \sqrt{H_e}$$

where `C_O` is an **equivalent orifice constant** (ft^5/2/sec). `C_O` is evaluated by setting
Eq. 6-27 equal to the appropriate weir equation (6-18, 6-19, 6-20, or 6-25) at a weir head
`H_e = ωY_full`, for which the corresponding orifice head is `ωY_full/2` (Eq. 6-28):

$$C_O = \frac{Q_W(\omega Y_{full})}{\sqrt{\omega Y_{full}/2}}$$

where `Q_W(ωY_full)` = the weir-equation flow (cfs) at head `ωY_full`. **`C_O` is re-evaluated
each time the weir's setting changes.**

If the user allows surcharge, whenever `H₁ > Z_W + Y_full` the flow uses Eq. 6-27. The head is
computed as follows. Let `H*` be the head corresponding to half the opening height (Eq. 6-29):

$$H^{*} = Z_W + (1-\omega)Y_{full} + \frac{\omega Y_{full}}{2}$$

Then (**Table in §6.3.5**, Eq. 6-30):

| Condition | `H_e` |
|---|---|
| `H₂ < H*` | `H₁ − H*` |
| otherwise | `H₁ − H₂` |

In addition, the weir submergence correction (Eq. 6-26) is **not applied** in surcharge.

### 2.3.6 Flap-gate head-loss adjustment (§6.3.6)

Same Armco formula as orifices (Eq. 6-31):

$$\Delta H = \frac{4U^2}{g}\exp\left(-1.15\,\frac{U}{\sqrt{H_e}}\right)$$

To evaluate the velocity one needs the effective flow area `A_e` (**Eq. 6-32**):

| Condition | `A_e` |
|---|---|
| normal weir flow | `A(H_W + y_C) − A(y_C)` |
| surcharged weir flow | `A(Y_full) − A(y_C)` |

`Y_full` = full opening height, `y_C` = crest rise due to the setting = `(1 − ω)Y_full`, and
`A(y)` = area of the weir opening at flow depth y (Chapter 5 geometry for rectangular, triangular,
or trapezoidal shapes). `U = Q/A_e` with the flow from the previous sections; `ΔH` is subtracted
from `H_e` and the flow recomputed.

### 2.3.7 Dynamic wave considerations (§6.3.7)

A weir contributes **no surface area** to its end nodes. The flow derivative with respect to head
`dQ/dH`, used for surcharged end nodes (§3.3.5), is (**Table 6-4**):

| Weir type | `dQ/dH` |
|---|---|
| Transverse rectangular | `1.5 |Q| / H_e` |
| Side rectangular, Q ≥ 0 | `1.67 |Q| / H_e` |
| Side rectangular, Q < 0 | `1.5 |Q| / H_e` |
| Transverse triangular, fully open (ω = 1) | `2.5 |Q| / H_e` |
| Transverse triangular, partly open (ω < 1) | `1.5 |Q_R|/H_e + 2.5 |Q_T|/H_e` |
| Transverse trapezoidal | `1.5 |Q_R|/H_e + 2.5 |Q_T|/H_e` |

For trapezoidal openings, `Q_R` = flow through the central rectangular portion and `Q_T` = flow
through the triangular end portions (see Eq. 6-20).

### 2.3.8 Summary of weir computations (§6.3.8)

If the weir is allowed to surcharge and its setting `ω` changes at the start of a time step,
recompute `C_O` with Eq. 6-28. Then for each flow iteration:
1. Take `H₁` (upstream) and `H₂` (downstream); kinematic wave: `H₂` = downstream invert.
2. If `H₁ < H₂`, reverse so `H₁` is the higher head (reverse flow). If a flap gate is present, or
   `H₁` is below the weir crest, set flow to 0.
3. If `H₁` is above the top of the weir's opening and surcharge is allowed, use Eq. 6-27 with the
   head from Eqs. 6-29/6-30.
4. Otherwise use Eq. 6-21 for `H_e` and the appropriate flow equation — 6-18, 6-19, 6-20, or
   6-25 by weir type.
5. Flap gate: adjust `H_e` via Eq. 6-31 and repeat steps 3–4.
6. If not surcharged, correct for tailwater submergence with Eq. 6-26.
7. If reverse flow, make the flow negative.
8. Dynamic wave: compute `dQ/dH` from Table 6-4.

## 2.4 Outlets (§6.4)

The **outlet** is a generic flow regulator with a user-defined rating curve relating flow rate to
effective head, for cases where orifice/weir relations don't apply. Examples: a side orifice
using the **Smith & Coleman weir equation** (flow ∝ head^1.645, Metcalf & Eddy, Inc., 1972); a
perforated riser pipe with a grate top; a **vortex-type flow regulator** (Hydro International,
2009; Faram et al., 2010). Kinematic wave: the upstream node must be a storage node.

Properties: offset above the upstream-node invert; a rating curve (head vs flow); whether head is
defined by just the upstream-node water level or by the **head difference** between upstream and
downstream nodes; optional flap gate. An outlet can also carry a **flow setting** 0–1 (modified
by control rules) that multiplies the curve-derived flow.

Rating curves: an analytical power law (Eq. 6-33):

$$Q = a H_e^b$$

(`a`, `b` user constants), or a tabular listing of `(H_e, Q)` points.

**Computation steps (§6.4):**
1. `H₁` = upstream-node head, `H₂` = downstream-node head (kinematic: `H₂` = downstream invert).
2. If `H₁ < H₂`, reverse so `H₁` is higher (reverse flow). If a flap gate exists or `H₁` is below
   the outlet's offset elevation, flow = 0.
3. Dynamic wave, if the rating curve is based on head difference: `H_e = H₁ − max(H₂, Z_O)`
   (`Z_O` = offset elevation). Otherwise `H_e = H₁ − Z_O`.
4. Analytical curve: Eq. 6-33. Tabular curve: linearly interpolate between the bracketing head
   values; if `H_e` is below the first entry use the first entry's flow; if above the last entry
   use the last entry's flow.
5. Multiply `Q` by the current outlet setting; change sign if reverse flow.

## 2.5 Manual ambiguities & errata — Chapter 6

1. **[ERR]** §6.2.6 step 2 says "For **side weirs** use Equation 6-7 …" — the context is
   orifices; should read "side **orifices**". Step 4 says "repeat the flow calculation of
   **step 2**" — should be step 3.
2. **Ambiguous** §6.2.2, Eq. 6-4: the condition is printed `Δt/Δt_O < Δω`. Since `Δω = ω* − ω`
   can be negative and has units of a setting (dimensionless), comparing the dimensionless time
   ratio to a signed delta is sign/scale confused as printed. One must read it as comparing to the
   magnitude of the required setting change; the manual doesn't define `|Δω|`.
3. **Ambiguous** §6.3.2, Eq. 6-24 (Kindsvater-Carter): `C_W = c1(H_W/Z_W) + c2` uses the crest
   elevation `Z_W` in the denominator, whereas standard references use the crest height above the
   channel bottom; `H_W` is not defined in the manual, and no guidance is given on how `Z_W` is
   interpreted in the ratio (the manual only defines `Z_W` as "the elevation of the weir's crest
   when fully open").
4. **Ambiguous** §6.3.4: the submergence condition is stated as `H₂ > Z_W` (downstream water above
   the crest), but Eq. 6-26 uses the raw ratio `H₂/H₁` with no crest term; the manual does not
   quantify when the Villemonte factor saturates (e.g., near-full drowning).
5. **Ambiguous** §6.3.5: the surcharge trigger is `H₁ > Z_W + Y_full`, yet the section's opening
   paragraph notes the max head an open-channel structure can supply is `ωY_full`; the interaction
   between the "structure crown" and the setting-reduced opening top is left implicit.
6. **Ambiguous** §6.4 step 3: for a rating curve not based on head difference, `H_e = H₁ − Z_O`
   regardless of downstream head; downstream conditions enter only through the step-2 head
   reversal. No tailwater/submergence handling is described for outlet curves.

---

# PART 3 — Advanced Features (Chapter 7)

## 3.1 Evaporation and seepage (§7.1)

### 3.1.1 Conduits (§7.1.1)

Evaporation and seepage losses from conduits are modeled as a **uniformly distributed lateral
outflow along the conduit length**.

**Distributed uniform evaporation rate (Eq. 7-1)** — only open channels can evaporate:

$$q_E = e_t\,W\!\left(\overline{\overline{Y}}\right)$$

where `q_E` = distributed evaporation rate along the channel (cfs/ft); `e_t` = potential
evaporation rate per unit area over the current time period (cfs/ft²); `Ȳ` (printed
`overline overline Y`) = average flow depth in the channel over the time period (ft); `W(Y)` =
water-surface width at depth Y (ft), from Chapter 5 geometry. Evaporation data sources (historical
daily NWS values, temperature-derived values, monthly averages, hourly time series — Volume I
Hydrology) supply `e_t` in cfs/ft² internally.

Average depth `Ȳ`:
- Kinematic wave (Eq. 7-2): `Ȳ = (Y(A₁ᵗ) + Y(A₂ᵗ))/2`, where `A₁ᵗ`, `A₂ᵗ` = flow areas at the
  upstream/downstream ends computed at time t, and `Y(A)` is the depth-vs-area function of Ch. 5.
- Dynamic wave (Eq. 7-3): `Ȳ = (Ȳᵗ + Ȳ^(t+Δt))/2`, with `Ȳ = (Y₁ + Y₂)/2`; the `t+Δt` values use
  Eq. 3-16 with the most recent nodal-head solution `H^last` as iterations unfold, so `q_E`
  changes within a time step.

**Distributed uniform seepage rate (Eq. 7-4):**

$$q_S = s\,f_c\,W\!\left(\overline{\overline{Y}}\right)$$

with `q_S` = seepage rate per length (cfs/ft); `s` = user-supplied seepage rate per unit area for
the conduit (cfs/ft²); `f_c` = monthly climate adjustment factor for the current time step
(dimensionless — 12 user constants for the study area allowing seasonal variation); `Ȳ` as above.
Seepage is a constant rate per unit area, one value per conduit.

**Equation 7-4 assumes vertical-only seepage**, so the wetted area is limited by the largest
horizontal extent of the cross section: the average depth `Ȳ` is limited by the depth at which
the cross-section width is a maximum. **Table 7-1** — relative depth at maximum width:
Circular 0.50, Ellipsoid 0.48, Arch 0.28, Basket Handle 0.20, Egg 0.64, Horseshoe 0.50, Catenary
0.25, Gothic 0.45, Semi-Circular 0.15, Semi-Elliptical 0.15. For other shapes: Modified Basket
Handle → the height of its bottom rectangular portion (Eq. 5-15); irregular channels and custom
conduit shapes → the width-table entry just prior to where width begins decreasing with depth (or
full depth if width always increases); all others → full depth.

**Total uniform loss rate (Eqs. 7-5…7-7):** `q_L = q_E + q_S`. Over any time step `Δt` the lost
volume cannot exceed the average volume contained in the conduit, `q_L L Δt ≤ Ā·L` (Eq. 7-6),
so:

$$q_L = \min\left(q_L, \frac{\overline{\overline{A}}}{\Delta t}\right)$$

where `Ā` = average flow area over the time step: kinematic (Eq. 7-8) `Ā = (A₁ᵗ + A₂ᵗ)/2`;
dynamic (Eq. 7-9) `Ā = (Āᵗ + Ā^(t+Δt))/2` with `Āᵗ = (A(Y₁)+A(Y₂))/2`. An additional constraint:
`q_L` cannot exceed the inflow `Q₁^(t+Δt)` (kinematic) or the last computed flow `Q^last`
(dynamic).

**Dynamic wave modifications.** The loss adds a term `ΔQ_lateral` to the flow-update equation
(Eq. 7-10):

$$Q_{t+\Delta t} = \frac{Q_t + \Delta Q_{inertia} + \Delta Q_{pressure} + \Delta Q_{lateral}}
{1 + \Delta Q_{friction}}, \qquad \Delta Q_{lateral} = 2.5\,\overline{U} q_L$$

with the other `ΔQ` terms from §3.2 (a sidebar gives the derivation). Also, `q_L·L` is added to
the total outflow from the upstream node of a conduit with positive flow, or to the total inflow
of the downstream node with negative flow — modifying the `ΣQ^(t+Δt)` term of Eq. 3-15a used to
update nodal heads.

**Kinematic wave modifications.** The continuity equation becomes (Eq. 7-11)
`∂A/∂t + ∂Q/∂x + q_L = 0`, whose finite-difference form (Eq. 7-12) reproduces the same nonlinear
equation for `A₂^(t+Δt)` as before (Eq. 7-13):

$$\beta\Psi\left(A_2^{t+\Delta t}\right) + C1\,A_2^{t+\Delta t} + C2 = 0$$

with `C1` from Eq. 4-9, `C2` from Eq. 4-10 **plus an added term `q_L·L/φ`**.

**[ERR: the sidebar pasted into §7.1.1 is titled "Computing Geometry Table Entries for Irregular
Cross Sections" and is identical to the §5.3 sidebar — it has nothing to do with the lateral-loss
momentum derivation described in the surrounding text. The derivation sidebar is missing.]**

### 3.1.2 Storage units (§7.1.2)

An open storage unit can lose water by evaporation from its top surface and, if unlined, seepage
into the soil beneath its bottom and sloped sides. Each loss is a rate per unit area of exposed
surface, computed from the depth at the **start of the computational time step**. The combined
loss is subtracted from the net inflow before computing the new depth.

**Evaporation (Eq. 7-14):**

$$Q_{EN} = e_t\,f_E\,A_{SN}(Y^t)$$

`Q_EN` = evaporation loss rate (cfs); `e_t` = potential evaporation rate per unit area at time t
(cfs/ft²); `f_E` = fraction of the rate realized (user-supplied per unit, normally 1.0, 0 if the
unit has a roof); `Yᵗ = Hᵗ − E` = stored water depth (water-surface elevation minus invert
elevation); `A_SN(Y)` = storage-unit surface area at depth Y (from the storage curve/shape, §5.5).

**Seepage — Green-Ampt infiltration (Eq. 7-15).** The rate per unit area is

$$q_{SN} = K_S\,f_C\left[1 + \frac{(\psi_S + d)\theta_d}{F}\right]$$

with `q_SN` (cfs/ft²), `K_S` = soil saturated hydraulic conductivity (ft/sec), `f_C` = monthly
climate adjustment factor (same set as for conduit seepage), `d` = depth of stored water above
the seepage area (ft), `ψ_S` = soil capillary suction head (ft), `θ_d` = soil moisture deficit
(dimensionless), `F` = cumulative depth of infiltrated water (ft). `θ_d` and `F` evolve over
time. **The only difference from the Volume I Green-Ampt formulation is that `ψ_S` is replaced by
`ψ_S + d`.** If either `ψ_S` or `θ_d` = 0, a constant seepage rate `K_S` independent of storage
depth is assumed; if `K_S` = 0, no seepage occurs.

Because the depth varies over sloped sides, **Green-Ampt is applied separately to two seepage
areas** — the flat bottom and the sloped sides (Fig. 7-1) (Eq. 7-16):

$$Q_{SN} = q_{btm}(d_{btm})A_{btm} + q_{side}(d_{side})A_{side}$$

- `d_btm = Yᵗ = Hᵗ − E` (depth above the bottom); `A_btm` = bottom surface area = the storage
  curve's area at depth 0.
- Average depth above the sloped sides (Eq. 7-17), with `d_min` = depth where sloped sides begin
  and `d_max` = depth where they end (both from the storage curve):

| Condition | `d_side` |
|---|---|
| `Yᵗ < d_min` | 0 |
| `d_min ≤ Yᵗ ≤ d_max` | `(Yᵗ − d_min)/2` |
| `Yᵗ > d_max` | `Yᵗ − (d_max − d_min)/2` |

- Effective sloped-side area (Eq. 7-18):

$$A_{side} = \min\left\{A(Y^t),\ A(d_{\max})\right\} - A_{btm}$$

**Total storage loss (Eqs. 7-19, 7-20):** `Q_LN = Q_EN + Q_SN`, capped so it cannot exceed the
volume stored at the start of the time step:

$$Q_{LN} = \min\left\{Q_{LN}, \frac{V_N(Y^t)}{\Delta t}\right\}$$

`Q_LN` is computed **once at the start of the time step** from the known water level. Dynamic wave:
subtracted from the `ΣQ^(t+Δt)` term of Eq. 3-15a (treated as a nodal outflow) each time the
node's head is updated (step 4 of §3.2). Kinematic wave: after all link flows are found, `Q_LN`
is added to the node's total outflow (Eq. 4-18) used to update volume/head (§4.3.5).

## 3.2 Minor losses (§7.2)

Minor (local) losses arise from bends, contractions, enlargements, and entrances/exits. A minor
loss is (Eq. 7-21):

$$\Delta H_L = K_{m,i}\frac{U_i^2}{2g}$$

`K_{m,i}` = loss coefficient at location i; location index i = 1 (entrance, upstream velocity),
2 (exit, downstream velocity), or 3 (average loss, average velocity). Minor losses enter the
St. Venant momentum equation as a per-unit-length loss `h_L` alongside the friction slope
(Eq. 7-22):

$$\frac{\partial Q}{\partial t} + \frac{\partial(Q^2/A)}{\partial x} + gA\frac{\partial H}{\partial x}
+ gAS_f - U\frac{q_L}{2} + gAh_L = 0, \qquad h_L = \frac{\sum_{i=1}^{3} K_{m,i}U_i^2}{2gL}$$

Finite-difference form (Eq. 7-23):

$$\frac{\Delta Q}{\Delta t} = 2\overline{U}\frac{\Delta\overline{A}}{\Delta t}
+ \overline{U}^2\frac{(A_2-A_1)}{L} - g\overline{A}\frac{(H_2-H_1)}{L}
- g\eta^2\frac{Q|\overline{U}|}{\overline{R}^{4/3}} + 2.5\overline{U}q_L
- \frac{Q\sum_{i=1}^{3} K_{m,i}|U_i|}{2L}$$

Re-arranged as the flow-update equation (Eq. 7-24):

$$Q_{t+\Delta t} = \frac{Q_t + \Delta Q_{inertia} + \Delta Q_{pressure} + \Delta Q_{lateral}}
{1 + \Delta Q_{friction} + \Delta Q_{loss}}, \qquad
\Delta Q_{loss} = \frac{\Delta t}{2L}\sum_{i=1}^{3} K_{m,i}|U_i|$$

(Eq. 7-25). **Minor losses are not computed for kinematic wave analysis** (its simplified momentum
equation only accounts for gravity and friction). Frost (2006) is cited for selecting `K_m` values;
**Table 7-2** classifies frequently/occasionally/rarely modeled losses for pipes, junctions, and
channels (e.g., flow-through-junction, bend-within-junction, and junction-with-lateral are
"frequently modeled"; culvert entrance/exit and channel bends are common).

## 3.3 Force mains (§7.3)

For dynamic wave, the user can designate circular pipes as **force mains** that use the
Hazen-Williams or Darcy-Weisbach equations for friction when pressurized. **Free-surface flow in
a force main still uses the Manning equation.**

### 3.3.1 Hazen-Williams force mains (§7.3.1)

Standard US form (Clark et al., 1977) (Eq. 7-26):

$$U = 1.318\,C_{HW}R_{full}^{0.63}S_f^{0.54}$$

`U` velocity (ft/sec), `R_full` full-pipe hydraulic radius (ft), `S_f` friction slope (ft/ft),
`C_HW` = user-supplied Hazen-Williams C-factor. Solved for `S_f` in Manning-like form (Eq. 7-27):

$$S_f = \frac{0.6|U|^{0.852}Q}{C_{HW}^{1.852}A_{full}R_{full}^{1.667}}$$

This replaces the Manning `S_f` when the force main flows full, so the friction term of the
dynamic-wave flow update (Eq. 3-14) becomes (Eq. 7-28):

$$\Delta Q_{friction} = 0.6g\frac{|\overline{U}|^{0.852}\Delta t}{C_{HW}^{1.852}R_{full}^{1.667}},
\qquad \overline{U} = \frac{Q^{last}}{A_{full}}$$

**Table 7-3** C-factors: Asbestos Cement 140, Brick Sewer 100, Cast Iron unlined 100 / asphalt
coated 140, Concrete 120, Corrugated Steel 60, Ductile Iron 140, Galvanized Iron 120, Plastic PVC
130, Polyethylene 140, Vitrified Clay 110, Welded Steel 100.

### 3.3.2 Darcy-Weisbach force mains (§7.3.2)

Head loss (Clark et al., 1977) (Eq. 7-29): `S_f = fU²/(2gD)`. With `D = 4R_full` for a circular
pipe (Eq. 7-30):

$$S_f = \frac{f|U|Q}{8gA_{full}R_{full}}$$

so the friction term becomes (Eq. 7-31):

$$\Delta Q_{friction} = \frac{f|\overline{U}|\Delta t}{8R_{full}}$$

Friction factor `f` from the Moody diagram as a function of Reynolds number and relative
roughness (Bhave, 1991):
- **Laminar flow:** `f = 64/Re` (Eq. 7-32), `Re = D|Ū|/μ`, μ = kinematic viscosity of water =
  1.1×10⁻⁵ ft²/sec. **[ERR: the manual prints the condition as "For laminar flow (Re ≥ 2000)" —
  the comparison direction is inverted; laminar means Re ≤ 2000.]**
- **Transition and rough turbulent (Re ≥ 4000):** Swamee-Jain approximation to
  Colebrook-White (Eq. 7-33):

$$f = \frac{0.25}{\left[\log\left(\frac{\epsilon}{3.7D} + \frac{5.74}{Re^{0.9}}\right)\right]^2}$$

`ε` = equivalent surface roughness height (ft), user-supplied; serves the same purpose as Manning
n or the C-factor. **Between Re = 2000 and 4000 linear interpolation is used between f at
Re = 2000 (equal to 0.032) and f at Re = 4000** (which depends on ε/D).

**Table 7-4** roughness heights ε (inches): Concrete 0.012–0.12, Cast Iron 0.010, Galvanized Iron
0.006, Asphalted Cast Iron 0.0048, Welded Steel 0.0018, PVC 0.00006.

### 3.3.3 Equivalent Manning's n (§7.3.3)

Because Manning's equation is still used for partly-full flow, SWMM derives an equivalent Manning
`n` by equating the Manning full-pipe flow to the Hazen-Williams or Darcy-Weisbach flow under
**fully turbulent** conditions at a friction slope equal to the pipe's bottom slope `S_O`.

**Hazen-Williams (Eqs. 7-34, 7-35):**

$$\left(\frac{1.486}{n}\right)^2 R_{full}^{4/3}S_O = \left(1.318C_{HW}R_{full}^{0.63}S_O^{0.54}\right)^2
\quad\Rightarrow\quad n = \frac{1.067\left(\frac{D}{S_O}\right)^{0.04}}{C_{HW}}$$

**Darcy-Weisbach (Eqs. 7-36…7-38):**

$$\left(\frac{1.486}{n}\right)^2 R_{full}^{4/3}S_O = \frac{2gDS_O}{f(\epsilon,\infty)},
\qquad f(\epsilon,\infty) = \frac{0.25}{\left[\log\left(\frac{\epsilon}{3.7D}\right)\right]^2},
\qquad n = \sqrt{\frac{f(\epsilon,\infty)}{185}}\,D^{1/6}$$

Summary: flowing full under dynamic wave, a force main uses Eq. 7-28 (H-W) or 7-31 (D-W) in place
of Eq. 3-14c for `ΔQ_friction`; for free-surface flow it uses the Manning form (Eq. 3-14c) with n
from Eq. 7-35 (H-W) or 7-38 (D-W).

## 3.4 Culverts (§7.4)

Culverts let a stream pass under a road/rail/trail (Fig. 7-2); equations come from FHWA's
*Hydraulic Design of Highway Culverts* (FHWA, 2012). Flow is controlled either by the **inlet**
(barrel capacity exceeds what the inlet accepts) or by the **outlet** (possibly backwater
limited). For SWMM's unsteady dynamic wave, culverts are analyzed to find the flow for **known
inlet and outlet depths**; **culvert analysis is not made under kinematic wave**. Any conduit link
can be a culvert by assigning one of the code numbers in Table H-1 (Appendix H; shape/material/
inlet configuration), consistent with its shape (circular, rectangular, ellipsoid, arch). Each
time step: first compute flow by the usual dynamic wave procedure (this is the **outlet control**
condition), then compute an **inlet-controlled** flow and keep the smaller if it is limiting.

### 3.4.1 Inlet control flow (§7.4.1)

Under inlet control a rating curve relates culvert flow to inlet head; the curve's shape depends
on shape, material, and inlet geometry. In normalized form (Fig. 7-3) headwater depth `Y₁` is
normalized by full barrel depth `Y_full` and flow by `A_full√Y_full`. Submerged inlet → orifice
behavior; unsubmerged → weir behavior. FHWA's NBS-tested curves are fitted to analytical
functions (Tables H-1, H-2).

### 3.4.2 Unsubmerged inlet control curves (§7.4.2)

Two forms. **Form 1** (Eq. 7-39):

$$\frac{H_1 - Z_1}{Y_{full}} = \frac{E_C}{Y_{full}} + K_I\left[\frac{Q_{IC}}{A_{full}\sqrt{Y_{full}}}\right]^{M_I} + Scf\,S_O$$

**Form 2** (Eq. 7-40):

$$\frac{H_1 - Z_1}{Y_{full}} = K_I\left[\frac{Q_{IC}}{A_{full}\sqrt{Y_{full}}}\right]^{M_I}$$

Definitions: `H₁` = head at the culvert's inlet node (ft); `Z₁` = inlet invert elevation (ft);
`Q_IC` = inlet-controlled flow (cfs); `E_C` = specific head at critical depth for `Q_IC` (ft);
`Y_full` = full barrel depth (ft); `A_full` = full barrel area (ft²); `S_O` = barrel slope (ft/ft);
`Scf` = slope correction factor (**0.7 for mitered inlets, −0.5 for all others**); `K_I`, `M_I` =
constants from Table H-2 for the culvert type in Table H-1. **`K_I` embeds a factor
`g^(−M_I/2)` so Eqs. 7-39/7-40 are dimensionally consistent.**

**Form 2 solves directly** for `Q_IC` given `H₁` (Eq. 7-41):

$$Q_{IC} = A_{full}\sqrt{Y_{full}}\left(\frac{H_1 - Z_1}{K_I Y_{full}}\right)^{\frac{1}{M_I}}$$

**Form 1** requires critical-depth relations. Specific head at critical depth (Eq. 7-42)
`E_C = Y_C + U_C²/(2g)`; from the definition of critical depth (§5.6.1), `U_C² = g·A(Y_C)/W(Y_C)`
(Eq. 7-43) and (Eq. 7-44):

$$Q_{IC} = A(Y_C)\sqrt{g\frac{A(Y_C)}{W(Y_C)}}$$

Substituting into the form 1 equation yields a nonlinear equation in the single unknown `Y_C`
(Eq. 7-45):

$$\frac{Y_C}{Y_{full}} = \frac{H_1 - Z_1 - \frac{Y_{HC}}{2}}{Y_{full}}
- K_I\left[\frac{A(Y_C)}{A_{full}}\sqrt{g\frac{Y_{HC}}{Y_{full}}}\right]^{M_I} - Scf\,S_O$$

where `Y_HC` = critical hydraulic depth = `A(Y_C)/W(Y_C)`. Solved with **Ridder's method**
(Appendix B), initial bracket on `Y_C` of 10–100% of `H₁ − Z₁`, stopping tolerance 0.001 ft;
`Q_IC` then follows from Eq. 7-44.

### 3.4.3 Submerged inlet control curve (§7.4.3)

(Eq. 7-46):

$$\frac{H_1 - Z_1}{Y_{full}} = c_I\left[\frac{Q_{IC}}{A_{full}\sqrt{Y_{full}}}\right]^2 + y_I + Scf\,S_O$$

`c_I`, `y_I` = Table H-2 constants for the culvert type; **`c_I` embeds a factor `1/g`**. Solving
(Eq. 7-47):

$$Q_{IC} = \left[\left(\frac{1}{c_I}\right)\left(\frac{H_1 - Z_1}{Y_{full}} - y_I - Scf\,S_O\right)\right]^{1/2} A_{full}\sqrt{Y_{full}}$$

### 3.4.4 Inlet control transition zone (§7.4.4)

The submerged equation applies for `Q_IC/(A_full√Y_full) > 4.0`, converted to a head condition
(Eq. 7-48):

$$H_1 > H_{IS} = Z_1 + Y_{full}\left(16c_I + y_I + Scf\,S_O\right)$$

The unsubmerged equation applies below `Q_IC/(A_full√Y_full) = 3.5`, but this can't be converted
to an a priori head limit because of the `E_C` term, so SWMM uses an **arbitrary criterion**
(Eq. 7-49):

$$H_1 < H_{IU} = Z_1 + 0.95\,Y_{full}$$

Between `H_IU` and `H_IS` the inlet-controlled flow is linearly interpolated (Eq. 7-50):

$$Q_{IC} = Q_{IC}(H_{IU}) + \left(Q_{IC}(H_{IS}) - Q_{IC}(H_{IU})\right)
\frac{H_1 - H_{IU}}{H_{IS} - H_{IU}}$$

### 3.4.5 Flow derivatives (§7.4.5)

`dQ_IC/dH₁` for surcharged end nodes (§3.3.5), (Eq. 7-51):

$$\frac{dQ_{IC}}{dH_1} = \begin{cases}
\frac{Q_{IC}}{M_I H_1} & \text{unsubmerged} \\[2mm]
\frac{0.5 A_{full}^2}{c_I Q_{IC}} & \text{submerged} \\[2mm]
\frac{Q_{IC}(H_{1S}) - Q_{IC}(H_{1U})}{H_{1S} - H_{1U}} & \text{transition}
\end{cases}$$

### 3.4.6 Summary of culvert analysis (§7.4.6)

1. Compute a first flow estimate `Q` with Eq. 3-14 (outlet control).
2. If the conduit is not flowing full at both ends, compute the inlet-control limit `Q_IC`:
   Eqs. 7-41 or 7-45 if `H₁ < H_1U`; Eq. 7-47 if `H₁ > H_1S`; Eq. 7-50 if between.
3. If `Q_IC < Q`, replace `Q` with `Q_IC` and use Eq. 7-51 for the conduit's `dQ/dH`.

## 3.5 Roadway weirs (§7.5)

When headwater rises to road elevation the culvert is overtopped (Fig. 7-4). SWMM models flow
across the road with a **roadway weir** — a special transverse rectangular weir with its own
coefficient and submergence methods based on road characteristics (Fig. 7-5 shows the node-link
setup with a culvert). Flow (FHWA, 2012) (Eq. 7-52):

$$Q = f_S\,C_W L\,H^{3/2}$$

`Q` = overtopping flow (cfs), `H` = upstream water surface height above the roadway crest (ft),
`L` = roadway crest length (ft), `C_W` = free-flow weir discharge coefficient (ft^1/2/sec),
`f_S` = submergence adjustment factor. FHWA publishes `C_W` and `f_S` as functions of headwater
depth `H`, tailwater depth `h_t`, roadway width `L_r`, and road surface material (Fig. 7-6,
graphical).

Properties: crest elevation (typically road surface); crest length (top width of the crossed
channel); roadway width (perpendicular to crest length); paved or gravel surface. **Unlike other
weirs, a roadway weir has neither a control setting nor a flap gate.** Its head `H` = inlet-node
head − crest elevation; tailwater `h_t` = outlet-node head − crest elevation; coefficients from
Figure 7-6 curves.

## 3.6 Storm drain inlets (§7.6)

Inlets convey runoff from roadways into below-ground sewers (Fig. 7-7). Equations are from FHWA's
*Urban Drainage Design Manual* HEC-22 (FHWA, 2009), incorporated into SWMM's routing routines.

### 3.6.1 Model setup (§7.6.1)

Dual drainage system: **street conduits** (ground surface) above **sewer conduits**; an inlet
diverts part of the street flow into a designated sewer node, the rest bypassing downstream.
When the sewer node reaches full depth, excess flow floods back through the inlet onto the
street (two-way exchange). HEC-22 assumes curb/gutter inlets sit in conduits with the **Street
cross-section** shape (§5.4); streets without inlets still need a Street shape if spread/depth
reporting is desired. Streets can be single- or dual-sided; each side gets the replicate number of
inlets; a street needing mixed inlet designs must be split into separate street conduits, each
with one design type. Inlets are **on-grade** (continuous slope; capture depends on approach
flow) or **on-sag** (low point; capture depends on ponded depth). There is no physical link
between street and sewer, so sewer manhole rims need not match street node inverts.

### 3.6.2 Computational scheme (§7.6.2)

Each routing time step SWMM adjusts lateral inflows: (1) compute captured flow at each inlet via
HEC-22 (standard) or table lookup (custom), using current street flows/depths; (2) add the
captured flow to the sewer node's lateral inflow and subtract it from the downstream street node's
lateral inflow; (3) any sewer-node overflow is added to the street node's lateral inflow (two-way
exchange once sewer water reaches ground); (4) apply the usual routing. For two-sided streets,
capture is computed for one side using **half** the total street flow as approach flow, then
doubled.

### 3.6.3 Flow capture for on-grade inlets (§7.6.3)

**Grate inlets.** (Eq. 7-53):

$$Q_c = Q\left\{R_f E_0 + R_s(1 - E_0)\right\}$$

`Q_c` = captured flow (cfs), `Q` = approach flow (cfs), `E_0` = ratio of flow over the grate's
width to total flow, `R_f` = frontal capture efficiency, `R_s` = side capture efficiency.
Frontal efficiency (Eq. 7-54):

$$R_f = 1 - 0.09\,\max(0,\ V - V_o)$$

Side efficiency (Eq. 7-55):

$$R_s = 1/\left\{1 + 0.15\,V^{1.8}/(S_x L^{2.3})\right\}$$

`V` = velocity over the grate (ft/sec), `V₀` = splash-over velocity (ft/sec), `S_x` = street
cross slope (ft/ft), `L` = grate length (ft). `V₀` increases with grate length; SWMM uses
polynomials fit by UDFCD (2010) (**Table 7-6**) for the common grate designs in **Table 7-5**
(P-50, P-50x100, P-30, Curved Vane, 45° Tilt Bar, 30° Tilt Bar, Reticuline); nonconforming grates
need a user-supplied `V₀`.

**Curb opening inlets.** (Eq. 7-56):

$$Q_c = Q\left\{1 - \left(1 - \min(1,\ L/L_T)\right)^{1.8}\right\}$$

`L` = curb-opening length, `L_T` = length for complete capture (Eq. 7-57):

$$L_T = 0.6\,Q^{0.42}S_L^{0.3}(nS_e)^{-0.6}$$

`S_L` = longitudinal street slope, `n` = street-surface Manning's n, `S_e = S_x + (a/W)E_0`
(a = curb depression, W = depressed gutter width, E₀ = fraction of flow over the gutter width).
If `L > L_T` capture is complete.

**Computing `E_0`.** Based on Izzard's form of Manning for a triangular section (Eq. 7-58) —
`Q = (0.56/n)S_x^1.67 S_L^0.5 T^2.67` (note: the standard Manning form uses 0.47). Spread (Eq. 7-59):

$$T = \left[\frac{Qn}{0.56\,S_x^{1.67}S_L^{0.5}}\right]^{0.375}$$

Uniform cross slope (a = 0) (Eq. 7-60): `E_0 = 1 − (1 − W/T)^2.67`. Compound cross section with
depressed curb (a > 0) (Eq. 7-61):

$$E_0 = \frac{1}{1 + \frac{\frac{S_W}{S_X}}{\left[1 + \frac{\frac{S_W}{S_X}}{\left(\frac{T}{W} - 1\right)}\right]^{2.67} - 1}}, \qquad S_W = S_X + \frac{a}{W}$$

Eq. 7-61 can't be solved directly (Eq. 7-59 for T(Q) assumes a uniform triangular section), so an
iteration is used: assume `T_X`; compute `E_0` via Eq. 7-61 with `T_X/W` substituted for `T/W − 1`
(cf. Eqs. 7-62…7-64: `Q_X = Q(1−E_0)`, `T_X = T − W`, `T/W − 1 = T_X/W`); recompute `T_X` from
Eq. 7-59 with `Q_X`; iterate until `T_X` is stable. If the grate is narrower than the depressed
gutter, `E_0` is adjusted by the ratio of flow area over the grate width to that over the gutter
width.

**Combination inlets.** Capture = grate capture + capture of the curb opening upstream of the
grate; the latter is computed first and subtracted from the approach flow used for the grate.

**Slotted inlets.** On-grade capture is the same as a curb opening of equal length.

**Custom inlets.** On-grade: a diversion curve (captured flow vs approach flow) if supplied,
otherwise a rating curve (captured flow vs water depth) applied at the downstream-end depth of the
street conduit.

### 3.6.4 On-sag inlet flow capture (§7.6.4)

At low depths the inlet acts as a weir (Eq. 7-66): `Q_c = C_W L_W d^1.5`; at higher depths as an
orifice (Eq. 7-67): `Q_c = C_O A_O √(2gd)`. `C_W` (ft^0.5/sec), `C_O`, `L_W` = effective inlet
length (ft), `A_O` = open area (ft²), `d` = effective depth (ft).

**Grate inlets:** `C_W = 3.0`, `C_O = 0.67`, `L_W = L + 2W`, `A_O = L W f_O` (f_O = open-area
ratio), `d = d_i − (W/2)S_W`, where `L` = grate length, `W` = width, `d_i` = water depth at the
downstream node of the street conduit. HEC-22 gives no clear weir→orifice switch depth for
grates, so SWMM assumes the switch occurs where Eqs. 7-66 and 7-67 are equal: **weir flow below
`d = 1.79 A_O/L_W`, orifice flow above**.

**Curb opening inlets:** for uniform cross slope, or openings longer than 12 ft, weir values are
`C_W = 3.0`, `L_W` = opening length; otherwise `C_W = 2.3`, `L_W = L + 1.8W` (L = opening length,
W = depressed-gutter width). Orifice values: `C_O = 0.67`, `A_O = hL` (h = opening height). The
effective depth under orifice flow depends on throat orientation (**Table 7-7**): horizontal
`d = d_i − h/2`; inclined `d = d_i − 0.7071(h/2)`; vertical `d = d_i`. Weir flow applies below
effective depth `h`, orifice flow above `1.4h`; between, linear interpolation (Eq. 7-68):

$$Q_c = (1 - r)Q_{weir} + rQ_{orif}, \qquad r = \frac{d - h}{0.4h}$$

(`Q_weir` at depth h, `Q_orif` at depth 1.4h.)

**Slotted inlets:** `C_W = 2.48`, `C_O = 0.8`, `L_W = L`, `A_O = L W`, `d_i = d` (L = length,
W = width). Weir flow for `d ≤ 0.2` ft, orifice flow for `d ≥ 0.4` ft, interpolation (Eq. 7-68)
with `Q_weir` at 0.2, `Q_orif` at 0.4, `r = (d − 0.2)/0.2`.

**Custom inlets:** on-sag uses the rating curve with the depth of the downstream node of the
street conduit; if only a diversion curve is supplied it is used, treating the inlet as on-grade.

### 3.6.5 Drop inlets (§7.6.5)

Drop inlets drain roadside ditches, swales, and flat-bottom channels; SWMM places them in open
rectangular or trapezoidal channels (Fig. 7-12), with the same §7.6.2 setup/scheme.

**Drop grate inlets.** On-grade capture uses the street-grate equation 7-53, but `E_0` (fraction
of flow over the grate) is (Eq. 7-69):

$$E_0 = \frac{1.486\sqrt{S_L}(yW)^{1.67}}{nQ(W + 2y)^{0.67}}$$

`W` = grate side length parallel to flow, `y` = channel flow depth, `n` = channel Manning's n,
`S_L` = channel longitudinal slope. A cross slope `S_X` of 1% is assumed unless the grate extends
across the entire bottom width of a trapezoidal channel, in which case `S_X` = channel side-wall
slope. On-sag drop grates use the same weir/orifice equations 7-66/7-67 as street grates except
the effective weir length `L_W` = the sum of the lengths of all four sides.

**Drop curb inlets.** Capture is computed like curb-opening inlets on sag; the effective length
= total length of all four sides, and the open area = opening height × total length of all four
sides.

### 3.6.6 Additional considerations (§7.6.6)

The section heading exists but contains no content in the manual.

## 3.7 Manual ambiguities & errata — Chapter 7

1. **[ERR]** §7.1.1 sidebar: pasted under the "Dynamic Wave Modifications" paragraph, it is
   titled "Computing Geometry Table Entries for Irregular Cross Sections" and is byte-for-byte the
   §5.3 sidebar — it is unrelated to the derivation of the modified momentum equation that the
   surrounding text describes. The intended derivation sidebar is missing.
2. **[ERR]** §7.3.2: the laminar-friction condition is printed "For laminar flow (**Re ≥ 2000**)";
   the comparison is inverted — laminar is `Re ≤ 2000` (the interpolation band 2000–4000 and the
   `Re ≥ 4000` turbulent condition that follow make the intent clear).
3. **Ambiguous** §7.1.2 references "Section 5.4" for storage curves and storage-unit shapes in
   three places; the storage-curve/geometry discussion is actually §5.5 (Section 5.4 is Street
   Cross-Sections). Likely a stale cross-reference.
4. **Ambiguous** §7.4.2, Eq. 7-39 form-1 equation: `Scf` (0.7 / −0.5) multiplies `S_O` inside
   the dimensionless head equation; the manual does not state whether `S_O` is dimensionless slope
   in ft/ft (it must be, for the product to be dimensionless) — worth confirming before
   implementation.
5. **Ambiguous** §7.5 roadway weirs: `C_W` and `f_S` are "determined from the curves in Figure
   7-6" — the figure is graphical in the manual (FHWA, 2012), so the exact functional forms/table
   of `C_W` and `f_S` vs head/tailwater/roadway width/material are not specified in this document.
6. **Ambiguous** §7.6.3: the note "(Note: the standard Manning equation has the same form except
   with the constant being 0.47)" refers to Eq. 7-58 (Izzard's 0.56 form); the manual gives no
   derivation or applicability limits of the 0.56 vs 0.47 choice.
7. **Ambiguous** §7.6.4 grate on-sag: the manual states the weir→orifice switch is "assumed" at
   the depth where Eqs. 7-66 and 7-67 are equal (`d = 1.79 A_O/L_W`), acknowledging HEC-22 gives
   no guidance; no smoothing/blending is described at the switch point.

---

# Cross-cutting notes

- **Head terminology.** In Chapters 6–7, `H₁`/`H₂` are *heads* (water-surface elevations); for
  kinematic wave the downstream node's head is always its invert elevation, so weir/orifice/
  outlet links with a downstream non-storage node always see full-free-discharge conditions.
- **Reverse flow convention.** Orifices, weirs, and outlets all use the same convention: if
  `H₁ < H₂` the head labels are swapped so the higher head is `H₁`, the flow is computed in that
  direction, and the result is negated at the end; a flap gate (or `H₁` below the opening/crest/
  offset) forces `Q = 0`.
- **Surcharge machinery.** `dQ/dH` for surcharged nodes (§3.3.5) is provided per link type:
  pumps (curve slope), orifices (Eqs. 6-16/6-17), weirs (Table 6-4), culverts (Eq. 7-51). A
  surcharged weir becomes an orifice via the equivalent constant `C_O` (Eq. 6-28) and drops the
  Villemonte submergence correction.
- **Chapter references into other chapters** used here: Eq. 3-14 (dynamic-wave flow update),
  Eq. 3-15a (nodal continuity), Eq. 3-16 (depth-from-head), §3.3.5 (surcharged-node head update),
  §4.2/4.3 (kinematic wave), Eqs. 4-8/4-9/4-10/4-18 (kinematic discretization), Appendix A
  (Newton-Raphson-Bisection), Appendix B (Ridder's method), Appendixes C–H (tables).
