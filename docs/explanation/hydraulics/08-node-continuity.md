# Node Continuity

<!-- Part of the 1D Hydraulics explanation series -->

## Node continuity, flooding, and surcharge

### Net flow and volume change

At each node, per Picard iteration (`DynamicWave.cpp`, function `setNodeDepth`), the net flow and trapezoidal volume change are:

$$\Delta Q = Q_{\mathrm{in}} - Q_{\mathrm{out}}, \qquad \Delta V = \tfrac{1}{2}\left(\Delta Q_{\mathrm{net}}^{t-1} + \Delta Q\right) \Delta t,$$

where $\Delta Q_{\mathrm{net}}^{t-1}$ is the net flow of the previous step (trapezoidal/Crank–Nicolson averaging).

### Free-surface update (EXPLICIT continuity)

For a node that is not surcharged, the depth update is

$$\Delta y = \frac{\Delta V}{A_S}, \qquad y^{t+\Delta t} = y^{t} + \Delta y,$$

where the assembly surface area is floored by the minimum surface area,

$$A_S = \max\left(A_{SN} + \sum A_{SL},\ A_{\min}\right), \qquad A_{\min} = 12.566\ \mathrm{ft^2},$$

the default (overrideable via the `MIN_SURFAREA` option). The minimum area is a purely computational device; it does not add volume.

### Surcharge (EXTRAN) update

A node is surcharged when all conduits connected to it are full or its head exceeds the crown of its highest conduit ($y > y_{\mathrm{crown}}$), and it is not a storage or outfall node and is not ponding. Under EXTRAN the continuity equation becomes $\sum Q = 0$, enforced through a perturbation (Newton/Hardy Cross) form. The surcharged depth update is

$$\Delta y = \frac{\alpha\,\Delta Q}{\mathrm{denom}}, \qquad y^{t+\Delta t} = y^{t} + \Delta y,$$

with the terminal-node correction $\alpha = 0.6$ for upstream terminal nodes (only outflow links, $\mathrm{deg} < 0$) and 1 otherwise, and a crown-proximity blend for a smooth transition into/out of surcharge:

$$\mathrm{denom} = \sum \frac{dQ}{dH} + \left(\frac{A_S^{\mathrm{old}}}{\Delta t} - \sum \frac{dQ}{dH}\right) e^{-15\,f}, \qquad f = \frac{y^{t} - y_{\mathrm{crown}}}{y_{\mathrm{crown}}},$$

applied while $y^{t} < 1.25\,y_{\mathrm{crown}}$. The head is kept at or above the crown ($y \ge y_{\mathrm{crown}} - \mathrm{FUDGE}$). The $\sum dQ/dH$ accumulated at each node is the sum of the per-link gradients (Eq. `eq:dqdh`, see [The link momentum kernel](07-link-momentum-kernel.md)); note the engine accumulates $\sum dQ/dH$ as a positive magnitude with $dQ_{\mathrm{net}}/dH = -\sum dQ/dH$ (a head rise increases net outflow).

### Semi-implicit node continuity

The `NODE_CONTINUITY` option (default EXPLICIT) can select the unified *semi-implicit* formulation, a single smooth expression valid for both free-surface and surcharged states. Linearizing the net flow about the current head estimate with the flow gradients, $\sum Q^{t+\Delta t} \approx \sum Q + \sum(dQ/dH)\,\Delta H$, and substituting into the trapezoidal head update yields

$$\Delta y = \frac{\Delta V}{A_S + \tfrac{\Delta t}{2}\sum \frac{dQ}{dH}}, \qquad y^{t+\Delta t} = y^{t} + \Delta y,$$

with the denominator floored by $A_{\min}$. The flow-gradient term damps the update (a head rise that increases net outflow reduces the net fill), and the expression is $C^1$-smooth through the crown, which is what makes it compatible with Anderson acceleration.

### Flooding and ponding

The maximum non-flooded depth is $y_{\max} = d_{\mathrm{full}} + d_{\mathrm{sur}}$ (for non-ponding nodes; ponding nodes are never capped). If the candidate depth exceeds $y_{\max}$:

- **Non-ponding**: the head is capped at $y_{\max}$ and the excess is lost as overflow,

  $$Q_{\mathrm{ovfl}} = \frac{\Delta V}{\Delta t}, \qquad V = V_{\mathrm{full}};$$

- **Ponding** (with `ALLOW_PONDING` and a positive ponded area): the ponded node acts as a constant-area storage node above the rim,

  $$V = \max\left(V^{\mathrm{old}} + \Delta V,\ V_{\mathrm{full}}\right), \qquad Q_{\mathrm{ovfl}} = \frac{V - \max(V^{\mathrm{old}},\ V_{\mathrm{full}})}{\Delta t},$$

  and the head is free to rise above the rim.

A ponded node is not allowed to drop much below full depth once ponded ($y \ge d_{\mathrm{full}} - \mathrm{FUDGE}$).
