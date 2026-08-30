# Estructuras hidráulicas y condiciones de borde

<!-- Parte de la serie de explicación de Hidráulica 1D -->

## Estructuras hidráulicas no-conducto

Los caudales de las estructuras no-conducto los calcula `HydStructures.cpp` (`StructureSolver`) dentro de la iteración de Picard de la onda dinámica, un enlace a la vez en orden de índice (para que dos bombas que comparten una cámara húmeda se vean mutuamente la extracción), con distribución inmediata en los acumuladores de los nodos y subrelajación a $\omega = 0.5$ para iteraciones $> 0$ (las bombas quedan exentas).

### Bombas

El control de arranque/parada de las bombas usa histéresis de tirante aplicada una vez por paso de tránsito:

$$\text{detener si } d < d_{\mathrm{off}} \ (\text{regulación} > 0), \qquad \text{arrancar si } d > d_{\mathrm{on}} \ (\text{regulación} = 0).$$

Los tipos de curva de bomba (1–5) determinan el caudal $q$ a partir de la curva versus el volumen de la cámara húmeda (tipo 1), el tirante (tipos 2 y 4) o la carga (tipos 3 y 5, donde $q$ se escala por la regulación de velocidad $s$ y la carga por $s^2$); una bomba ideal descarga exactamente el ingreso más el rebalse del nodo aguas arriba. La limitación de caudal (legado `getModPumpFlow`) evita bombear más de lo disponible (protección contra aspiración en seco) y, para bombas tipo 1 o alimentadas por estanque, acota $q$ por $Q_{\mathrm{in}} + V_{\mathrm{old}}/\Delta t$.

### Orificios

Los orificios de fondo y laterales usan un coeficiente y un tirante crítico definidos a partir de la altura de apertura $h_{\mathrm{open}} = s\,y_{\mathrm{full}}$ (regulación $s$):

$$
\begin{aligned}
  f &= \min\!\left(\frac{\text{carga}}{h_{\mathrm{crit}}},\ 1\right),
      \qquad h_{\mathrm{crit}} = \frac{C_d}{0.414}\,\frac{h_{\mathrm{open}}} {4}\ \text{(circular)}\ \text{o}\ \frac{C_d}{0.414}\, \frac{h_{\mathrm{open}}\,W_{\max}}{2(h_{\mathrm{open}} + W_{\max})} \text{(rectangular)},\\
  q &= \begin{cases}
    C_w\,f^{3/2} & f < 1 \quad\text{(escurrimiento parcial tipo vertedero)},\\
    C_d\,A_{\mathrm{eff}}\sqrt{2g\,H} & f \ge 1 \quad\text{(orificio lleno)},
  \end{cases}
\end{aligned}
$$

con $C_w = C_d\sqrt{h_{\mathrm{crit}}}\,A_{\mathrm{eff}}\sqrt{2g}$ (coeficiente de vertedero de cresta afilada 0.414), $A_{\mathrm{eff}}$ el área de la sección transversal a la altura de apertura y $H$ la carga apropiada (carga diferencial cuando está sumergido/ahogado). El gradiente de caudal es

$$\frac{dQ}{dH} = \frac{3}{2}\,\frac{q}{f\,h_{\mathrm{crit}}} \quad\text{(régimen vertedero)}, \qquad \frac{dQ}{dH} = \frac{q}{2H} \quad\text{(régimen orificio)}.$$

Puede aplicarse una pérdida de carga opcional de compuerta de retención ARMCO y la corrección de sumersión de Villemonte.

### Vertederos

Los cuatro tipos de vertedero (transversal, lateral, escotadura en V, trapezoidal) descargan según

$$
\begin{aligned}
  q &= C_d\,L\,h^{3/2} &&\text{(transversal)},\\
  q &= C_d\,L^{0.83}\,h^{1.67} &&\text{(lateral, corregido)},\\
  q &= C_d\,s_h\,h^{5/2} &&\text{(escotadura en V)},
\end{aligned}
$$

con contracciones de extremo que reducen la longitud efectiva. Cuando la línea de gradiente hidráulica aguas arriba alcanza la clave ($H_1 \ge H_{\mathrm{crown}}$) y se permite la entrada en carga, el vertedero transita a escurrimiento por orificio usando un coeficiente equivalente de orificio calculado desde el caudal del vertedero a apertura completa:

$$C_{\mathrm{sur}} = \frac{Q_{\mathrm{weir}}(s\,y_{\mathrm{full}})} {\sqrt{(s\,y_{\mathrm{full}})/2}}, \qquad q = C_{\mathrm{sur}}\sqrt{H_{\mathrm{orif}}},$$

con $H_{\mathrm{orif}}$ la carga al punto medio de la abertura (o la carga diferencial cuando está sumergido/ahogado). Si no se permite la entrada en carga, la carga se acota en la clave y se mantiene la ecuación de vertedero. La corrección de sumersión de Villemonte se aplica cuando la LGH aguas abajo supera la cresta. La contribución de área superficial del vertedero se anula por compatibilidad con SWMM 4.

### Descargas (outlets)

Las descargas usan curvas de gasto en función de la carga o del tirante (tabulares o funcionales):

$$q = C\,H^{e} \quad\text{(funcional)}, \qquad q = \mathrm{table}(H) \quad\text{(tabular)},$$

escaladas por la regulación. El $dQ/dH$ se deja deliberadamente en cero (igual que el legado), lo que evita inflar el denominador de carga de los nodos.

## Condiciones de borde de emisario

Los niveles de agua de los emisarios se fijan al inicio de cada paso de tránsito y nuevamente dentro de cada iteración de Picard a partir de los caudales actuales de los conductos. Para el conducto conectado a un emisario en un extremo de elevación $z$, con caudal por barril $q$, se calculan el tirante normal $y_n$ (desde el factor de sección inverso) y el tirante crítico $y_c$ ($y_c$ tiene formas cerradas para las formas estándar y una búsqueda numérica de raíz en el resto). El nivel depende del tipo de condición de borde (`Outfall.cpp:setOutfallDepth`):

- **LIBRE (FREE)**: caída libre, $d = z + \min(y_n, y_c)$.
- **NORMAL**: $d = z + y_n$.
- **FIJO (FIXED)**, **MAREA (TIDAL)**, **SERIE DE TIEMPO (TIMESERIES)**: el nivel $s_{\mathrm{stage}}$ es constante, proviene de una tabla de mareas (hora del día) o de una serie de tiempo; entonces

$$d = \begin{cases} s_{\mathrm{stage}} - z_{\mathrm{inv}} & z + y_c + z_{\mathrm{inv}} < s_{\mathrm{stage}},\\ \max(0,\ s_{\mathrm{stage}} - z_{\mathrm{inv}}) & z > 0 \wedge s_{\mathrm{stage}} < z_{\mathrm{inv}} + z,\\ z + y_c & z > 0 \wedge s_{\mathrm{stage}} \ge z_{\mathrm{inv}} + z,\\ y_c & z = 0. \end{cases}$$

El último caso mantiene un emisario fijo de descarga libre al tirante crítico del conducto. Una compuerta de retención en un emisario bloquea el flujo inverso.

## Divisores de flujo

Los divisores están activos solo bajo tránsito por onda cinemática (y permanente); bajo onda dinámica actúan como cámaras de unión ordinarias. Dado el ingreso total $Q_{\mathrm{in}}$ en el nodo divisor:

- **De corte (cutoff)**: desvía todo el ingreso sobre un mínimo, $Q_{\mathrm{div}} = \max(0, Q_{\mathrm{in}} - q_{\min})$.
- **De rebalse (overflow)**: desvía el ingreso sobre la capacidad del enlace de continuación.
- **Tabular**: $Q_{\mathrm{div}} = Q_{\mathrm{in}}\cdot f(Q_{\mathrm{in}})$ con la fracción de una tabla de gasto.
- **Vertedero**: $Q_{\mathrm{div}} = C_d\,W\,d^{3/2}$ a partir de una relación de vertedero sobre el tirante del nodo, acotada al ingreso.

El caudal desviado se escribe en el enlace de desvío; el enlace de continuación lleva el resto.
