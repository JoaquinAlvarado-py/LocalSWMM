# El núcleo de momentum del enlace

<!-- Parte de la serie de explicación de Hidráulica 1D -->

Cada conducto se resuelve con uno de los núcleos de momentum de `DynamicWave.cpp` (`processManningLink`, `processDryLink`, `processForceMainLink`), despachado por categoría de momentum. Esta sección transcribe el núcleo de Manning (superficie libre y conducto cerrado), que es el principal.

## Velocidad, número de Froude y amortiguación inercial

Con $\bar A$ el área media y $q_{\mathrm{last}}$ el caudal por barril de la iteración anterior,

$$v = \frac{q_{\mathrm{last}}}{\bar A}, \qquad \lvert v \rvert \le V_{\max} = 50\ \mathrm{ft/s} \quad\text{(tope de velocidad).}$$

Para un conducto sin escurrimiento en carga, el número de Froude usa el tirante hidráulico $\bar A/\bar W$:

$$\mathrm{Fr} = \frac{\lvert v \rvert}{\sqrt{g\,\bar A / \bar W}} \quad\text{(0 para un conducto cerrado a menos de FUDGE de sección llena).}$$

El factor de amortiguación inercial sigue el enfoque de *inercia parcial local* (mezcla lineal sobre $0.5 \le \mathrm{Fr} \le 1$):

$$\sigma = \begin{cases} 1 & \mathrm{Fr} \le 0.5,\\ 2\,(1 - \mathrm{Fr}) & 0.5 < \mathrm{Fr} < 1,\\ 0 & \mathrm{Fr} \ge 1, \end{cases} \qquad\text{es decir}\quad \sigma = \mathrm{clamp}\!\big(2(1-\mathrm{Fr}),\ 0,\ 1\big).$$

La opción `INERTIAL_DAMPING` sobrescribe esto: NONE fuerza $\sigma = 1$, FULL fuerza $\sigma = 0$ (sin términos inerciales en absoluto); un conducto cerrado con escurrimiento en carga siempre tiene $\sigma = 0$.

## Ponderación aguas arriba

Los términos de presión y fricción usan área y radio hidráulico promedio *ponderados aguas arriba*, reflejando que el escurrimiento supercrítico solo se ve influido por las condiciones aguas arriba. Con el factor de ponderación

$$\rho = \begin{cases} \sigma & q_{\mathrm{last}} > 0 \text{ y } H_1 \ge H_2 \text{ (y no a sección llena),}\\ 1 & \text{en caso contrario,}\end{cases}$$

$$\bar A' = A_1 + \rho\left(\bar A - A_1\right), \qquad \bar R' = R_1 + \rho\left(\bar R - R_1\right).$$

## Los seis términos de momentum

El motor evalúa la ecuación de momentum como las seis contribuciones $dq_1 \ldots dq_6$ (por barril):

$$
\begin{aligned}
  dq_1 &= \Delta t \cdot \mathrm{rough\_factor} \cdot \frac{\lvert v \rvert}{\bar R'^{\,4/3}}, \\
  dq_2 &= \Delta t\, g\, \bar A'\, \frac{H_2 - H_1}{L}, \\
  dq_3 &= 2\,v\,\sigma\left(\bar A^{t+\Delta t} - \bar A^{t}\right), \\
  dq_4 &= \Delta t\, v^{2}\, \sigma\,\frac{A_2 - A_1}{L}, \\
  dq_5 &= \frac{\Delta t}{2L} \left[ K_{\mathrm{in}}\frac{\lvert q \rvert}{A_1} + K_{\mathrm{out}}\frac{\lvert q \rvert}{A_2} + K_{\mathrm{avg}}\frac{\lvert q \rvert}{\bar A} \right], \\
  dq_6 &= \frac{2.5\,\Delta t\, v}{L}\left(Q_{\mathrm{evap}} + Q_{\mathrm{filt}}\right),
\end{aligned}
$$

donde $\mathrm{rough\_factor} = g(n/1.486)^2$, los coeficientes de pérdida local $K_{\mathrm{in}}, K_{\mathrm{out}}, K_{\mathrm{avg}}$ son los coeficientes de pérdida menor de entrada, salida y promedio (ponderado por pérdidas) del usuario, y $Q_{\mathrm{evap}} + Q_{\mathrm{filt}}$ es la tasa de pérdida del conducto.

La actualización de caudal (por barril) y su gradiente de carga son

$$q = \frac{q_{\mathrm{old}} - dq_2 + dq_3 + dq_4 + dq_6} {1 + dq_1 + dq_5},$$

$$\frac{dQ}{dH} = \frac{1}{1 + dq_1 + dq_5}\, \frac{g\,\Delta t\, \bar A'}{L}\,\mathrm{barrels}.$$

El gradiente $dQ/dH$ alimenta el solver de nodos en carga (Sección 10).

## Limitación del caudal y postproceso

Después de la actualización de momentum cruda, `applyFlowLimits` (`DynamicWave.cpp:2211`) aplica, en orden:

1. **Control de entrada de alcantarilla** (FHWA HEC-5): si hay un código de alcantarilla y el conducto no está a sección llena, $q \leftarrow \min(q, q_{\mathrm{inlet}})$.
2. **Límite de caudal normal**: para un conducto abierto/de superficie libre no lleno, si se cumple la condición de pendiente ($y_1 < y_2$, es decir, la pendiente de la superficie del agua es menor que la pendiente de fondo) o la condición de Froude aguas arriba ($\mathrm{Fr}_1 \ge 1$) (según la opción `NORMAL_FLOW_LIMITED`), entonces

$$q \leftarrow \min\!\left(q,\ \beta\,A_1\,R_1^{2/3}\right),$$

   el caudal normal de Manning al tirante aguas arriba.
3. **Subrelajación** (iteraciones $> 0$): $q = (1-\omega)q_{\mathrm{last}} + \omega\,q$ con acotación del cambio de signo a $\pm 0.001$.
4. **Límite de caudal del usuario**: $\lvert q \rvert \le q_{\mathrm{limit}}$.
5. **Compuertas de retención**: el flujo inverso a través de una compuerta de retención se anula.
6. **Verificación de nodo seco**: el caudal se fuerza a $\pm \mathrm{FUDGE}$ si el nodo aguas arriba (aguas abajo) está seco.

Finalmente,

$$Q^{t+\Delta t} = q\,\mathrm{barrels}, \qquad d_{\mathrm{link}} = \min(\bar y, y_{\mathrm{full}}), \qquad V_{\mathrm{link}} = \frac{A_1 + A_2}{2}\,L_{\mathrm{cruda}}\,\mathrm{barrels}.$$

## Impulsiones (force mains)

Las impulsiones (sección `FORCE_MAIN`, siempre a sección llena) usan un núcleo separado (`processForceMainLink`) con $\sigma = 0$ y fricción según la ecuación de Hazen–Williams o de Darcy–Weisbach,

$$
\begin{aligned}
  dq_1 &= \Delta t\, g\, \frac{S_f}{\lvert v \rvert},\\
  q &= \frac{q_{\mathrm{old}} - dq_2 + dq_6}{1 + dq_1 + dq_5}.
\end{aligned}
$$
