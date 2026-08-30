<!-- Part of the engine modifications explanation series -->

# Virtual junctions (`[VIRTUAL_JUNCTIONS]`)

## Motivation

A slope change in a conduit must be split at a junction chamber. But an
ordinary junction chamber introduces two numerical artifacts:

1. **Artificial storage**: its surface area is floored with the minimum
   $A_{\min} = 12.566\ \mathrm{ft^2}$, which adds a stagnation volume
   that "blurs" transients;
2. **Momentum break**: the node acts as a small stagnation volume that
   interrupts the momentum transmission between the two conduits.

A **virtual junction** (`[VIRTUAL_JUNCTIONS]`, section with name and
invert elevation; everything else is derived) eliminates both artifacts for
two collinear conduits of identical cross-section that meet at a slope
break. A sealed node of identically null storage is declared. The
eligibility rules are checked at input: exactly two links, both conduits;
identical cross-sections (shape, dimensions, curve reference, number of
barrels; Manning roughness may differ); both offsets at the node null with
continuous invert; no lateral inflows of any kind; and dynamic wave routing
method. Any violation is an input error.

## Continuity treatment

A virtual junction is a sealed node of zero storage. Its head is updated
with the free-surface formula using the natural half-link surface area
contributed by its two conduits, *without* the minimum area floor (that
floor is precisely the artificial storage the feature eliminates). When the
natural area vanishes (dry pair, or surcharged pair with small slot width),
the update falls to a pure flow-balance form of the surcharged update with
$\alpha = 1$ and no floor. At convergence, $\sum Q = 0$ at the node. The
node is sealed: its head can rise above the crown without limit (like a
chamber with a bolted lid), it never floods or ponds, and its volume and
overflow are identically zero.

## Momentum treatment

For a pass-through pair (one conduit entering, one leaving), the downstream
conduit takes as upstream state the mean values of the upstream conduit in
its Froude weighting (*upwinding* mechanism through the node), transporting
the momentum advected through the node instead of resetting it. With
`VIRTUAL_JUNCTION_MOMENTUM FULL` (default `BASIC`), a convective
correction is additionally added to the inertia term of both conduits:

$$\Delta Q_j = \Delta t\,\sigma_j\,
    \frac{\left(\bar U^{2}\bar A\right)_{\mathrm{ab}} -
          \left(\bar U^{2}\bar A\right)_{\mathrm{ar}}}{\Lambda},
  \qquad \Lambda = \frac{L_{\mathrm{ar}} + L_{\mathrm{ab}}}{2},$$

with $\sigma_j$ a Froude-shaped damping factor; the correction vanishes when
the two conduits do not convey flow in the same direction through the node.
Saddle pairs (both conduits toward the node) or crest pairs (both from the
node) receive the zero-storage continuity treatment but not the directional
momentum coupling. The pair is always solved together (it is not frozen by
the convergence bypass) and a pair-level Courant check is added.

The usage guidance: virtual junctions are intended for slope breaks of small
deflection; horizontal alignment changes should remain ordinary junction
chambers with loss coefficients.
