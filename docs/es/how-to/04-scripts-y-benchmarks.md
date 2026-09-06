# Cómo Ejecutar los Scripts, Benchmarks y Harnesses de Verificación

Ejecuta los benchmarks basados en Node, las sondas y los harnesses de verificación que validan el motor OpenSWMM.

Todo se ejecuta desde la raíz del repo con `node scripts/<nombre>.mjs`. El patrón común: shim `globalThis.self/window`, cargar `public/swmm6wasm.js`, instanciar `swmm6wasm.wasm` en Node, y envolver la API C con `Module.cwrap`. Varios lanzan `server.py` y una instancia de Chrome vía CDP para pruebas de extremo a extremo.

## 1. Benchmarks y sondas (motor en Node)

| Script | Propósito | Uso |
|---|---|---|
| `bench-1d-bellinge.mjs` | Costos por-stride y por-ventana en el modelo Bellinge; proyecta 48 h de tiempo de pared | sin argumentos |
| `bench-1d.mjs` | Benchmark de stride 1D con salida JSON | `node bench-1d.mjs <inp> [--wasm <ruta>] [--tag <l>] [--keep-vs]` |
| `probe-1d.mjs` | Volcado de altura y profundidad de nodo por paso (máx. 80 pasos) | `node probe-1d.mjs <inp>` |
| `probe-1d-nan.mjs` | Corrida 1D completa de 48 h escaneando alturas/profundidades/volúmenes en busca de anomalías NaN/Inf | `node probe-1d-nan.mjs [VS]` |
| `bench-wasm-threads.mjs` | **Benchmark del motor con threads:** ejecuta `simWorker.js` en Chrome aislado con THREADS 1 vs N; reporta tiempo y continuidad | `node bench-wasm-threads.mjs [--inp <p>] [--threads 1,4] [--minutes <n>]` |

## 2. Harnesses de extremo a extremo Chrome/CDP y pruebas unitarias

| Script | Propósito | Puerto | Uso |
|---|---|---|---|
| `test-network3d.mjs` | Suite de pruebas unitarias de geometría de red 3D (generación de polígonos, trazo de enlaces, features) | — | `npm run test:3d` |
| `verify-bellinge.mjs` | **Compuerta de verificación automatizada:** Chrome headless carga la app, carga Bellinge Web, ejecuta la simulación con `simWorker.js` y verifica continuidad | CDP 9222 | sin argumentos; escribe `scripts/verify-out/` |
| `verify-1d-split.mjs` | Compuerta de regresión para la pierna de simulación 1D; verifica alturas finitas | — | `node verify-1d-split.mjs <inp> [--wasm <p>] [--tol <%>] [--hours <n>] [--json]` |
| `verify-lchar.mjs` | Verificación de longitud característica | — | `node verify-lchar.mjs <inp>` |
