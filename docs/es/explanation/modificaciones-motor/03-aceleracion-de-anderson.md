<!-- Parte de la serie de explicación de modificaciones del motor -->

# Aceleración de Anderson del ciclo de Picard (`ANDERSON_ACCEL`)

## Motivación

El solver de onda dinámica resuelve las ecuaciones de nodo y de enlace por
*iteración funcional* (Picard / aproximaciones sucesivas): cada pasada
aplica el mismo operador de actualización de carga $G$ a las últimas
estimaciones de carga hasta que ningún nodo cambia más que la tolerancia de
carga $\varepsilon_H$. La iteración de punto fijo converge *linealmente*,
y el factor de subrelajación $\omega = 0.5$ que amortigua cada actualización
estabiliza la iteración sin mejorar su tasa. En redes con muchos nodos
fuertemente acoplados, el solver puede consumir sus 8 intentos
(`MAX_TRIALS`) en casi todos los pasos de tránsito, incluso en
condiciones suaves.

## El método

La aceleración de Anderson de profundidad 2 (equivalente a la actualización de
Aitken) mezcla las dos salidas más recientes del operador. Sea
$H_k$ la estimación de carga al entrar a la iteración $k$, el residual es

$$r_k = G(H_k) - H_k,$$

y el coeficiente de mezcla es

$$\alpha_k = \mathrm{clamp}\!\left(
    \frac{r_k\,(r_k - r_{k-1})}{(r_k - r_{k-1})^{2}},\ 0,\ 1\right),
  \qquad
  H_{k+1} = (1-\alpha_k)\,G(H_k) + \alpha_k\,G(H_{k-1}).$$

El acotamiento de $\alpha_k$ a $[0,1]$ restringe la actualización a una
*interpolación* entre dos salidas del operador ya calculadas y ya acotadas;
nunca se produce una carga extrapolada. La mezcla se aplica por nodo a partir
del segundo intento de cada paso de tránsito.

## Salvaguardas

- **Compuerta por magnitud del residual**: la mezcla se aplica solo
  cuando $\lvert r_k \rvert \le 20\,\varepsilon_H$; lejos del régimen
  lineal la mezcla podría sobrepasar.
- **Cotas físicas**: un tirante mezclado negativo se descarta en
  favor de la iteración ordinaria de Picard.
- **Exclusión de nodos no suaves**: la aceleración se omite en los
  nodos donde el operador $G$ es conocido no suave (véase la
  [tabla de nodos excluidos](#salvaguardas) más abajo):
  nodos en carga bajo `EXTRAN` con continuidad `EXPLICIT`
  (la rama cambia en la clave), ranura dinámica activa, conductos cerca
  del corte de la ranura estática, vertederos u orificios en la clave,
  extremos de bombas (estado discreto on/off) y el borde de
  encharcamiento.
- **Criterio de convergencia doble**: un nodo se cuenta como
  convergido solo cuando tanto el residual crudo $\lvert G(H_k) - H_k \rvert$ como el movimiento aceptado $\lvert H_{k+1} - H_k \rvert$ están
  dentro de la tolerancia. Sin esta doble condición, una mezcla que
  aterrice cerca de la iteración anterior podría declarar convergencia
  mientras el balance de caudales sigue sin satisfacerse.

| Condición | Cuándo | Razón |
|---|---|---|
| Nodo en carga | `SURCHARGE_METHOD EXTRAN` con `NODE_CONTINUITY EXPLICIT` | la rama cambia en la clave |
| Ranura dinámica activa | `SURCHARGE_METHOD DYNAMIC_SLOT` | la geometría se reescribe por iteración |
| Cerca del corte estático | `SURCHARGE_METHOD SLOT`, $0.98 \le \bar y/y_{\mathrm{full}} \le 1.02$ | el ancho de ranura entra abruptamente |
| Vertedero/orificio en la clave | LGH aguas arriba $\ge$ clave | la ecuación de caudal cambia de forma |
| Bombas | ambos nodos extremos | el estado on/off es discreto |
| Borde de encharcamiento | nodo encharcado en $d_{\mathrm{full}}$ | piso $C^0$ en el límite de encharcamiento |

*Tabla: Nodos excluidos de la aceleración de Anderson.*

El efecto medido: reducción de los conteos de intentos en aproximadamente 25 a
50 % por paso de tránsito en redes que de otro modo iteran hasta el límite.
