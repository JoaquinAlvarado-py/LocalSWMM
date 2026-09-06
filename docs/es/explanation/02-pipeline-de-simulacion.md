# El pipeline de simulación y el puente al motor WASM

Cómo fluye una simulación desde la UI al motor y de vuelta — el worker, los contratos de mensajes y el puente WASM que conecta JavaScript con el motor C++.

## Flujo de extremo a extremo

Presionar **Run** (`#btn-run`, `ui.js:216`) recorre este camino:

```
Botón Run (#btn-run, ui.js:216)
  └─ window.runSimulation()                       app.js
       ├─ guardas: ≥1 nodo, ≥1 OUTFALL
       ├─ inpText = inpExporter.generateInp(Net)
       ├─ targetDuration = estimateSimDurationMs(...)
       │
       └─ runSimulationInWorker(inpText, …)
            ├─ simWorker.js persistente (pre-calentado)
            └─ fallback runSimulationOnMainThread
            ├─ App.outData = new SWMMOutParser(out).parse()
            └─ displayResults(rpt, outData)              results.js
```

## Validación previa al vuelo

`runSimulation` aborta con una advertencia si: no hay nodos; o no hay un nodo `OUTFALL`.

## Estimación de duración (progreso cosmético)

`estimateSimDurationMs(inpText, networkSize)` parsea START/END de `[OPTIONS]` y `ROUTING_STEP` del INP y extrapola el tiempo de reloj. La barra de progreso de Run Status se maneja con un `setInterval` contra esta estimación, con tope en 99% y luego asintótica a 100%.

## Web Workers

| Worker | Instanciado en | Rol |
|---|---|---|
| `parseWorker.js` | `app.js` (por import) | Parsear el texto `.inp` fuera del hilo principal |
| `simWorker.js` | `app.js` (**persistente**) | Corrida del motor 1D; pre-calentado en la carga |

**Contratos de mensajes de los workers** (principal → worker):

- `parseWorker`: `{ text }` → postea `{type:'progress'|'done', model}` | `{type:'error'}`.
- `simWorker`: `{ type:'run', inpText, targetDurationMs, files? }` → postea `{type:'ready'}` (una vez, tras compilar el WASM), `{type:'log'|'err'}`, `{type:'done', rpt, outBuffer}` (ArrayBuffer transferible), `{type:'error'}`.

**Detener:** `stopSimulationWorker()` termina el worker, limpia el timer de progreso y restaura el botón Run.

## Ejecución en el motor

- **`simWorker.js`** — runner 1D bloqueante: escribe un `.inp` en MEMFS, llama `stride(engine, 10_000_000, …)` una vez para correr hasta completarse, lee `/rpt.rpt` y `/out.out`, transfiere los bytes.

## Resultados

**Parser binario `.out` — `swmmOutParser.js`:** lee el footer del archivo de salida SWMM (últimos seis INT32: `idNamesOffset, objPropsOffset, resultsOffset, numPeriods, errCode, magicEnd`), valida el magic `516114522`, parsea los headers y los conteos de variables, y expone **vistas `Float32Array` zero-copy** sobre los registros de periodo (`readResults`). Caminos calientes: `getTimeSeries(type,index,varIndex)` (cacheado) y `getStepData(type,step,varIndex)` para el coloreado del mapa por paso.

**Presentación — `results.js`:** el texto `.rpt` se parsea una vez en tablas resumen (`parseNodeDepths`, `parseLinkFlows`, `parseFlooding`, `parseNodeInflows`, `parseOutfallLoadings`, `parseConduitSurcharges`, `parseSubcatchmentRunoffs`, `parseContinuityErrors`, `parseEngineErrors`, `parseTimeSeries`). `ResultStyling` es dueño del coloreado: `applyToMapForStep(step)` pinta el mapa vía la vía binaria optimizada `.out` o el fallback `.rpt`. `displayResults` construye tarjetas KPI, chips de continuidad, leyendas de color, tablas de resultados ordenables/filtrables con minigráficos lazy vía `IntersectionObserver`, y fly-to al hacer clic.

**Gráficos:** `profile.js` `ProfilePlot.openForNodes` traza BFS por conductos, muestrea el terreno y dibuja un perfil hidráulico (código de color de capacidad: rojo ≥1.0 en carga, ámbar ≥0.85, cian normal). `plot.js` `TimeSeriesPlot` grafica series de tiempo multi-serie desde el binario `.out` (preferido) o con fallback `.rpt`.

## Los binarios distribuidos

`public/` contiene el build del motor (`swmm6wasm.js` + `swmm6wasm.wasm`).

El pegamento Emscripten exporta la fábrica **`createModule`**.

## Instanciación de módulo

El WASM se **compila una vez, se instancia por corrida** (~10–50 ms por re-instanciación):

```js
const module = await WebAssembly.compileStreaming(fetch('swmm6wasm.wasm')); // once
const factory = createModule({ noInitialRun: true,
    instantiateWasm: (imports, cb) => WebAssembly.instantiate(module, imports).then(m => cb(m.instance)) });
const engine = await factory();   // fresh instance each run
```

## API C exportada (símbolos en `EXPORTED_FUNCTIONS`)

**Ciclo de vida** (`swmm_engine_*`; máquina de estados `CREATED → OPENED → INITIALIZED → STARTED → [RUNNING] → ENDED → CLOSED`):

| Símbolo | Significado |
|---|---|
| `swmm_engine_create` / `destroy` | Asignar / liberar el handle del motor |
| `swmm_engine_open(engine, inp, rpt, out, plugin)` | Parsear el `.inp` |
| `swmm_engine_initialize` / `start` / `end` / `close` | Transiciones del ciclo de vida (`start` toma `save_results`) |
| `swmm_engine_step(engine, double* elapsed)` | Avanzar exactamente un paso de tránsito |
| `swmm_engine_stride(engine, n_steps, double* elapsed)` | Avanzar hasta `n` pasos en una llamada |
| `swmm_engine_report(engine)` | Escribir el archivo de reporte resumen |

Más `malloc`/`free` para la gestión de memoria JS↔WASM.

## Gestión de memoria

- Todos los punteros vienen de `Module._malloc(bytes)` y se liberan con `Module._free(ptr)`.
- Los archivos van al sistema de archivos virtual MEMFS de Emscripten: `FS.writeFile('/in.inp', inpText)`, `FS.readFile('/rpt.rpt', {encoding:'utf8'})`, `FS.readFile('/out.out')` que retorna un `Uint8Array` **vista sobre el heap del WASM**. El worker recorta una copia (`outBytes.buffer.slice(...)`) para que el buffer del heap pueda desprenderse en la transferencia.
