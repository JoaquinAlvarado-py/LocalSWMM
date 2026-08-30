<!-- Parte de la serie de explicación de modificaciones del motor -->

# Tránsito 1D por volúmenes finitos explícitos (`FLOW_ROUTING FV`)

## Motivación

El SWMM oficial solo ofrece esquemas implícitos con linealización (onda
dinámica) u ondas cinemática/permanente. El solver de onda dinámica, aunque es
el estándar de la industria, tiene dificultades bien documentadas con el flujo
transcrítico, la propagación de frentes bruscos y la transición seco/húmedo. La
extensión `FLOW_ROUTING FV` agrega un solver 1D de *volúmenes
finitos explícito y conservativo* de tipo Godunov, que resuelve el flujo
transcrítico de forma nativa y maneja seco/húmedo sin las ramas ad hoc de la
onda dinámica.

## Arquitectura del solver

El solver vive en `src/engine/hydraulics/fv/`. Cada conducto se discretiza en
celdas (por defecto al menos `FV_MIN_CELLS` = 4 por conducto, o con un
blanco de longitud `FV_CELL_LENGTH`); el estado conservado de cada celda es
el área hidráulica $A$ y el caudal $Q$. El paso temporal global obedece la
condición de Courant, y el solver sub-pasea internamente a su propio límite
CFL, de modo que el paso de tránsito (de reporting/forzamiento) no necesita
encogerse por estabilidad.

Las opciones principales (claves `FV_*` en `[OPTIONS]`) son:

| Opción | Defecto | Descripción |
|---|---|---|
| `FV_CFL` | 0.5 | número de Courant |
| `FV_RIEMANN` | HLLC | solver de Riemann (HLL / HLLC) |
| `FV_ORDER` | 1 | orden espacial (1 = Godunov, 2 = MUSCL–Hancock) |
| `FV_LIMITER` | MINMOD | limitador de pendiente (MINMOD/VANLEER/SUPERBEE) |
| `FV_CELL_LENGTH` | 0 | blanco de $\Delta x$ (0 = solo piso de celdas) |
| `FV_MIN_CELLS` | 4 | piso de celdas por conducto |
| `FV_SLOT_CELERITY` | 100 ft/s | celeridad de presión (ancho de ranura) |
| `FV_NODE_COUPLING` | SEMI_IMPLICIT | acoplamiento nodo–celda |
| `FV_STRUCTURE_COUPLING` | SUBSTEP | cuándo se re-evalúan las estructuras |
| `FV_LTS` | true | paso de tiempo local |
| `FV_LTS_MAX_TIERS` | 6 | máximo de niveles LTS |
| `FV_DISPERSION` | 0 | coeficiente de dispersión longitudinal |

*Tabla: Opciones del solver 1D de volúmenes finitos.*

## Diseños clave

- **Nodos algebraicos**: las cámaras de unión no son estados con
  área (como en la onda dinámica, donde el área de trabajo pertenece a
  los conductos); un nodo de grado 2 sin aporte lateral pasa los flujos
  directamente como una cara, y los demás nodos resuelven su carga desde
  el balance instantáneo de flujos por subpaso. Esto elimina el límite de
  paso de milisegundos que un área de cámara imponía al modelo completo.
- **Acoplamiento nodo–celda semi-implícito**: el flujo de cada cara
  de acoplamiento se linealiza en la carga del nodo, lo que saca al nodo
  del límite de estabilidad explícito (la cámara, no la tubería, era el
  factor limitante del subpaso). La conservación no se altera: el flujo
  corregido es el que ven tanto el nodo como la celda. Con
  `FV_NODE_PICARD_SWEEPS` > 1 se re-evalúan área, ancho y
  flujos de Riemann en cada barrido.
- **Paso de tiempo local (LTS)**: las celdas rígidas (conductos
  cortos, presurizados) avanzan a su propio $\Delta t = 2^k\,\Delta t_0$
  mientras el resto avanza al paso global; cuando el reparto no separa
  nada, el solver cae al camino de paso global bit a bit.
- **Estructuras**: las ecuaciones de bombas/orificios/vertederos/
  descargas se re-evalúan por defecto en *cada* subpaso explícito
  (`FV_STRUCTURE_COUPLING SUBSTEP`), lo que es físicamente
  exacto; la alternativa es una vez por paso de tránsito.
- **Backends**: el mismo núcleo escalar se compila para CPU,
  OpenMP y dispositivos (CUDA/HIP/SYCL mediante plugins Kokkos); el
  resultado debe ser bit a bit idéntico entre backends.
