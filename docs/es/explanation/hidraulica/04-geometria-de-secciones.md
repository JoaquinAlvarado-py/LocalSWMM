# Geometría de la sección transversal

<!-- Parte de la serie de explicación de Hidráulica 1D -->

## Las cuatro relaciones geométricas

Para un conducto, el área hidráulica $A$, el espejo de agua (ancho superficial) $W$, el perímetro mojado $P_w$ y el radio hidráulico $R = A/P_w$ son funciones del tirante $y$. El motor precalcula, para cada forma, las cuatro relaciones fundamentales (`XSectKernels.hpp`, `xsect_tables.hpp`):

$$
\begin{aligned}
  A &= A(y), \qquad W = W(y), \qquad R = R(y), \\
  S &= S(A) = A\,R^{2/3} \quad \text{(factor de sección, "forma de capacidad de conducción"),}
\end{aligned}
$$

junto con sus inversas $y = y(A)$, $A = A(S)$ y la derivada $dS/dA$. Existen expresiones cerradas para las formas estándar (circular, circular llena, rectangular, trapezoidal, triangular, parabólica, potencia, huevo, herradura, gótica, canasta, etc.); las formas irregulares y personalizadas usan tablas (transectas) con interpolación lineal, y la inversa $A(S)$ se resuelve por iteración de Newton o inversión de tabla.

## Manning y el factor de sección

La ecuación de Manning en forma US es

$$Q = \frac{1.486}{n}\,A\,R^{2/3}\,\sqrt{S_f} = \beta\,\Psi(A)\,\sqrt{S_f/S_0}, \qquad \Psi(A) = A\,R^{2/3},$$

donde $S_f$ es la pendiente de fricción, $\beta = (1.486/n)\sqrt{S_0}$ y $\Psi(A)$ es el factor de sección. Para muchas formas cerradas el factor de sección presenta un máximo bajo la profundidad total, de modo que el caudal máximo ocurre a un área menor que la de sección llena.
