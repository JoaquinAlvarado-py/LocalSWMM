# Cómo Ejecutar los Scripts, Benchmarks y Harnesses de Verificación

Ejecuta los benchmarks basados en Node, las sondas, los generadores de entrada y los harnesses de extremo a extremo Chrome/CDP que verifican el motor.

Todo se ejecuta desde la raíz del repo con `node scripts/<nombre>.mjs`. El patrón común: shim `globalThis.self/window`, cargar `public/openswmm2d.js`, instanciar `openswmm2d.wasm` sincrónicamente en Node, envolver la API C con `Module.cwrap`. Varios lanzan `server.py` + una instancia de Chrome vía CDP.

## 1. Benchmarks y sondas (motor en Node)

| Script | Propósito | Uso |
|---|---|---|
| `bench-1d-bellinge.mjs` | Costos por-stride / por-window / freeze / cplF en Bellinge; proyecta 48 h de tiempo de pared | sin argumentos |
| `bench-1d.mjs` | Benchmark de stride 1D puro; salida JSON | `node bench-1d.mjs <inp> [--wasm <ruta>] [--tag <l>] [--keep-vs]` |
| `probe-1d.mjs` | Volcado de altura/depths de nodo por paso (máx. 80 pasos) | `node probe-1d.mjs <inp>` |
| `probe-1d-coupl.mjs` | Carga 1D tipo split: `setPondArea` + `setLatInflow` alternados; histograma de dt | sin argumentos (fixture de Bellinge) |
| `probe-1d-nan.mjs` | Corrida 1D completa de 48 h escaneando alturas/depths/volúmenes en busca de NaN/Inf | `node probe-1d-nan.mjs [VS]` |
| `probe-cpl.mjs` | Deltas de volumen de acoplamiento por stride desde el buffer de balance de masa de 10 ranuras | `node probe-cpl.mjs <inp>` |
| `run-engine-marcher.mjs` | Corrida 2D de referencia: depth/velocidad/altura por frame + alturas de nodo + balance de masa → JSON. Requiere un build de wasm **sin threads** (el build con threads necesita un navegador) | `node run-engine-marcher.mjs <inp> <out.json> [--frames N] [--interval <seg>] [--wasm <p>]` |
| `bench-wasm-threads.mjs` | **Compuerta del motor con threads:** ejecuta el `openSwmm2dWorker.js` de producción en Chrome aislado de origen cruzado con THREADS 1 vs N; reporta tiempo de pared + continuidad bit idéntica | CDP 9225 | `node bench-wasm-threads.mjs [--inp <p>] [--threads 1,4] [--minutes <n>]` |

## 2. Generadores de entrada sintética

| Script | Propósito | Uso |
|---|---|---|
| `make-marcher-inp.mjs` | INP 2D de cuenca cerrada M1 (bordes WALL, lecho sinusoidal) | `node make-marcher-inp.mjs <nx> <ny> <dx> <rainMmHr> <min> <out.inp>` |
| `make-marcher-cpl-inp.mjs` | INP de acoplamiento 1D↔2D M2 (storage S1 + conducto + outfall, celda 0 acoplada) | `node make-marcher-cpl-inp.mjs <out.inp>` |

## 3. Harnesses de extremo a extremo Chrome/CDP

| Script | Propósito | Puerto | Uso |
|---|---|---|---|
| `verify-bellinge.mjs` | **Compuerta insignia:** Chrome headless carga la app, proyecta Bellinge a EPSG:25832, auto-carga `Bellinge2.tif`, genera la malla, ejecuta el modelo completo de 48 h a través del propio worker de la app, verifica frames/depths/balance de masa/continuidad | CDP 9222 | sin argumentos; escribe `scripts/verify-out/` |
| `verify-1d-split.mjs` | Compuerta de regresión para la pierna 1D del split (usa el `couplingSplit.js` de producción; falla con alturas de acoplamiento no finitas) | — | `node verify-1d-split.mjs <inp> [--wasm <p>] [--tol <%>] [--hours <n>] [--json]` |
| `test-gpu-worker.mjs` | Conduce el `gpu2dWorker.js` de producción a través del contrato `run2d` de la app en Chrome con ventana | CDP 9224 | `node test-gpu-worker.mjs [--inp <p>]` |
| `bench-gpu-coupl.mjs` | Tiempos del split de GPU por window (`strideMs/freezeMs/advanceMs/exchMs/dt0/substeps`), extrapola 48 h de tiempo de pared | CDP 9225 | `node bench-gpu-coupl.mjs [--windows N] [--lts N] [--cadence N] [--dtfloor N] [--dbgcell N] [--inp <p>]` |
| `run-webgpu-harness.mjs` | Conduce `public/webgpu/harness.html` M1/M2 paridad + bench en Chrome **con ventana** (headless no tiene WebGPU); prepara fixtures en `public/webgpu/fixtures/` desde `scripts/verify-out/` | CDP 9223 | `node run-webgpu-harness.mjs [fixture…] [--coupled] [--bench] [--lts N] [--hours N]` |
| `test-2d-render.mjs` | Prueba de humo del pipeline de render: flechas de velocidad, regresión de bandas de contorno, frame-max robusto, compilación de shaders WebGL2, finitud de `display2DResults` | CDP 9225 | sin argumentos |

> **Nota:** `public/webgpu/fixtures/` **no está commiteado** — los scripts del harness lo generan/preparan desde `scripts/verify-out/`. Si falta un fixture, ejecuta primero el generador (`make-marcher-*.mjs`) o `verify-bellinge.mjs`.
