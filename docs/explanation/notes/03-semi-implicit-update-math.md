# Why the semi-implicit update is one equation

Five-step derivation of the unified node depth update, from the continuity equation through trapezoidal integration and linearization of the outflow term to the closed-form solve.

```
  ┌───────────────────────────────┐
  │ 1 · Continuity                │
  │ $A \cdot dH/dt = Q_{net}(H)$  │
  │ storage = net inflow          │
  └──────────────┬────────────────┘
                 │
  ┌──────────────▼────────────────┐
  │ 2 · Trapezoid rule            │
  │ $A \cdot dH = 0.5 \cdot (Q_{old} + Q_{new}) \cdot dt$ │
  │ integrate over dt             │
  └──────────────┬────────────────┘
                 │
  ┌──────────────▼────────────────┐
  │ 3 · Linearize outflow         │
  │ $Q_{new} \approx Q_{net} - \Sigma dqdh \cdot dH$  │
  │ $\partial Q_{net}/\partial H = -\Sigma dqdh$     │
  └──────────────┬────────────────┘
                 │
  ┌──────────────▼────────────────┐
  │ 4 · Substitute                │
  │ $(A + 0.5 \cdot \Sigma dqdh \cdot dt) \cdot dH = dV$ │
  │ $dV = 0.5 \cdot (Q_{old} + Q_{net}) \cdot dt$       │
  └──────────────┬────────────────┘
                 │ ★ new method
  ┌──────────────▼────────────────┐
  │ 5 · Solve                     │
  │ $dH = \frac{dV}{A + 0.5 \cdot dt \cdot \Sigma dqdh}$ │
  │ one equation · every regime   │
  └───────────────────────────────┘
```

> $\Sigma dqdh$ is the equation's own damping — a rising head drains more, so the update shrinks.

> the trapezoid reuses the previous step's net inflow — $dV$ is Crank–Nicolson.

Legend:

- Rectangle: derivation step
- ★ Accent arrow: new method (the solve step)
- Dashed leader: editorial aside (the two callouts above)

Original: [1d-semi-implicit-math.html](../../sources/1d-semi-implicit-math.html)
