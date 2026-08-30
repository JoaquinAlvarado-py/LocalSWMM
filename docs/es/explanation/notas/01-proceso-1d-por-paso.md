# Cómo el motor 1D calcula un paso de tiempo

Diagrama de proceso del motor de onda dinámica 1D: la hidrología de escorrentía alimenta los aportes laterales, luego una iteración de Picard alterna el momentum de los enlaces y la continuidad de los nodos hasta que las cargas convergen, antes de escribir las instantáneas de salida.

```
  PASO 1..8  DT · ESCORRENTÍA · INGRESO · GEOMETRÍA · MOMENTUM · TIRANTES · ¿CONVERGE? · INSTANTÁNEA

      VÍAS:  MOTOR │ ESCORRENTÍA │ ROUTER │ ONDA DINÁMICA

  ┌───────────────────────────────┐
  │ [1] DT · [ENG]                │
  │ Calcular dt                   │
  │ reloj → dt                    │
  │ TimestepController            │
  └──────────────┬────────────────┘
                 │
  ┌──────────────▼────────────────┐
  │ [2] ESCORRENTÍA · [HYD]       │
  │ Escorrentía + Infil           │
  │ lluvia → escorrentía          │
  │ RunoffSolver                  │
  └──────────────┬────────────────┘
                 │
  ┌──────────────▼────────────────┐
  │ [3] INGRESO · [ENG]           │
  │ Ensamblar ingreso             │
  │ escorrentía → lat_flow        │
  │ inflow.computeAll             │
  └──────────────┬────────────────┘
                 │
  ┌──────────────▼────────────────┐
  │ [4] GEOMETRÍA · [RTE]         │
  │ Geometría de enlace           │
  │ h → tirante · área            │
  │ XSectBatch                    │
  └──────────────┬────────────────┘
                 │
  ┌──────────────▼────────────────┐
  │ [5] MOMENTUM · [DYN]          │
  │ Momentum de enlace            │
  │ h → q · v                     │
  │ processManningLink            │
  └──────────────┬────────────────┘
                 │
  ┌──────────────▼────────────────┐
  │ [6] TIRANTES · [DYN]          │
  │ Tirantes de nodo              │
  │ q → h · vol                   │
  │ setNodeDepth                  │
  └──────────────┬────────────────┘
                 │
  ┌──────────────▼────────────────┐
  │ [7] CONVERGE? · [DYN]  ★      │
  │ $\Delta h \le 0.005$ ft       │
  │ máx. 8 intentos               │
  └───────┬──────────────┬────────┘
     no / REINTENTO      │ yes
     │                   │
     ▼                   │
  (vuelta a [5]          │
  Momentum de enlace)    │
                         ▼
  ┌────────────────────────────────┐
  │ [8] INSTANTÁNEA · [ENG]        │
  │ Instantánea                    │
  │ state → .out · .rpt            │
  │ postOutputSnapshot             │
  └────────────────────────────────┘
```

Leyenda de flujo:

- ★ Entrega crítica (test de convergencia → instantánea; la salida "sí")
- Entrega secuencial (flechas simples entre pasos consecutivos)
- Bucle de reintento (flecha discontinua del paso 7 de vuelta al paso 5, etiquetada REINTENTO)

Original: [1d-engine-process.html](../../../sources/1d-engine-process.html)
