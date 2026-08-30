# Continuidad en los nodos, anegamiento y escurrimiento en carga

<!-- Parte de la serie de explicación de Hidráulica 1D -->

## Caudal neto y cambio de volumen

En cada nodo, por iteración de Picard (`DynamicWave.cpp`, función `setNodeDepth`), el caudal neto y el cambio de volumen trapezoidal son:

$$\Delta Q = Q_{\mathrm{in}} - Q_{\mathrm{out}}, \qquad \Delta V = \tfrac{1}{2}\left(\Delta Q_{\mathrm{net}}^{t-1} + \Delta Q\right) \Delta t,$$

donde $\Delta Q_{\mathrm{net}}^{t-1}$ es el caudal neto del paso anterior (promediado trapezoidal / Crank–Nicolson).

## Actualización de superficie libre (continuidad EXPLICITA)

Para un nodo sin escurrimiento en carga, la actualización de tirante es

$$\Delta y = \frac{\Delta V}{A_S}, \qquad y^{t+\Delta t} = y^{t} + \Delta y,$$

donde el área superficial del ensamble está pisada por el área superficial mínima,

$$A_S = \max\left(A_{SN} + \sum A_{SL},\ A_{\min}\right), \qquad A_{\min} = 12.566\ \mathrm{ft^2},$$

el valor por defecto (sobrescribible mediante la opción `MIN_SURFAREA`). El área mínima es un dispositivo puramente computacional; no agrega volumen.

## Actualización en carga (EXTRAN)

Un nodo está en carga cuando todos los conductos conectados están a sección llena o su carga supera la clave de su conducto más alto ($y > y_{\mathrm{crown}}$), y no es un nodo estanque ni emisario y no está encharcado. Bajo EXTRAN la ecuación de continuidad se convierte en $\sum Q = 0$, impuesta mediante una forma de perturbación (Newton/Hardy Cross). La actualización de tirante en carga es

$$\Delta y = \frac{\alpha\,\Delta Q}{\mathrm{denom}}, \qquad y^{t+\Delta t} = y^{t} + \Delta y,$$

con la corrección de nodo terminal $\alpha = 0.6$ para nodos terminales aguas arriba (solo enlaces de salida, $\mathrm{deg} < 0$) y 1 en caso contrario, y una mezcla de proximidad a la clave para una transición suave de entrada/salida de la condición en carga:

$$\mathrm{denom} = \sum \frac{dQ}{dH} + \left(\frac{A_S^{\mathrm{old}}}{\Delta t} - \sum \frac{dQ}{dH}\right) e^{-15\,f}, \qquad f = \frac{y^{t} - y_{\mathrm{crown}}}{y_{\mathrm{crown}}},$$

aplicada mientras $y^{t} < 1.25\,y_{\mathrm{crown}}$. La carga se mantiene en o sobre la clave ($y \ge y_{\mathrm{crown}} - \mathrm{FUDGE}$). El $\sum dQ/dH$ acumulado en cada nodo es la suma de los gradientes por enlace (Ecuación 52); nótese que el motor acumula $\sum dQ/dH$ como una magnitud positiva con $dQ_{\mathrm{net}}/dH = -\sum dQ/dH$ (una subida de carga aumenta la salida neta).

## Continuidad de nodo semi-implícita

La opción `NODE_CONTINUITY` (por defecto EXPLICIT) puede seleccionar la formulación unificada *semi-implícita*, una única expresión suave válida tanto para el estado de superficie libre como para el estado en carga. Linealizando el caudal neto alrededor de la estimación actual de carga con los gradientes de caudal, $\sum Q^{t+\Delta t} \approx \sum Q + \sum(dQ/dH)\,\Delta H$, y sustituyendo en la actualización trapezoidal de carga se obtiene

$$\Delta y = \frac{\Delta V} {A_S + \tfrac{\Delta t}{2}\sum \frac{dQ}{dH}}, \qquad y^{t+\Delta t} = y^{t} + \Delta y,$$

con el denominador pisado por $A_{\min}$. El término de gradiente de caudal amortigua la actualización (una subida de carga que aumenta la salida neta reduce el llenado neto), y la expresión es $C^1$-suave a través de la clave, que es lo que la hace compatible con la aceleración de Anderson.

## Anegamiento y encharcamiento

El tirante máximo sin anegar es $y_{\max} = d_{\mathrm{full}} + d_{\mathrm{sur}}$ (para nodos sin encharcamiento; los nodos encharcados nunca se acotan). Si el tirante candidato supera $y_{\max}$:

- **Sin encharcamiento**: la carga se acota a $y_{\max}$ y el exceso se pierde como rebalse,

$$Q_{\mathrm{ovfl}} = \frac{\Delta V}{\Delta t}, \qquad V = V_{\mathrm{full}};$$

- **Con encharcamiento** (con `ALLOW_PONDING` y un área de encharcamiento positiva): el nodo encharcado actúa como un estanque de área constante sobre el brocal,

$$V = \max\left(V^{\mathrm{old}} + \Delta V,\ V_{\mathrm{full}}\right), \qquad Q_{\mathrm{ovfl}} = \frac{V - \max(V^{\mathrm{old}},\ V_{\mathrm{full}})} {\Delta t},$$

  y la carga puede subir libremente sobre el brocal.

Un nodo encharcado no puede bajar mucho bajo la profundidad total una vez encharcado ($y \ge d_{\mathrm{full}} - \mathrm{FUDGE}$).
