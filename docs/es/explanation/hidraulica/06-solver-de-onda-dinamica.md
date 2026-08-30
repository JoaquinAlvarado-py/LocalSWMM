# Onda dinámica: ecuaciones de gobierno y algoritmo de solución

<!-- Parte de la serie de explicación de Hidráulica 1D -->

## Onda dinámica: ecuaciones de gobierno

### Las ecuaciones de St. Venant

El modelo de onda dinámica resuelve las ecuaciones unidimensionales completas de de Saint-Venant (continuidad y momentum):

$$\underbrace{\frac{\partial A}{\partial t}}_{\text{almacenamiento}} + \underbrace{\frac{\partial Q}{\partial x}}_{\text{flujo convectivo}} = 0,$$

$$\underbrace{\frac{\partial Q}{\partial t}}_{\text{aceleración local}} + \underbrace{\frac{\partial}{\partial x}\!\left(\frac{Q^{2}}{A}\right)}_{\text{aceleración convectiva}} + \underbrace{gA\,\frac{\partial H}{\partial x}}_{\text{gradiente de presión}} + \underbrace{gA\,S_f}_{\text{fricción}} = 0,$$

donde $A$ es el área hidráulica, $Q$ el caudal, $H = Z + y$ la carga hidráulica ($Z$ cota de batea del conducto, $y$ tirante), $g$ la gravedad y $S_f$ la pendiente de fricción. La pendiente de fricción sigue a Manning:

$$S_f = \left(\frac{n}{1.486}\right)^{2} \frac{Q\,\lvert U \rvert}{A\,R^{4/3}}, \qquad U = \frac{Q}{A}.$$

### Ecuación de momentum en diferencias finitas

El motor usa una forma implícita (Euler hacia atrás) en diferencias finitas. Con diferencias espaciales sobre la longitud del conducto $L$ y diferencias temporales sobre $\Delta t$, la actualización de caudal en cada conducto es

$$Q^{t+\Delta t} = \frac{Q^{t} + \Delta Q_{\text{inercia}} + \Delta Q_{\text{presión}} + \Delta Q_{\text{pérdida}}} {1 + \Delta Q_{\text{fricción}}},$$

donde todas las magnitudes geométricas se evalúan en el nuevo tiempo $t + \Delta t$. Los cuatro términos son:

$$
\begin{aligned}
  \Delta Q_{\text{inercia}}
    &= 2\bar{U}\left(\bar{A}^{t+\Delta t} - \bar{A}^{t}\right)
       + \bar{U}^{2}\,\frac{A_2 - A_1}{L}\,\Delta t, \\
  \Delta Q_{\text{presión}}
    &= -g\bar{A}\,\frac{H_2 - H_1}{L}\,\Delta t, \\
  \Delta Q_{\text{fricción}}
    &= g\left(\frac{n}{1.486}\right)^{2} \frac{\lvert \bar{U} \rvert}{\bar{R}^{4/3}}\,\Delta t, \\
  \Delta Q_{\text{pérdida}}
    &= \text{pérdidas locales (menores) y términos de evaporación/filtración}.
\end{aligned}
$$

### Continuidad en los nodos

La conservación de volumen en cada ensamble de nodo (el nodo más la mitad de cada enlace conectado) requiere

$$\frac{\partial V}{\partial t} = A_{S}\,\frac{\partial H}{\partial t} = \sum Q,$$

con $A_S = A_{SN} + \sum A_{SL}$ el área superficial del ensamble (el área superficial propia del nodo más las áreas superficiales de medio enlace que aporta cada conducto). En forma de diferencias finitas:

$$H^{t+\Delta t} = H^{t} + \frac{\tfrac{\Delta t}{2}\left(\sum Q^{t} + \sum Q^{t+\Delta t}\right)} {\left(A_{SN} + \sum A_{SL}\right)^{t+\Delta t}},$$

es decir, una actualización trapezoidal de la carga usando el *promedio* de los caudales netos en $t$ y $t+\Delta t$.

## Algoritmo de solución de la onda dinámica

### Resumen: la iteración de Picard (aproximaciones sucesivas)

La ecuación de momentum (Ecuación 31) y la continuidad de nodo se resuelven implícitamente sobre cada paso de tiempo mediante *iteración funcional* (iteración de Picard / aproximaciones sucesivas). Los pasos, que coinciden con el `DWSolver::execute` del motor (`DynamicWave.cpp:1026`), son:

1. **initNodeStates** — reinicia los acumuladores por nodo: ingreso = 0, salida = pérdidas $+$ aporte lateral negativo, ingreso $+$ aporte lateral positivo; área superficial desde la geometría de almacenamiento/encharcamiento; convergido = 0, $\sum dQ/dH = 0$.
2. **computeLinkGeometry** — calcula en lote los tirantes de extremo $y_1, y_2$, el tirante medio $\bar y$, los espejos de agua, las áreas y los radios hidráulicos de todos los conductos desde las cargas actuales de los nodos; clasifica el régimen de escurrimiento de cada conducto; aplica las correcciones de ranura de Preissmann donde hay escurrimiento en carga.
3. **Núcleos de momentum** — resuelve la ecuación de momentum implícita para cada conducto (Sección 9), registra los nuevos caudales y los distribuye en los acumuladores de ingreso/salida de los nodos, acumulando $\sum dQ/dH$ y las contribuciones de área superficial.
4. **Estructuras no-conducto** — calcula los caudales de bombas/orificios/vertederos/descargas (Sección 12).
5. **Niveles de emisario** — vuelve a fijar los niveles de borde de los emisarios desde los caudales actuales.
6. **Actualización de tirante en los nodos** — resuelve la ecuación de continuidad para la carga de cada nodo (Sección 10); cuenta los nodos no convergidos.
7. Si algún nodo cambió más que la tolerancia de carga y no se ha alcanzado el límite de intentos, marca como *omitidos (bypassed)* los enlaces cuyos dos nodos extremos convergieron (sus caudales se mantienen), e itera.

Subrelajación: después de la primera iteración, todo caudal y carga actualizados se relajan con $\omega = 0.5$,

$$x^{k+1} = (1-\omega)\,x^{k} + \omega\,x^{k+1}_{\mathrm{crudo}}, \qquad \omega = 0.5,$$

y un cambio de signo en el caudal se fuerza a pasar por un valor pequeño no nulo ($q = \pm 0.001$).

### Convergencia

Un nodo está convergido cuando tanto el residual de Picard crudo como el movimiento aceptado (posiblemente mezclado por Anderson) están dentro de la tolerancia de carga $\varepsilon_H = 0.005\ \mathrm{ft}$ (por defecto). El paso de tránsito converge cuando ningún nodo no-emisario queda sin converger. El número máximo de intentos es 8 por defecto (`MAX_TRIALS`); un paso que converge en su último intento permitido aún se cuenta como convergido.

### Clasificación del escurrimiento

Durante el cálculo de la geometría, cada conducto se clasifica en una de siete clases de escurrimiento (DRY, UP_DRY, DN_DRY, SUBCRITICAL, SUPERCRITICAL, UP_CRITICAL, DN_CRITICAL) en base a los tirantes de extremo y a la carga relativa a las cotas de batea de los extremos, usando el tirante normal $y_n$ (desde el factor de sección inverso en $Q/\beta$) y el tirante crítico $y_c$ (Sección 13). La clase determina:

- los ajustes de área superficial para extremos secos/críticos (Tabla 4),
- el tirante usado en el extremo crítico (reemplazado por $\min(y_n, y_c)$),
- el límite de caudal normal basado en la fricción.

| Condición | Criterio | Ajuste |
|---|---|---|
| Seco aguas arriba | $y_1 = 0$; $Z_1 > E_1$ | $A_{SL1} = 0$ si $H_2 \le Z_1$, si no ajuste crítico |
| Seco aguas abajo | $y_2 = 0$; $Z_2 > E_2$ | $A_{SL2} = 0$ si $H_1 \le Z_2$, si no ajuste crítico |
| Crítico aguas arriba | $Q < 0$; $Z_1 > E_1$; $H_1 - Z_1 < y_*$ | $y_1 = y_*$; $A_{SL1} = 0$ |
| Crítico aguas abajo | $Q > 0$; $Z_2 > E_2$; $H_2 - Z_2 < y_*$ | $y_2 = y_*$; $A_{SL2} = 0$ |

Ajustes de área superficial y de tirante para extremos de conducto secos/críticos ($y_* = \min(y_n, y_c)$; $E$ = batea del nodo, $Z$ = batea del conducto).

### Contribuciones de área superficial

Para un conducto subcrítico, las áreas de superficie libre aportadas a sus dos nodos extremos son

$$A_{SL1} = \frac{W_1 + \bar{W}}{2}\,\frac{L}{2}, \qquad A_{SL2} = \frac{\bar{W} + W_2}{2}\,\frac{L}{2}\, \mathrm{fasnh},$$

donde $W_1, W_2, \bar W$ son los espejos de agua en $y_1, y_2, \bar y$, y $\mathrm{fasnh}$ es un factor entre el tirante normal y el crítico para un extremo aguas abajo casi crítico. Para extremos secos/críticos el área superficial de medio enlace se ajusta según la Tabla 4; un conducto completamente seco aporta $A_{SL1} = A_{SL2} = \mathrm{FUDGE}\cdot L/2$. Un conducto cerrado cuyo tirante medio supera el corte de clave ($y/y_{\mathrm{full}} \ge 0.96$ bajo EXTRAN) usa un ancho acotado en la clave en el cálculo del área superficial, entregando la pequeña contribución no nula que mantiene acotado el denominador de Picard del nodo.
