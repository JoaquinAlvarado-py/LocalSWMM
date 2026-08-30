# Scripts, benchmarks y verificación

Los 15 scripts `.mjs` en `scripts/` más los dos scripts de build de shell — qué hace cada uno y cómo ejecutarlo.

Todos se ejecutan desde la raíz del repo con `node scripts/<name>.mjs`. El patrón común: shim de `globalThis.self/window`, cargar `public/openswmm2d.js`, instanciar `openswmm2d.wasm` sincrónicamente en Node, envolver la API C con `Module.cwrap`. Varios levantan `server.py` + una instancia de Chrome vía CDP.

## Benchmarks y probes (motor en Node)

| Script | Propósito | Uso |
|---|---|---|
| `bench-1d-bellinge.mjs` | Costos por-stride / por-window / freeze / cplF en Bellinge; proyecta 48 h de wall time | sin args |
| `bench-1d.mjs` | Benchmark 1D de stride puro; salida JSON | `node bench-1d.mjs <inp> [--wasm <path>] [--tag <l>] [--keep-vs]` |
| `probe-1d.mjs` | Volcado de head/depth por paso de uniones (limitado a 80 pasos) | `node probe-1d.mjs <inp>` |
| `probe-1d-coupl.mjs` | Carga 1D tipo split: `setPondArea` + `setLatInflow` alternado; histograma de dt | sin args (fixture Bellinge) |
| `probe-1d-nan.mjs` | Corrida 1D completa de 48 h escaneando heads/depths/volúmenes por NaN/Inf | `node probe-1d-nan.mjs [VS]` |
| `probe-cpl.mjs` | Deltas de volumen de acople por-stride desde el buffer de balance de masa de 10 slots | `node probe-cpl.mjs <inp>` |
| `run-engine-marcher.mjs` | Corrida 2D de referencia: depth/head/velocity por frame + heads de nodos + balance de masa → JSON. Requiere un build wasm **sin hilos** (el build con hilos necesita un navegador) | `node run-engine-marcher.mjs <inp> <out.json> [--frames N] [--interval <sec>] [--wasm <p>]` |
| `bench-wasm-threads.mjs` | **Gate del motor con hilos:** ejecuta el `openSwmm2dWorker.js` de producción en Chrome con aislamiento cross-origin a THREADS 1 vs N; reporta wall time + continuidad bit-idéntica | CDP 9225 | `node bench-wasm-threads.mjs [--inp <p>] [--threads 1,4] [--minutes <n>]` |

## Generadores de input sintético

| Script | Propósito | Uso |
|---|---|---|
| `make-marcher-inp.mjs` | INP 2D M1 de cuenca cerrada (bordes WALL, lecho sinusoidal) | `node make-marcher-inp.mjs <nx> <ny> <dx> <rainMmHr> <min> <out.inp>` |
| `make-marcher-cpl-inp.mjs` | INP de acople 1D↔2D M2 (storage S1 + conducto + outfall, celda 0 acoplada) | `node make-marcher-cpl-inp.mjs <out.inp>` |

## Harnesses end-to-end Chrome/CDP

| Script | Propósito | Puerto | Uso |
|---|---|---|---|
| `verify-bellinge.mjs` | **Gate insignia:** Chrome headless carga la app, proyecta Bellinge a EPSG:25832, auto-carga `Bellinge2.tif`, genera la malla, corre el modelo completo de 48 h a través del propio worker de la app, y verifica frames/depths/balance de masa/continuidad | CDP 9222 | sin args; escribe `scripts/verify-out/` |
| `verify-1d-split.mjs` | Gate de regresión para la pierna 1D del split (usa el `couplingSplit.js` de producción; falla ante heads de acople no finitos) | — | `node verify-1d-split.mjs <inp> [--wasm <p>] [--tol <%>] [--hours <n>] [--json]` |
| `test-gpu-worker.mjs` | Maneja el `gpu2dWorker.js` de producción a través del contrato `run2d` de la app en Chrome con ventana | CDP 9224 | `node test-gpu-worker.mjs [--inp <p>]` |
| `bench-gpu-coupl.mjs` | Timings del split GPU por-window (`strideMs/freezeMs/advanceMs/exchMs/dt0/substeps`), extrapola 48 h de wall time | CDP 9225 | `node bench-gpu-coupl.mjs [--windows N] [--lts N] [--cadence N] [--dtfloor N] [--dbgcell N] [--inp <p>]` |
| `run-webgpu-harness.mjs` | Maneja la paridad M1/M2 de `public/webgpu/harness.html` + bench en Chrome **con ventana** (headless no tiene WebGPU); prepara fixtures en `public/webgpu/fixtures/` desde `scripts/verify-out/` | CDP 9223 | `node run-webgpu-harness.mjs [fixture…] [--coupled] [--bench] [--lts N] [--hours N]` |
| `test-2d-render.mjs` | Smoke test del pipeline de render: flechas de velocidad, regresión de bandas de contorno, frame-max robusto, compilación de shaders WebGL2, finitud de `display2DResults` | CDP 9225 | sin args |

## Scripts de build

| Script | Propósito | Uso |
|---|---|---|
| `build-openswmm2d.sh` | Build WASM para Linux/macOS (emcmake + vcpkg) | `npm run build:2d-wasm:sh` |
| `build-openswmm2d.ps1` | Build WASM para Windows | `npm run build:2d-wasm` |

## Nota sobre fixtures

> **Nota:** `public/webgpu/fixtures/` **no está commiteado** — los scripts de harness lo generan/preparan desde `scripts/verify-out/`. Si falta un fixture, ejecuta primero el generador (`make-marcher-*.mjs`) o `verify-bellinge.mjs`.
