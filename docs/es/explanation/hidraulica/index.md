# Hidráulica 1D

La descripción a nivel de ecuaciones del proceso de cálculo hidráulico 1D del motor de LocalSWMM, transcrita desde el código fuente del motor. Léelos en orden; los artículos posteriores se construyen sobre los anteriores.

1. [Modelo conceptual](01-modelo-conceptual) — alcance, modelo conceptual de nodos y enlaces, variables de estado, las cuatro formulaciones de tránsito.
2. [Componentes del modelo](02-componentes-del-modelo) — datos de nodos, datos de enlaces, pendiente y longitud, alargamiento de conductos.
3. [Orquestación de la simulación](03-orquestacion-de-la-simulacion) — el ciclo de avance temporal, relojes de escorrentía y tránsito, aportes laterales.
4. [Geometría de secciones](04-geometria-de-secciones) — las cuatro relaciones geométricas, Manning y el factor de sección.
5. [Formulaciones de tránsito](05-formulaciones-de-transito) — flujo permanente y onda cinemática.
6. [Solver de onda dinámica](06-solver-de-onda-dinamica) — ecuaciones de St. Venant, diferencias finitas, la iteración de Picard.
7. [Kernel de momentum de enlaces](07-kernel-de-momentum-de-enlaces) — velocidad, número de Froude, los seis términos de momentum, limitación de flujo.
8. [Continuidad de nodo](08-continuidad-de-nodo) — actualizaciones explícita y semi-implícita, inundación y encharcamiento.
9. [Métodos de sobrenivel](09-metodos-de-sobrenivel) — EXTRAN y ranura de Preissmann estática/dinámica.
10. [Estructuras y condiciones de borde](10-estructuras-y-condiciones-de-borde) — bombas, orificios, vertederos, descargas, emisarios, divisores.
11. [Estabilidad y paso de tiempo](11-estabilidad-y-paso-de-tiempo) — condición de Courant, balance de masa.
12. [Opciones y valores por defecto](12-opciones-y-valores-por-defecto) — la superficie de configuración del motor.

La fuente LaTeX original es [1d_hidraulica.tex](../../../sources/1d_hidraulica.tex). El espejo en inglés está en [1D Hydraulics](/explanation/hydraulics/).
