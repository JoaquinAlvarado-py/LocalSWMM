# The Simulation Pipeline and the WASM Engine Bridge

How a simulation flows from the UI to the engine and back — the worker, the message contracts, and the WASM bridge that connects JavaScript to the C++ engine.

## End-to-end flow

Pressing **Run** (`#btn-run`, `ui.js:216`) walks this path:

```
Run button (#btn-run, ui.js:216)
  └─ window.runSimulation()                       app.js
       ├─ guards: ≥1 node, ≥1 OUTFALL
       ├─ inpText = inpExporter.generateInp(Net)
       ├─ targetDuration = estimateSimDurationMs(...)
       │
       └─ runSimulationInWorker(inpText, …)
            ├─ persistent simWorker.js (pre-warmed)
            └─ fallback runSimulationOnMainThread
            ├─ App.outData = new SWMMOutParser(out).parse()
            └─ displayResults(rpt, outData)              results.js
```

## Pre-flight validation

`runSimulation` aborts with a warning if: no nodes; or no `OUTFALL` node is present.

## Duration estimate (cosmetic progress)

`estimateSimDurationMs(inpText, networkSize)` parses `[OPTIONS]` START/END and `ROUTING_STEP` from the INP and extrapolates wall-clock time. The Run-Status progress bar is driven by a `setInterval` against this estimate, capped at 99% then asymptoting to 100%.

## Web Workers

| Worker | Instantiated at | Role |
|---|---|---|
| `parseWorker.js` | `app.js` (per import) | Parse `.inp` text off-thread |
| `simWorker.js` | `app.js` (**persistent**) | 1D engine run; pre-warmed at load |

**Worker message contracts** (main → worker):

- `parseWorker`: `{ text }` → posts `{type:'progress'|'done', model}` | `{type:'error'}`.
- `simWorker`: `{ type:'run', inpText, targetDurationMs, files? }` → posts `{type:'ready'}` (once, after WASM compile), `{type:'log'|'err'}`, `{type:'done', rpt, outBuffer}` (transferable ArrayBuffer), `{type:'error'}`.

**Stop:** `stopSimulationWorker()` terminates the worker, clears the progress timer, and restores the Run button.

## Engine execution

- **`simWorker.js`** — 1D blocking runner: writes `.inp` to MEMFS, calls `stride(engine, 10_000_000, …)` once to run to completion, reads `/rpt.rpt` and `/out.out`, transfers the bytes.

## Results

**`.out` binary parser — `swmmOutParser.js`:** reads the SWMM output-file footer (last six INT32s: `idNamesOffset, objPropsOffset, resultsOffset, numPeriods, errCode, magicEnd`), validates magic `516114522`, parses headers and variable counts, and exposes **zero-copy `Float32Array` views** over period records (`readResults`). Hot paths: `getTimeSeries(type,index,varIndex)` (cached) and `getStepData(type,step,varIndex)` for per-step map coloring.

**Presentation — `results.js`:** `.rpt` text is parsed once into summary tables (`parseNodeDepths`, `parseLinkFlows`, `parseFlooding`, `parseNodeInflows`, `parseOutfallLoadings`, `parseConduitSurcharges`, `parseSubcatchmentRunoffs`, `parseContinuityErrors`, `parseEngineErrors`, `parseTimeSeries`). `ResultStyling` owns coloring: `applyToMapForStep(step)` paints the map based on the binary `.out` path or `.rpt` fallback. `displayResults` builds KPI cards, continuity chips, color legends, sortable/filterable result tables with `IntersectionObserver` lazy sparklines, and fly-to-on-click.

**Plotting:** `profile.js` `ProfilePlot.openForNodes` BFS-traces conduits, samples terrain, and draws a hydraulic profile (capacity color coding: red ≥1.0 surcharged, amber ≥0.85, cyan normal). `plot.js` `TimeSeriesPlot` charts multi-series time series from binary `.out` (preferred) or `.rpt` fallback.

## The shipped binaries

`public/` contains the engine build (`swmm6wasm.js` + `swmm6wasm.wasm`).

The Emscripten glue exports the factory **`createModule`**.

## Module instantiation

The WASM binary is **compiled once, instantiated per run** (~10–50 ms per re-instantiation):

```js
const module = await WebAssembly.compileStreaming(fetch('swmm6wasm.wasm')); // once
const factory = createModule({ noInitialRun: true,
    instantiateWasm: (imports, cb) => WebAssembly.instantiate(module, imports).then(m => cb(m.instance)) });
const engine = await factory();   // fresh instance each run
```

## Exported C API (symbols in `EXPORTED_FUNCTIONS`)

**Lifecycle** (`swmm_engine_*`; state machine `CREATED → OPENED → INITIALIZED → STARTED → [RUNNING] → ENDED → CLOSED`):

| Symbol | Meaning |
|---|---|
| `swmm_engine_create` / `destroy` | Allocate / free the engine handle |
| `swmm_engine_open(engine, inp, rpt, out, plugin)` | Parse the `.inp` |
| `swmm_engine_initialize` / `start` / `end` / `close` | Lifecycle transitions (`start` takes `save_results`) |
| `swmm_engine_step(engine, double* elapsed)` | Advance exactly one routing step |
| `swmm_engine_stride(engine, n_steps, double* elapsed)` | Advance up to `n` steps in one call |
| `swmm_engine_report(engine)` | Write the summary report file |

Plus `malloc`/`free` for JS↔WASM memory management.

## Memory management

- All pointers come from `Module._malloc(bytes)` and are freed with `Module._free(ptr)`.
- Files go to the Emscripten MEMFS virtual filesystem: `FS.writeFile('/in.inp', inpText)`, `FS.readFile('/rpt.rpt', {encoding:'utf8'})`, `FS.readFile('/out.out')` returning a `Uint8Array` **view on the WASM heap**. The worker slices a copy out (`outBytes.buffer.slice(...)`) so the heap buffer can be detached on transfer.
