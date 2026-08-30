<!-- Parte de la serie de explicación de modificaciones del motor -->

# Ranura de Preissmann dinámica

## Motivación

La opción `SURCHARGE_METHOD DYNAMIC_SLOT` agrega un tercer método de
escurrimiento en carga. El SWMM oficial ofrece dos formas de representar el
escurrimiento presurizado en conductos cerrados: el algoritmo EXTRAN
(perturbación tipo Hardy–Cross con $dQ/dH$) y la ranura de Preissmann
estática. Ambos tienen limitaciones conocidas en los transitorios de
llenado/vaciado: la ranura estática fija su ancho a partir de la profundidad
instantánea, lo que en el frente de mezcla superficie libre/presión produce
"apretón de ranura" (*slot squeezing*), una amplificación de energía
artificial. La extensión `DYNAMIC_SLOT` implementa la formulación de ranura
de Preissmann *dinámica* de Sharior, Hodges & Vasconcelos (2023), en la que
el área de la ranura evoluciona en el tiempo como un elemento de
*almacenamiento transitorio*.

## Formulación

La ranura dinámica tiene un ancho superior que depende del número de
Preissmann $P$ y de una celeridad de onda de presión objetivo $c_{pT}$
(el usuario la fija con `DPS_CELERITY`, por defecto 25 m/s):

$$T_s = \frac{g\,A_{\mathrm{full}}}{c_{pT}^{2}}\,P^{2},$$

donde $A_{\mathrm{full}}$ es el área de sección llena. El número de Preissmann
parte, al inicio de la presurización, en

$$P_{0} = \max\!\left(\frac{c_{pT}}{\alpha\,c_g},\ 1\right),
  \qquad c_g = \sqrt{g\,A_{\mathrm{full}}/W_{\max}},$$

con $\alpha$ el parámetro de choque (`DPS_ALPHA`, por defecto 3) y
$c_g$ la celeridad de la onda de gravedad a sección llena. El área de ranura se
acumula de forma *dependiente de la trayectoria*:

$$A_s \leftarrow \max\!\left(A_s + T_s\,\Delta h_s,\ 0\right),
  \qquad h_s = \max(\bar y - y_{\mathrm{full}},\ 0),$$

es decir, cada incremento de almacenamiento se crea con el ancho de ranura
vigente en el momento en que se acumula, y las contribuciones previas nunca se
reescriben cuando $P$ decae. Esta propiedad es la que evita la amplificación de
energía del "apretón de ranura". Si la carga cae bajo la clave con área
residual, la carga de sobrepresión se mantiene en cero y el área restante
drena a través de incrementos negativos sucesivos (histéresis de
despresurización).

Después de la presurización, $P$ decae exponencialmente hacia 1 con la escala
de tiempo `DPS_DECAY_TIME` ($r = 0.5$ s por defecto):

$$\hat P(t) = 1 + (\hat P_0 - 1)\exp\!\left(-\frac{10\,(t - t_s)}{r}\right),$$

con $t_s$ el instante en que el conducto entró en carga, y se suaviza
espacialmente una vez por paso promediando $\hat P$ sobre los conductos
incidentes a cada nodo y tomando como $P$ de trabajo el promedio de los dos
extremos del conducto.

## Consecuencias para el solver

Mientras una ranura está activa:

- el área hidráulica es $A = A_{\mathrm{full}} + A_s$ y el ancho superior
  es $T_s$;
- el área superficial aportada a un nodo extremo en carga es
  $T_s\,L/4$;
- el radio hidráulico se mantiene en su valor de sección llena (la
  ranura aporta almacenamiento pero no fricción);
- las cargas de los nodos se actualizan *siempre* con la fórmula
  ordinaria de superficie libre; la rama de surcharge EXTRAN nunca se
  invoca, y la carga piezométrica sobre la clave emerge naturalmente como
  $z_{\mathrm{inv}} + y_{\mathrm{full}} + h_s$.

El paso de tiempo variable usa la celeridad de presión efectiva
$c_p = c_{pT}/P$ en la condición de Courant del conducto en carga:

$$\Delta t \le \frac{L}{\lvert \bar U \rvert + c_{pT}/P}.$$
