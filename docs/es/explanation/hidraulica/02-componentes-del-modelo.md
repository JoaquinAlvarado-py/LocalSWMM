# Componentes del modelo hidráulico

<!-- Parte de la serie de explicación de Hidráulica 1D -->

## Datos de los nodos

Cada nodo lleva propiedades geométricas estáticas y estado dinámico (`NodeData.hpp`):

- $z_{\mathrm{inv}}$ — cota de batea (ft).
- $d_{\mathrm{full}}$ — profundidad total (tirante hasta el brocal / borde superior del estanque).
- $d_{\mathrm{sur}}$ — profundidad máxima admisible de escurrimiento en carga sobre la profundidad total; el límite de anegamiento es $z_{\mathrm{inv}} + d_{\mathrm{full}} + d_{\mathrm{sur}}$.
- $A_{\mathrm{pond}}$ — área de encharcamiento usada cuando el nodo se anega sobre el brocal y el encharcamiento está habilitado.
- $z_{\mathrm{crown}}$ — cota de la clave del conducto más alto conectado; el umbral de entrada en carga es $y_{\mathrm{crown}} = z_{\mathrm{crown}} - z_{\mathrm{inv}}$.
- $\mathrm{deg}$ — número de enlaces conectados; si es negativo, el nodo es un nodo terminal aguas arriba.
- $V_{\mathrm{full}}$ — volumen a profundidad total.

Estado dinámico (actualizado en cada paso de tránsito):

- $d$ — tirante de agua sobre la batea (ft);
- $H = z_{\mathrm{inv}} + d$ — carga hidráulica (ft);
- $V$ — volumen almacenado (ft³);
- $Q_{\mathrm{lat}}$ — aporte lateral total (ft³/s);
- $Q_{\mathrm{in}}$, $Q_{\mathrm{out}}$ — ingreso y salida totales;
- $Q_{\mathrm{ovfl}}$ — tasa de rebalse/anegamiento;
- $Q_{\mathrm{loss}}$ — tasa de pérdidas por evaporación + filtración/exfiltración;
- $\Delta Q_{\mathrm{net}}^{t-1}$ — ingreso neto $Q_{\mathrm{in}} - Q_{\mathrm{out}}$ del paso anterior (usado para el promediado trapezoidal);
- valores del paso anterior $d^{t-1}$, $V^{t-1}$, $Q_{\mathrm{lat}}^{t-1}$.

### Funciones de área superficial y volumen de los nodos

Las funciones de geometría de nodo están implementadas en `src/engine/hydraulics/Node.cpp`.

**Volumen de cámara de unión / emisario / divisor**: con $\mathrm{MIN\_SURFAREA} = 12.566\ \mathrm{ft^2}$ ($\approx 4\pi$, el área de una cámara de inspección de 4 pies),

$$V(d) = V_{\mathrm{full}}\,\frac{d}{d_{\mathrm{full}}},$$

donde $V_{\mathrm{full}} = \mathrm{MIN\_SURFAREA}\cdot d_{\mathrm{full}}$ salvo que se haya redefinido.

**Volumen del estanque de almacenamiento**:

- Tabular: $V = \mathrm{table}(d\cdot \mathrm{Ucf}[L])/\mathrm{Ucf}[V]$ con interpolación de tabla;
- Las formas geométricas (cilíndrica, cónica, paraboloide, piramidal) usan la relación cuadrática de área superficial $A(d) = c + a\,d + b\,d^{2}$, integrada al polinomio cúbico

$$V(d) = d\left(c + d\!\left(\tfrac{a}{2} + d\,\tfrac{b}{3}\right)\right);$$

- Almacenamiento funcional: ley de potencia $A(d) = c + a\,d^{b}$ integrada analíticamente.

**Área superficial** $A_{\mathrm{surf}}(d)$: los nodos no-estanque retornan 0 (el piso de área mínima se aplica más adelante en la actualización de nodo de la onda dinámica); los estanques retornan el valor de la tabla (extrapolando linealmente) o la forma analítica $A(d) = c + a\,d + b\,d^{2}$ / $A(d) = c + a\,d^{b}$.

**Área de encharcamiento**:

$$A_{\mathrm{pond}}(d) = \begin{cases} A_{\mathrm{surf}}(d) & d \le d_{\mathrm{full}} \text{ o } A_{\mathrm{pond}} = 0,\\ A_{\mathrm{pond}} & d > d_{\mathrm{full}} \text{ (anegado)}. \end{cases}$$

**Tirante a partir del volumen** (la inversa de la función de volumen, usada por la actualización de estanque de la onda cinemática y por los reportes): los nodos cámara de unión usan $d = V/\mathrm{MIN\_SURFAREA}$; los estanques invierten las relaciones tabular/geométrica/funcional, usando Newton–Raphson con fallback de bisección cuando no existe forma cerrada.

**Caudal máximo de salida** (usado por la reunión de ingreso de enlace de la onda cinemática y del escurrimiento permanente):

$$Q_{\max} = Q_{\mathrm{in}} + \frac{V_{\mathrm{old}}}{dt}, \qquad Q_{\mathrm{in}} = \min\!\left(Q_{\mathrm{in}}, Q_{\max}\right).$$

## Datos de los enlaces

Cada enlace lleva propiedades estáticas y estado dinámico (`LinkData.hpp`). Para los conductos, los parámetros de capacidad de conducción por enlace (por barril) son (`Link.cpp`, `computeConveyance`):

$$
\begin{aligned}
  \beta &= \frac{\mathrm{PHI}\,\sqrt{|S_0|}}{n}, \qquad \mathrm{PHI} = 1.486 \quad\text{(factor US de Manning)}, \\
  \mathrm{rough\_factor} &= g\left(\frac{n}{\mathrm{PHI}}\right)^{2},\\
  Q_{\mathrm{full}} &= S_{\mathrm{full}}\cdot\beta, \qquad Q_{\max} = S_{\max}\cdot\beta,
\end{aligned}
$$

donde $n$ es la rugosidad de Manning, $S_0$ la pendiente del conducto, $S(a) = A\,R^{2/3}$ el *factor de sección* (ver Sección 4), $S_{\mathrm{full}} = S(A_{\mathrm{full}})$ y $S_{\max} = \max_a S(a)$.

Estado dinámico por enlace: $Q$ (caudal actual, $+$ = nodo1→nodo2), $d$ (tirante medio), $V$ (volumen), $\mathrm{Fr}$ (número de Froude), $\mathrm{flow\_class}$ (DRY, UP_DRY, DN_DRY, SUBCRITICAL, SUPERCRITICAL, UP_CRITICAL, DN_CRITICAL) y valores del paso anterior.

## Pendiente y longitud del conducto

Para un conducto que conecta los nodos $i$ y $j$ con elevaciones de extremo $z_1, z_2$, las cotas de batea de los extremos del conducto son $Z_1 = z_{\mathrm{inv},1} + z_1$, $Z_2 = z_{\mathrm{inv},2} + z_2$. La pendiente del conducto es

$$S_0 = \frac{\Delta y}{\Delta x}, \qquad \Delta y = Z_1 - Z_2, \quad \Delta x = \sqrt{L^{2} - \Delta y^{2}},$$

con un desnivel mínimo impuesto de $\lvert \Delta y \rvert \ge 0.001\ \mathrm{ft}$ (sobrescribible).

## Alargamiento de conductos (estabilidad de Courant)

Si se entrega un `LENGTHENING_STEP` positivo, los conductos cortos se alargan artificialmente para que se cumpla la condición de Courant para el paso de tiempo entregado por el usuario (`Routing.cpp:135–195`):

$$t_{\mathrm{step}} = \min(\mathrm{routing\_step},\ \mathrm{lengthening\_step}), \qquad v_{\mathrm{full}} = \frac{\mathrm{PHI}}{n}\,\frac{S_{\mathrm{full}}}{\sqrt{|S_0|}\,A_{\mathrm{full}}},$$

$$\mathrm{ratio} = \frac{\left(\sqrt{g\,y_{\mathrm{full}}} + v_{\mathrm{full}}\right) t_{\mathrm{step}}}{L}, \qquad L' = \max(L,\ \mathrm{ratio}\cdot L),$$

En canales abiertos, $y_{\mathrm{full}}$ se reemplaza por el tirante hidráulico $A_{\mathrm{full}}/W_{\max}$. Si $L' > L$, la pendiente y la rugosidad se ajustan para preservar igual pérdida de carga a cualquier caudal,

$$S_0' = \frac{|S_0|}{L'/L}, \qquad n' = \frac{n}{\sqrt{L'/L}},$$

y $\beta$, $\mathrm{rough\_factor}$, $Q_{\mathrm{full}}$, $Q_{\max}$ se recalculan a partir de los valores ajustados. La longitud alargada $L'$ (`mod_length`) se usa en la ecuación de momentum; la longitud cruda $L$ se usa para la contabilidad de volúmenes.
