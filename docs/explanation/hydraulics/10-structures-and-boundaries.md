# Structures and Boundaries

<!-- Part of the 1D Hydraulics explanation series -->

## Non-conduit hydraulic structures

The non-conduit structure flows are computed by `HydStructures.cpp` (`StructureSolver`) inside the dynamic-wave Picard iteration, one link at a time in link-index order (so that two pumps sharing a wet well see each other's draw), with immediate scatter into the node accumulators and under-relaxation at $\omega = 0.5$ for iterations $> 0$ (pumps exempt).

### Pumps

Pump on/off control uses depth hysteresis applied once per routing step:

$$\text{shut off if } d < d_{\mathrm{off}} \ (\text{setting} > 0), \qquad \text{start if } d > d_{\mathrm{on}} \ (\text{setting} = 0).$$

The pump curve types (1–5) determine the discharge $q$ from the curve versus wet-well volume (type 1), depth (types 2 and 4), or head (types 3 and 5, where $q$ is scaled by the speed setting $s$ and the head by $s^2$); an ideal pump discharges exactly the upstream node's inflow plus overflow. Flow limiting (legacy `getModPumpFlow`) prevents pumping more than is available (dry-draw protection) and, for type-1 pumps or storage-fed pumps, caps $q$ by $Q_{\mathrm{in}} + V_{\mathrm{old}}/\Delta t$.

### Orifices

Bottom and side orifices use a coefficient and a critical depth set up from the opening height $h_{\mathrm{open}} = s\,y_{\mathrm{full}}$ (setting $s$):

$$
\begin{aligned}
  f &= \min\!\left(\frac{\text{head}}{h_{\mathrm{crit}}},\ 1\right),
  \qquad h_{\mathrm{crit}} = \frac{C_d}{0.414}\,\frac{h_{\mathrm{open}}}{4}\ \text{(circular)}\ \text{or}\ \frac{C_d}{0.414}\, \frac{h_{\mathrm{open}}\,W_{\max}}{2(h_{\mathrm{open}} + W_{\max})} \text{(rectangular)},\\
  q &= \begin{cases}
    C_w\,f^{3/2} & f < 1 \quad\text{(weir-like partial flow)},\\
    C_d\,A_{\mathrm{eff}}\sqrt{2g\,H} & f \ge 1 \quad\text{(full orifice)},
  \end{cases}
\end{aligned}
$$

with $C_w = C_d\sqrt{h_{\mathrm{crit}}}\,A_{\mathrm{eff}}\sqrt{2g}$ (sharp-crested weir coefficient 0.414), $A_{\mathrm{eff}}$ the cross-section area at the opening height, and $H$ the appropriate head (differential head when submerged). The flow gradient is

$$\frac{dQ}{dH} = \frac{3}{2}\,\frac{q}{f\,h_{\mathrm{crit}}} \quad\text{(weir regime)}, \qquad \frac{dQ}{dH} = \frac{q}{2H} \quad\text{(orifice regime)}.$$

An optional ARMCO flap-gate head loss and the Villemonte submergence correction may be applied.

### Weirs

The four weir types (transverse, side-flow, V-notch, trapezoidal) discharge according to

$$
\begin{aligned}
  q &= C_d\,L\,h^{3/2} &&\text{(transverse)},\\
  q &= C_d\,L^{0.83}\,h^{1.67} &&\text{(side-flow, corrected)},\\
  q &= C_d\,s_h\,h^{5/2} &&\text{(V-notch)},
\end{aligned}
$$

with end contractions reducing the effective length. When the upstream hydraulic grade line reaches the crown ($H_1 \ge H_{\mathrm{crown}}$) and surcharging is allowed, the weir transitions to orifice flow using an equivalent-orifice coefficient computed from the weir discharge at full opening:

$$C_{\mathrm{sur}} = \frac{Q_{\mathrm{weir}}(s\,y_{\mathrm{full}})}{\sqrt{(s\,y_{\mathrm{full}})/2}}, \qquad q = C_{\mathrm{sur}}\sqrt{H_{\mathrm{orif}}},$$

with $H_{\mathrm{orif}}$ the head to the mid-point of the opening (or the differential head when submerged). If surcharging is not allowed, the head is capped at the crown and the weir equation is kept. Villemonte submergence correction applies when the downstream HGL exceeds the crest. The weir's surface-area contribution is zeroed for SWMM-4 compatibility.

### Outlets

Outlets use head- or depth-based rating curves (tabular or functional):

$$q = C\,H^{e} \quad\text{(functional)}, \qquad q = \mathrm{table}(H) \quad\text{(tabular)},$$

scaled by the setting. The $dQ/dH$ is deliberately left zero (matching legacy), which keeps the node surcharge denominator from being inflated.

## Outfall boundary conditions

Outfall stages are set at the start of each routing step and again inside each Picard iteration from the current conduit flows. For the conduit connected to an outfall at end offset $z$, with per-barrel flow $q$, the normal depth $y_n$ (from the inverse section factor) and critical depth $y_c$ are computed ($y_c$ has closed forms for standard shapes and a numerical root find otherwise). The stage depends on the boundary-condition type (`Outfall.cpp:setOutfallDepth`):

- **FREE**: free overfall, $d = z + \min(y_n, y_c)$.
- **NORMAL**: $d = z + y_n$.
- **FIXED**, **TIDAL**, **TIMESERIES**: the stage $s_{\mathrm{stage}}$ is constant, from a tidal table (hour of day), or from a time series; then

  $$d = \begin{cases} s_{\mathrm{stage}} - z_{\mathrm{inv}} & z + y_c + z_{\mathrm{inv}} < s_{\mathrm{stage}},\\ \max(0,\ s_{\mathrm{stage}} - z_{\mathrm{inv}}) & z > 0 \wedge s_{\mathrm{stage}} < z_{\mathrm{inv}} + z,\\ z + y_c & z > 0 \wedge s_{\mathrm{stage}} \ge z_{\mathrm{inv}} + z,\\ y_c & z = 0. \end{cases}$$

The last case keeps a free-discharging fixed outfall at the conduit critical depth. A flap gate at an outfall blocks reverse flow.

## Flow dividers

Dividers are active only under kinematic-wave (and steady) routing; under dynamic wave they act as ordinary junctions. Given the total inflow $Q_{\mathrm{in}}$ at the divider node:

- **Cutoff**: diverts all inflow above a minimum, $Q_{\mathrm{div}} = \max(0, Q_{\mathrm{in}} - q_{\min})$.
- **Overflow**: diverts the inflow above the capacity of the continuation link.
- **Tabular**: $Q_{\mathrm{div}} = Q_{\mathrm{in}}\cdot f(Q_{\mathrm{in}})$ with the fraction from a rating table.
- **Weir**: $Q_{\mathrm{div}} = C_d\,W\,d^{3/2}$ from a weir relation on the node depth, capped at the inflow.

The diverted flow is written to the diversion link; the continuation link carries the remainder.
