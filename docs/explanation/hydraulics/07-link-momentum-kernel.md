# Link Momentum Kernel

<!-- Part of the 1D Hydraulics explanation series -->

## The link momentum kernel

Each conduit is solved by one of the momentum kernels in `DynamicWave.cpp` (`processManningLink`, `processDryLink`, `processForceMainLink`), dispatched by momentum category. This section transcribes the Manning (free-surface and closed-conduit) kernel, which is the main one.

### Velocity, Froude number, and inertial damping

With $\bar A$ the midpoint area and $q_{\mathrm{last}}$ the per-barrel flow from the previous iteration,

$$v = \frac{q_{\mathrm{last}}}{\bar A}, \qquad \lvert v \rvert \le V_{\max} = 50\ \mathrm{ft}/\mathrm{s} \quad\text{(velocity cap).}$$

For a non-surcharged conduit the Froude number uses the hydraulic depth $\bar A/\bar W$:

$$\mathrm{Fr} = \frac{\lvert v \rvert}{\sqrt{g\,\bar A / \bar W}} \quad\text{(0 for a closed conduit within FUDGE of full).}$$

The inertial-damping factor follows the *local partial inertia* approach (linear blend over $0.5 \le \mathrm{Fr} \le 1$):

$$\sigma = \begin{cases} 1 & \mathrm{Fr} \le 0.5,\\ 2\,(1 - \mathrm{Fr}) & 0.5 < \mathrm{Fr} < 1,\\ 0 & \mathrm{Fr} \ge 1, \end{cases} \qquad\text{i.e.}\quad \sigma = \mathrm{clamp}\!\big(2(1-\mathrm{Fr}),\ 0,\ 1\big).$$

The `INERTIAL_DAMPING` option overrides this: NONE forces $\sigma = 1$, FULL forces $\sigma = 0$ (no inertial terms at all); a closed conduit that is surcharged always has $\sigma = 0$.

### Upstream weighting

The pressure and friction terms use *upstream-weighted* average area and hydraulic radius, reflecting that supercritical flow is influenced only by upstream conditions. With the weighting factor

$$\rho = \begin{cases} \sigma & q_{\mathrm{last}} > 0 \text{ and } H_1 \ge H_2 \text{ (and not full),}\\ 1 & \text{otherwise,} \end{cases}$$

$$\bar A' = A_1 + \rho\left(\bar A - A_1\right), \qquad \bar R' = R_1 + \rho\left(\bar R - R_1\right).$$

### The six momentum terms

The engine evaluates the momentum equation as the six contributions $dq_1 \ldots dq_6$ (per barrel):

<!-- eq:dq1 ... eq:dq6 -->
$$
\begin{aligned}
  dq_1 &= \Delta t \cdot \mathrm{rough\_factor} \cdot \frac{\lvert v \rvert}{\bar R'^{\,4/3}},\\
  dq_2 &= \Delta t\, g\, \bar A'\, \frac{H_2 - H_1}{L},\\
  dq_3 &= 2\,v\,\sigma\left(\bar A^{t+\Delta t} - \bar A^{t}\right),\\
  dq_4 &= \Delta t\, v^{2}\, \sigma\,\frac{A_2 - A_1}{L},\\
  dq_5 &= \frac{\Delta t}{2L} \left[ K_{\mathrm{in}}\frac{\lvert q \rvert}{A_1} + K_{\mathrm{out}}\frac{\lvert q \rvert}{A_2} + K_{\mathrm{avg}}\frac{\lvert q \rvert}{\bar A} \right],\\
  dq_6 &= \frac{2.5\,\Delta t\, v}{L}\left(Q_{\mathrm{evap}} + Q_{\mathrm{seep}}\right),
\end{aligned}
$$

where $\mathrm{rough\_factor} = g(n/1.486)^2$, the local-loss coefficients $K_{\mathrm{in}}, K_{\mathrm{out}}, K_{\mathrm{avg}}$ are the user's inlet, outlet, and average (loss-weighted) minor-loss coefficients, and $Q_{\mathrm{evap}} + Q_{\mathrm{seep}}$ is the per-conduit loss rate.

The flow update (per barrel) and its head gradient are

<!-- eq:q-update -->
$$q = \frac{q_{\mathrm{old}} - dq_2 + dq_3 + dq_4 + dq_6}{1 + dq_1 + dq_5},$$

<!-- eq:dqdh -->
$$\frac{dQ}{dH} = \frac{1}{1 + dq_1 + dq_5}\, \frac{g\,\Delta t\, \bar A'}{L}\,\mathrm{barrels}.$$

The $dQ/dH$ gradient feeds the node surcharge solver ([Node continuity, flooding, and surcharge](08-node-continuity.md)).

### Flow limiting and post-processing

After the raw momentum update, `applyFlowLimits` (`DynamicWave.cpp:2211`) applies, in order:

1. **Culvert inlet control** (FHWA HEC-5): if a culvert code is present and the conduit is not full, $q \leftarrow \min(q, q_{\mathrm{inlet}})$.
2. **Normal-flow limit**: for an open/free-surface conduit not full, if the slope condition ($y_1 < y_2$, i.e. the water-surface slope is smaller than the bed slope) or the upstream-Froude condition ($\mathrm{Fr}_1 \ge 1$) holds (per the `NORMAL_FLOW_LIMITED` option), then

   $$q \leftarrow \min\!\left(q,\ \beta\,A_1\,R_1^{2/3}\right),$$

   the Manning normal flow at the upstream depth.
3. **Under-relaxation** (iterations $> 0$): $q = (1-\omega)q_{\mathrm{last}} + \omega\,q$ with a sign-change clamp to $\pm 0.001$.
4. **User flow limit**: $\lvert q \rvert \le q_{\mathrm{limit}}$.
5. **Flap gates**: reverse flow through a flap gate is zeroed.
6. **Dry-node check**: flow is forced to $\pm \mathrm{FUDGE}$ if the upstream (downstream) node is dry.

Finally,

$$Q^{t+\Delta t} = q\,\mathrm{barrels}, \qquad d_{\mathrm{link}} = \min(\bar y, y_{\mathrm{full}}), \qquad V_{\mathrm{link}} = \frac{A_1 + A_2}{2}\,L_{\mathrm{raw}}\,\mathrm{barrels}.$$

### Force mains

Force mains (a `FORCE_MAIN` cross-section, always full) use a separate kernel (`processForceMainLink`) with $\sigma = 0$ and friction from either the Hazen–Williams or Darcy–Weisbach equation,

$$
\begin{aligned}
  dq_1 &= \Delta t\, g\, \frac{S_f}{\lvert v \rvert},\\
  q &= \frac{q_{\mathrm{old}} - dq_2 + dq_6}{1 + dq_1 + dq_5}.
\end{aligned}
$$
