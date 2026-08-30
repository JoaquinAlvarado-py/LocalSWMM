<!-- Parte de la serie de explicación de modificaciones del motor -->

# Opciones nuevas del motor

La siguiente tabla resume las opciones y secciones que HydroCouple agrega
sobre el SWMM oficial.

| Opción / sección | Qué agrega | Valor por defecto |
|---|---|---|
| `NODE_CONTINUITY` | continuidad de nodo unificada semi-implícita | EXPLICIT (legado) |
| `ANDERSON_ACCEL` | aceleración de Anderson del ciclo de Picard | NO |
| `SURCHARGE_METHOD` | tercer método de carga: DYNAMIC_SLOT | EXTRAN (legado) |
| `DPS_CELERITY` / `DPS_ALPHA` / `DPS_DECAY_TIME` | parámetros de la ranura dinámica | 25 m/s, 3, 0.5 s |
| `[VIRTUAL_JUNCTIONS]` | nodos sellados de almacenamiento cero con transmisión de momentum | --- |
| `VIRTUAL_JUNCTION_MOMENTUM` | corrección convectiva a través de la unión virtual | BASIC |
| `FLOW_ROUTING FV` | solver 1D explícito de volúmenes finitos | DYNWAVE (legado) |
| `FV_*` | opciones del solver FV (CFL, Riemann, orden, LTS, ...) | ver la [tabla de opciones del solver FV](../explanation/modificaciones-motor/06-transito-por-volumenes-finitos.md) |
| `[2D_VERTICES]`<br>`[2D_TRIANGLES]` | malla 2D de aguas someras local-inercial | --- |
| `[2D_OPTIONS]` | opciones del marchante 2D y del acople (`COUPLING_CD`, `COUPLING_SYNC`, ...) | COUPLING_CD 0.65 |
| `IGNORE_2D` | desactiva el solver 2D conservando la malla | NO |
| `[RDII_DECAY]` | recuperación exponencial de la abstracción del RDII con temperatura ($k_0$, $k_T$, $T_{\mathrm{ref}}$) | --- |
| `THREADS` | hilos OpenMP bit-exactos del solver | 1 |
| `CRS` | sistema de referencia espacial (EPSG/PROJ) | vacío |
| `SKIP_STEADY_STATE` | omite el tránsito en régimen permanente | NO |

*Tabla: Opciones y secciones nuevas del motor OpenSWMM respecto del SWMM
oficial de la US EPA.*
