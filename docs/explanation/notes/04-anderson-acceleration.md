# Anderson acceleration: mixing two iterates

Process of Anderson acceleration inside the Picard iteration: per-node residual, safety gates, mixing coefficient, blend, state commit, and the dual convergence test, with the retry loop back to the solver.

```
  STEP 1..7  SOLVE · RESIDUAL · GATES · COEFF · BLEND · CONVERGE? · NEXT

      LANES:  PICARD │ ANDERSON

  ┌──────────────────────────────────┐
  │ [1] SOLVE · [PIC]                │
  │ Picard solve                     │
  │ $y_{last} \to g_k$               │
  │ momentum + continuity            │
  └───────────────┬──────────────────┘
                  │
  ┌───────────────▼──────────────────┐
  │ [2] RESIDUAL · [AND]             │
  │ Residual                         │
  │ $r_k = g_k - y_{last}$           │
  │ recall $r_{k-1}$ · $g_{prev}$    │
  └───────────────┬──────────────────┘
                  │
  ┌───────────────▼──────────────────┐
  │ [3] GATES · [AND]                │
  │ $|r_k| \le 20 \cdot tol$         │
  │ step ≥ 1 · no skip flag          │
  └───────────────┬──────────────────┘
                  │
  ┌───────────────▼──────────────────┐
  │ [4] COEFF · [AND]                │
  │ $\alpha = r_k \cdot dr / dr^2$   │
  │ clamped to [0, 1]                │
  └───────────────┬──────────────────┘
                  │
  ┌───────────────▼──────────────────┐
  │ [5] BLEND · [AND]                │
  │ $y = (1-\alpha) g_k + \alpha \cdot g_{prev}$  │
  │ y ≥ 0 · recompute dV             │
  └───────────────┬──────────────────┘
                  │ ★
  ┌───────────────▼──────────────────┐
  │ [6] CONVERGE? · [PIC]  ★         │
  │ $|g_k - y_{last}| \le tol$       │
  │ and $|y - y_{last}| \le tol$     │
  └───────┬──────────────┬───────────┘
     no / RETRY ≤8       │ yes
     │                   │
     ▼                   │
  (back to [1]           ▼
  Picard solve)  ┌──────────────────────────────┐
                 │ [7] NEXT · [PIC]             │
                 │ Next timestep                │
                 │ exit Picard loop             │
                 │ report · snapshot            │
                 └──────────────────────────────┘
```

> AA is skipped at every branch kink: surcharge, pond, slot, weir, orifice, pump

Flow legend:

- ★ Critical handoff (blend → convergence test, and convergence test → next timestep)
- Sequential handoff (plain arrows between consecutive steps)
- Retry loop (dashed arrow from step 6 back to step 1, labeled RETRY ≤8)

Original: [1d-anderson-accel.html](../../sources/1d-anderson-accel.html)
