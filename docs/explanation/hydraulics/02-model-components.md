# Model Components

<!-- Part of the 1D Hydraulics explanation series -->

## Hydraulic model components

### Node data

Each node carries static geometric properties and dynamic state (`NodeData.hpp`):

- $z_{\mathrm{inv}}$ — invert elevation (ft).
- $d_{\mathrm{full}}$ — full depth (depth to the rim / top of storage).
- $d_{\mathrm{sur}}$ — maximum allowed surcharge depth above full depth; the flooding limit is $z_{\mathrm{inv}} + d_{\mathrm{full}} + d_{\mathrm{sur}}$.
- $A_{\mathrm{pond}}$ — ponded surface area used when the node floods above its rim and ponding is enabled.
- $z_{\mathrm{crown}}$ — elevation of the crown of the highest connecting conduit; the surcharge threshold is $y_{\mathrm{crown}} = z_{\mathrm{crown}} - z_{\mathrm{inv}}$.
- $\mathrm{deg}$ — number of connecting links; if negative the node is an upstream terminal node.
- $V_{\mathrm{full}}$ — volume at full depth.

Dynamic state (updated each routing step):

- $d$ — water depth above the invert (ft);
- $H = z_{\mathrm{inv}} + d$ — hydraulic head (ft);
- $V$ — stored volume (ft$^3$);
- $Q_{\mathrm{lat}}$ — total lateral inflow (ft$^3$/s);
- $Q_{\mathrm{in}}$, $Q_{\mathrm{out}}$ — total inflow and outflow;
- $Q_{\mathrm{ovfl}}$ — overflow/flooding rate;
- $Q_{\mathrm{loss}}$ — evaporation + seepage/exfiltration loss rate;
- $\Delta Q_{\mathrm{net}}^{t-1}$ — net inflow $Q_{\mathrm{in}} - Q_{\mathrm{out}}$ of the previous step (used for trapezoidal averaging);
- previous-step values $d^{t-1}$, $V^{t-1}$, $Q_{\mathrm{lat}}^{t-1}$.

#### Node surface area and volume functions

The node geometry functions are implemented in `src/engine/hydraulics/Node.cpp`.

**Junction/outfall/divider volume**: with $\mathrm{MIN\_SURFAREA} = 12.566\ \mathrm{ft^2}$ ($\approx 4\pi$, the area of a 4-ft manhole),

$$V(d) = V_{\mathrm{full}}\,\frac{d}{d_{\mathrm{full}}},$$

where $V_{\mathrm{full}} = \mathrm{MIN\_SURFAREA}\cdot d_{\mathrm{full}}$ unless overridden.

**Storage volume**:

- Tabular: $V = \mathrm{table}(d\cdot \mathrm{Ucf}[L])/\mathrm{Ucf}[V]$ with table interpolation;
- Geometric shapes (cylindrical, conical, paraboloid, pyramidal) use the quadratic surface-area relation $A(d) = c + a\,d + b\,d^{2}$, integrated to the cubic

  $$V(d) = d\left(c + d\!\left(\tfrac{a}{2} + d\,\tfrac{b}{3}\right)\right);$$

- Functional storage: power law $A(d) = c + a\,d^{b}$ integrated analytically.

**Surface area** $A_{\mathrm{surf}}(d)$: non-storage nodes return 0 (the minimum-area floor is applied later in the dynamic-wave node update); storage nodes return the table value (extrapolating linearly) or the analytic $A(d) = c + a\,d + b\,d^{2}$ / $A(d) = c + a\,d^{b}$.

**Ponded area**:

$$
A_{\mathrm{pond}}(d) =
\begin{cases}
  A_{\mathrm{surf}}(d) & d \le d_{\mathrm{full}} \text{ or } A_{\mathrm{pond}} = 0,\\
  A_{\mathrm{pond}} & d > d_{\mathrm{full}} \text{ (flooded)}.
\end{cases}
$$

**Depth from volume** (the inverse of the volume function, used by the kinematic-wave storage update and by reporting): junction nodes use $d = V/\mathrm{MIN\_SURFAREA}$; storage nodes invert the tabular/geometric/functional relations, using Newton–Raphson with bisection fallback where no closed form exists.

**Maximum outflow** (used by the kinematic-wave and steady-flow link inflow gathering):

$$Q_{\max} = Q_{\mathrm{in}} + \frac{V_{\mathrm{old}}}{dt}, \qquad Q_{\mathrm{in}} = \min\!\left(Q_{\mathrm{in}}, Q_{\max}\right).$$

### Link data

Each link carries static properties and dynamic state (`LinkData.hpp`). For conduits the per-link (per-barrel) conveyance parameters are (`Link.cpp`, `computeConveyance`):

$$
\begin{aligned}
  \beta &= \frac{\mathrm{PHI}\,\sqrt{|S_0|}}{n}, \qquad \mathrm{PHI} = 1.486
    \quad\text{(Manning US factor)}, \\
  \mathrm{rough\_factor} &= g\left(\frac{n}{\mathrm{PHI}}\right)^{2},\\
  Q_{\mathrm{full}} &= S_{\mathrm{full}}\cdot\beta,
  \qquad Q_{\max} = S_{\max}\cdot\beta,
\end{aligned}
$$

where $n$ is the Manning roughness, $S_0$ the conduit slope, $S(a) = A\,R^{2/3}$ the *section factor* (see [Cross-section geometry](04-cross-section-geometry.md)), $S_{\mathrm{full}} = S(A_{\mathrm{full}})$ and $S_{\max} = \max_a S(a)$.

Dynamic state per link: $Q$ (current flow, $+$ = node1$\to$node2), $d$ (midpoint depth), $V$ (volume), $\mathrm{Fr}$ (Froude number), $\mathrm{flow\_class}$ (DRY, UP\_DRY, DN\_DRY, SUBCRITICAL, SUPERCRITICAL, UP\_CRITICAL, DN\_CRITICAL), and previous-step values.

### Conduit slope and length

For a conduit connecting node $i$ and node $j$ with end offsets $z_1, z_2$, the end invert elevations of the conduit are $Z_1 = z_{\mathrm{inv},1} + z_1$, $Z_2 = z_{\mathrm{inv},2} + z_2$. The conduit slope is

$$S_0 = \frac{\Delta y}{\Delta x}, \qquad \Delta y = Z_1 - Z_2, \quad \Delta x = \sqrt{L^{2} - \Delta y^{2}},$$

with a minimum imposed drop of $\lvert \Delta y \rvert \ge 0.001\ \mathrm{ft}$ (overrideable).

### Conduit lengthening (Courant stability)

If a positive `LENGTHENING_STEP` is supplied, short conduits are artificially lengthened so that the Courant condition for the user-supplied time step is met (`Routing.cpp:135–195`):

$$t_{\mathrm{step}} = \min(\mathrm{routing\_step},\ \mathrm{lengthening\_step}), \qquad v_{\mathrm{full}} = \frac{\mathrm{PHI}}{n}\,\frac{S_{\mathrm{full}}}{\sqrt{|S_0|}\,A_{\mathrm{full}}},$$

$$\mathrm{ratio} = \frac{\left(\sqrt{g\,y_{\mathrm{full}}} + v_{\mathrm{full}}\right) t_{\mathrm{step}}}{L}, \qquad L' = \max(L,\ \mathrm{ratio}\cdot L),$$

For open channels $y_{\mathrm{full}}$ is replaced by the hydraulic depth $A_{\mathrm{full}}/W_{\max}$. If $L' > L$, the slope and roughness are adjusted to preserve equal head loss at any flow,

$$S_0' = \frac{|S_0|}{L'/L}, \qquad n' = \frac{n}{\sqrt{L'/L}},$$

and $\beta$, $\mathrm{rough\_factor}$, $Q_{\mathrm{full}}$, $Q_{\max}$ are recomputed from the adjusted values. The lengthened length $L'$ (`mod_length`) is used in the momentum equation; the raw length $L$ is used for volume accounting.
