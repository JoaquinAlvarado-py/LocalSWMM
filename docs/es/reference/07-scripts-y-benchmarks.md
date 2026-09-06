# Scripts, benchmarks y verificación

El conjunto de scripts de prueba y verificación en `scripts/` — qué hace cada uno y cómo ejecutarlo.

Todos se ejecutan desde la raíz del repo con `node scripts/<name>.mjs`. El patrón común: shim de `globalThis.self/window`, cargar `public/swmm6wasm.js`, instanciar `swmm6wasm.wasm` en Node y envolver la API C con `Module.cwrap`. Varios levantan `server.py` + una instancia de Chrome vía CDP.

## Benchmarks y probes (motor en Node)

| Script | Propósito | Uso |
|---|---|---|
| `bench-1d-bellinge.mjs` | Costos por-stride y por-window en el modelo Bellinge; proyecta 48 h de wall time | sin args |
| `bench-1d.mjs` | Benchmark 1D de stride puro; salida JSON | `node bench-1d.mjs <inp> [--wasm <path>] [--tag <l>] [--keep-vs]` |
| `probe-1d.mjs` | Volcado de head/depth por paso de uniones (limitado a 80 pasos) | `node probe-1d.mjs <inp>` |
| `probe-1d-nan.mjs` | Corrida 1D completa de 48 h escaneando heads/depths/volúmenes por anomalías NaN/Inf | `node probe-1d-nan.mjs [VS]` |
| `bench-wasm-threads.mjs` | **Benchmark del motor con hilos:** ejecuta `simWorker.js` en Chrome con aislamiento cross-origin a THREADS 1 vs N; reporta wall time + continuidad bit-idéntica | `node bench-wasm-threads.mjs [--inp <p>] [--threads 1,4] [--minutes <n>]` |

## Harnesses end-to-end Chrome/CDP y pruebas unitarias

| Script | Propósito | Puerto | Uso |
|---|---|---|---|
| `test-network3d.mjs` | Suite de pruebas unitarias para la geometría de red 3D (generación de polígonos, trayectorias de enlaces, mapeo de entidades) | — | `npm run test:3d` |
| `verify-bellinge.mjs` | **Gate de verificación automatizada:** Chrome headless carga la app, carga Bellinge Web, corre la simulación vía `simWorker.js` y verifica la continuidad de salida | CDP 9222 | sin args; escribe `scripts/verify-out/` |
| `verify-1d-split.mjs` | Gate de regresión para la pierna de simulación 1D; verifica heads hidráulicos finitos | — | `node verify-1d-split.mjs <inp> [--wasm <p>] [--tol <%>] [--hours <n>] [--json]` |
| `verify-lchar.mjs` | Verificación de longitud característica | — | `node verify-lchar.mjs <inp>` |
