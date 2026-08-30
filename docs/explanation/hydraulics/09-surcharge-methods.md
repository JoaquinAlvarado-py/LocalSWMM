# Surcharge Methods

<!-- Part of the 1D Hydraulics explanation series -->

## Surcharge methods

The `SURCHARGE_METHOD` option selects how pressurized flow in closed conduits is treated. All three methods update the flow area of a surcharged conduit (depth $> y_{\mathrm{full}}$) by adding a narrow slot of width $w_s$:

$$A = A_{\mathrm{full}} + (y - y_{\mathrm{full}})\,w_s,$$

while the hydraulic radius is clamped to its full value $R_{\mathrm{full}}$ (the slot contributes storage but not friction).

### EXTRAN (default)

The classical perturbation method of [Node continuity, flooding, and surcharge](08-node-continuity.md): $dQ/dH$-based surcharged node updates with a crown cutoff at $y/y_{\mathrm{full}} = 0.96$ used for the width used in the surface-area computation.

### Static Preissmann slot

The conduit carries a fictitious narrow slot above the crown so the free-surface formulation remains valid throughout pressurization. The slot width follows the Sjöberg (1982) formula,

$$\frac{w_s}{W_{\max}} = 0.5423\, \exp\!\left(-\left(\frac{y}{y_{\mathrm{full}}}\right)^{2.4}\right),$$

applied for $0.985257 \le y/y_{\mathrm{full}} \le 1.78$, clamped at $w_s = 0.01\,W_{\max}$ above that, and zero below the cutoff.

### Dynamic Preissmann slot

An OpenSWMM extension (Sharior, Hodges & Vasconcelos 2023) in which the slot area evolves in time as an element of transient storage. The slot top width is driven by a target pressure-wave celerity $c_{pT}$ and a time-varying Preissmann number $P$:

$$T_s = \frac{g\,A_{\mathrm{full}}}{c_{pT}^{2}}\,P^{2}, \qquad P_{0} = \max\!\left(\frac{c_{pT}}{\alpha\,c_g},\ 1\right), \qquad c_g = \sqrt{g\,A_{\mathrm{full}}/W_{\max}},$$

with the shock parameter $\alpha = 3$ (default). The accumulated slot area is path-dependent,

$$A_s \leftarrow \max\!\left(A_s + T_s\,\Delta h_s,\ 0\right), \qquad h_s = \max(\bar y - y_{\mathrm{full}},\ 0),$$

and $P$ decays exponentially after pressurization onset and is spatially smoothed across nodes. While a slot is active, the top width is $T_s$ and the surface area contributed to a surcharged end node is $T_s\,L/4$. Nodal heads are updated with the ordinary free-surface formula at all times; the surcharge branch is never invoked. The variable time step uses the pressure celerity $c_p = c_{pT}/P$.
