<!-- Part of the engine modifications explanation series -->

# Anderson acceleration of the Picard loop (`ANDERSON_ACCEL`)

## Motivation

The dynamic wave solver solves the node and link equations by *functional
iteration* (Picard / successive approximations): each pass applies the same
head update operator $G$ to the latest head estimates until no node changes
by more than the head tolerance $\varepsilon_H$. The fixed-point iteration
converges *linearly*, and the subrelaxation factor $\omega = 0.5$ that damps
each update stabilizes the iteration without improving its rate. In networks
with many strongly coupled nodes, the solver can exhaust its 8 attempts
(`MAX_TRIALS`) in almost every routing step, even under smooth
conditions.

## The method

Anderson acceleration of depth 2 (equivalent to Aitken's update) mixes the
two most recent outputs of the operator. Let $H_k$ be the head estimate
entering iteration $k$; the residual is

$$r_k = G(H_k) - H_k,$$

and the mixing coefficient is

$$\alpha_k = \mathrm{clamp}\!\left(
    \frac{r_k\,(r_k - r_{k-1})}{(r_k - r_{k-1})^{2}},\ 0,\ 1\right),
  \qquad
  H_{k+1} = (1-\alpha_k)\,G(H_k) + \alpha_k\,G(H_{k-1}).$$

Clamping $\alpha_k$ to $[0,1]$ restricts the update to an *interpolation*
between two already computed and already bounded outputs of the operator; an
extrapolated head is never produced. The mix is applied per node starting
from the second attempt of each routing step.

## Safeguards

- **Gate by residual magnitude**: the mix is applied only when
  $\lvert r_k \rvert \le 20\,\varepsilon_H$; far from the linear regime
  the mix could overshoot.
- **Physical bounds**: a negative mixed depth is discarded in favor of
  the ordinary Picard iteration.
- **Exclusion of non-smooth nodes**: the acceleration is skipped at nodes
  where the operator $G$ is known to be non-smooth (see the
  [table of excluded nodes](#safeguards) below):
  surcharged nodes under `EXTRAN` with continuity `EXPLICIT`
  (the branch changes at the crown), active dynamic slot, conduits near
  the static slot cut, weirs or orifices at the crown, pump ends (discrete
  on/off state) and the ponding edge.
- **Double convergence criterion**: a node is counted as converged only
  when both the raw residual $\lvert G(H_k) - H_k \rvert$ and the
  accepted movement $\lvert H_{k+1} - H_k \rvert$ are within tolerance.
  Without this double condition, a mix landing close to the previous
  iteration could declare convergence while the flow balance remains
  unsatisfied.

| Condition | When | Reason |
|---|---|---|
| Surcharged node | `SURCHARGE_METHOD EXTRAN` with `NODE_CONTINUITY EXPLICIT` | the branch changes at the crown |
| Active dynamic slot | `SURCHARGE_METHOD DYNAMIC_SLOT` | the geometry is rewritten each iteration |
| Near static slot cut | `SURCHARGE_METHOD SLOT`, $0.98 \le \bar y/y_{\mathrm{full}} \le 1.02$ | the slot width enters abruptly |
| Weir/orifice at the crown | LGH upstream $\ge$ crown | the discharge equation changes form |
| Pumps | both end nodes | the on/off state is discrete |
| Ponding edge | ponded node at $d_{\mathrm{full}}$ | $C^0$ floor at the ponding limit |

*Table: Nodes excluded from Anderson acceleration.*

The measured effect: reduction of attempt counts by roughly 25 to
50 % per routing step in networks that would otherwise iterate to the limit.
