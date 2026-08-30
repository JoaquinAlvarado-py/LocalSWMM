# El pipeline de simulación y el puente al motor WASM

Cómo fluye una simulación desde la UI al motor y de vuelta — los workers, los contratos de mensajes y el puente WASM que conecta JavaScript con el motor C++.

## Flujo de extremo a extremo

Presionar **Run** (`#btn-run`, `ui.js:216`) recorre este camino:

```
Botón Run (#btn-run, ui.js:216)
  └─ window.runSimulation()                       app.js:1392
       ├─ guardas: ≥1 nodo, ≥1 OUTFALL, unidades SI si 2D   app.js:1393-1406
       ├─ baseInpText = inpExporter.generateInp(Net)     app.js:1407
       ├─ si hay malla 2D: inp = Mesh2DInp.buildInput(...)    app.js:1414-1422
       ├─ targetDuration = estimateSimDurationMs(...)    app.js:1427-1431 / 1083
       │
       ├─ [vía 2D] run2DSimulationInWorker(...)         app.js:1131
       │    ├─ default openSwmm2dWorker (motor WASM f64 — fiel) app.js:1133
       │    └─ WebGPU gpu2dWorker solo si Net.useGpu2d === true (opt-in) app.js:1209-1221
       │    ├─ apply2DResults(result)                    app.js:1200
       │    └─ display2DResults(result)                  results.js:1291
       │
       └─ [vía 1D] runSimulationInWorker(inpText, …)    app.js:1233
            ├─ simWorker.js persistente (pre-calentado)      app.js:969/1304
            └─ fallback runSimulationOnMainThread        app.js:1307
            ├─ App.outData = new SWMMOutParser(out).parse()  app.js:1466
            └─ displayResults(rpt, outData)              results.js:790
```

Los dos backends comparten la misma superficie de corrida pero difieren en fidelidad: el motor WASM es la referencia (f64, fiel), mientras que el marcher WebGPU es una vía de rendimiento opt-in (`Net.useGpu2d === true`) que reimplementa el solver 2D explícito local-inercial en la GPU.

## Validación previa al vuelo

`runSimulation` (`app.js:1392-1489`) aborta con una advertencia si: no hay nodos; no hay `OUTFALL`; o hay una malla 2D presente mientras las unidades son US (`app.js:1402-1406` — el 2D es solo SI).

## Estimación de duración (progreso cosmético)

`estimateSimDurationMs(inpText, networkSize)` (`app.js:1083-1129`) parsea START/END de `[OPTIONS]` y `ROUTING_STEP` del INP y extrapola el tiempo de reloj. La barra de progreso 1D de Run Status se maneja con un `setInterval` contra esta estimación, con tope en 99% y luego asintótica a 100% (`app.js:1252-1271`).

## Web Workers

| Worker | Instanciado en | Rol |
|---|---|---|
| `parseWorker.js` | `app.js:933` (por import) | Parsear el texto `.inp` fuera del hilo principal |
| `simWorker.js` | `app.js:969-978` (**persistente**) | Corrida del motor 1D; pre-calentado en la carga (`app.js:1304`) |
| `openSwmm2dWorker.js` | `app.js:1143` (por corrida 2D) | Motor acoplado 1D+2D + muestreo de cuadros (**default — la referencia f64**) |
| `webgpu/gpu2dWorker.js` | `app.js:1186` (por corrida 2D, **solo si `Net.useGpu2d === true`**) | Marcher WebGPU f32 (vía de rendimiento opt-in) |

**Contratos de mensajes de los workers** (principal → worker):

- `parseWorker`: `{ text }` → postea `{type:'progress'|'done', model}` | `{type:'error'}`.
- `simWorker`: `{ type:'run', inpText, targetDurationMs, files? }` → postea `{type:'ready'}` (una vez, tras compilar el wasm), `{type:'log'|'err'}`, `{type:'done', rpt, outBuffer}` (ArrayBuffer transferible), `{type:'error'}`.
- `openSwmm2dWorker` / `gpu2dWorker`: `{ type:'run2d', inp, triangleIds, meshFile|null, triangleVertices, dryDepth, wantVertexFields, frameIntervalMs }` (+ `wasmBinary` transferido opcional) → postea `{type:'status2d', stage}`, `{type:'stdout'|'stderr'}`, `{type:'progress2d', elapsedMs}`, `{type:'results2d', triangleIds, frames, diagnostics, report}` (buffers transferidos), `{type:'error'}`.

**Asimetría del ciclo de vida de los workers:** el worker 1D se crea una vez y se reutiliza (`simWorker.onerror` lo anula para que la siguiente corrida lo recree); los workers 2D se recrean en cada corrida y una instancia WASM fallida no puede reutilizarse (`openSwmm2dWorker.js:376`).

**Detener:** `stopSimulationWorker()` (`app.js:1038-1059`) termina ambos workers, limpia el timer de progreso falso y restaura el botón Run.

## Ejecución 1D vs 2D dentro del motor

- **`simWorker.js`** — runner 1D bloqueante: escribe un `.inp` en MEMFS, llama `stride(engine, 10_000_000, …)` una vez para correr hasta completarse, lee `/rpt.rpt` y `/out.out`, transfiere los bytes. Sin muestreo de cuadros (`simWorker.js:76-81`).
- **`openSwmm2dWorker.js`** — runner 1D+2D: mismo ciclo de vida pero avanza en bloques `stride(…, stepsPerYield=256)` y **muestrea cuadros por triángulo en JS entre strides** (`readFrame`, `openSwmm2dWorker.js:158-179`) — esto es lo que produce la línea de tiempo de la animación 2D. También lee los diagnósticos 2D (balance de masa, pasos del solver, velocidad máxima) y el reporte. Sin parseo de `.out` en esta vía.
- **`webgpu/gpu2dWorker.js`** — mismo contrato `results2d`, pero el avance 2D corre en el marcher de GPU (ver el subsistema de malla 2D y WebGPU) en lugar del solver WASM.

## Resultados

**Parser binario `.out` — `swmmOutParser.js`:** lee el footer del archivo de salida SWMM (últimos seis INT32: `idNamesOffset, objPropsOffset, resultsOffset, numPeriods, errCode, magicEnd`), valida el magic `516114522`, parsea los headers y los conteos de variables, y expone **vistas `Float32Array` zero-copy** sobre los registros de periodo (`readResults`, `swmmOutParser.js:132-180`). Caminos calientes: `getTimeSeries(type,index,varIndex)` (cacheado, `:184-209`) y `getStepData(type,step,varIndex)` para el coloreado del mapa por paso (`:212-230`).

**Presentación — `results.js`:** el texto `.rpt` se parsea una vez en tablas resumen (`parseNodeDepths`, `parseLinkFlows`, `parseFlooding`, `parseNodeInflows`, `parseOutfallLoadings`, `parseConduitSurcharges`, `parseSubcatchmentRunoffs`, `parseContinuityErrors`, `parseEngineErrors`, `parseTimeSeries` — `results.js:59-366`). `ResultStyling` (`results.js:369-547`) es dueño del coloreado: `applyToMapForStep(step)` (`:402-518`) pinta primero los cuadros de la malla 2D, luego la vía binaria optimizada `.out`, y luego el fallback `.rpt`. `displayResults` (`:790-1288`) construye tarjetas KPI, chips de continuidad, leyendas de color, tablas de resultados ordenables/filtrables con minigráficos lazy vía `IntersectionObserver`, y fly-to al hacer clic. `display2DResults` (`:1291-1492`) colorea la malla por cuadro, expone un selector de tirante/carga/velocidad y maneja el mismo deslizador de tiempo vía una serie de tiempo sintética.

**Gráficos:** `profile.js` `ProfilePlot.openForNodes` (`:630`) traza BFS por conductos, muestrea el terreno y dibuja un perfil hidráulico (código de color de capacidad: rojo ≥1.0 en carga, ámbar ≥0.85, cian normal). `plot.js` `TimeSeriesPlot` (`:227`) grafica series de tiempo multi-serie desde el binario `.out` (preferido) o con fallback `.rpt`.

## Los binarios distribuidos

`public/` contiene **dos builds idénticos del motor** (misma fábrica, mismo tamaño 4.614.086 bytes, mismo sello):

- `openswmm2d.js` + `openswmm2d.wasm` — usados por `openSwmm2dWorker.js`, `gpu2dWorker.js` y todos los `scripts/*.mjs`.
- `swmm6wasm.js` + `swmm6wasm.wasm` — una copia usada por `simWorker.js` (nombre legado).

Ambos son pegamento Emscripten de 2 líneas que exporta la fábrica **`createOpenSwmm2D`** (`swmm6wasm.js:1-2`). Los archivos `.version.json` registran el commit/describe/fecha del motor (escritos por el script de build).

## Instanciación de módulo

El wasm se **compila una vez, se instancia por corrida** (~10–50 ms por re-instanciación, según `simWorker.js:8-12`):

```js
// simWorker.js:19-63 (condensed)
const module = await WebAssembly.compileStreaming(fetch('swmm6wasm.wasm')); // once
const factory = createOpenSwmm2D({ noInitialRun: true,
    instantiateWasm: (imports, cb) => WebAssembly.instantiate(module, imports).then(m => cb(m.instance)) });
const engine = await factory();   // fresh instance each run
```

`wasm/openswmm2d_exports.cpp` es deliberadamente **solo-fuente** (6 líneas): incluye los headers públicos del motor y nada más, para que Emscripten exporte la API C como funciones de librería sin arrastrar el ciclo de vida de `main`.

## API C exportada (31 símbolos en `EXPORTED_FUNCTIONS`)

**Ciclo de vida** (`swmm_engine_*`; máquina de estados `CREATED → OPENED → INITIALIZED → STARTED → [RUNNING] → ENDED → CLOSED` según `openswmm_engine.h:31-37`):

| Símbolo | Significado |
|---|---|
| `swmm_engine_create` / `destroy` | Asignar / liberar el handle del motor |
| `swmm_engine_open(engine, inp, rpt, out, plugin)` | Parsear el `.inp` (+ librería plugin opcional, siempre `0` en wasm) |
| `swmm_engine_initialize` / `start` / `end` / `close` | Transiciones del ciclo de vida (`start` toma `save_results`) |
| `swmm_engine_step(engine, double* elapsed)` | Avanzar exactamente un paso de tránsito |
| `swmm_engine_stride(engine, n_steps, double* elapsed)` | Avanzar hasta `n` pasos en una llamada |
| `swmm_engine_report(engine)` | Escribir el archivo de reporte resumen |

**Accesores 2D** (`swmm_2d_*`): `swmm_2d_triangle_count`, `swmm_2d_get_depths_bulk`, `swmm_2d_get_heads_bulk`, `swmm_2d_get_stat_max_velocities`, `swmm_2d_get_continuity_error`, `swmm_2d_get_solver_steps` (+ legado `swmm_2d_get_cvode_steps`), `swmm_2d_get_mass_balance` (10 términos double), y accesores opcionales de vértices/bordes (`swmm_2d_vertex_count`, `swmm_2d_vertex_get_xyz_bulk`, `swmm_2d_edge_get_geometry_bulk`, `swmm_2d_get_edge_flux_bulk`, `swmm_2d_vertex_get_render_depths_bulk`, `swmm_2d_vertex_get_heads_bulk`).

**Acceso/control de nodos 1D** (`swmm_node_*`): `swmm_node_count`, `swmm_node_get_heads/depths/volumes_bulk`, `swmm_node_set_lateral_inflow`, `swmm_node_set_pond_area` — usados por el split de WebGPU para devolver el intercambio 1D↔2D al motor.

Más `malloc`/`free` para la gestión de memoria JS↔wasm.

## Capa de wrapper JS — `openSwmm2dWorker.js`

- `bindApi(Module)` (`:79-107`) envuelve cada símbolo con `Module.cwrap`; `optional()` retorna `null` para símbolos ausentes de un build, de modo que un worker maneja múltiples configuraciones de motor.
- `check(code, op, Module, reportPath, payload)` (`:109-148`) lanza errores ricos; ante un fallo, vuelca el `.rpt` (líneas de error filtradas o los últimos 1500 caracteres) y los primeros 3000 caracteres del INP como mensajes `stderr` — esta es tu primera parada cuando una simulación "falla en silencio".
- `readFrame(Module, api, engine, count, elapsedMs)` (`:158-179`) mallocs arrays de tirante/carga/velocidad, los lee en bulk, retorna Float64Arrays, libera en `finally`.
- `readVelocity(...)` (`:196-229`) reconstruye la **velocidad física centrada en la celda** a partir del flujo de borde + la geometría de borde vía una solución de mínimos cuadrados de `(NᵀN)v = Nᵀq` (q = flujo/longitud), convirtiendo el caudal específico en velocidad (`/h`); las celdas secas (`h ≤ dryDepth`) se ponen en cero.
- `readDiagnostics(...)` (`:231-257`) lee el balance de masa, los pasos internos del solver y las estadísticas de velocidad máxima.
- `run(payload)` (`:259-368`) es el bucle de corrida 2D: escribir `/model2d.inp` (+ archivo de malla opcional) → ciclo de vida `open→initialize→start` con `check()` tras cada uno → `do/while` `stride(engine, 256, …)` muestreando cuadros a `frameIntervalMs` → cuadro final + diagnósticos → `end→report` → postear `results2d`.

## Gestión de memoria

- Todos los punteros vienen de `Module._malloc(bytes)` y se liberan con `Module._free(ptr)`; las lecturas escalares usan `Module.getValue(ptr, 'double'|'i32')`; el código nunca toca vistas HEAP crudas directamente.
- Los archivos van al sistema de archivos virtual MEMFS de Emscripten: `FS.writeFile('/in.inp', inpText)`, `FS.readFile('/rpt.rpt', {encoding:'utf8'})`, `FS.readFile('/out.out')` que retorna un `Uint8Array` **vista sobre el heap del wasm**. El worker recorta una copia (`outBytes.buffer.slice(...)`, `simWorker.js:162`) para que el buffer del heap pueda desprenderse en la transferencia.
- El worker 2D desvincula sus archivos temporales en `finally` (`openSwmm2dWorker.js:364-366`).
