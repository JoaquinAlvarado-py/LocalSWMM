# Stability and Time Stepping

<!-- Part of the 1D Hydraulics explanation series -->

## Adaptive time stepping and the Courant condition

### Courant–Friedrichs–Lewy condition

Because the dynamic-wave scheme updates flows and heads element by element (there is no simultaneous spatial coupling), it is subject to the Courant condition: the time step must not exceed the time for a dynamic wave to traverse the shortest conduit,

$$\Delta t \le \frac{L}{\lvert U \rvert + c}, \qquad c = \sqrt{g\,\frac{A}{W}} \text{ (gravity-wave celerity).}$$

### Link-based step

For each conduit (`getLinkStep`, `DynamicWave.cpp:3711`) with per-barrel flow $q = \lvert Q \rvert/\mathrm{barrels}$, midpoint area $A$, and Froude number $\mathrm{Fr}$:

$$t = \frac{V/\mathrm{barrels}}{q}\, \frac{L'}{L}\,\frac{\mathrm{Fr}}{1 + \mathrm{Fr}},$$

(the classic SWMM CFL expression, scaled by the lengthened/raw length ratio). Under the dynamic Preissmann slot a surcharged conduit instead uses the pressure celerity,

$$t = \frac{L\,(L'/L)}{\lvert v \rvert + c_p}, \qquad c_p = \frac{c_{pT}}{P}.$$

### Node-based step

For each non-outfall node below the crown with a nonzero depth-change rate $\dot y = \lvert \Delta y/\Delta t \rvert$:

$$t = 0.25\,\frac{y_{\mathrm{crown}}}{\dot y},$$

guarding against excessive head change in one step.

### Combining the constraints

The next routing step (`getRoutingStep`) is the minimum over all links, nodes, and virtual-junction pairs, each scaled by the user's Courant factor, then floored and clamped:

$$\Delta t_{\min}^{\mathrm{eff}} = \max\!\left(\min_{j,i}\{t_j, t_i\}\cdot \mathrm{Cr},\ \max(\min(\Delta t_{\min},\ \Delta t_{\mathrm{routing}}),\ 0.001\ \mathrm{s})\right),$$

rounded to milliseconds. The effective step is then capped by the user's fixed `ROUTING_STEP` and the remaining simulation duration. The initial step is the minimum step. The first call (no flows yet) also returns the minimum step. The FV solver substeps internally at its own CFL limit, so the routing step under FV is only a reporting cadence.

## Stability, convergence, and mass balance

### Stability indicators

Numerical instability appears as non-damping oscillations in flow and water surface, and nodes that repeatedly dry up. Two report metrics quantify it:

- the overall **flow continuity error** (below), and
- the **link Flow Instability Index (FII)** — the normalized count of times a link's flow exceeds both its neighbors.

### Convergence of the Picard loop

A routing step "does not converge" only when the head tolerance ($\varepsilon_H = 0.005\ \mathrm{ft}$) is not met at some non-outfall node after `MAX_TRIALS` iterations. Anderson acceleration (optional) speeds convergence by blending the two most recent operator outputs at each node:

$$\alpha_k = \mathrm{clamp}\!\left( \frac{r_k\,(r_k - r_{k-1})}{(r_k - r_{k-1})^{2}},\ 0,\ 1\right), \qquad H_{k+1} = (1-\alpha_k)\,G(H_k) + \alpha_k\,G(H_{k-1}),$$

with $r_k = G(H_k) - H_k$ the residual and $G$ the head-update operator. It is skipped at nodes where $G$ is non-smooth (EXTRAN-surcharged, dynamic-slot active, near the static-slot cutoff, weir/orifice at crown, pump ends, ponding boundary).

### Routing mass balance

The routing continuity error (fraction of total inflow) is

$$\varepsilon_{\mathrm{routing}} = \frac{Q_{\mathrm{dw}} + Q_{\mathrm{wet}} + Q_{\mathrm{gw}} + Q_{\mathrm{rdii}} + Q_{\mathrm{ext}} + V_{\mathrm{init}} - \left(Q_{\mathrm{flood}} + Q_{\mathrm{out}} + Q_{\mathrm{evap}} + Q_{\mathrm{seep}} + V_{\mathrm{final}}\right)}{Q_{\mathrm{total\,in}}},$$

where the inflows are dry-weather, wet-weather, groundwater, RDII, and external, and the outflows are flooding, system outflow, evaporation, seepage, and final storage. Flooding is counted only when the node volume does not exceed its full volume; outfall discharge counts as system outflow, and outfall backflow counts as external inflow. Conduit and storage-node evap/seep losses are charged here as well.
