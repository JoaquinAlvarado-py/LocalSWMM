# Node continuity — two depth-update formulations

Flowchart of the dynamic-wave node depth update: both formulations share the trapezoidal volume change, then semi-implicit uses one unified equation while the explicit path branches into free-surface and surcharged updates, before under-relaxation and state commit.

```
         ╭─────────────────────────────────────╮
         │        Node continuity               │   start (oval)
         ╰──────────────────┬──────────────────╯
                            │
         ┌──────────────────▼──────────────────┐
         │ Mass balance                        │
         │ $dQ = Q_{in} - Q_{out}$             │
         │ $dV = 0.5 \cdot (Q_{old} + dQ) \cdot dt$   │
         └──────────────────┬──────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │     SEMI-IMPLICIT?        │   decision (diamond)
              └──────┬─────────────┬──────┘
             yes ★   │             │ no
                     │             │
                     │             ▼
   ┌─────────────────▼────────┐  ┌─────────────────────────┐
   │ Semi-implicit            │  │ EXTRAN SURCHARGED?      │  decision (diamond)
   │ ★ new method             │  └──────┬───────────┬──────┘
   │ $dy = dV / (A + 0.5 \cdot dt \cdot \Sigma dqdh)$ │  yes │        │ no
   │                          │         │           │
   └──────────┬──────────────┘         │           │
              │                        │           │
              │                        ▼           ▼
              │         ┌────────────────────┐  ┌─────────────┐
              │         │ EXTRAN dQ/dH       │  │ Free surface│
              │         │ $dy = corr \cdot dQ / denom$  │  │ $dy = dV / A$│
              │         │ crown blend        │  └──────┬──────┘
              │         │ exp(−15·f)         │         │
              │         └─────────┬──────────┘         │
              │                   │                    │
              ▼                   ▼                    ▼
   ┌──────────────────────────────────────────────────────┐
   │ Under-relax · pond floor                             │
   │ $y = (1-\omega) \cdot y_{last} + \omega \cdot y_{new}$      │
   │ ω = 0.5 · FUDGE = 0.0001                            │
   └──────────────────────────┬───────────────────────────┘
                              │
   ┌──────────────────────────▼───────────────────────────┐
   │ Commit state                                         │
   │ $overflow = dV/dt \cdot y_{max}$ cap                 │
   │ $head = invert + y \cdot dYdT$                       │
   └──────────────────────────────────────────────────────┘
```

Legend — shape carries type:

- Oval: start / end
- Rectangle: step
- Diamond: decision
- ★ Accent: new method (semi-implicit)
- Plain arrow: branch

Original: [1d-node-continuity.html](../../sources/1d-node-continuity.html)
