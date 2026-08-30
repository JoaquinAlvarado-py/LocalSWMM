# Aceleración de Anderson: mezclar dos iterados

Proceso de la aceleración de Anderson dentro de la iteración de Picard: residual por nodo, compuertas de seguridad, coeficiente de mezcla, mezcla, confirmación de estado y el test dual de convergencia, con el bucle de reintento de vuelta al solver.

```
  PASO 1..7  RESOLVER · RESIDUAL · COMPUERTAS · COEF · MEZCLA · ¿CONVERGE? · SIGUIENTE

      VÍAS:   PICARD │ ANDERSON

  ┌──────────────────────────────────┐
  │ [1] RESOLVER · [PIC]             │
  │ Solución de Picard               │
  │ $y_{last} \to g_k$               │
  │ momentum + continuidad           │
  └───────────────┬──────────────────┘
                  │
  ┌───────────────▼──────────────────┐
  │ [2] RESIDUAL · [AND]             │
  │ Residual                         │
  │ $r_k = g_k - y_{last}$           │
  │ retomar $r_{k-1}$ · $g_{prev}$   │
  └───────────────┬──────────────────┘
                  │
  ┌───────────────▼──────────────────┐
  │ [3] COMPUERTAS · [AND]           │
  │ $|r_k| \le 20 \cdot tol$         │
  │ step ≥ 1 · sin flag de salto     │
  └───────────────┬──────────────────┘
                  │
  ┌───────────────▼──────────────────┐
  │ [4] COEF · [AND]                 │
  │ $\alpha = r_k \cdot dr / dr^2$   │
  │ acotado a [0, 1]                 │
  └───────────────┬──────────────────┘
                  │
  ┌───────────────▼──────────────────┐
  │ [5] MEZCLA · [AND]               │
  │ $y = (1-\alpha) g_k + \alpha \cdot g_{prev}$  │
  │ y ≥ 0 · recalcular dV            │
  └───────────────┬──────────────────┘
                  │ ★
  ┌───────────────▼──────────────────┐
  │ [6] CONVERGE? · [PIC]  ★         │
  │ $|g_k - y_{last}| \le tol$       │
  │ y $|y - y_{last}| \le tol$       │
  └───────┬──────────────┬───────────┘
     no / REINTENTO ≤8   │ yes
     │                   │
     ▼                   │
  (vuelta a [1]          ▼
  Iterar Picard) ┌──────────────────────────────┐
                 │ [7] SIGUIENTE · [PIC]        │
                 │ Siguiente paso               │
                 │ salir del bucle de Picard    │
                 │ reporte · instantánea        │
                 └──────────────────────────────┘
```

> AA se omite en cada quiebre de rama: en carga, encharcamiento, ranura, vertedero, orificio, bomba

Leyenda de flujo:

- ★ Entrega crítica (mezcla → test de convergencia, y test de convergencia → siguiente paso)
- Entrega secuencial (flechas simples entre pasos consecutivos)
- Bucle de reintento (flecha discontinua del paso 6 de vuelta al paso 1, etiquetada REINTENTO ≤8)

Original: [1d-anderson-accel.html](../../../sources/1d-anderson-accel.html)
