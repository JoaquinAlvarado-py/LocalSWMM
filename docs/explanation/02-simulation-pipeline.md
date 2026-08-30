# The Simulation Pipeline and the WASM Engine Bridge

How a simulation flows from the UI to the engine and back — the workers, the message contracts, and the WASM bridge that connects JavaScript to the C++ engine.

## End-to-end flow

Pressing **Run** (`#btn-run`, `ui.js:216`) walks this path:

```
Run button (#btn-run, ui.js:216)
  └─ window.runSimulation()                       app.js:1392
       ├─ guards: ≥1 node, ≥1 OUTFALL, SI units if 2D   app.js:1393-1406
       ├─ baseInpText = inpExporter.generateInp(Net)     app.js:1407
       ├─ if 2D mesh: inp = Mesh2DInp.buildInput(...)    app.js:1414-1422
       ├─ targetDuration = estimateSimDurationMs(...)    app.js:1427-1431 / 1083
       │
       ├─ [2D path] run2DSimulationInWorker(...)         app.js:1131
       │    ├─ default openSwmm2dWorker (f64 WASM engine — faithful) app.js:1133
       │    └─ WebGPU gpu2dWorker only when Net.useGpu2d === true (opt-in) app.js:1209-1221
       │    ├─ apply2DResults(result)                    app.js:1200
       │    └─ display2DResults(result)                  results.js:1291
       │
       └─ [1D path] runSimulationInWorker(inpText, …)    app.js:1233
            ├─ persistent simWorker.js (pre-warmed)      app.js:969/1304
            └─ fallback runSimulationOnMainThread        app.js:1307
            ├─ App.outData = new SWMMOutParser(out).parse()  app.js:1466
            └─ displayResults(rpt, outData)              results.js:790
```

The two backends share the same run surface but differ in fidelity: the WASM engine is the reference (f64, faithful), while the WebGPU marcher is an opt-in performance path (`Net.useGpu2d === true`) that re-implements the 2D explicit local-inertial solver on the GPU.

## Pre-flight validation

`runSimulation` (`app.js:1392-1489`) aborts with a warning if: no nodes; no `OUTFALL`; or a 2D mesh is present while units are US (`app.js:1402-1406` — 2D is SI-only).

## Duration estimate (cosmetic progress)

`estimateSimDurationMs(inpText, networkSize)` (`app.js:1083-1129`) parses `[OPTIONS]` START/END and `ROUTING_STEP` from the INP and extrapolates wall-clock time. The 1D Run-Status progress bar is driven by a `setInterval` against this estimate, capped at 99% then asymptoting to 100% (`app.js:1252-1271`).

## Web Workers

| Worker | Instantiated at | Role |
|---|---|---|
| `parseWorker.js` | `app.js:933` (per import) | Parse `.inp` text off-thread |
| `simWorker.js` | `app.js:969-978` (**persistent**) | 1D engine run; pre-warmed at load (`app.js:1304`) |
| `openSwmm2dWorker.js` | `app.js:1143` (per 2D run) | 1D+2D coupled engine + frame sampling (**default — the f64 reference**) |
| `webgpu/gpu2dWorker.js` | `app.js:1186` (per 2D run, **only if `Net.useGpu2d === true`**) | WebGPU f32 marcher (opt-in performance path) |

**Worker message contracts** (main → worker):

- `parseWorker`: `{ text }` → posts `{type:'progress'|'done', model}` | `{type:'error'}`.
- `simWorker`: `{ type:'run', inpText, targetDurationMs, files? }` → posts `{type:'ready'}` (once, after wasm compile), `{type:'log'|'err'}`, `{type:'done', rpt, outBuffer}` (transferable ArrayBuffer), `{type:'error'}`.
- `openSwmm2dWorker` / `gpu2dWorker`: `{ type:'run2d', inp, triangleIds, meshFile|null, triangleVertices, dryDepth, wantVertexFields, frameIntervalMs }` (+ optional transferred `wasmBinary`) → posts `{type:'status2d', stage}`, `{type:'stdout'|'stderr'}`, `{type:'progress2d', elapsedMs}`, `{type:'results2d', triangleIds, frames, diagnostics, report}` (buffers transferred), `{type:'error'}`.

**Worker lifecycle asymmetry:** the 1D worker is created once and reused (`simWorker.onerror` nulls it so the next run recreates it); the 2D workers are recreated every run and a failed WASM instance cannot be reused (`openSwmm2dWorker.js:376`).

**Stop:** `stopSimulationWorker()` (`app.js:1038-1059`) terminates both workers, clears the fake-progress timer, and restores the Run button.

## 1D vs 2D execution inside the engine

- **`simWorker.js`** — 1D-only blocking runner: writes one `.inp` to MEMFS, calls `stride(engine, 10_000_000, …)` once to run to completion, reads `/rpt.rpt` and `/out.out`, transfers the bytes. No frame sampling (`simWorker.js:76-81`).
- **`openSwmm2dWorker.js`** — 1D+2D runner: same lifecycle but advances in `stride(…, stepsPerYield=256)` chunks and **samples per-triangle frames in JS between strides** (`readFrame`, `openSwmm2dWorker.js:158-179`) — this is what produces the 2D animation timeline. Also reads 2D diagnostics (mass balance, solver steps, max velocity) and the report. No `.out` parsing on this path.
- **`webgpu/gpu2dWorker.js`** — same `results2d` contract, but the 2D advance runs on the GPU marcher (see the 2D mesh & WebGPU subsystem) instead of the WASM solver.

## Results

**`.out` binary parser — `swmmOutParser.js`:** reads the SWMM output-file footer (last six INT32s: `idNamesOffset, objPropsOffset, resultsOffset, numPeriods, errCode, magicEnd`), validates magic `516114522`, parses headers and variable counts, and exposes **zero-copy `Float32Array` views** over period records (`readResults`, `swmmOutParser.js:132-180`). Hot paths: `getTimeSeries(type,index,varIndex)` (cached, `:184-209`) and `getStepData(type,step,varIndex)` for per-step map coloring (`:212-230`).

**Presentation — `results.js`:** `.rpt` text is parsed once into summary tables (`parseNodeDepths`, `parseLinkFlows`, `parseFlooding`, `parseNodeInflows`, `parseOutfallLoadings`, `parseConduitSurcharges`, `parseSubcatchmentRunoffs`, `parseContinuityErrors`, `parseEngineErrors`, `parseTimeSeries` — `results.js:59-366`). `ResultStyling` (`results.js:369-547`) owns coloring: `applyToMapForStep(step)` (`:402-518`) paints 2D mesh frames first, then the optimized binary `.out` path, then the `.rpt` fallback. `displayResults` (`:790-1288`) builds KPI cards, continuity chips, color legends, sortable/filterable result tables with `IntersectionObserver` lazy sparklines, and fly-to-on-click. `display2DResults` (`:1291-1492`) colors the mesh per frame, exposes a depth/head/velocity selector, and drives the same time slider via a synthetic time series.

**Plotting:** `profile.js` `ProfilePlot.openForNodes` (`:630`) BFS-traces conduits, samples terrain, and draws a hydraulic profile (capacity color coding: red ≥1.0 surcharged, amber ≥0.85, cyan normal). `plot.js` `TimeSeriesPlot` (`:227`) charts multi-series time series from binary `.out` (preferred) or `.rpt` fallback.

## The shipped binaries

`public/` contains **two identical engine builds** (same factory, same size 4,614,086 bytes, same stamp):

- `openswmm2d.js` + `openswmm2d.wasm` — used by `openSwmm2dWorker.js`, `gpu2dWorker.js`, and all `scripts/*.mjs`.
- `swmm6wasm.js` + `swmm6wasm.wasm` — a copy used by `simWorker.js` (legacy name).

Both are 2-line Emscripten glue exporting the factory **`createOpenSwmm2D`** (`swmm6wasm.js:1-2`). The `.version.json` files record the engine commit/describe/date (written by the build script).

## Module instantiation

The wasm is **compiled once, instantiated per run** (~10–50 ms per re-instantiation, per `simWorker.js:8-12`):

```js
// simWorker.js:19-63 (condensed)
const module = await WebAssembly.compileStreaming(fetch('swmm6wasm.wasm')); // once
const factory = createOpenSwmm2D({ noInitialRun: true,
    instantiateWasm: (imports, cb) => WebAssembly.instantiate(module, imports).then(m => cb(m.instance)) });
const engine = await factory();   // fresh instance each run
```

`wasm/openswmm2d_exports.cpp` is deliberately **source-only** (6 lines): it includes the engine's public headers and nothing else, so Emscripten exports the C API as library functions without pulling in `main`/run lifecycle.

## Exported C API (31 symbols in `EXPORTED_FUNCTIONS`)

**Lifecycle** (`swmm_engine_*`; state machine `CREATED → OPENED → INITIALIZED → STARTED → [RUNNING] → ENDED → CLOSED` per `openswmm_engine.h:31-37`):

| Symbol | Meaning |
|---|---|
| `swmm_engine_create` / `destroy` | Allocate / free the engine handle |
| `swmm_engine_open(engine, inp, rpt, out, plugin)` | Parse the `.inp` (+ optional plugin lib, always `0` in wasm) |
| `swmm_engine_initialize` / `start` / `end` / `close` | Lifecycle transitions (`start` takes `save_results`) |
| `swmm_engine_step(engine, double* elapsed)` | Advance exactly one routing step |
| `swmm_engine_stride(engine, n_steps, double* elapsed)` | Advance up to `n` steps in one call |
| `swmm_engine_report(engine)` | Write the summary report file |

**2D accessors** (`swmm_2d_*`): `swmm_2d_triangle_count`, `swmm_2d_get_depths_bulk`, `swmm_2d_get_heads_bulk`, `swmm_2d_get_stat_max_velocities`, `swmm_2d_get_continuity_error`, `swmm_2d_get_solver_steps` (+ legacy `swmm_2d_get_cvode_steps`), `swmm_2d_get_mass_balance` (10 double terms), and optional vertex/edge accessors (`swmm_2d_vertex_count`, `swmm_2d_vertex_get_xyz_bulk`, `swmm_2d_edge_get_geometry_bulk`, `swmm_2d_get_edge_flux_bulk`, `swmm_2d_vertex_get_render_depths_bulk`, `swmm_2d_vertex_get_heads_bulk`).

**1D node access/control** (`swmm_node_*`): `swmm_node_count`, `swmm_node_get_heads/depths/volumes_bulk`, `swmm_node_set_lateral_inflow`, `swmm_node_set_pond_area` — used by the WebGPU split to feed 1D↔2D exchange back into the engine.

Plus `malloc`/`free` for JS↔wasm memory management.

## JS wrapper layer — `openSwmm2dWorker.js`

- `bindApi(Module)` (`:79-107`) wraps every symbol with `Module.cwrap`; `optional()` returns `null` for symbols absent from a build, so one worker handles multiple engine configurations.
- `check(code, op, Module, reportPath, payload)` (`:109-148`) throws rich errors; on failure it dumps the `.rpt` (filtered error lines or last 1500 chars) and the first 3000 chars of the INP as `stderr` messages — this is your first stop when a simulation "fails silently".
- `readFrame(Module, api, engine, count, elapsedMs)` (`:158-179`) mallocs depth/head/velocity arrays, bulk-reads them, returns Float64Arrays, frees in `finally`.
- `readVelocity(...)` (`:196-229`) reconstructs **cell-centered physical velocity** from edge flux + edge geometry via a least-squares solve of `(NᵀN)v = Nᵀq` (q = flux/length), converting specific discharge to velocity (`/h`); dry cells (`h ≤ dryDepth`) are zeroed.
- `readDiagnostics(...)` (`:231-257`) reads mass balance, solver internal steps, max-velocity stats.
- `run(payload)` (`:259-368`) is the 2D run loop: write `/model2d.inp` (+ optional mesh file) → lifecycle `open→initialize→start` with `check()` after each → `do/while` `stride(engine, 256, …)` sampling frames at `frameIntervalMs` → final frame + diagnostics → `end→report` → post `results2d`.

## Memory management

- All pointers come from `Module._malloc(bytes)` and are freed with `Module._free(ptr)`; scalar reads use `Module.getValue(ptr, 'double'|'i32')`; the code never touches raw HEAP views directly.
- Files go to the Emscripten MEMFS virtual filesystem: `FS.writeFile('/in.inp', inpText)`, `FS.readFile('/rpt.rpt', {encoding:'utf8'})`, `FS.readFile('/out.out')` returning a `Uint8Array` **view on the wasm heap**. The worker slices a copy out (`outBytes.buffer.slice(...)`, `simWorker.js:162`) so the heap buffer can be detached on transfer.
- 2D worker unlinks its temp files in `finally` (`openSwmm2dWorker.js:364-366`).
