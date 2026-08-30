# Dynamic Wave Solver

<!-- Part of the 1D Hydraulics explanation series -->

## Dynamic wave routing: governing equations

### The St. Venant equations

The dynamic wave model solves the full one-dimensional de Saint-Venant equations (continuity and momentum):

$$\underbrace{\frac{\partial A}{\partial t}}_{\text{storage}} + \underbrace{\frac{\partial Q}{\partial x}}_{\text{convective flux}} = 0,$$

$$\underbrace{\frac{\partial Q}{\partial t}}_{\text{local acceleration}} + \underbrace{\frac{\partial}{\partial x}\!\left(\frac{Q^{2}}{A}\right)}_{\text{convective acceleration}} + \underbrace{gA\,\frac{\partial H}{\partial x}}_{\text{pressure gradient}} + \underbrace{gA\,S_f}_{\text{friction}} = 0,$$

where $A$ is the flow area, $Q$ the discharge, $H = Z + y$ the hydraulic head ($Z$ conduit invert, $y$ depth), $g$ gravity, and $S_f$ the friction slope. The friction slope follows Manning:

$$S_f = \left(\frac{n}{1.486}\right)^{2} \frac{Q\,\lvert U \rvert}{A\,R^{4/3}}, \qquad U = \frac{Q}{A}.$$

### Finite-difference momentum equation

The engine uses an implicit (backwards Euler) finite-difference form. With spatial differences over the conduit length $L$ and temporal differences over $\Delta t$, the flow update at each conduit is

<!-- eq:mom-update -->
$$Q^{t+\Delta t} = \frac{Q^{t} + \Delta Q_{\mathrm{inertia}} + \Delta Q_{\mathrm{pressure}} + \Delta Q_{\mathrm{loss}}}{1 + \Delta Q_{\mathrm{friction}}},$$

where all geometric quantities are evaluated at the new time $t + \Delta t$. The four terms are:

<!-- eq:mom-inertia, eq:mom-pressure, eq:mom-friction -->
$$
\begin{aligned}
  \Delta Q_{\mathrm{inertia}} &= 2\bar{U}\left(\bar{A}^{t+\Delta t} - \bar{A}^{t}\right) + \bar{U}^{2}\,\frac{A_2 - A_1}{L}\,\Delta t,\\
  \Delta Q_{\mathrm{pressure}} &= -g\bar{A}\,\frac{H_2 - H_1}{L}\,\Delta t,\\
  \Delta Q_{\mathrm{friction}} &= g\left(\frac{n}{1.486}\right)^{2} \frac{\lvert \bar{U} \rvert}{\bar{R}^{4/3}}\,\Delta t,\\
  \Delta Q_{\mathrm{loss}} &= \text{local (minor) losses and evap/seepage terms}.
\end{aligned}
$$

### Node continuity

Conservation of volume at each node assembly (the node plus half of each connected link) requires

$$\frac{\partial V}{\partial t} = A_{S}\,\frac{\partial H}{\partial t} = \sum Q,$$

with $A_S = A_{SN} + \sum A_{SL}$ the assembly surface area (the node's own storage surface area plus the half-link surface areas contributed by each conduit). In finite-difference form:

$$H^{t+\Delta t} = H^{t} + \frac{\tfrac{\Delta t}{2}\left(\sum Q^{t} + \sum Q^{t+\Delta t}\right)}{\left(A_{SN} + \sum A_{SL}\right)^{t+\Delta t}},$$

i.e. a trapezoidal update of the head using the *average* of the net flows at $t$ and $t+\Delta t$.

## The dynamic wave solution algorithm

### Overview: the Picard (successive-approximation) iteration

Equations (Eq. `eq:mom-update`) and the node continuity are solved implicitly over each time step by *functional iteration* (Picard iteration / successive approximations). The steps, matching the engine's `DWSolver::execute` (`DynamicWave.cpp:1026`), are:

1. **initNodeStates** — reset per-node accumulators: inflow = 0, outflow = losses $+$ negative lateral flow, inflow $+$ positive lateral flow; surface area from the storage/ponding geometry; converged = 0, $\sum dQ/dH = 0$.
2. **computeLinkGeometry** — batch-compute the end depths $y_1, y_2$, midpoint depth $\bar y$, top widths, areas, and hydraulic radii of all conduits from the current node heads; classify each conduit's flow regime; apply Preissmann-slot overrides where surcharged.
3. **Momentum kernels** — solve the implicit momentum equation for each conduit ([The link momentum kernel](07-link-momentum-kernel.md)), commit the new flows, and scatter them to the node inflow/outflow accumulators, accumulating $\sum dQ/dH$ and the surface-area contributions.
4. **Non-conduit structures** — compute pump/orifice/weir/outlet flows ([Non-conduit hydraulic structures](10-structures-and-boundaries.md)).
5. **Outfall depths** — re-set outfall boundary stages from the current flows.
6. **Node depth update** — solve the continuity equation for each node head ([Node continuity, flooding, and surcharge](08-node-continuity.md)); tally the unconverged nodes.
7. If any node changed by more than the head tolerance and the trial limit has not been reached, mark links whose both end nodes converged as *bypassed* (their flows are held), and iterate.

Under-relaxation: after the first iteration every updated flow and head is relaxed with $\omega = 0.5$,

$$x^{k+1} = (1-\omega)\,x^{k} + \omega\,x^{k+1}_{\mathrm{raw}}, \qquad \omega = 0.5,$$

and a sign change in flow is forced through a small nonzero value ($q = \pm 0.001$).

### Convergence

A node is converged when both the raw Picard residual and the accepted (possibly Anderson-mixed) movement are within the head tolerance $\varepsilon_H = 0.005\ \mathrm{ft}$ (default). The routing step converges when no non-outfall node is unconverged. The maximum number of trials is 8 by default (`MAX_TRIALS`); a step that converges on its last allowed trial is still counted as converged.

### Flow classification

During geometry computation each conduit is classified into one of seven flow classes (DRY, UP\_DRY, DN\_DRY, SUBCRITICAL, SUPERCRITICAL, UP\_CRITICAL, DN\_CRITICAL) based on the end depths and the head relative to the end invert elevations, using the normal depth $y_n$ (from the inverse section factor at $Q/\beta$) and critical depth $y_c$ ([Outfall boundary conditions](10-structures-and-boundaries.md)). The class drives:

- the surface-area adjustments for dry/critical ends (Table `tab:surfadj`),
- the depth used at the critical end (replaced by $\min(y_n, y_c)$),
- the friction-based normal-flow limit.

**Table `tab:surfadj` — Surface-area and depth adjustments for dry/critical conduit ends ($y_* = \min(y_n, y_c)$; $E$ = node invert, $Z$ = conduit invert).**

| Condition | Criteria | Adjustment |
|-----------|----------|------------|
| Upstream dry | $y_1 = 0$; $Z_1 > E_1$ | $A_{SL1} = 0$ if $H_2 \le Z_1$, else critical adjustment |
| Downstream dry | $y_2 = 0$; $Z_2 > E_2$ | $A_{SL2} = 0$ if $H_1 \le Z_2$, else critical adjustment |
| Upstream critical | $Q < 0$; $Z_1 > E_1$; $H_1 - Z_1 < y_*$ | $y_1 = y_*$; $A_{SL1} = 0$ |
| Downstream critical | $Q > 0$; $Z_2 > E_2$; $H_2 - Z_2 < y_*$ | $y_2 = y_*$; $A_{SL2} = 0$ |

### Surface-area contributions

For a subcritical conduit, the free-surface areas contributed to its two end nodes are

$$A_{SL1} = \frac{W_1 + \bar{W}}{2}\,\frac{L}{2}, \qquad A_{SL2} = \frac{\bar{W} + W_2}{2}\,\frac{L}{2}\, \mathrm{fasnh},$$

where $W_1, W_2, \bar W$ are the top widths at $y_1, y_2, \bar y$, and $\mathrm{fasnh}$ is a factor between normal and critical depth for a nearly critical downstream end. For dry/critical ends the half-link surface area is adjusted per Table `tab:surfadj`; a completely dry conduit contributes $A_{SL1} = A_{SL2} = \mathrm{FUDGE}\cdot L/2$. A closed conduit whose midpoint depth exceeds the crown cutoff ($y/y_{\mathrm{full}} \ge 0.96$ under EXTRAN) uses a width capped at the crown in the surface-area computation, providing the small nonzero contribution that keeps the node Picard denominator bounded.
