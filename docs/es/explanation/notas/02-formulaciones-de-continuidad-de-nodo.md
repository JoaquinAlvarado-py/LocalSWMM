# Continuidad de nodo — dos formulaciones de actualización de tirantes

Flujograma de la actualización de tirantes de nodo de la onda dinámica: ambas formulaciones comparten el cambio de volumen trapezoidal, luego la semi-implícita usa una única ecuación unificada mientras que la vía explícita se bifurca en actualizaciones de superficie libre y en carga, antes de la subrelajación y la confirmación del estado.

```
         ╭─────────────────────────────────────╮
         │        Continuidad de nodo           │   inicio (óvalo)
         ╰──────────────────┬──────────────────╯
                            │
         ┌──────────────────▼──────────────────┐
         │ Balance de masa                     │
         │ $dQ = Q_{in} - Q_{out}$             │
         │ $dV = 0.5 \cdot (Q_{old} + dQ) \cdot dt$   │
         └──────────────────┬──────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │     ¿SEMI-IMPLÍCITO?      │   decisión (rombo)  
              └──────┬─────────────┬──────┘
             sí  ★   │             │ no
                     │             │
                     │             ▼
   ┌─────────────────▼────────┐  ┌─────────────────────────┐
   │ Semi-implícito           │  │ ¿EXTRAN EN CARGA?       │  decisión (rombo)  
   │ ★ método nuevo           │  └──────┬───────────┬──────┘
   │ $dy = dV / (A + 0.5 \cdot dt \cdot \Sigma dqdh)$ │  yes │        │ no
   │                          │         │           │
   └──────────┬──────────────┘         │           │
              │                        │           │
              │                        ▼           ▼
              │         ┌────────────────────┐  ┌─────────────┐
              │         │ EXTRAN dQ/dH       │  │ Free surface│
              │         │ $dy = corr \cdot dQ / denom$  │  │ $dy = dV / A$│
              │         │ mezcla de clave    │  └──────┬──────┘
              │         │ exp(−15·f)         │         │
              │         └─────────┬──────────┘         │
              │                   │                    │
              ▼                   ▼                    ▼
   ┌──────────────────────────────────────────────────────┐
   │ Subrelajación · piso de encharcamiento               │
   │ $y = (1-\omega) \cdot y_{last} + \omega \cdot y_{new}$      │
   │ ω = 0.5 · FUDGE = 0.0001                            │
   └──────────────────────────┬───────────────────────────┘
                              │
   ┌──────────────────────────▼───────────────────────────┐
   │ Confirmar estado                                     │
   │ $overflow = dV/dt \cdot y_{max}$ tope                │
   │ $head = invert + y \cdot dYdT$                       │
   └──────────────────────────────────────────────────────┘
```

Leyenda — la forma transmite el tipo:

- Óvalo: inicio / fin
- Rectángulo: paso
- Rombo: decisión
- ★ Énfasis: método nuevo (semi-implícito)
- Flecha simple: rama

Original: [1d-node-continuity.html](../../../sources/1d-node-continuity.html)
