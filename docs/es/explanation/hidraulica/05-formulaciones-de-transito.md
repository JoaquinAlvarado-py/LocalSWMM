# Tránsito: escurrimiento permanente y onda cinemática

<!-- Parte de la serie de explicación de Hidráulica 1D -->

## Tránsito de escurrimiento permanente

Bajo escurrimiento permanente (`executeSteadyFlow`, `Routing.cpp:637`), los enlaces se procesan en orden topológicamente ordenado. Para cada conducto:

1. Se reúne el ingreso del nodo aguas arriba $Q_{\mathrm{in}}$ (limitado por el caudal máximo de salida).
2. El caudal por barril es $q = Q_{\mathrm{in}}/\mathrm{barrels}$ menos la tasa de pérdida del conducto, acotado a cero.
3. Si $q \ge Q_{\mathrm{full}}$: $q = Q_{\mathrm{full}}$ y $A = A_{\mathrm{full}}$; en caso contrario, el área de tirante normal se obtiene del factor de sección inverso,

$$s = \frac{q}{\beta}, \qquad A = A(s),$$

   y el tirante de $y = y(A)$.
4. El escurrimiento es uniforme a lo largo del conducto ($Q_{\mathrm{out}} = q\cdot\mathrm{barrels}$, $A_1 = A_2 = A$); el volumen del enlace es $V = A\,L\,\mathrm{barrels}$.

Los enlaces no-conducto simplemente dejan pasar el ingreso del nodo aguas arriba. El escurrimiento permanente converge en una sola pasada.

## Tránsito por onda cinemática

### Ecuaciones de gobierno

El modelo de onda cinemática combina la ecuación de continuidad con la curva de gasto de escurrimiento uniforme, eliminando los términos de inercia, gradiente de presión y (parcialmente) convectivos de la ecuación de momentum de St. Venant. No puede representar remanso, inversión del flujo ni presurización, y requiere una red dirigida acíclica. Partiendo de las ecuaciones de St. Venant y fijando la pendiente de fondo igual a la pendiente de fricción, $S_0 = S_f$, el par de gobierno es:

$$\frac{\partial A}{\partial t} + \frac{\partial Q}{\partial x} = 0 \qquad\text{(continuidad),}$$

$$Q = \beta\,\Psi(A), \qquad \Psi(A) = A\,R^{2/3}, \qquad \beta = \frac{1.486}{n}\sqrt{S_0} \qquad\text{(curva de gasto).}$$

### Esquema de diferencias finitas

Un esquema de diferencias finitas implícito de Wendroff ponderado discretiza la ecuación de continuidad entre los extremos aguas arriba (1) y aguas abajo (2):

$$\frac{(1-\theta)(A_1^{t+1}-A_1^{t}) + \theta\,(A_2^{t+1}-A_2^{t})}{\Delta t} \;+\; \frac{(1-\varphi)(Q_2^{t}-Q_1^{t}) + \varphi\,(Q_2^{t+1}-Q_1^{t+1})}{L} = 0,$$

con $\theta = \varphi = 0.6$. Como cada cámara de unión tiene a lo más un conducto de salida, procesar los enlaces en orden topológico deja solo a $A_2^{t+1}$ y $Q_2^{t+1}$ como incógnitas; $Q_1^{t+1}$ se conoce desde el ingreso del nodo aguas arriba y $A_1^{t+1}$ desde el factor de sección inverso en $Q_1^{t+1}/\beta$. Sustituyendo la curva de gasto se obtiene la única ecuación no lineal

$$f\!\left(A_2^{t+1}\right) = \beta\,\Psi\!\left(A_2^{t+1}\right) + C_1\,A_2^{t+1} + C_2 = 0,$$

con (en la implementación normalizada del motor, `KinematicWave.cpp:solveConduit`)

$$
\begin{aligned}
  C_1 &= \frac{L\,\theta}{\Delta t\,\varphi},\\
  C_2 &= \frac{L}{\Delta t\,\varphi} \Big[(1-\theta)(A_1^{t+1} - A_1^t) - \theta\,A_2^t\Big] + \frac{1-\varphi}{\varphi}(Q_2^t - Q_1^t) - Q_1^{t+1}.
\end{aligned}
$$

### Búsqueda de la raíz

La ecuación $f(A_2^{t+1}) = 0$ se resuelve con una iteración de Newton–Raphson enmarcada (máximo 40 iteraciones). Como el factor de sección puede tener dos raíces (máximo en $A_{\max}$ bajo sección llena), el marco se preselecciona: el marco inicial es $[A_{\max}, A_{\mathrm{full}}]$; si ambos límites producen el mismo signo se reinicia a $[0, A_{\max}]$. Si ambos límites dan $f$ negativo el conducto está a sección llena ($Q = Q_{\mathrm{full}}$); si ambos dan $f$ positivo el caudal es cero.

### Estanques bajo onda cinemática

Los estanques de almacenamiento pueden tener cualquier número de enlaces de salida. Su balance de masa se integra con la regla trapezoidal,

$$V^{t+1} = V^{t} + \tfrac{1}{2}\left(Q_{\mathrm{in}}^{t} + Q_{\mathrm{in}}^{t+1} - Q_{\mathrm{out}}^{t} - Q_{\mathrm{out}}^{t+1}\right)\Delta t,$$

resuelto por aproximaciones sucesivas ($\omega = 0.55$, tolerancia de convergencia 0.005 ft) porque tanto $Q_{\mathrm{out}}$ como $V$ dependen de la carga. La carga del estanque se actualiza una vez más después de que se conocen todos los caudales de los enlaces (`Routing.cpp:345–389`).
