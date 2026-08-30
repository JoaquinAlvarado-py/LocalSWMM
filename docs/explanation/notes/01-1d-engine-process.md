# How the 1D engine computes one timestep

Process diagram of the 1D dynamic-wave engine: runoff hydrology feeds lateral inflows, then a Picard iteration alternates link momentum and node continuity until heads converge, before output snapshots are written.

```
  STEP 1..8  DT · RUNOFF · INFLOW · GEOMETRY · MOMENTUM · DEPTHS · CONVERGE? · SNAPSHOT

      LANES:  ENGINE │ RUNOFF │ ROUTER │ DYN WAVE

  ┌───────────────────────────────┐
  │ [1] DT · [ENG]                │
  │ Compute dt                    │
  │ clock → dt                    │
  │ TimestepController            │
  └──────────────┬────────────────┘
                 │
  ┌──────────────▼────────────────┐
  │ [2] RUNOFF · [HYD]            │
  │ Runoff + Infil                │
  │ rain → runoff                 │
  │ RunoffSolver                  │
  └──────────────┬────────────────┘
                 │
  ┌──────────────▼────────────────┐
  │ [3] INFLOW · [ENG]            │
  │ Assemble Inflow               │
  │ runoff → lat_flow             │
  │ inflow.computeAll             │
  └──────────────┬────────────────┘
                 │
  ┌──────────────▼────────────────┐
  │ [4] GEOMETRY · [RTE]          │
  │ Link Geometry                 │
  │ h → depth · area              │
  │ XSectBatch                    │
  └──────────────┬────────────────┘
                 │
  ┌──────────────▼────────────────┐
  │ [5] MOMENTUM · [DYN]          │
  │ Link Momentum                 │
  │ h → q · v                     │
  │ processManningLink            │
  └──────────────┬────────────────┘
                 │
  ┌──────────────▼────────────────┐
  │ [6] DEPTHS · [DYN]            │
  │ Node Depths                   │
  │ q → h · vol                   │
  │ setNodeDepth                  │
  └──────────────┬────────────────┘
                 │
  ┌──────────────▼────────────────┐
  │ [7] CONVERGE? · [DYN]  ★      │
  │ $\Delta h \le 0.005$ ft       │
  │ max 8 trials                  │
  └───────┬──────────────┬────────┘
     no / RETRY          │ yes
     │                   │
     ▼                   │
  (back to [5]           │
  Link Momentum)         │
                         ▼
  ┌────────────────────────────────┐
  │ [8] SNAPSHOT · [ENG]           │
  │ Snapshot                       │
  │ state → .out · .rpt            │
  │ postOutputSnapshot             │
  └────────────────────────────────┘
```

Flow legend:

- ★ Critical handoff (convergence test → snapshot; the "yes" exit)
- Sequential handoff (plain arrows between consecutive steps)
- Retry loop (dashed arrow from step 7 back to step 5, labeled RETRY)

Original: [1d-engine-process.html](../../sources/1d-engine-process.html)
