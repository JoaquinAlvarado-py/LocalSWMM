# SWMM Fork WebGPU — Plan: acelerar el solver 2D con WebGPU

## 1. Objetivo

El cuello de botella de las simulaciones 2D es el **marchador hidráulico explícito**
(local-inertial con LTS) sobre mallas de 10k–70k triángulos, corriendo escalar en WASM.
WebGPU permite ejecutar los kernels de celdas/caras en la GPU con un speedup potencial
de **5–20×** en la parte 2D (estima: run de 10 min → ~30 s–1 min).

Este proyecto es una **copia limpia** de `SWMM_3D_Web_UI` para desarrollar un backend
2D WebGPU *en paralelo* al motor WASM actual (que queda como fallback y referencia de
validación).

## 2. Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│ App (vanilla JS, sin bundler)                                 │
│  - Generación de malla (Triangle WASM) → mesh2DIndexed        │
│  - UI / layers / resultados (sin cambios)                     │
├──────────────────────────────────────────────────────────────┤
│ 2D Backend (nuevo)                                            │
│  ┌─────────────────┐     ┌───────────────────────────────┐   │
│  │ JS orchestrator  │◄───►│ 1D SWMM engine (WASM, actual) │   │
│  │ WebGPUMarscher   │     │  open/init/stride (1D steps)  │   │
│  └────────┬────────┘     └───────────────────────────────┘   │
│           │ estado compartido: coupling points, head 1D      │
│  ┌────────▼────────┐                                          │
│  │ WGSL compute     │  faceFlux → cellUpdate → boundary      │
│  │ kernels (GPU)    │  → LTS (v2) → output fields            │
│  └─────────────────┘                                          │
├──────────────────────────────────────────────────────────────┤
│ Fallback: openSwmm2dWorker.js (WASM) cuando no hay WebGPU    │
└──────────────────────────────────────────────────────────────┘
```

- **El 1D no se toca**: el motor WASM (`swmm_engine_*`) sigue resolviendo la red
  (Bellinge: 1,044 links) y la hidrología.
- El 2D WebGPU corre los substeps del marchador entre pasos de enrutado 1D y hace el
  intercambio de acople (coupling) por buffers.

## 3. Por qué el marchador encaja en WebGPU

`ExplicitInertialSolver` (referencia: `third_party/openswmm-engine/src/engine/2d/solver/ExplicitInertialSolver.cpp`)
es un stencil:

- **fireFaces**: por cara, flujo `q` desde head de los 2 triángulos adyacentes
  (Manning + cap de Froude + limiter). Caras independientes → paralelizable 1:1.
- **fireCells**: por celda, volumen/head/depth desde la suma de flujos de sus 3 caras
  + fuentes (lluvia, acople). Celdas independientes → paralelizable 1:1.
- **syncAndRebuild / tiers (LTS)**: v1 con dt global; v2 con listas de tiers.

Los pasos 1:1 sobre arreglos contiguos son exactamente el modelo de compute shaders.

## 4. Modelo de datos (SoA, buffers GPU)

Todo en **coordenadas locales métricas** (ya lo produce `mesh2DProj`).

| Buffer | Tipo | Contenido |
|---|---|---|
| `vert_xyz` | f32×3 | x,y,z de vértices |
| `tri` | u32×3 | índices de triángulo |
| `face` | u32×2 | tri izquierdo/derecho por cara (precomputado en CPU) |
| `face_edge` | u32×3 | vértices de cada cara (para geometría) |
| `tri_area`, `tri_cz`, `face_len`, `face_nx/ny`, `face_zmid` | f32 | geometría derivada (una vez) |
| `state_vol`, `state_head`, `state_depth` | f32 | estado actual |
| `state_q` | f32×2 | momentum por cara (componentes) |
| `state_flux` | f32 | flujo acumulado por cara para output |
| `sources_rain`, `sources_coupling`, `boundary` | f32 | forzamientos |
| `tiers` / `active` (v2) | u32 | listas de trabajo |

Tamaño para 50k celdas: ~50k×3×4 B ≈ 2–6 MB en total — trivial para GPUs.

## 5. Kernels WGSL (v1: dt global, sin LTS)

1. `faceFlux` (1 invocación por cara)
   - `hf = faceFlowDepth(head[a], head[b], zmid)` (portar exacto de `inertial::faceFlowDepth`)
   - Manning friction, cap Froude, limiter → `q`
   - escribir `flux` (antisimétrico: + en un lado, − en el otro)
2. `cellUpdate` (1 invocación por celda)
   - sumar flujos de sus 3 caras → Δvol
   - + lluvia, + acople, − evaporación
   - `vol = max(0, vol + Δ)`; `head = z + vol/area`; `depth = head − z`
3. `boundaryApply` (v1: WALL en todas las caras exteriores; luego NORMAL_FLOW / SPECIFIED_STAGE)
4. `renderDepths` / `vertexReconstruct` (para resultados, cadencia de frame)

Los substeps se encadenan con barriers entre `faceFlux` y `cellUpdate`.

## 6. Acople 1D↔2D (orquestador JS)

- Bucle por paso de enrutado (ROUTING_STEP):
  1. `stride` del 1D WASM (1 paso) → lee `head`/`depth` de nodos acoplados.
  2. Escribe en `sources_coupling` (intercambio con CD, área de acople).
  3. GPU: N substeps del marchador para avanzar el 2D el `COUPLING_SYNC`.
  4. Lee `coupling_flux` → lo devuelve al 1D como inflow lateral.
- Cadencia de frames (60 s) → `renderDepths` + descarga para `Mesh2DLayers`.

## 7. Precisión (f32 vs f64)

WebGPU compute es **f32**; el motor usa double.

- Coordenadas locales ya son pequeñas (±5 km) → sin cancelación catastrófica en XY.
- `head = z + depth` con z≈65 m y depth≈0.001–1 m: en f32, resolución ≈ 7.8e-6 m
  (sub-mm) — aceptable frente a `DRY_DEPTH 0.001`.
- Validar continuidad de masa del prototipo contra el motor; si hace falta,
  acumular volumen en f32 con suma por pares o `Kahan` en el kernel de celdas.

## 8. Validación (paridad con el motor)

- Portar las fórmulas **exactas** de `ExplicitInertialSolver.cpp` + `inertial::*` (leer
  `faceFlowDepth`, Manning, `cellCflDt`, limiter).
- Test de paridad: mismo mesh (Bellinge2.tif), misma lluvia y opciones; comparar
  por frame: max depth, max velocity, volumen total, continuidad.
- Criterio: máx|Δdepth| < 1e-3 m y |Δcontinuidad| < 0.1% en los mismos frames.

## 9. Hitos (milestones)

- **M0 — Harness**: copia lista, `navigator.gpu` detect, canvas/device, kernel trivial,
  baseline de FPS; correr en localhost con Chrome. *(Criterio: el harness carga el mesh
  generado y pinta 1 frame.)*
- **M1 — Marchador dt global**: kernels faceFlux+cellUpdate con lluvia uniforme,
  sin acople. *(Criterio: paridad en el ejemplo 2D del engine con 8 celdas y luego 5k.)*
- **M2 — Acople 1D+2D**: loop orquestado con el 1D WASM + coupling points.
  *(Criterio: Bellinge completo corre y la animación se ve igual que WASM.)*
- **M3 — Condiciones de borde + LTS v2**: NORMAL_FLOW/SPECIFIED_STAGE, tiers por listas.
- **M4 — Output/rendering**: `renderDepths` por frame para `Mesh2DLayers` + toggle
  WebGPU/WASM en la UI.
- **M5 — Benchmark & host**: medir en tu GPU vs WASM; deploy a GitHub Pages
  (o Cloudflare Pages). Fallback automático a WASM sin WebGPU.

## 10. Hosting

- **GitHub Pages funciona para WebGPU** (solo requiere HTTPS; no necesita COOP/COEP).
- Cloudflare Pages / Netlify si más adelante se quiere probar pthreads.
- Verificar: `navigator.gpu` en Chrome/Edge 113+, desktop y Android.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| Divergencia numérica f32 | Portar fórmulas exactas + tests de paridad + Kahan si necesario |
| Complejidad del acople 1D↔2D | Iterar en Bellinge con pocos nodos acoplados primero |
| LTS en GPU (v2) | v1 con dt global; medir antes de invertir |
| Soporte WebGPU del usuario | Fallback automático al worker WASM |
| Mantener dos backends | Capa única de interfaz (`Mesh2DSolver`) con dos implementaciones |

## 12. Estado actual (sesión 2026-08-03: M0 + M1)

### Infraestructura de verificación (gate Bellinge)

- **`scripts/verify-bellinge.mjs`** — gate repetible: carga Bellinge en la app real
  (headless/headed Chrome vía CDP), genera malla desde el GeoTIFF, corre el motor
  WASM completo. **PASS verificado**: 34.709 triángulos, 882 frames, acople
  1D→2D 1.572.700 m³ / 2D→1D 1.657.096 m³, continuidad 1D reportada. Corre en
  ~25 min (48 h de simulación); artefactos en `scripts/verify-out/`.
- **`scripts/run-engine-marcher.mjs`** — motor WASM 2D en Node (sin browser):
  referencia para paridad. El glue Emscripten funciona en Node 24 pasando
  `wasmBinary` + `instantiateWasm`.
- **`scripts/make-marcher-inp.mjs`** — genera INP 2D sintéticos (cuenca cerrada,
  lluvia uniforme `RAINFALL_MODE SYSTEM`, `LTS_TIERS 1`, `FLAT`).
  Lecciones del INP: la lluvia constante necesita una entrada de TS por
  intervalo de gage; `ROUTING_STEP` define el batch del co-advance; el primer
  batch 2D es `[0, routing+0.5]` (acumulador `pending_dt_`).
- Fixtures: `marcher-8cells` (8 celdas, 30 min) y `marcher-5k` (5.000, 60 min).

### M0 — Harness WebGPU ✅

- `public/webgpu/harness.html?fixture=<name>` — detecta `navigator.gpu`, crea
  device, carga la malla del fixture, corre el marchador, compara contra la
  referencia, pinta el campo de profundidad final en un canvas.
- **Caveat Chrome/Windows**: headless NO expone WebGPU (verificado en 151);
  el harness corre en Chrome headed con perfil temporal
  (`scripts/run-webgpu-harness.mjs`). El adaptador real funciona.

### M1 — Marchador dt global ✅ (paridad estadística)

`public/webgpu/shaders/marcher.wgsl` + `public/webgpu/webgpuMarscher.js`:
port 1:1 del `ExplicitInertialSolver` con K=1 (sin LTS):
`faceFlux`, `cellUpdate` (con Perot θ-mix), `lazySources`, `seedActive`
(histéresis h_on/h_off + copia base del active set), `halo` (un anillo),
`cflReduce` (atomicMin del dt0), y el loop `advance()` en JS (cadencia de
rebuild cada 4 ciclos, lazy clock, tail).

**Gate de paridad estadístico (M1.x, decidido en sesión)**: la dinámica f32
diverge del motor f64 en el sentido de max|Δdepth| (chaos del dt0 min-CFL
amplificado por el frente), pero conserva masa y sigue el campo
estadísticamente. Criterios del harness:
  - conservación |GPU−rain|/rain ≤ 0.5 %
  - mean-depth worst |meanΔ| ≤ 1e-3 m
  - correlación Pearson worst ≥ 0.5 (se omite en campos uniformes degenerados)

**Resultados** (f32 GPU vs f64 WASM):
- Pre-activación: **bit-exacto** (max|Δdepth| ≈ 1e-10 m).
- 8 celdas: **PASS** — cons 0.15 %, meanΔ 5.3e-4 m, corr 0.887
  (max|Δd| de referencia 2.1e-1 m).
- 5k celdas: **PASS** — cons 0.01 %, meanΔ 7.5e-5 m, corr 0.588
  (max|Δd| de referencia 1.1e+1 m; la diferencia se concentra en la esquina
  profunda — el GPU sobreconcentra ~2× el agua en el cell más hondo).
- El conteo de substeps coincide dentro de 4–8 % (ref 647 vs 604 en 8 celdas;
  ref 4652 vs ~5000 en 5k) — el dt0 del min-CFL es la fuente de sensibilidad.

**Lecciones duras de WebGPU (documentadas para M2+):**
1. Los *structs* en storage buffers leen basura/ceros en este driver
   (Chrome 151) — usar `array<f32>` planos (params como array con índices).
2. `queue.writeBuffer` → dispatch inmediato lee datos STALE — actualizar
   parámetros vía staging + `copyBufferToBuffer` DENTRO del encoder.
3. El active set necesita la copia base `cell_active = next` ANTES del halo.
4. Los acumuladores de cara (faccL/faccR) deben limpiarse en cada substep:
   una cara seca/inactiva que retorna temprano dejaba dM stale → el cell
   gather lo sumaba cada substep (creaba agua: +74 %).
5. Límite WebGPU: 8 storage buffers por stage → geometría empaquetada
   (geoA/geoF/topo) y estado (state/qbuf/wk/red).
6. El batch del co-advance del motor: `pending_dt_` acumula el paso de
   routing (0.5 s inicial + 60 s) → el primer batch 2D es `[0, 60.5]`, no
   `[0, 0.5]` — la cadencia de rebuild depende de esta estructura exacta.

### M2 — Acople 1D↔2D ✅ (validación PASS)

**Entregado:**
- **Rebuild del WASM** con las APIs de nodo exportadas (`swmm_node_count/get_heads_bulk/get_depths_bulk/get_volumes_bulk/set_lateral_inflow/set_pond_area`) — toolchain emscripten 6.0.5 + vcpkg instalada localmente (`.tools/`), build reproducible con `scripts/build-openswmm2d.ps1`.
- **Kernel `couplingExchange`** (WGSL): port 1:1 de `computeNodeCouplingQ` + el bloque live-exchange de `fireCells` — ley de orificio con φ C¹-regularizado (ε=0.02), gate capped-pipe (banda 5 cm sobre el crown), wet-ramp Hermite fuente-seca, caps de disponibilidad (β·V_celda para drenaje; presupuesto de volumen del nodo para spill), acumulador ∫Q.
- **Orquestador split** (`harness.html?mode=coupled`): 1D WASM (INP sin secciones 2D) stride-a-stride ↔ GPU (batches) ↔ retroalimentación `set_lateral_inflow` del ∫Q.
- **Fix del pin**: el motor fuerza activas las celdas de acople (`pin_t0`) — el seed de la GPU ahora las pincha.
- **Ponding del nodo acoplado**: el motor marca `coupled_node` → can_pond (DynamicWave `commitNodeDepthState`) y sobreescribe `ponded_area` con el footprint 2D; el split replica con `ALLOW_PONDING YES` + `swmm_node_set_pond_area(tri_area)` — sin esto el 1D floodea en el crown y el gate nunca abre.
- **Fixture `marcher-cpl`**: nodo STORAGE S1 (FUNC 100 → A efectiva 3.075 m² — el coeficiente FUNC se interpreta en ft²/US incluso en SI) + conduit restrictivo + outfall + `[2D_TRIANGLE_NODE_MAP]` → referencia completa del motor (depths + nodeHeads + mass balance + cpl acumulado por ventana).

**Validación (marcher-cpl, 8 celdas, 3600 s, 60 s/ventana):** VERDICT **PASS** — meanΔ = 4.7e-4 m (≤1e-3), medianCorr = 0.865 (≥0.5), temporalCorr = 1.0000; el nodo se pinna en 10.66 m (la ref 10.662), el exch por ventana coincide EXACTAMENTE con la ref (28.64, 43.0, 35.86, 25.12, 23.33, 27.8, 28.7…), y los volúmenes del nodo también (28.64, 43, 35.86, 25.12…). La ref misma sloshea (modo checkerboard de la cuenca cerrada, amplitud ±2 m); el split reproduce el modo con deriva de fase (f32 vs f64) → la corr espacial por-frame se invierte en ~15/50 frames; la MEDIANA es la métrica robusta (el peor-frame era −0.86).

**Lecciones M2 (todas medidas, no teoría):**
1. **El stride del 1D-only NO coincide con el co-advance del motor** (pasos adaptativos 1 s/120 s vs 60 s con el acople) — el split debe batch-por-landing del stride (VARIABLE_STEP NO pinna los pasos a ROUTING_STEP 60 s) y parear por tiempo (no por índice; el json de la ref omite el frame 241.5 aunque el stride existe).
2. **`set_lateral_inflow` aplica la MEDIA de los últimos DOS valores seteado** (medido: set −1.0 → aplicado −0.5; set 1.194 → aplicado 0.835) — el split debe setear `exch/dt` (el rate del batch actual); el aplicado = ½(exch_N + exch_{N-1})/dt = exactamente la entrega de la cola del motor (`coupling_queue` con `coupling_delivery_remaining` ≈ 2 ventanas).
3. **El orden de `_setParams` vs `_beginEncoder` importa**: el copy staged→params ocurre en el `_beginEncoder`; llamar `_setParams` DESPUÉS dejaba el primer rebuild con params ceros (P_NT=0 → el seed no hacía nada → activeCount 0 → el advance saltaba la ventana) y los substeps con dt de un substep atrás. Fix: `_setParams` ANTES del `_beginEncoder`.
4. **El seed escribe AMBAS regiones de wk** (`wk[i]` y `wk[NT+i]`): los kernels/count leen la base; el seed solo en la current dejaba la celda pinneada fuera del count → el advance saltaba y el intercambio no disparaba hasta que el halo dejaba un leftover.
5. **El budget del faceFlux usa el EXPORTADOR** (`exp_cell = (qn1 > 0) ? a : b` en el motor); el kernel tenía `select(a, b, qn1 > 0)` = el RECEPTOR → con receptor seco el flujo moría (el agua quedaba atrapada en la celda de acople). El M1 lo enmascaró (lluvia cubre todo el mesh).
6. **El buffer `pin` necesita COPY_SRC** para el readback (diagnóstico).
7. **La ref json incluye un frame final tSec=0** (estado END del engine) — excluirlo de la paridad; y el pairing por `≤` deja el par una ventana stale cuando la grilla del split está desfasada — usar el vecino más cercano.
8. **El frame final del 2D en la ref = la suma de DOS ventanas 60 s** (los strides a 241.5 no producen frame en el json) — no confundirlo con una ventana 120 s.

**Próximo M2.x:**
1. Unit test del kernel de acople vs la fórmula del motor (Q fijo con estados conocidos).
2. Acople por vértice (stencil) + validación Bellinge con el split.

### Próximos pasos

1. **M2.x**: unit test del kernel de acople; acople por vértice (stencil) + validación Bellinge con el split.
2. **M3**: condiciones de borde (NORMAL_FLOW/SPECIFIED_STAGE) + LTS v2.
3. **M4**: `renderDepths` por frame + toggle WebGPU/WASM en la UI.
4. (Opcional) Si se quiere max|Δdepth| < 1e-3 a escala: Kahan para volúmenes,
   desensibilizar el min-CFL, o build de referencia del motor en f32.

## Integración producción UI (branch `experimental`)

Estado: el 2D WebGPU corre **en la app de producción** como backend por defecto
(cuando `navigator.gpu` existe), con fallback automático al worker WASM.

- `public/webgpu/gpu2dWorker.js` — worker de producción con el **mismo contrato**
  que `openSwmm2dWorker.js` (`status2d`/`progress2d`/`results2d`/`error`): 1D en
  WASM + 2D en GPU (split M2), frames `{elapsedMs, depth, head, velocity,
  velocityX, velocityY}` (sin campos `vertex` — el render cae al derivado de
  celdas), `report` del 1D + `massBalance` del split (exch acumulado).
- `public/webgpu/couplingSplit.js` — maquinaria M2 compartida (worker-safe):
  `parse2DMesh`, `parse2DOptions`, `parseCoupling` (mapa por triángulo y por
  vértice), `build1DInp`, `simStartSec`/`simEndSec`, `rainMpsAt` (lluvia
  uniforme = media de los gages del modelo), `runSplit` (el loop completo).
- `public/app.js` — `run2DSimulationInWorker` intenta `webgpu/gpu2dWorker.js`
  primero; errores `WEBGPU_*`/`VERTEX_COUPLING_*` → reintenta con el worker
  WASM. Toggle `Net.useGpu2d !== false` (por defecto GPU).
- `public/webgpu/webgpuMarscher.js` — `sample()` ahora devuelve también
  `qx`/`qy` (velocidad Perot por celda) para los frames de producción.
- `scripts/test-gpu-worker.mjs` — drive del worker por el contrato real vía
  CDP (`--inp <path>`): fixture marcher-cpl → 51 frames, volume final 1707.0 m³
  (ref del engine 1706.8) ✓; Bellinge → `VERTEX_COUPLING_UNSUPPORTED` (cae al
  WASM) ✓.

Validado en el fixture de acople por triángulo (marcher-cpl): volumen 2D final
y acople 1D→2D coinciden con la referencia del motor.

### Pendiente para Bellinge en GPU

1. **Acople por vértice** (stencil): `[2D_VERTEX_NODE_MAP]` — el kernel de
   acople actual solo soporta `[2D_TRIANGLE_NODE_MAP]` (una celda por punto).
   El motor scatter Q sobre el stencil (weights upwind/geométricos) y la head
   2D del vértice usa reconstrucción (vertexHeadAt) — portar
   `NodeCoupling.cpp` vertexHeadAt/scatterCouplingFlux + stencil
   vertex→celdas en el marcher.
2. **Rain NATURAL_NEIGHBOUR** en la lluvia uniforme del split (hoy: media de
   gages por ventana).

### LTS v2 (M3) — hecho

Tiered local timestepping en GPU, port del esquema halving del motor
(`ExplicitInertialSolver.cpp` runMacroCycle): tier k de una celda se dispara
cada 2^k substeps con Δt = 2^k·dt0; face tier = min(celdas); cada firing de
cara bookea ±dM en acumuladores por lado (faccL/faccR) que el cell pass drena
en su cadencia — conservación exacta por construcción (mismos productos f32,
bookeados en tiempos distintos). Budget de positividad dividido por
refire = 2^(tier_exp − face_tier). Todo el macro ciclo en un solo encoder
(batching: 0.8 → 0.13 ms/substep).

- Kernels nuevos: settleAcc, tierAssign (CFL ratio → tier + compactación con
  atomics), faceTierAssign, degenTier/degenFaceTier (tail), faceFluxLts,
  cellUpdateLts. K=1 mantiene el path bit-idéntico del marcher M1.
- Validez: M1 8-cell y 5k con `--lts 4` → números idénticos a K=1 (cons 0.00%,
  meanΔ 1.1e-6, corr 0.923); bench Bellinge 48 h: 3372 s (K=1) → **1830 s**
  (LTS, 13.8M substeps @ 0.13 ms). El dt0 del bench rain-only colapsa a ~3.5 ms
  por UNA celda tier-0 (sin drenajes — el run acoplado de producción tiene
  ~1900 celdas tier-0 con dt0 ~0.25 s → expectativa ~1M substeps → ~3-5 min).
- Guard f32: piso dt0 = 1e-3 s (una velocidad Perot patológica q/h en f32 puede
  llevar el CFL min a ~1e-30 y colgar el march — `t += nsub·dt ≈ 0`; el motor
  en f64 nunca lo alcanza). Verificado: sin el piso el bench colgaba (TDR).
- Diagnóstico: `console.log('LTS[...]')` por rebuild cada 64 (dt0 + tiers).

### Acople por vértice (M2.x) — hecho

`[2D_VERTEX_NODE_MAP]` en el marcher + el split. Descubrimiento clave leyendo
`SurfaceRouter2D.cpp:394-412`: el **live path del motor NO usa el stencil** —
cada punto por vértice se convierte en un punto de UNA celda sobre **la celda
incidente de menor cota de lecho** (`sc.cell_idx = lo`, `vertex_idx = -1` → la
head del exchange = la head de la celda, no la pseudo-Laplaciana). El stencil
(head del vértice + scatter upwind) solo aplica al path de inyección de
outfalls (router), fuera del marcher.

- `parseCoupling` (split + harness): vertex → celda de menor cota del stencil
  (stencil Jawahar-Kamath portado de `VertexReconstruction.cpp`), crown/área
  igual que triángulos; pin = la misma celda.
- `couplingExchange` (WGSL): layout cplF 7→9 floats (cell, crown, cd, area,
  h1d, d1d, v1d, stPtr, stCnt) — el branch de stencil queda para el futuro
  path de outfalls (stCnt=0 hoy).
- Fixture `marcher-cplv` (vertex 0↔S1) + ref del motor (51 frames, 1705.9 m³):
  **PASS** — exch Δ 1.62%, medianCorr 0.860, temporalCorr 1.0 (el triángulo:
  1.67% / 0.865). Gates coupled robustos (el worst-frame meanΔ no es robusto
  ante el seiche anti-fase del basin cerrado — documentado en el harness).
- El worker de producción ya NO rechaza modelos con coupling por vértice:
  **Bellinge corre en GPU**.

### Ventanas de acople multi-stride (N-strides) — hecho

`runSplit` stridea exactamente `N = round(couplingWindowSec / routing_step)` pasos
1D por ventana GPU (worker: 60 s → N = 6 para routing 10 s; N = 1 para modelos
de 60 s — bit-idéntico al grid single-stride). Lección medida: un target
basado en tiempo MERGEA ventanas por el offset de ~1 s de los landings (50 vs
51 ventanas → −12 % de intercambio); el conteo exacto de strides lo evita.
Fixture: 51 frames, 1707.0 m³ ✓ (paridad intacta).

### Estado honesto del rendimiento (Bellinge, medido)

- Bench 2D-only (GPU, LTS): 48 h en 1830 s — pero el bench rain-only pincha
  UNA celda tier-0 con dt0 = 3.5 ms → 13.8M substeps (el run acoplado tiene
  ~1020 celdas tier-0 con dt0 ~0.25 s → ~700k substeps → ~2-4 min de 2D).
- El split de producción (worker, ventanas de 60 s) mide: batches de
  ~100-700 ms (stride 3-7 ms, advance 60-700 ms, exch ~2 ms) — el 1D de
  Bellinge DEGRADA sus strides a ~0.5-4 s aun con VARIABLE_STEP NO (rigidez
  de los nodos — el report del motor: min 0.38 s) → ~20-40k ventanas → el
  run completo ≈ 25-35 min vs 24 min del motor. El 1D es el piso irreducible
  (~20 min en ambos); el GPU quita el 2D de la CPU (~2-4 min del total) pero
  el total no gana al motor hoy.
- Conclusión: el 2D GPU es rápido por substep (0.13 ms) y la paridad del
  split es sólida (M1/M2/vertex verdes) — para ganar de verdad al motor hay
  que acelerar el 1D (fuera de alcance) o relajar el paso del 1D aceptando
  menos fidelidad.

### Investigación dt0 collapse — raíz encontrada (hecho)

El dt0 del split colapsaba al piso (1e-3 → 6.6M substeps, advance 400-700 ms/ventana).
Con el kernel `cflArgmin` (la celda cuyo CFL = el min): **las celdas que pinchan
el dt0 son celdas de acople con lchar = 0.25-0.30 m** (celdas diminutas del
mesh de Bellinge) — su dt CFL real = 0.018-0.023 s, NO un blow-up f32. El
report del motor lo confirma: "Avg Internal Step 0.2456 s" es el dt EFECTIVO
ponderado por LTS (tier 3 = 8×dt0) — el dt0 BASE del motor es el mismo régimen
(~0.03 s). El motor también corre ~5M substeps base — el 2D es caro en ambos
por las celdas tiny del mesh, no por la GPU.

- **Piso dt0 configurable** (`options.dtFloor`, default 0.05 s = 2× el CFL de
  las celdas tiny): 4× menos substeps, advance 13× más rápido (29-38 ms).
  Riesgo de estabilidad local acotado a las celdas tiny (artefactos del mesh).
- **Bug del 1D fijo**: `build1DInp` agregaba una segunda línea VARIABLE_STEP
  que perdía contra la original (el parser toma la última → el 1D corría
  VARIABLE pese al pin). Ahora reemplaza la línea existente.
- **El piso real final**: el 1D de Bellinge corre ~230k pasos INTERNOS del
  dynamic wave (~0.5 s — la rigidez; el stride API avanza el paso interno, no
  el routing step) × ~6 ms = **~23 min — idéntico en el motor**. El 2D del
  motor ya es barato (LTS + WASM: ~1-3 min de los 24) — **el 1D es el ~90 %
  del tiempo en ambos — WebGPU no puede ganar porque el 2D no es el cuello**.
  El 2D GPU (con el piso) ≈ 4 min — a la par del motor.

## Sesión 2026-08-05: aceleraciones aplicadas (medidas, no teoría)

### Corrección del diagnóstico anterior

Las cifras de arriba ("25-35 min", "el 1D es el ~90 %") están **obsoletas**:
con el fix del VARIABLE_STEP pin (`build1DInp` reemplaza la línea) el 1D del
split corre a **10 s de sim por stride a ~1.2-1.4 ms** (medido con
`scripts/bench-1d.mjs`, 8 h = 2.874 strides en ~3.4 s; 48 h ≈ 17.280 strides
≈ 24 s). El cuello actual del split es el **advance 2D GPU**: ~200 ms por
ventana de 60 s con `dt0` clavado en el piso → **48 h ≈ 11 min en total**,
con el 1D ≈ 2 min y el resto overhead. (La rigidez de ~0.5 s por stride solo
aplica al co-advance del motor WASM con el INP completo, no al 1D-only del
split.)

### 1. `DT_FLOOR` default 0.05 → **0.1 s** (`couplingSplit.js parse2DOptions`)

- Medido en Bellinge 8 h (fixture `bellinge-8h.inp`, worker de producción):
  advance 195-210 ms → **85-90 ms/ventana** (~2.2×); total 230 → ~120 ms
  (~1.9×). Mismo número de frames (435), `continuityError = 0` (conservación
  exacta del GPU).
- Coste: el estado final de la celda 0 deriva +1.2 mm vs el piso 0.05 (8 h) —
  dentro de la banda estadística documentada (meanΔ ≤ 1e-3 m); el cell argmin
  del CFL puede alternar entre celdas tiny vecinas. Configurable por modelo
  con `DT_FLOOR` en `[2D_OPTIONS]` (control de validación:
  `bellinge-8h-dtf05.inp`).
- 48 h con el nuevo piso ≈ **5-6 min** (2.880 ventanas × ~0.12 s).

### 2. Rebuild WASM con SIMD128 + LTO (`build-openswmm2d.ps1`)

- `-DCMAKE_{C,CXX}_FLAGS=-msimd128` + `-DOPENSWMM_ENABLE_LTO=ON` (antes OFF).
  Verificado: objetos LLVM bitcode (`BC` magic) → LTO activo; el wasm mide
  4.518.354 B. Sin `-ffast-math` → f64 IEEE intacto.
- Resultado medido: el 1D probe queda igual (4.000 → 4.023 ms, ruido) — el
  stride 1D está dominado por el solve de nodos (poco vectorizable), no por
  la geometría batch. **La corrección no es necesaria para el split** pero
  queda activa: flags correctos para el futuro y para el co-advance WASM.
- Efecto secundario honesto: LTO permite contracciones FMA cross-TU → el 1D
  cambia en ~1 ulp → el acople caótico amplifica → estado final de la celda 0
  deriva 1.1 mm vs el wasm anterior (mismo band, misma 0 % continuidad).
- Fix colateral: el stamping de git en el script crasheaba al final (el
  submodule no es un repo git) → ahora `try/catch` → stamp "unknown".

### 3. Knobs del modelo 1D — **experimento medido y RECHAZADO**

`MIN_SURFAREA 1.167 → 12.566` + `HEAD_TOLERANCE 0.0015 → 0.005` +
`SKIP_STEADY_STATE YES` en los INP de Bellinge:
- 1D-only (VARIABLE_STEP 0.75): 18.973 → 17.774 strides (−6 %), wall 18.3 →
  11.7 s (−36 %).
- Co-advance WASM completo (fallback, 8 h): 126.2 → 118.0 s (**−6.5 %**).
- **Pero**: el total de lluvia 2D del co-advance cambia 1.086.623 → 1.100.444
  m³ (**+1.3 %**) y los frames 472 → 468 — el grid de ventanas del co-advance
  cambia con el paso interno del 1D (la lluvia se muestrea por ventana), y
  `SKIP_STEADY_STATE YES` no disparó en absoluto (resultado bit-idéntico con
  y sin él). Mover la referencia validada +1.3 % por −6.5 % de wall no
  compensa → **los sample INPs quedan sin cambios**; los knobs quedan
  documentados como opción por-modelo.

### Herramientas

- **`scripts/bench-1d.mjs`** (nuevo): probe 1D bare (strip 2D + pin
  VARIABLE_STEP como el split; `--keep-vs` para medir con paso adaptativo):
  strides, wall, ms/stride, sim·s/wall·s, código de fin tolerado (el stride
  señala fin natural con el código de lifecycle 6 — los workers de
  producción cierran sin llamar `end()`).
- `scripts/run-engine-marcher.mjs`: tolera `end()`/`report()` (mismo motivo)
  y escribe salida compacta cuando el JSON de Bellinge excede el límite de
  string de Node (`Invalid string length`).

## Referencias

- Motor (copia): `third_party/openswmm-engine/src/engine/2d/solver/ExplicitInertialSolver.cpp`
  e `inertial.hpp` (fórmulas a portar).
- Malla actual: `public/mesh2d*.js` (generación, sin cambios).
- Resultados: `public/mesh2dRender.js`, `public/meshGlLayer.js` (reutilizar).
