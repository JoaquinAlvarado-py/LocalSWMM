<!-- Parte de la serie de explicación de modificaciones del motor -->

# Recuperación física de la abstracción del RDII (`[RDII_DECAY]`)

## Motivación

En el SWMM oficial, la infiltración/entrada por lluvia (RDII, *rain-derived
inflow and infiltration*) se modela con el método RTK: cada nodo responde con
hasta tres hidrogramas unitarios triangulares (corto, medio y largo) definidos
por $R$, $T$ y $K$, convolucionados con la precipitación. La abstracción
inicial (capacidad de almacenamiento antes de que se genere RDII) se recupera
entre eventos a *tasa constante* dada por una tabla mensual
(`IA_Recov`): la variación estacional debe pre-cocinarse en los datos de
entrada del usuario.

## La extensión: abstracción de decaimiento exponencial

La extensión `[RDII_DECAY]` reemplaza esa recuperación constante por un
modelo físico de *relajación exponencial de primer orden* cuya tasa depende
de la *temperatura del aire*. Los parámetros por par (grupo de
hidrogramas, respuesta) son $k_{\mathrm{dep}}$, $k_0$, $k_T$, $T_{\mathrm{ref}}$,
$\theta_{\mathrm{rec}}$, $T_{\mathrm{cong}}$ y, opcionalmente, un particionado
lluvia/nieve.

**Agotamiento durante la lluvia** ($k_{\mathrm{dep}}$): la capacidad
disponible se agota exponencialmente con la lámina de lluvia $\Delta P$,

$$IA_{\mathrm{avail}}^{+} = IA_{\mathrm{avail}}\,
    e^{-k_{\mathrm{dep}}\,\Delta P},
  \qquad
  P_{\mathrm{net}} = \max\!\left(0,\ \Delta P -
    \left(IA_{\mathrm{avail}} - IA_{\mathrm{avail}}^{+}\right)\right),$$

con contabilidad másica consistente (el almacenamiento drena exactamente lo
que abstrae). $k_{\mathrm{dep}} = 0$ desactiva la abstracción.

**Recuperación entre eventos** ($k_0$, $k_T$, $T_{\mathrm{ref}}$): la
capacidad disponible relaja hacia el máximo,

$$\frac{d\,IA_{\mathrm{avail}}}{dt} = k_{\mathrm{rec}}(T)\,
    \left(IA_{\max} - IA_{\mathrm{avail}}\right),
  \qquad
  IA_{\mathrm{avail}}^{+} = IA_{\max} - \left(IA_{\max} - IA_{\mathrm{avail}}\right)
    e^{-k_{\mathrm{rec}}(T)\,\Delta t},$$

donde la tasa de recuperación depende de la temperatura con una base
independiente de la temperatura (drenaje gravitacional / redistribución
capilar) más un término térmico:

$$k_{\mathrm{rec}}(T) = \max\!\left(0,\ k_0 + k_T\,
    e^{\theta_{\mathrm{rec}}\,(T - T_{\mathrm{ref}})}\right),$$

y se anula bajo la temperatura de congelamiento $T_{\mathrm{cong}}$ (suelo
congelado), reproduciendo la elevación de RDII de inicios de primavera. La
temperatura proviene de la fuente `[TEMPERATURE]` del proyecto (serie de
tiempo o archivo); si no se configura, $T$ se fija en $T_{\mathrm{ref}}$ y se
emite una advertencia.

**Particionado lluvia/nieve (opcional)**: con la cláusula `SNOW`,
$T \le T_{\mathrm{nieve}}$ acumula la precipitación como equivalente en nieve
(sin aporte líquido), y con nieve presente y $T > T_{\mathrm{nieve}}$ se agrega
un derretimiento de grado-día $m = \min\!\left(SWE,\ DDF\,(T - T_{\mathrm{nieve}})\,\Delta t\right)$ a la lluvia (lluvia sobre nieve).

La recuperación de primer orden es más rápida cuando el déficit es grande y se
ralentiza cerca de la saturación, a diferencia de la tasa constante lineal del
SWMM oficial. Los pares sin fila en `[RDII_DECAY]` usan el modelo
lineal legado; el estado de ejecución (el tirante $ia_{\mathrm{used}}$) es
intercambiable entre formulaciones, por lo que los archivos de arranque en
caliente son compatibles.
