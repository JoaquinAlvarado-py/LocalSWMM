# El Proceso de Cálculo Hidráulico 1D

*del proyecto LocalSWMM (motor HydroCouple OpenSWMM) — Documento de Referencia Técnica, Agosto 2026.*

<!-- Parte de la serie de explicación de Hidráulica 1D -->
<!-- Original en LaTeX: docs/sources/1d_hidraulica.tex -->

*Este documento entrega una descripción completa, a nivel de ecuaciones, del proceso de cálculo hidráulico unidimensional (1D) que utiliza la aplicación web LocalSWMM. Todos los cálculos hidráulicos los ejecuta el motor HydroCouple **OpenSWMM**, compilado a WebAssembly y que se ejecuta dentro del navegador. El motor resuelve las ecuaciones de de Saint-Venant sobre una red de nodos y enlaces. Se dispone de cuatro formulaciones de tránsito (routing):* escurrimiento permanente *(flujo permanente),* onda cinemática, *onda dinámica* (la opción por defecto) *y un esquema explícito de* volúmenes finitos. *El documento explica el modelo conceptual, las ecuaciones de gobierno, los esquemas de diferencias finitas, el procedimiento de solución iterativa, los algoritmos de continuidad en los nodos y de escurrimiento en carga (surcharge), el cálculo de las estructuras hidráulicas no-conducto, las funciones de geometría de sección transversal, las condiciones de borde, el paso de tiempo adaptativo y el balance de masa. Toda ecuación está transcrita del código fuente del motor (ver la lista de archivos en las Referencias) y referenciada a los Manuales de Referencia del motor cuando corresponde.*

## Introducción

### Alcance

Este documento cubre los cálculos hidráulicos (tránsito de caudales) *unidimensionales* del proyecto LocalSWMM. LocalSWMM es una aplicación web basada en navegador para el modelamiento de redes de aguas lluvias y aguas servidas; incorpora el motor HydroCouple OpenSWMM (C++) compilado a WebAssembly. El componente hidráulico 1D resuelve el escurrimiento unidimensional, no permanente y gradualmente variado a través de una red de *nodos* (cámaras de unión, estanques de almacenamiento, divisores de flujo, emisarios) y *enlaces* (conductos, bombas, orificios, vertederos, descargas). El módulo de escurrimiento superficial 2D y su acoplamiento 1D–2D quedan fuera del alcance, salvo donde interactúan con el solver 1D (por ejemplo, a través de los aportes laterales y del acoplamiento por área de encharcamiento).

El motor es un *modelo de simulación distribuida de tiempo discreto*: avanza un vector de estado a lo largo de una secuencia de pasos de tiempo,

$$\boldsymbol{X}_{t} = f\!\left(\boldsymbol{X}_{t-1}, \boldsymbol{I}_{t}, \boldsymbol{P}\right), \qquad \boldsymbol{Y}_{t} = g\!\left(\boldsymbol{X}_{t}, \boldsymbol{P}\right),$$

donde $\boldsymbol{X}$ es el vector de estado, $\boldsymbol{I}$ las entradas externas, $\boldsymbol{P}$ los parámetros fijos e $\boldsymbol{Y}$ las salidas.

### Glosario de terminología (español de Chile)

A lo largo de este documento se usa la terminología técnica empleada en la práctica hidrosanitaria chilena. La Tabla 1 entrega la equivalencia entre los términos del motor (en inglés) y su traducción local.

| Término del motor | Español de Chile |
|---|---|
| stormwater | aguas lluvias |
| wastewater / sewage | aguas servidas |
| sewer system | alcantarillado |
| sewer main (collector) | colector |
| culvert | alcantarilla de paso |
| manhole / junction chamber | cámara de inspección |
| junction node | cámara de unión |
| outfall | emisario / punto de descarga |
| storage unit | estanque de almacenamiento (piscina de laminación / estanque de retención) |
| pump | bomba |
| pump station | cámara de bombeo / estación de bombeo |
| wet well | cámara húmeda |
| weir | vertedero |
| orifice | orificio |
| outlet (link) | descarga regulada / salida con curva de gasto |
| flap gate | compuerta de retención |
| link / conduit | vínculo / enlace; conducto / tubería |
| invert elevation | cota de batea |
| crown | clave |
| rim | brocal |
| flow depth | tirante |
| water surface width | espejo de agua / ancho superficial |
| hydraulic radius | radio hidráulico |
| hydraulic head | carga hidráulica / cota piezométrica |
| friction slope | pendiente de fricción / pendiente motriz |
| minor losses | pérdidas locales / pérdidas singulares |
| backwater | remanso |
| surcharge (state) | escurrimiento en carga |
| flowing full | a sección llena |
| overflow | rebalse |
| flooding | anegamiento / inundación |
| ponding | encharcamiento |
| runoff | escorrentía superficial |
| groundwater table | napa freática |
| infiltration | infiltración |
| exfiltration | exfiltración |
| street inlet / catch basin | sumidero |
| rain gage | pluviómetro |
| catchment / subcatchment | cuenca / subcuenca |
| time step | paso de tiempo |
| flow rate | caudal |
| hydrograph | hidrograma |
| time series | serie de tiempo |
| control rules | reglas de control |
| steady flow | escurrimiento permanente |
| kinematic wave | onda cinemática |
| dynamic wave | onda dinámica |

### El modelo conceptual de nodos y enlaces

La porción de conducción de un sistema de drenaje es una red de nodos y enlaces. Los **nodos** son puntos que representan:

- **Cámaras de unión** — puntos donde se unen los enlaces, con cota de batea, altura hasta el brocal, profundidad opcional de escurrimiento en carga (presión) y área opcional de encharcamiento.
- **Emisarios (puntos de descarga)** — nodos de borde terminales con una condición de nivel de agua prescrita (libre, normal, fija, de marea o serie de tiempo) y compuerta de retención opcional.
- **Estanques de almacenamiento** — nodos con una relación superficie–versus–tirante y volumen de almacenamiento real; nunca se presurizan.
- **Divisores de flujo** — nodos que dividen el ingreso entre un enlace de continuación y un enlace de desvío (de corte, de rebalse, tabular o de vertedero; activos bajo onda cinemática, tratados como cámaras de unión bajo onda dinámica).

Los **enlaces** conectan nodos. Los tipos de enlace son:

- **Conductos** — tuberías y canales abiertos de sección transversal arbitraria, descritos por la ecuación de Manning y un conjunto de tablas de geometría de sección transversal.
- **Bombas** — gobernadas por curvas características (cinco tipos de curva o un modelo de bomba ideal) con histéresis de arranque/parada según el tirante.
- **Orificios** — aberturas de fondo o laterales con comportamiento de descarga tipo vertedero/orificio.
- **Vertederos** — transversales, laterales, de escotadura en V o trapezoidales, con transición opcional a escurrimiento por orificio bajo sumersión.
- **Descargas (outlets)** — curvas de gasto en función de la carga o del tirante (tabulares o funcionales).

### Variables de estado y unidades internas

En el tránsito de caudales las variables de estado fundamentales son exactamente tres (Tabla 2):

| Símbolo | Descripción |
|---|---|
| $H$ | Carga hidráulica del agua en un nodo |
| $Q$ | Caudal en un enlace |
| $A$ | Área hidráulica en un enlace (inferida de $Q$ y de la geometría) |

Todas las demás magnitudes se derivan de estas tres variables, de las entradas externas y de los parámetros fijos. Internamente el motor realiza todos los cálculos en **pies** (longitud), **segundos** (tiempo), **cfs** (caudal), **ft²** (área) y **ft³** (volumen). Los valores de entrada del proyecto en unidades SI (métricas) o US se convierten a estas unidades internas al momento de la lectura; los factores de conversión son

$$
\begin{aligned}
  \mathrm{Ucf}[\mathrm{LENGTH}] &=
    \begin{cases} 1.0 & \text{(US)} \\ 0.3048 & \text{(SI)} \end{cases}, \\
  \mathrm{Ucf}[\mathrm{VOLUME}] &=
    \begin{cases} 1.0 & \text{(US)} \\ 0.02832 & \text{(SI)} \end{cases},
\end{aligned}
$$

(obsérvese que el factor SI de volumen es el valor *truncado* del motor legado, no $0.3048^3$, conservado deliberadamente para mantener la paridad de punto flotante con el motor SWMM legado). La conversión de caudal usa $\mathrm{Qcf} = \{1.0,\ 448.831,\ 0.64632,\ 0.02832,\ 28.317,\ 2.4466\}$ para cfs/gpm/MGD/cms/LPS/MLD.

### Las cuatro formulaciones de tránsito

El motor selecciona el método de tránsito de caudales con la opción `FLOW_ROUTING`. La Tabla 3 resume los cuatro métodos.

| Método | Ecuaciones de gobierno | Características |
|---|---|---|
| Permanente | continuidad + tirante normal de Manning | pasante, sin almacenamiento/remanso |
| Onda cinemática | continuidad + curva de gasto de escurrimiento uniforme | sin remanso, inversión ni presión |
| Onda dinámica (defecto) | St. Venant completo | remanso, pérdidas, inversión, presión |
| Volúmenes finitos (explícito) | St. Venant, Godunov/HLLC | flujo transcrítico, seco/húmedo nativo |

La onda dinámica es la opción por defecto y aquí se trata con mayor profundidad. Cada método de tránsito se invoca desde un orquestador común `Router`.
