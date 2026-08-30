# Por qué la actualización semi-implícita es una sola ecuación

Derivación en cinco pasos de la actualización unificada de tirantes de nodo, desde la ecuación de continuidad pasando por la integración trapezoidal y la linealización del término de salida hasta la resolución en forma cerrada.

```
  ┌───────────────────────────────┐
  │ 1 · Continuidad               │
  │ $A \cdot dH/dt = Q_{net}(H)$  │
  │ almacenamiento = ingreso neto │
  └──────────────┬────────────────┘
                 │
  ┌──────────────▼────────────────┐
  │ 2 · Regla del trapecio        │
  │ $A \cdot dH = 0.5 \cdot (Q_{old} + Q_{new}) \cdot dt$ │
  │ integrar sobre dt             │
  └──────────────┬────────────────┘
                 │
  ┌──────────────▼────────────────┐
  │ 3 · Linealizar salida         │
  │ $Q_{new} \approx Q_{net} - \Sigma dqdh \cdot dH$  │
  │ $\partial Q_{net}/\partial H = -\Sigma dqdh$     │
  └──────────────┬────────────────┘
                 │
  ┌──────────────▼────────────────┐
  │ 4 · Sustituir                 │
  │ $(A + 0.5 \cdot \Sigma dqdh \cdot dt) \cdot dH = dV$ │
  │ $dV = 0.5 \cdot (Q_{old} + Q_{net}) \cdot dt$       │
  └──────────────┬────────────────┘
                 │ ★ método nuevo
  ┌──────────────▼────────────────┐
  │ 5 · Resolver                  │
  │ $dH = \frac{dV}{A + 0.5 \cdot dt \cdot \Sigma dqdh}$ │
  │ una ecuación · todo régimen   │
  └───────────────────────────────┘
```

> $\Sigma dqdh$ es el amortiguamiento propio de la ecuación — una carga en ascenso drena más, por lo que la actualización se encoge.

> el trapecio reutiliza el ingreso neto del paso anterior — $dV$ es Crank–Nicolson.

Leyenda:

- Rectángulo: paso de la derivación
- ★ Flecha de énfasis: método nuevo (el paso de resolución)
- Líder discontinuo: acotación editorial (las dos notas de arriba)

Original: [1d-semi-implicit-math.html](../../../sources/1d-semi-implicit-math.html)
