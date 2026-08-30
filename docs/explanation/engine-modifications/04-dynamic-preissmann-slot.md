<!-- Part of the engine modifications explanation series -->

# Dynamic Preissmann slot

## Motivation

The `SURCHARGE_METHOD DYNAMIC_SLOT` option adds a third method of
surcharged flow. Official SWMM offers two ways of representing pressurized
flow in closed conduits: the EXTRAN algorithm (Hardy–Cross-type perturbation
with $dQ/dH$) and the static Preissmann slot. Both have known limitations in
filling/emptying transients: the static slot fixes its width from the
instantaneous depth, which at the free-surface/pressure mixing front
produces "slot squeezing", an artificial energy amplification. The
`DYNAMIC_SLOT` extension implements the *dynamic* Preissmann slot
formulation of Sharior, Hodges & Vasconcelos (2023), in which the slot area
evolves in time as a *transient storage* element.

## Formulation

The dynamic slot has an upper width that depends on the Preissmann number
$P$ and on a target pressure wave celerity $c_{pT}$ (set by the user
with `DPS_CELERITY`, 25 m/s by default):

$$T_s = \frac{g\,A_{\mathrm{full}}}{c_{pT}^{2}}\,P^{2},$$

where $A_{\mathrm{full}}$ is the full-section area. The Preissmann number
starts, at the beginning of pressurization, at

$$P_{0} = \max\!\left(\frac{c_{pT}}{\alpha\,c_g},\ 1\right),
  \qquad c_g = \sqrt{g\,A_{\mathrm{full}}/W_{\max}},$$

with $\alpha$ the shock parameter (`DPS_ALPHA`, 3 by default) and
$c_g$ the gravity wave celerity at full section. The slot area is
accumulated in a *path-dependent* way:

$$A_s \leftarrow \max\!\left(A_s + T_s\,\Delta h_s,\ 0\right),
  \qquad h_s = \max(\bar y - y_{\mathrm{full}},\ 0),$$

that is, each storage increment is created with the slot width in force at
the moment it is accumulated, and previous contributions are never rewritten
when $P$ decays. This property is what avoids the energy amplification of
"slot squeezing". If the head falls below the crown with residual area, the
overpressure head is kept at zero and the remaining area drains through
successive negative increments (depressurization hysteresis).

After pressurization, $P$ decays exponentially toward 1 with the time scale
`DPS_DECAY_TIME` ($r = 0.5$ s by default):

$$\hat P(t) = 1 + (\hat P_0 - 1)\exp\!\left(-\frac{10\,(t - t_s)}{r}\right),$$

with $t_s$ the instant the conduit entered surcharge, and it is smoothed
spatially once per step by averaging $\hat P$ over the conduits incident to
each node and taking as the working $P$ the average of the two ends of the
conduit.

## Consequences for the solver

While a slot is active:

- the hydraulic area is $A = A_{\mathrm{full}} + A_s$ and the top width
  is $T_s$;
- the surface area contributed to a surcharged end node is
  $T_s\,L/4$;
- the hydraulic radius stays at its full-section value (the slot
  contributes storage but no friction);
- node heads are *always* updated with the ordinary free-surface
  formula; the EXTRAN surcharge branch is never invoked, and the
  piezometric head above the crown emerges naturally as
  $z_{\mathrm{inv}} + y_{\mathrm{full}} + h_s$.

The variable time step uses the effective pressure celerity
$c_p = c_{pT}/P$ in the Courant condition of the surcharged conduit:

$$\Delta t \le \frac{L}{\lvert \bar U \rvert + c_{pT}/P}.$$
