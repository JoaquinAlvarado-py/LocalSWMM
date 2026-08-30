# Routing Formulations

<!-- Part of the 1D Hydraulics explanation series -->

## Steady flow routing

Under steady flow (`executeSteadyFlow`, `Routing.cpp:637`), links are processed in topologically sorted order. For each conduit:

1. The upstream node's inflow $Q_{\mathrm{in}}$ is gathered (limited by the maximum outflow).
2. The per-barrel flow is $q = Q_{\mathrm{in}}/\mathrm{barrels}$ minus the conduit loss rate, clamped at zero.
3. If $q \ge Q_{\mathrm{full}}$: $q = Q_{\mathrm{full}}$ and $A = A_{\mathrm{full}}$; otherwise the normal-depth area is found from the inverse section factor,

   $$s = \frac{q}{\beta}, \qquad A = A(s),$$

   and the depth from $y = y(A)$.
4. The flow is uniform along the conduit ($Q_{\mathrm{out}} = q\cdot\mathrm{barrels}$, $A_1 = A_2 = A$); the link volume is $V = A\,L\,\mathrm{barrels}$.

Non-conduit links simply pass the upstream node's inflow through unchanged. Steady flow converges in one pass.

## Kinematic wave routing

### Governing equations

The kinematic wave model combines the continuity equation with the uniform-flow rating curve, dropping the inertia, pressure-gradient, and (partially) convective terms of the St. Venant momentum equation. It cannot represent backwater, flow reversal, or pressurization, and requires a directed acyclic network. Starting from the St. Venant equations and setting the bed slope equal to the friction slope, $S_0 = S_f$, the governing pair is:

$$\frac{\partial A}{\partial t} + \frac{\partial Q}{\partial x} = 0 \qquad\text{(continuity),}$$

$$Q = \beta\,\Psi(A), \qquad \Psi(A) = A\,R^{2/3}, \qquad \beta = \frac{1.486}{n}\sqrt{S_0} \qquad\text{(rating curve).}$$

### Finite-difference scheme

A weighted Wendroff implicit finite-difference scheme discretizes the continuity equation between the upstream (1) and downstream (2) ends:

$$\frac{(1-\theta)(A_1^{t+1}-A_1^{t}) + \theta\,(A_2^{t+1}-A_2^{t})}{\Delta t} \;+\; \frac{(1-\varphi)(Q_2^{t}-Q_1^{t}) + \varphi\,(Q_2^{t+1}-Q_1^{t+1})}{L} = 0,$$

with $\theta = \varphi = 0.6$. Because each junction has at most one outlet conduit, processing links in topological order leaves only $A_2^{t+1}$ and $Q_2^{t+1}$ as unknowns; $Q_1^{t+1}$ is known from the upstream node's inflow and $A_1^{t+1}$ from the inverse section factor at $Q_1^{t+1}/\beta$. Substituting the rating curve yields the single nonlinear equation

$$f\!\left(A_2^{t+1}\right) = \beta\,\Psi\!\left(A_2^{t+1}\right) + C_1\,A_2^{t+1} + C_2 = 0,$$

with (in the engine's normalized implementation, `KinematicWave.cpp:solveConduit`)

$$
\begin{aligned}
  C_1 &= \frac{L\,\theta}{\Delta t\,\varphi},\\
  C_2 &= \frac{L}{\Delta t\,\varphi}
        \Big[(1-\theta)(A_1^{t+1} - A_1^t) - \theta\,A_2^t\Big]
        + \frac{1-\varphi}{\varphi}(Q_2^t - Q_1^t) - Q_1^{t+1}.
\end{aligned}
$$

### Root finding

Equation $f(A_2^{t+1}) = 0$ is solved by a bracketed Newton–Raphson iteration (maximum 40 iterations). Because the section factor can have two roots (peak at $A_{\max}$ below full), the bracket is pre-screened: the initial bracket is $[A_{\max}, A_{\mathrm{full}}]$; if both bounds produce the same sign it is reset to $[0, A_{\max}]$. If both bounds give negative $f$ the conduit is full ($Q = Q_{\mathrm{full}}$); if both give positive $f$ the flow is zero.

### Storage nodes under kinematic wave

Storage nodes may have any number of outlet links. Their mass balance is integrated with the trapezoidal rule,

$$V^{t+1} = V^{t} + \tfrac{1}{2}\left(Q_{\mathrm{in}}^{t} + Q_{\mathrm{in}}^{t+1} - Q_{\mathrm{out}}^{t} - Q_{\mathrm{out}}^{t+1}\right)\Delta t,$$

solved by successive approximation ($\omega = 0.55$, convergence tolerance 0.005 ft) because both $Q_{\mathrm{out}}$ and $V$ depend on the head. The storage head is then updated once more after all link flows are known (`Routing.cpp:345–389`).
