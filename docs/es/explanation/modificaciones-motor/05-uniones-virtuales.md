<!-- Parte de la serie de explicación de modificaciones del motor -->

# Uniones virtuales (`[VIRTUAL_JUNCTIONS]`)

## Motivación

Un cambio de pendiente en un conducto debe dividirse en una cámara de unión.
Pero una cámara de unión ordinaria introduce dos artefactos numéricos:

1. **Almacenamiento artificial**: su área superficial se pisa con el
   mínimo $A_{\min} = 12.566\ \mathrm{ft^2}$, lo que agrega un volumen de
   estancamiento que "emborrona" los transitorios;
2. **Ruptura de momentum**: el nodo actúa como un pequeño volumen de
   estancamiento que interrumpe la transmisión de momentum entre los dos
   conductos.

Una **unión virtual** (`[VIRTUAL_JUNCTIONS]`, sección con nombre y
cota de batea; todo lo demás se deriva) elimina ambos artefactos para dos
conductos colineales de sección idéntica que se encuentran en un quiebre de
pendiente. Se declara un nodo sellado de almacenamiento idénticamente nulo. Las
reglas de elegibilidad se verifican en la lectura: exactamente dos enlaces,
ambos conductos; secciones transversales idénticas (forma, dimensiones,
referencia de curva, número de barriles; la rugosidad de Manning puede
diferir); ambos desfases en el nodo nulos con batea continua; sin aportes
laterales de ningún tipo; y método de tránsito de onda dinámica. Cualquier
violación es un error de entrada.

## Tratamiento de continuidad

Una unión virtual es un nodo sellado de almacenamiento cero. Su carga se
actualiza con la fórmula de superficie libre usando el área superficial natural
de medio enlace aportada por sus dos conductos, *sin* el piso de área
mínima (ese piso es precisamente el almacenamiento artificial que la
funcionalidad elimina). Cuando el área natural se anula (par seco, o par en
carga con ancho de ranura pequeño), la actualización cae a una forma pura de
balance de caudales de la actualización en carga con $\alpha = 1$ y sin piso.
En la convergencia, $\sum Q = 0$ en el nodo. El nodo está sellado: su carga
puede subir sobre la clave sin límite (como una cámara con tapa empernada),
nunca se anega ni se encharca, y su volumen y rebalse son idénticamente cero.

## Tratamiento de momentum

Para un par de paso (un conducto entrando, otro saliendo), el conducto aguas
abajo toma como estado aguas arriba los valores medios del conducto aguas
arriba en su ponderación por Froude (mecanismo de *upwinding* a través
del nodo), transportando el momentum advectado a través del nodo en lugar de
reiniciarlo. Con `VIRTUAL_JUNCTION_MOMENTUM FULL` (por defecto
`BASIC`) se agrega además una corrección convectiva al término de
inercia de ambos conductos:

$$\Delta Q_j = \Delta t\,\sigma_j\,
    \frac{\left(\bar U^{2}\bar A\right)_{\mathrm{ab}} -
          \left(\bar U^{2}\bar A\right)_{\mathrm{ar}}}{\Lambda},
  \qquad \Lambda = \frac{L_{\mathrm{ar}} + L_{\mathrm{ab}}}{2},$$

con $\sigma_j$ un factor de amortiguación de la forma de Froude; la corrección
se anula cuando los dos conductos no transportan caudal en el mismo sentido a
través del nodo. Los pares en silla (ambos conductos hacia el nodo) o en cresta
(ambos desde el nodo) reciben el tratamiento de continuidad de almacenamiento
cero pero no el acoplamiento direccional de momentum. La pareja siempre se
resuelve junta (no se congela por el bypass de convergencia) y se agrega una
verificación de Courant a nivel de par.

La guía de uso: las uniones virtuales están pensadas para quiebres de
pendiente de pequeña deflexión; los cambios de alineación horizontal deben
seguir siendo cámaras de unión ordinarias con coeficientes de pérdida.
