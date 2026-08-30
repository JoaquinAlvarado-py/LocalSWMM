# Server-side migration brief — running the LocalSWMM engine on a server

Research notes on the planned migration of the OpenSWMM engine from browser-only (WASM)
to a native service that executes corridas on the server. The plan is already documented
in `CONTEXT.md`; this brief grounds it in the code that exists today and surfaces the
realistic considerations for the move.

Domain terms follow `CONTEXT.md` (corrida, pool de workers del motor, EngineClient,
Modo local / Modo API, estado del sistema, progreso de corrida, resultados de corrida).

---

## 1. Today — client-only architecture

### 1.1 What runs in the browser

Everything: the UI, the mesher, the engine, the results. The only server in the repo is
`server.py`, a zero-dependency Python stdlib static server + one health endpoint.

- `server.py` binds `127.0.0.1:8080`, serves `<repo>/public`, and exposes a single JSON
  endpoint `GET /api/status` → `{"status":"running","msg":"3D Map Prototype Server Online"}`.
  Everything else is static GET. CORS `Access-Control-Allow-Origin: *` on OPTIONS + `/api/status`.
  (`docs/reference/06-api-endpoints.md:3,19-43`; `server.py:27-35`).
- The worktree copy on branch `website` (`/home/nekzoh/Dev/LocalSWMM-network3d/server.py`) is
  identical except it also sends the COOP/COEP cross-origin-isolation headers in
  `end_headers()` (needed by the threaded WASM build's SharedArrayBuffer); the main-branch
  `server.py` omits them and relies on `public/_headers` in production.
- The app is described as **"No backend"** in three places:
  `docs/reference/03-technology-stack.md:9`, `docs/explanation/01-architecture.md:13`,
  `docs/tutorials/01-getting-started.md:20`.

### 1.2 The exact data flow of a 1D run

`runSimulation` (`public/app.js:1341`) is the entry point wired to the Run button
(`ui.js` → `#btn-run`). Walkthrough:

1. **Guards** — ≥1 node, ≥1 `OUTFALL`, and SI units if a 2D mesh is present
   (`app.js:1343-1355`).
2. **Net → .inp** — `window.inpExporter.generateInp(Net)` serializes the in-memory network
   into an `.inp` text string (`app.js:1356`).
3. **Duration estimate** — `estimateSimDurationMs(inpText, networkSize)` parses
   `[OPTIONS]` START/END and `ROUTING_STEP` to predict wall-clock time; used only to drive
   the cosmetic progress bar (`app.js:1062-1108`, `app.js:1377-1380`).
4. **Dispatch to `simWorker.js`** — a **persistent** Web Worker that pre-warms at page
   load: it fetches + compiles `swmm6wasm.wasm` once and re-instantiates a fresh engine
   per run (~10–50 ms) (`app.js:948-957`, `app.js:1252-1253`; `simWorker.js:16-37`).
   Message contract: `{type:'run', inpText, files?}` → `{type:'ready'|'log'|'err'|'done'|'error'}`
   (`docs/explanation/02-simulation-pipeline.md:52`).
5. **In the worker** — write `/in.inp` to Emscripten MEMFS, drive the exported C API
   `swmm_engine_create → open → initialize → start → stride(…, 10_000_000, …) → end → report
   → close → destroy`, then read `/rpt.rpt` (text) and `/out.out` (binary bytes) back out
   of MEMFS (`simWorker.js:83-165`). The single `stride` runs the whole sim blocking; no
   incremental progress is produced (`simWorker.js:76-81`).
6. **Transfer to main thread** — `{type:'done', rpt, outBuffer}` with the `outBuffer`
   ArrayBuffer transferred (`simWorker.js:169`). A main-thread fallback exists for
   environments without workers (`app.js:1256-1339`).
7. **Results parsing** — `new SWMMOutParser(outBuffer).parse()` produces zero-copy
   `Float32Array` views over per-period records (`swmmOutParser.js:132-180`); stored as
   `window.App.outData` (`app.js:1415-1421`).
8. **Presentation** — `displayResults(rpt, outData)` builds KPI cards, tables, sparklines
   and colors the map (`results.js:790-1288`); `.rpt` is parsed into summary tables by
   `parseNodeDepths`, `parseLinkFlows`, `parseFlooding`, etc. (`results.js:59-366`).

### 1.3 The 2D run flow

`run2DSimulationInWorker` (`app.js:1110-1157`) adds a mesh:

1. **Mesh serialization** — `Mesh2DInp.buildInput(baseInp, Net.mesh2D, map)` (`app.js:1364`).
   For the default/external path it delegates to `Mesh2DExport.buildExternal(...)` which
   writes the mesh to a **separate `.2dm` mesh file** referenced from the `.inp`
   (`mesh2dInp.js:162-211`, default `meshFileName` `'mesh.2dm'`). So a 2D model is
   `.inp` **plus** a mesh file, both needed by the engine.
2. **A fresh `openSwmm2dWorker.js` per run** (recreated each run; a failed WASM instance is
   never reused) (`app.js:1116-1119`, `docs/explanation/02-simulation-pipeline.md:55`).
3. **Frame sampling between strides** — the worker advances the engine in
   `stride(…, stepsPerYield=256)` chunks and between strides mallocs + bulk-reads per-triangle
   `depth/head/velocity` via `swmm_2d_get_depths_bulk` etc. (`openSwmm2dWorker.js:257-331`,
   `readFrame` at `:158-179`). Frames are collected at a `frameIntervalMs` cadence (default
   60000 ms sim-time) and transferred to the main thread as transferable Float64Array buffers.
4. **Presentation** — `apply2DResults` writes depth/head/velocity back into the mesh cells and
   `display2DResults` colors the mesh per frame and drives a time slider
   (`app.js:1159-1180`, `results.js:1291-1492`).

An opt-in **WebGPU** backend (`Net.useGpu2d === true`, `webgpu/gpu2dWorker.js`) re-implements
the 2D explicit local-inertial solver in WGSL on the client GPU — browser-only by nature
(`docs/explanation/02-simulation-pipeline.md:30,63`; `docs/explanation/04-two-d-mesh-and-webgpu.md:9`).

### 1.4 The engine binary and build path

- **Two identical engine builds** ship in `public/` (same 4,614,086 bytes):
  `openswmm2d.{js,wasm}` (used by `openSwmm2dWorker.js`, `gpu2dWorker.js`, `scripts/*.mjs`)
  and `swmm6wasm.{js,wasm}` (a legacy-named copy used by `simWorker.js`)
  (`docs/explanation/02-simulation-pipeline.md:73-80`).
- Both export the factory `createOpenSwmm2D` via 2-line Emscripten glue (`swmm6wasm.js:1-2`).
- Built by `scripts/build-openswmm2d.sh` targeting **`wasm32-emscripten`** with vcpkg
  (deps: eigen3, hdf5, nlohmann-json, sundials), `OPENSWMM_BUILD_2D=ON`,
  `OPENSWMM_FORCE_SCALAR=ON` (no SIMD on wasm32), OpenMP off, `OPENSWMM_BUILD_CLI=OFF`,
  `OPENSWMM_BUILD_SHARED=OFF`, `OPENSWMM_BUILD_TESTS=OFF` (`scripts/build-openswmm2d.sh:36-56`;
  `docs/how-to/03-build-from-source.md:36-55`).
- The wasm-specific wrapper `cmake/wasm/CMakeLists.txt` adds `-pthread` +
  `PTHREAD_POOL_SIZE=4` — the OpenMP loops map to Emscripten pthreads on a SharedArrayBuffer,
  which is what forces the COOP/COEP cross-origin isolation requirement
  (`docs/how-to/03-build-from-source.md:56`).
- **31 exported C API symbols** (`swmm_engine_*`, `swmm_2d_*`, `swmm_node_*`, `malloc/free`)
  are the entire bridge between JS and the engine; `wasm/openswmm2d_exports.cpp` is a
  deliberately source-only TU so Emscripten never pulls in `main`
  (`docs/explanation/02-simulation-pipeline.md:94-113`).
- The engine is a pinned git submodule (`third_party/openswmm-engine`, fork of
  HydroCouple `openswmm.engine`, pinned commit carries an Emscripten-compat fix —
  `docs/how-to/03-build-from-source.md:107-120`).

---

## 2. The planned server-side architecture (per CONTEXT.md)

`CONTEXT.md:3` states the plan verbatim: *"el plan de escalamiento añade una vía
servidor-side: un servicio nativo con pool de workers que ejecuta corridas, una API para
consumirlas y un estado agregado para monitorear todo."* The glossary doc
(`docs/reference/08-glossary.md`) and the Spanish mirror (`docs/es/reference/08-glosario.md`)
spell out the terms; there is **no implementation yet** — a grep for `EngineClient`,
`modo api`, `api_mode`, etc. across the repo only hits `CONTEXT.md` and the glossary docs.

### 2.1 The pieces as defined

| Term | Definition (CONTEXT.md) |
|---|---|
| **Corrida** | A complete simulation run with lifecycle **encolada → corriendo → terminada (o fallida)**, identified by an ID; what the user fires with Run (`CONTEXT.md:7-9`). |
| **Pool de workers del motor** | A set of **native processes on the server**, one per core, taking work from a queue (`CONTEXT.md:11-13`). |
| **EngineClient** | Frontend seam between the UI and the engine, with two switchable implementations: **local** (WASM in browser) and **remote** (via API) (`CONTEXT.md:15-17`). |
| **Modo local / Modo API** | The two execution paths: offline browser WASM vs server engine via API (**default**) (`CONTEXT.md:19-20`). |
| **Estado del sistema** | Aggregated health endpoint: app version, worker-pool state, active corridas; for scripts/CI/debug (`CONTEXT.md:22-24`). Note: this is an **evolution of the existing `GET /api/status`** endpoint. |
| **Progreso de corrida** | Live state of a corrida: sim-time reached, fraction of total, phase; queried by ID; what Run Status paints (`CONTEXT.md:26-27`). |
| **Resultados de corrida** | Finished product of a corrida: JSON tables (1D series per node/link/subcatchment and 2D frames captured live) plus the binary `.out` and `.rpt` for export (`CONTEXT.md:29-30`). |

### 2.2 How it maps onto the engine today

The native service needs almost nothing new from the engine. The exported C API the browser
already drives is the same API a native host process would call:

- Lifecycle: `swmm_engine_create/open/initialize/start/step/stride/end/report/close/destroy`
  (`include/openswmm/engine/openswmm_engine.h`, documented at
  `docs/explanation/02-simulation-pipeline.md:98-107`).
- **Native progress primitives already exist** — better than the browser path:
  - `swmm_engine_run_with_callback(..., SWMM_ProgressCallback, void*)` runs a full sim with a
    progress callback (`openswmm_engine.h:278-281`).
  - `swmm_set_progress_callback` fires `(engine, elapsed_frac, sim_time, user_data)` —
    **exactly** the `progreso de corrida` data (sim-time + fraction) (`openswmm_callbacks.h:81-86`).
  - `swmm_set_step_begin_callback` / `swmm_set_step_end_callback` fire per timestep with
    `sim_time` and `dt` — the hook a native runner would use to **capture 2D frames live**
    (mirroring what `openSwmm2dWorker.js` does between strides) (`openswmm_callbacks.h:128-151`).
  - `swmm_set_warning_callback` for live warnings (`openswmm_callbacks.h:106-111`).
- The 2D bulk accessors (`swmm_2d_triangle_count`, `swmm_2d_get_depths_bulk`,
  `swmm_2d_get_heads_bulk`, `swmm_2d_get_stat_max_velocities`, `swmm_2d_get_mass_balance`,
  vertex/edge accessors) are the same calls the browser worker uses to build frames
  (`docs/explanation/02-simulation-pipeline.md:109`; `openSwmm2dWorker.js:92-106`).

So the server-side service is essentially a **native host loop over the same C API**,
running in a process per core. The "one per core" design matches the engine's own threading
story: in the browser, OpenMP loops are emulated with Emscripten pthreads
(`docs/how-to/03-build-from-source.md:56`); natively they would just use OpenMP directly
(the CLI already supports the step loop — `src/cli/main.cpp:110-127`).

### 2.3 The API surface implied by the language

- `POST` submit a corrida (`.inp` text + auxiliary `files`, and for 2D the mesh `.2dm`) →
  returns a **corrida ID**; lifecycle **encolada → corriendo → terminada/fallida**.
- `GET` progreso de corrida by ID → sim-time, fraction, phase (and 2D frames streamed live).
- `GET` resultados de corrida by ID → JSON tables (1D series per node/link/subcatchment +
  2D frames) + `.out` / `.rpt` blobs for export.
- `GET` estado del sistema → app version, pool state, active corridas (extends today's
  `/api/status`).
- Queue + pool: the pool de workers pulls corridas off a queue, one native process per core.

### 2.4 The EngineClient seam

Today the seam does not exist in code — `app.js` calls `simWorker.js` / `openSwmm2dWorker.js`
directly. The migration introduces `EngineClient` with two implementations:

- **Modo local**: the current workers (unchanged behavior; offline).
- **Modo API** (**default**): the same `runSimulation` entry point submits the corrida over
  the API instead of posting to a worker, and the same progress/results handlers consume
  API responses. The 1D and 2D paths collapse into one client surface: both produce the
  `resultados de corrida` shape (JSON series + frames + `.out`/`.rpt`), so the GUI layers
  (`results.js`, `swmmOutParser.js`) stay reusable.

---

## 3. What changes for the GUI, what stays the same

### Stays the same

- **Model editing, meshing, `.inp` generation** — all still client-side:
  `inpExporter.generateInp(Net)` (`app.js:1356`) and `Mesh2DInp.buildInput` + Triangle WASM
  meshing (`mesh2dInp.js:162-211`) stay in the browser; the client uploads the finished
  `.inp` (+ `.2dm` mesh file + rain files). The server does not need the network model.
- **Results presentation** — `displayResults` / `display2DResults` / `ResultStyling`
  (`results.js:790-1288`, `:1291-1492`, `:369-547`) are unchanged; they consume the same
  shapes (outData + frames + rpt).
- **Run Status modal** — same UI; only the source of progress changes (see below).
- **Guard rails** — node/OUTFALL/SI-units-for-2D checks stay in `runSimulation`
  (`app.js:1343-1355`).
- **`.out` parsing** — `SWMMOutParser` stays in the browser even in API mode, unless the
  server pre-converts `.out` → JSON (see §4.4).

### Changes

- **Progress is real instead of cosmetic.** Today the 1D bar is a fake time-based estimate:
  `simWorker` never posts progress, and `app.js:1224-1226` explicitly ignores any
  `'progress'` message; the bar is a `setInterval` against `estimateSimDurationMs`
  (`app.js:1196-1220`; confirmed as "dead protocol" in `docs/how-to/07-troubleshoot.md:51`).
  In Modo API the bar can be driven by the real `progreso de corrida` (sim-time + fraction)
  polled by corrida ID — this is the biggest UX win and also benefits the 2D path, which
  today posts `progress2d` only as console debug (`app.js:1132`).
- **2D frames stream over HTTP instead of a `postMessage` transfer.** Today frames are
  transferred as transferable ArrayBuffers (zero-copy, same process)
  (`openSwmm2dWorker.js:334-346`). In API mode each frame (Float64Arrays: depth/head/velocity
  per triangle) must be serialized and shipped. Mitigations: binary encoding (JSON arrays of
  doubles are wasteful), sampling cadence control (today `frameIntervalMs=60000` sim-time,
  `app.js:1154`), and only shipping final + animation frames.
- **Stop semantics.** Today Stop terminates the worker process
  (`stopSimulationWorker`, `app.js:1017-1038`). In API mode Stop becomes a cancel request to
  the server (kill the worker's corrida / remove from queue); the UI handler stays but its
  target moves.
- **Engine version stamping** — currently fetched client-side from
  `openswmm2d.version.json` (`app.js:1111-1114`); in API mode the server's engine version
  becomes part of `estado del sistema`.
- **Offline.** Modo local must keep working (the seam exists precisely to keep the offline
  WASM path); so the shipped `.wasm` binaries remain in the repo.

---

## 4. Realistic considerations

### 4.1 Where the native engine build comes from

- The repo **already builds the engine natively as a side effect**: the submodule is the
  upstream HydroCouple `openswmm.engine`, whose own CMake builds `openswmm_engine`,
  `openswmm_legacy_engine`, `openswmm_plugin_sdk`, and **`openswmm_cli`** natively
  (`src/CMakeLists.txt:25-28`). The wasm build is the *modified* path: it disables
  `OPENSWMM_BUILD_CLI`, `OPENSWMM_BUILD_SHARED`, OpenMP, and forces scalar
  (`scripts/build-openswmm2d.sh:36-56`).
- A native service build is therefore a **plain host-toolchain CMake build** of the same
  submodule with `OPENSWMM_BUILD_2D=ON`, OpenMP **enabled** (the browser's pthread
  emulation becomes real threads), SIMD allowed (drop `OPENSWMM_FORCE_SCALAR`), and
  `OPENSWMM_BUILD_CLI=ON` or a thin custom host binary that wraps the C API with the
  callbacks from §2.2. The C API is `SWMM_ENGINE_API` C89-compatible
  (`openswmm_engine.h:75`), so a C host (or C++/Python ctypes) can drive it directly.
- Watch out: the pinned submodule commit carries an **Emscripten-only compatibility fix**
  (`PluginFactory.cpp` dlopen shims, static linking under `EMSCRIPTEN`,
  `docs/how-to/03-build-from-source.md:107-120`). Those `#ifdef __EMSCRIPTEN__` branches are
  inert natively, but the native build needs its own verification that `PluginFactory`
  dynamic plugin loading (`dlopen`/`dlsym`) works on the target OS — that is the code path
  the wasm build bypasses.
- Alternative that avoids shipping a native binary at all: run the **wasm build under a JS
  runtime** (Node) per worker. The repo already runs the wasm engine in plain Node for
  reference scripts (`docs/reference/07-scripts-and-benchmarks.md:5`); however the shipped
  wasm is pthread/SAB-flavored for the browser and needs a non-threaded build for Node
  (`docs/how-to/03-build-from-source.md:56`). Native is the better fit for the "one process
  per core" pool and is what CONTEXT.md describes.

### 4.2 HDF5 / `.out` handling

- The engine writes two outputs today: the legacy **SWMM 5.x binary `.out`** via
  `DefaultOutputPlugin` (`src/engine/plugins/DefaultOutputPlugin.cpp:19-30`) and the text
  `.rpt` via `DefaultReportPlugin`. The `.out` is what the client parses with `SWMMOutParser`
  (`swmmOutParser.js:28-63`).
- **HDF5 is for 2D** — the `Default2DOutputPlugin` writes 2D mesh geometry + time-varying
  state to an HDF5 file following CF-1.11/UGRID-1.0 conventions
  (`src/engine/2d/output/Default2DOutputPlugin.hpp:18-31`; the `hdf5` vcpkg dep is "needed by
  the 2D module's Default2DOutputPlugin", `docs/how-to/03-build-from-source.md:66`). In the
  browser this plugin is not what feeds the animation (frames come from the bulk accessors
  sampled live), but a native runner that enables it will produce large HDF5 files on disk —
  size/cleanup policy needed per corrida.
- **Same C API = same bytes**: because the native process uses the same engine code, the
  `.out` and `.rpt` formats are identical to the browser's, so the client's existing
  `SWMMOutParser` + `.rpt` parsers (`results.js:59-366`) keep working unchanged on files
  served back. Server-side conversion to JSON (`resultados de corrida`) is optional
  optimization (see §4.4) — the format is already understood client-side.

### 4.3 2D frames transfer

- Frames are `Float64Array` per-triangle depth/head/velocity (+ optional vertex fields +
  reconstructed cell velocities via the least-squares solve, `openSwmm2dWorker.js:196-229`).
  Sizes scale as `triangles × 3 × 8 bytes` per frame. For a 5k-triangle mesh that is ~120 KB
  per frame; a 48 h model at 1-min sim-time frames is ~2900 frames → ~350 MB if every frame
  is kept. Today all frames ride one `postMessage` (transferables, zero-copy)
  (`openSwmm2dWorker.js:334-346`).
- Over HTTP this must be tamed: (a) `frameIntervalMs` is already configurable
  (`app.js:1154`), (b) store frames as `Float32Array` (the renderer already tolerates
  precision loss; the 1D `.out` path already uses f32 — `swmmOutParser.js:163-178`),
  (c) stream frames incrementally (progress endpoint + a per-frame resource) instead of one
  giant JSON body, and (d) cap/decimate the retained animation timeline. The WebGPU marcher's
  f32 frames set the precedent that f32 is acceptable for presentation
  (`docs/explanation/02-simulation-pipeline.md:30`).

### 4.4 Concurrency, queueing, and the API server itself

- Today's server is `ThreadingTCPServer` with `daemon_threads=True` and zero API routes
  (`server.py:44-51`). A native pool service needs: a **queue** (encolada state), **one
  process per core** (corridas are long-running and must not share process state — a crash
  must not take down the service), per-corrida **cancel**, and **result persistence**
  (`.out`/`.rpt`/frames/JSON keyed by corrida ID).
- The engine is already stress-tested for concurrent simulation
  (`python/tests/engine/test_concurrent_simulation.py` in the submodule) and is
  multi-threaded internally via OpenMP; the pool adds process-level parallelism on top.
- **Procesos, no threads** is the stated design ("Conjunto de procesos nativos", `CONTEXT.md:11-13`)
  — this matters because the C API is a single global-ish handle and because a crashed
  solver (numerical blow-up, `ExitStatus` handling in `simWorker.js:142-150`) must not poison
  the pool.
- The existing `/api/status` endpoint (`server.py:27-35`) is the seed of `estado del
  sistema`; keep its shape (`{"status": ..., "msg": ...}`) for backward compat with the
  scripts that auto-probe it (`docs/reference/06-api-endpoints.md:17`).
- CORS: today `Access-Control-Allow-Origin: *` on OPTIONS/status (`server.py:20-25`) works
  for a static site; a POST/streaming API needs CORS widened to the app origin(s) and
  CSRF/auth consideration.

### 4.5 Security / tenancy

- **Arbitrary `.inp` upload is arbitrary code execution risk**: the engine parses file
  inputs and links in optional plugin libs (`swmm_engine_open(..., input_plugin_lib)` —
  `openswmm_engine.h:255-262`). A native service that accepts user `.inp` must sandbox each
  worker process (container / user per process, seccomp, resource limits) — the same
  reasoning that motivates one process per core.
- **Resource exhaustion**: a corrida can request huge simulation extents; the pool needs
  per-corrida CPU-time / memory / wall-clock caps (the browser analog is the
  `MAX_ITERATIONS` safety limit in `openSwmm2dWorker.js:303-321`).
- **Tenancy / data**: `.inp` files may embed rain gage time series (user data) and reference
  local files; uploaded aux files (`files` in the worker contract, `simWorker.js:86-91`) and
  results must be isolated per corrida (no cross-corrida reads). No auth model exists today
  (local single-user app); the API mode implies at minimum per-deployment auth or a
  trusted-network posture.
- **Cross-origin isolation is no longer required in API mode** — the browser stops loading
  the threaded wasm, so the COOP/COEP headers (`server.py` worktree copy; `public/_headers`)
  become unnecessary *for that path* but must remain for Modo local.

---

## Citations (primary sources)

- `CONTEXT.md` — the scaling plan and domain language (lines 3-30).
- `docs/reference/08-glossary.md`, `docs/es/reference/08-glosario.md` — glossary expansion.
- `docs/reference/06-api-endpoints.md` — the current server's API surface; `server.py` source (lines 59-114).
- `server.py` (main) and `/home/nekzoh/Dev/LocalSWMM-network3d/server.py` (worktree, `website` branch) — static + `/api/status` only.
- `docs/explanation/02-simulation-pipeline.md` — end-to-end run flow, worker contracts, exported C API, `.out`/`.rpt` handling.
- `public/app.js` — `runSimulation` (1341), `runSimulationInWorker` (1182), `run2DSimulationInWorker` (1110), `apply2DResults` (1159), `stopSimulationWorker` (1017), estimateSimDurationMs (1062).
- `public/simWorker.js` — 1D runner: MEMFS I/O, C API call sequence (83-165), `.out` transfer (159-172).
- `public/openSwmm2dWorker.js` — 2D runner: stride loop + frame sampling (257-359), `bindApi` (79-107), `readFrame` (158-179).
- `public/swmmOutParser.js` — `.out` binary parser (28-230).
- `public/mesh2dInp.js` / `mesh2dExport` — `.inp` + external `.2dm` mesh file (162-211).
- `public/swmm6wasm.js`, `public/openswmm2d.js` — 2-line Emscripten factory glue.
- `scripts/build-openswmm2d.sh`; `docs/how-to/03-build-from-source.md` — wasm build path and options; browser-only pthread caveat (56); submodule + Emscripten compat fix (107-120).
- `wasm/openswmm2d_exports.cpp` — source-only TU exporting the C API.
- `third_party/openswmm-engine/include/openswmm/engine/openswmm_engine.h` — native C API, `swmm_engine_run_with_callback` (278-281), callbacks.
- `third_party/openswmm-engine/include/openswmm/engine/openswmm_callbacks.h` — progress/step/warning callback signatures (81-151).
- `third_party/openswmm-engine/src/cli/main.cpp` — native CLI step loop (40-142).
- `third_party/openswmm-engine/src/CMakeLists.txt` (25-28) — native targets incl. `openswmm_cli`.
- `third_party/openswmm-engine/src/engine/plugins/DefaultOutputPlugin.cpp` / `src/engine/2d/output/Default2DOutputPlugin.hpp` — `.out` writer; HDF5 UGRID 2D output plugin.
- `docs/reference/03-technology-stack.md` (9, 27), `docs/explanation/01-architecture.md` (13), `docs/how-to/07-troubleshoot.md` (51) — "no backend" posture; fake 1D progress.
- `docs/reference/07-scripts-and-benchmarks.md` — wasm engine run under plain Node for reference scripts.