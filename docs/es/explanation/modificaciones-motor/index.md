# Modificaciones del motor

Las modificaciones que LocalSWMM hace al motor HydroCouple OpenSWMM: nuevas formulaciones, nuevas opciones y cambios en los valores por defecto.

1. [Introducción y reescritura](01-introduccion-y-reescritura) — contexto y la reescritura arquitectónica como base.
2. [Continuidad de nodo semi-implícita](02-continuidad-de-nodo-semi-implicita) — la formulación `NODE_CONTINUITY`.
3. [Aceleración de Anderson](03-aceleracion-de-anderson) — aceleración del ciclo de Picard (`ANDERSON_ACCEL`).
4. [Ranura de Preissmann dinámica](04-ranura-de-preissmann-dinamica) — ranura dinámica vs estática.
5. [Uniones virtuales](05-uniones-virtuales) — la opción `[VIRTUAL_JUNCTIONS]`.
6. [Tránsito por volúmenes finitos](06-transito-por-volumenes-finitos) — FV 1D explícito (`FLOW_ROUTING FV`).
7. [Módulo 2D y acoplamiento](07-modulo-2d-y-acoplamiento) — el módulo 2D y el acoplamiento 1D–2D.
8. [RDII decay](08-rdii-decay) — la opción `[RDII_DECAY]`.
9. [Cambios de comportamiento](09-cambios-de-comportamiento) — nuevos valores por defecto y cambios de plataforma.

Las opciones nuevas del motor están resumidas en la [referencia de opciones del motor](../../reference/01-opciones-del-motor).
