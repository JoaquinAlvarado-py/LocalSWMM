# Cross-Section Geometry

<!-- Part of the 1D Hydraulics explanation series -->

## Cross-section geometry

### The four geometric relations

For a conduit, the flow area $A$, top width $W$, wetted perimeter $P_w$, and hydraulic radius $R = A/P_w$ are functions of the flow depth $y$. The engine pre-computes, for each shape, the four fundamental relations (`XSectKernels.hpp`, `xsect_tables.hpp`):

$$
\begin{aligned}
  A &= A(y), \qquad W = W(y), \qquad R = R(y), \\
  S &= S(A) = A\,R^{2/3} \quad \text{(section factor, "conveyance shape"),}
\end{aligned}
$$

together with their inverses $y = y(A)$, $A = A(S)$, and the derivative $dS/dA$. Closed-form expressions exist for the standard shapes (circular, filled circular, rectangular, trapezoidal, triangular, parabolic, power, eggs, horseshoe, gothic, basket-handle, etc.); irregular and custom shapes use tabulated (transect) tables with linear interpolation, and the inverse $A(S)$ is solved by Newton iteration or table inversion.

### Manning and the section factor

Manning's equation in US customary form is

$$Q = \frac{1.486}{n}\,A\,R^{2/3}\,\sqrt{S_f} = \beta\,\Psi(A)\,\sqrt{S_f/S_0}, \qquad \Psi(A) = A\,R^{2/3},$$

where $S_f$ is the friction slope, $\beta = (1.486/n)\sqrt{S_0}$, and $\Psi(A)$ is the section factor. For many closed shapes the section factor peaks below full depth, so the maximum discharge occurs at a less-than-full area.
