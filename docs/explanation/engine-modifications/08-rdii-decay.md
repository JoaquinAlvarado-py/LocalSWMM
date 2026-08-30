<!-- Part of the engine modifications explanation series -->

# Physical recovery of the RDII abstraction (`[RDII_DECAY]`)

## Motivation

In official SWMM, rain-derived inflow and infiltration (RDII) is modeled
with the RTK method: each node responds with up to three triangular unit
hydrographs (short, medium and long) defined by $R$, $T$ and $K$,
convolved with the precipitation. The initial abstraction (storage capacity
before RDII is generated) is recovered between events at a *constant rate*
given by a monthly table (`IA_Recov`): the seasonal variation must be
pre-cooked into the user's input data.

## The extension: exponential decay abstraction

The `[RDII_DECAY]` extension replaces that constant recovery with a
physical model of *first-order exponential relaxation* whose rate depends on
the *air temperature*. The parameters per pair (hydrograph group, response)
are $k_{\mathrm{dep}}$, $k_0$, $k_T$, $T_{\mathrm{ref}}$,
$\theta_{\mathrm{rec}}$, $T_{\mathrm{cong}}$ and, optionally, a
rain/snow partition.

**Depletion during rain** ($k_{\mathrm{dep}}$): the available capacity
is depleted exponentially with the rainfall depth $\Delta P$,

$$IA_{\mathrm{avail}}^{+} = IA_{\mathrm{avail}}\,
    e^{-k_{\mathrm{dep}}\,\Delta P},
  \qquad
  P_{\mathrm{net}} = \max\!\left(0,\ \Delta P -
    \left(IA_{\mathrm{avail}} - IA_{\mathrm{avail}}^{+}\right)\right),$$

with consistent mass accounting (the storage drains exactly what it
abstracts). $k_{\mathrm{dep}} = 0$ disables the abstraction.

**Recovery between events** ($k_0$, $k_T$, $T_{\mathrm{ref}}$): the
available capacity relaxes toward the maximum,

$$\frac{d\,IA_{\mathrm{avail}}}{dt} = k_{\mathrm{rec}}(T)\,
    \left(IA_{\max} - IA_{\mathrm{avail}}\right),
  \qquad
  IA_{\mathrm{avail}}^{+} = IA_{\max} - \left(IA_{\max} - IA_{\mathrm{avail}}\right)
    e^{-k_{\mathrm{rec}}(T)\,\Delta t},$$

where the recovery rate depends on temperature with a temperature-independent
base (gravitational drainage / capillary redistribution) plus a thermal
term:

$$k_{\mathrm{rec}}(T) = \max\!\left(0,\ k_0 + k_T\,
    e^{\theta_{\mathrm{rec}}\,(T - T_{\mathrm{ref}})}\right),$$

and vanishes below the freezing temperature $T_{\mathrm{cong}}$ (frozen
soil), reproducing the early-spring RDII rise. The temperature comes from
the `[TEMPERATURE]` source of the project (time series or file); if not
configured, $T$ is set to $T_{\mathrm{ref}}$ and a warning is issued.

**Rain/snow partitioning (optional)**: with the `SNOW` clause,
$T \le T_{\mathrm{snow}}$ accumulates the precipitation as snow equivalent
(no liquid input), and with snow present and $T > T_{\mathrm{snow}}$ a
degree-day melt $m = \min\!\left(SWE,\ DDF\,(T - T_{\mathrm{snow}})\,\Delta t\right)$ is added to the rainfall (rain-on-snow).

The first-order recovery is faster when the deficit is large and slows down
near saturation, unlike the linear constant rate of official SWMM. Pairs
without a row in `[RDII_DECAY]` use the legacy linear model; the running
state (the depth $ia_{\mathrm{used}}$) is interchangeable between
formulations, so hot-start files are compatible.
