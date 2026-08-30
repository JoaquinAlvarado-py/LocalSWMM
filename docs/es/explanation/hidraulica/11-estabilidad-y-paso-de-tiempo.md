# Estabilidad, paso de tiempo y balance de masa

<!-- Parte de la serie de explicación de Hidráulica 1D -->

## Paso de tiempo adaptativo y condición de Courant

### Condición de Courant–Friedrichs–Lewy

Como el esquema de onda dinámica actualiza caudales y cargas elemento por elemento (no hay acoplamiento espacial simultáneo), está sujeto a la condición de Courant: el paso de tiempo no debe exceder el tiempo que tarda una onda dinámica en atravesar el conducto más corto,

$$\Delta t \le \frac{L}{\lvert U \rvert + c}, \qquad c = \sqrt{g\,\frac{A}{W}} \text{ (celeridad de la onda de gravedad).}$$

### Paso basado en el enlace

Para cada conducto (`getLinkStep`, `DynamicWave.cpp:3711`) con caudal por barril $q = \lvert Q \rvert/\mathrm{barrels}$, área media $A$ y número de Froude $\mathrm{Fr}$:

$$t = \frac{V/\mathrm{barrels}}{q}\, \frac{L'}{L}\,\frac{\mathrm{Fr}}{1 + \mathrm{Fr}},$$

(la expresión CFL clásica de SWMM, escalada por la razón longitud alargada/cruda). Bajo la ranura de Preissmann dinámica, un conducto en carga usa en su lugar la celeridad de presión,

$$t = \frac{L\,(L'/L)}{\lvert v \rvert + c_p}, \qquad c_p = \frac{c_{pT}}{P}.$$

### Paso basado en el nodo

Para cada nodo no-emisario bajo la clave con tasa de cambio de tirante no nula $\dot y = \lvert \Delta y/\Delta t \rvert$:

$$t = 0.25\,\frac{y_{\mathrm{crown}}}{\dot y},$$

resguardando contra un cambio excesivo de carga en un solo paso.

### Combinación de las restricciones

El siguiente paso de tránsito (`getRoutingStep`) es el mínimo sobre todos los enlaces, nodos y pares de unión virtual, cada uno escalado por el factor de Courant del usuario, y luego pisado y acotado:

$$\Delta t_{\min}^{\mathrm{eff}} = \max\!\left(\min_{j,i}\{t_j, t_i\}\cdot \mathrm{Cr},\ \max(\min(\Delta t_{\min},\ \Delta t_{\text{tránsito}}),\ 0.001\ \mathrm{s})\right),$$

redondeado a milisegundos. El paso efectivo se acota luego por el `ROUTING_STEP` fijo del usuario y por la duración restante de la simulación. El paso inicial es el paso mínimo. La primera llamada (sin caudales aún) también retorna el paso mínimo. El solver FV sub-pasea internamente a su propio límite CFL, por lo que bajo FV el paso de tránsito es solo una cadencia de reporte.

## Estabilidad, convergencia y balance de masa

### Indicadores de estabilidad

La inestabilidad numérica se manifiesta como oscilaciones que no se amortiguan en el caudal y en la superficie del agua, y en nodos que se secan repetidamente. Dos métricas de reporte la cuantifican:

- el **error de continuidad de caudal** global (abajo), y
- el **índice de inestabilidad de flujo del enlace (FII)** — el conteo normalizado de las veces que el caudal de un enlace supera a sus dos vecinos.

### Convergencia del ciclo de Picard

Un paso de tránsito "no converge" solo cuando la tolerancia de carga ($\varepsilon_H = 0.005\ \mathrm{ft}$) no se cumple en algún nodo no-emisario después de `MAX_TRIALS` iteraciones. La aceleración de Anderson (opcional) acelera la convergencia mezclando las dos salidas más recientes del operador en cada nodo:

$$\alpha_k = \mathrm{clamp}\!\left( \frac{r_k\,(r_k - r_{k-1})}{(r_k - r_{k-1})^{2}},\ 0,\ 1\right), \qquad H_{k+1} = (1-\alpha_k)\,G(H_k) + \alpha_k\,G(H_{k-1}),$$

con $r_k = G(H_k) - H_k$ el residual y $G$ el operador de actualización de carga. Se omite en nodos donde $G$ es no suave (en carga bajo EXTRAN, ranura dinámica activa, cerca del corte de la ranura estática, vertedero/orificio en la clave, extremos de bomba, borde de encharcamiento).

### Balance de masa del tránsito

El error de continuidad del tránsito (fracción del ingreso total) es

$$\varepsilon_{\mathrm{routing}} = \frac{Q_{\mathrm{dw}} + Q_{\mathrm{wet}} + Q_{\mathrm{gw}} + Q_{\mathrm{rdii}} + Q_{\mathrm{ext}} + V_{\mathrm{init}} - \left(Q_{\mathrm{aneg}} + Q_{\mathrm{sal}} + Q_{\mathrm{evap}} + Q_{\mathrm{filt}} + V_{\mathrm{final}}\right)} {Q_{\mathrm{total\,in}}},$$

donde los ingresos son de tiempo seco, tiempo húmedo, napa freática, RDII y externos, y las salidas son anegamiento, caudal de salida del sistema, evaporación, filtración y almacenamiento final. El anegamiento solo se cuenta cuando el volumen del nodo no excede su volumen total; la descarga de los emisarios cuenta como caudal de salida del sistema, y el flujo inverso en los emisarios cuenta como ingreso externo. Las pérdidas por evaporación/filtración de conductos y estanques también se cargan aquí.
