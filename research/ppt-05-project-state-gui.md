# LocalSWMM — Presentation notes: Topic B (State of the project) & Topic E (GUI features)

Research compiled from the repo. Primary sources cited inline as `path:line` (or file-only when the claim is about the file as a whole).

---

# Topic B — State of the project

## What the project is today

LocalSWMM is a **web application for 1D+2D hydraulic modeling and simulation of stormwater/wastewater networks**. Everything — the map editor, the mesher, and the SWMM hydraulics engine — runs **in the browser**; the engine is the HydroCouple **OpenSWMM** C++ engine compiled to **WebAssembly** with Emscripten.

- "Local SWMM is a web application for 2D modeling and hydraulic simulation of stormwater and wastewater networks" — `README.md:6`; docs describe it as "1D+2D" — `docs/index.md:3`.
- Engine runs directly in the browser thanks to WebAssembly — `README.md:12`.
- "**No backend.** The only server is a trivial static-file + health endpoint server (`server.py`). No database, no build step for the UI, no bundler." — `MANUAL.md:42`.
- "**No UI framework.** The frontend is ~15,000 lines of dependency-free JavaScript (classic scripts + IIFEs) using Mapbox GL JS as the only heavyweight runtime library." — `MANUAL.md:43`.
- Production site: **https://swmm6.is-local.org** — `MANUAL.md:7`, `public/CNAME`.
- Two simulation backends coexist: a **WASM engine** path (1D + 1D/2D coupled) and an **experimental WebGPU** backend — `MANUAL.md:45`, `docs/reference/03-technology-stack.md:12`.

### Where the docs live

A full Diátaxis-style documentation set (tutorials / how-to / reference / explanation, plus a Spanish mirror `docs/es/`) lives in the repo — `docs/index.md:5-12`. The reference glossary and tech stack are in `docs/reference/08-glossary.md` and `docs/reference/03-technology-stack.md`. There is also a hand-written engineering manual (`MANUAL.md`, ~980 lines) covering architecture, the WASM bridge, the 2D/WebGPU subsystem, build system and CI.

## Stable vs experimental

The project has three tiers of maturity, clearly labeled in the docs and git history:

| Tier | What | Evidence |
|---|---|---|
| **Stable — 1D engine + network editor** | Map-based editor, INP/JSON/shapefile/DXF import-export, 1D SWMM simulation (Kinematic/Dynamic wave), results tables, profile/time-series plots | The whole editor + `.inp` pipeline is the product surface — `README.md:54-155`, `MANUAL.md:7-10`. |
| **Experimental — 2D module** | Surface-routing mesh generation (Shewchuk Triangle WASM), 1D↔2D coupling, per-frame 2D result rendering | "The experimental surface-routing work…" — `docs/explanation/04-two-d-mesh-and-webgpu.md:3`; "The experimental branch adds the 2D surface-routing module…" — `MANUAL.md:48`. |
| **Experimental — WebGPU marcher** | WGSL re-implementation of the engine's explicit local-inertial 2D solver; now **opt-in** | "run the f64 WASM engine by default; WebGPU f32 marcher is now opt-in" — worktree commit `405481f`; "Two simulation backends… experimental WebGPU" — `MANUAL.md:45`. |

Current hardening work (f64 WASM is the reference): `fix(2d): run the f64 WASM engine by default; WebGPU f32 marcher is now opt-in` (commit `405481f`), and recent commits fixing 2D mass-balance / node-continuity / 3D rendering (`git log --oneline -30` in the worktree).

### Recent activity (worktree `website` branch, `git log --oneline -30`)

- **3D network geometry**: `e2834d6` pure geometry builders + tests, `a5e0e9a` Mapbox fill-extrusion source/layers, `572594d` 3D toggle + live update hook, `c627b1b` mirror result colors onto 3D, `41446fb` replay colors on 3D activation + DEM fallback, `52ea3e2` drop subcatchment 3D rendering (perf), `9e1afdf`/`4f8332e` 3D cache-buster + terrain fix.
- **2D default flip**: `405481f` f64 WASM default, WebGPU opt-in.
- **Run Status from sim-time**: `e9c0b0d` drive Run Status UI from simulated time in `progress2d`.
- **Threading + hosting**: `dc39470` threaded engine + Cloudflare Pages deployment, `7ca76e1` deploy website branch too.
- **Engine fixes**: `f7bafdb`/`abf2e84` node-continuity double-count/sign fixes, `0fbb6aa` submodule pin with wasm compat fix.
- `main` branch (main checkout) carries a parallel line: **FV (Finite Volume) routing options + VIRTUAL_JUNCTIONS** UI/parser/exporter (`2c8c4a7`, `18956f0`, `a40d1aa`, `2844fd6`) — i.e. the Options modal exposes Flow Routing `KINWAVE/DYNWAVE/STEADY/FV` plus a full "Advanced FV Options" panel (`public/index.html:461-496`).

## Deploy targets

| Target | Workflow | Branches | COOP/COEP (threaded wasm) | Notes |
|---|---|---|---|---|
| **Cloudflare Pages** (production) | `.github/workflows/cloudflare.yml` | `main`, `experimental`, `website` | ✅ via `public/_headers` (`COOP: same-origin`, `COEP: credentialless`) | Serves **https://swmm6.is-local.org** (`public/CNAME`); "The production site is swmm6.is-local.org (Cloudflare Pages)" — `docs/how-to/05-deploy.md:3`. |
| **GitHub Pages** | `.github/workflows/static.yml` | `main`, `experimental` | ❌ cannot set COOP/COEP | "GitHub Pages cannot set COOP/COEP headers, so the threaded 2D wasm (pthreads/SharedArrayBuffer) will NOT run on this deployment. Deploy via Cloudflare Pages instead… Remove this workflow once Cloudflare is live." — `static.yml:3-6`. |
| **Local dev** | `server.py` | — | ✅ same headers | "`python server.py` sends the same COOP/COEP headers, so the threaded engine works on http://127.0.0.1:8080 out of the box" — `docs/how-to/05-deploy.md:43`; `docs/reference/06-api-endpoints.md:47-55`. |

Both workflows regenerate `public/config.js` from repo secrets (Mapbox/Google/OpenTopography keys); Cloudflare also writes a `build-version.js` cache stamp (`cloudflare.yml:29-30`). There is **no WASM build in CI** — the engine is built locally and the artifacts are committed to `public/` (`static.yml` note in `docs/how-to/05-deploy.md:30-39`). The threaded build requires **cross-origin isolation** (`SharedArrayBuffer`), which only Cloudflare + local server provide — `docs/how-to/05-deploy.md:5`.

## The openswmm-engine submodule pin

- Submodule path: `third_party/openswmm-engine`, URL `https://github.com/JoaquinAlvarado-py/openswmm.engine.git` (a fork of HydroCouple) — `.gitmodules:1-3`.
- **Pin per branch** (`git ls-tree HEAD third_party/openswmm-engine` + `public/openswmm2d.version.json`):
  - Worktree `website` HEAD → **`ec280d2c`**, described `v6.0.0-alpha.3-3-gec280d2c`, built 2026-08-12.
  - Main checkout `main` HEAD → **`ea3e9cdc`**, described `backup/pre-sync-2026-08-17-59-gea3e9cdc`, built 2026-08-17.
- The pin commit in the worktree's recent history is `0fbb6aa submodule: pin openswmm-engine with wasm compatibility fix`.
- **Wasm-compat caveat**: the pinned engine is not Emscripten-buildable out of the box — `PluginFactory.cpp` uses `dlopen`/`dlsym` and fails on `__EMSCRIPTEN__`. The fix commit (referenced as `85e4be38`, "fix(wasm): emscripten compatibility…") makes the wasm build work (static libs, stripped export macros, Emscripten no-ops, re-added `OPENSWMM_WASM_INJECT_FILE` hook). "If you re-pin the submodule… keep the wasm-compat commit or the WASM build will fail again at `PluginFactory.cpp`." — `MANUAL.md:766-779`.
- `MANUAL.md:6`'s stated pin (`85e4be38`, `v6.0.0-alpha.1-347-g85e4be38`) is **stale** relative to the actual gitlinks above.

## Scaling plan (client-side today; server-side pool/API planned)

Stated in `CONTEXT.md` (the repo's Spanish domain-glossary/plan doc):

- **Today**: "el motor corre 100% en el navegador (WASM)" — engine runs 100% in the browser — `CONTEXT.md:3`.
- **Planned**: "el plan de escalamiento añade una vía servidor-side: un servicio nativo con pool de workers que ejecuta corridas, una API para consumirlas y un estado agregado para monitorear todo" — a native server-side service with a **pool of workers** (one per core) that executes runs, an **API** to consume them, and an **aggregated system state** endpoint — `CONTEXT.md:3`.
- Domain vocabulary defined for the plan (Spanish): **corrida** (a full simulation run with lifecycle queued→running→finished/failed, identified by an ID), **EngineClient** (the frontend seam with two switchable implementations: local WASM and remote via API; **Modo local / Modo API**), **progreso de corrida** (live sim-time progress by ID, what Run Status paints), **resultados de corrida** (JSON tables + `.out`/`.rpt` for export), **estado del sistema** (aggregated health: app version, worker-pool state, active runs) — `CONTEXT.md:7-30`.

The current server (`server.py`) is only a static file + health server with a single endpoint `GET /api/status` → `{"status":"running","msg":"3D Map Prototype Server Online"}` — `docs/reference/06-api-endpoints.md:3-5,21-29`. That is the seed of the planned "estado del sistema" endpoint, not yet a run-executing API.

---

# Topic E — What the LocalSWMM GUI on the website features (engine + editor)

Capabilities from `README.md` (feature list), `MANUAL.md`, and the UI files (`public/index.html`, `public/ui.js`; 3D work in worktree `public/network3D.js`, `public/app.js`). Each item is tagged **[ENGINE]** (drives or consumes the OpenSWMM engine) vs **[UI-only]** (presentation/interaction, no engine involvement). The engine itself is invoked only via **Run**; everything up to Run is editor/UI work.

## Layout

The UI is a CSS grid SPA: **Top Toolbar** (file ops, Options, 2D Mesh, Plot, Run, Clear, Data menu), **Left Tool Palette** (draw tools), **Map View** (Mapbox 2D/3D), **Right Side Panel** (Properties / Results / Report tabs), **Bottom Status Bar** (tool, element counts, cursor coords) — `README.md:44-52`; grid areas and containers — `MANUAL.md:254-270`; `public/index.html:21-448`.

## 1. Building networks — [UI-only] (consumed by the engine at Run)

Tool palette (left) and click-to-draw interactions; all stored in the single source of truth `window.Net` (`MANUAL.md:235`, `network.js`).

- **Node tools**: Junction, Outfall, Storage, Divider — `README.md:79-85`; palette buttons `data-tool="junction|outfall|storage|divider"` — `public/index.html:99-110`; node types `JUNCTION/OUTFALL/STORAGE/DIVIDER` + `RAINGAGE` — `tools.js:11-17` (via `MANUAL.md:290`).
- **Link tools**: Conduit, Pump, Weir, Orifice (+ `outlet` in the tool registry) — `README.md:89-92`; palette buttons — `public/index.html:113-124`.
- **Area tools**: Subcatchment (polygon, double-click to close), Rain Gage — `README.md:96-97`; palette buttons — `public/index.html:127-132`.
- **Select / move / delete / undo-redo**: drag to move nodes, `Esc`, `Del`, `Ctrl+Z`/`Ctrl+Shift+Z`, `Ctrl+A` — `README.md:76-77,67`; keyboard handling — `tools.js:473-505` (via `MANUAL.md:295`).
- Drawing interactions (snap, ghost draft, hit-testing) — `tools.js:295-371` (via `MANUAL.md:294`).
- **Element properties** are edited via schema-driven forms in the right panel (`renderPropsPanel`, `FIELD_DEFS` — `ui.js:842`, `ui.js:570-736` via `MANUAL.md:274,284`); defaults per element type — `network.js:30-54`.

## 2. Import / export — [UI-only] (bridge to/from engine input formats)

- **Save**: project to `.json` (`.oswmm.json`) or browser storage (localStorage → IndexedDB fallback) — `README.md:58-61`; `network.js:774-781`, `network.js:677-737`.
- **Load**: `.json`, browser storage, **SWMM `.inp`**, **GIS Shapefile `.zip`**, **CAD DXF**, GeoJSON, and three sample models (Bellinge Web / Self-Contained / No Pervious) — `README.md:59-65`; dropdown menu — `public/index.html:44-53`.
- **Export INP**: full standard SWMM input with the 2D extension sections — `README.md:66`; section order + 2D sections (`2D_OPTIONS`, `2D_VERTICES`, `2D_TRIANGLES`, `2D_VERTEX_NODE_MAP`, `2D_MESH_FILE`) — `MANUAL.md:621-643`.
- **Coordinate systems** on import: WGS84, UTM/projected (EPSG code), local coordinates — `README.md:114-120`; proj4js is used (`MANUAL.md:147`).
- **Import as**: active network elements vs background "master plan" reference layers — `README.md:122`; constraint layers can be "block flow (impermeable)" → become mesh holes — `docs/explanation/04-two-d-mesh-and-webgpu.md:38`.
- INP parsing is **lossless** (`rawSections` preserved) so uneditable data survives round-trips — `MANUAL.md:645`, `MANUAL.md:345`.

## 3. Simulation options — [ENGINE] (written into `[OPTIONS]` / `[2D_OPTIONS]` at Run)

Options modal (`#options-modal`, `public/index.html:456-536`), saved via `ui.js:190-227` and emitted by `inpExporter.js`:

- **Flow Routing** dropdown: Kinematic Wave / Dynamic Wave / Steady / **Finite Volume (FV)** — `public/index.html:461-468`; emitted as `FLOW_ROUTING` — `inpExporter.js:85`. FV note: "FV is 1.5–6× slower than dynamic wave (engine's own benchmark range)" — `public/index.html:469`.
- **Advanced FV Options** (under `<details>`): `FV_CELL_LENGTH`, `FV_MIN_CELLS`, `FV_CFL`, `FV_RIEMANN` (HLLC/HLL), `FV_ORDER` (1 / 2 MUSCL-Hancock), `FV_LIMITER` (MINMOD/VANLEER/SUPERBEE), `FV_SCALAR_SCHEME`, `FV_TIME_INTEGRATION` (EULER/RK2), `FV_SLOT_CELERITY`, `FV_NODE_COUPLING`, `FV_NODE_DT`, `FV_NODE_PICARD`, `FV_STRUCTURE_COUPLING`, `FV_BACKEND`, `FV_COMPACTION`, `FV_DISPERSION` — `public/index.html:471-495`; emitted only under FV routing in a fixed order — `inpExporter.js:87-93`; parser/exporter handle `FV_*` + `[VIRTUAL_JUNCTIONS]` (commits `18956f0`, `a40d1aa`, `2844fd6`).
- **Node Continuity**: Legacy (default) or `SEMI_IMPLICIT` (Enhanced) — `README.md:128-129`; `public/index.html:497-504`; emitted as `NODE_CONTINUITY` — `inpExporter.js:122`.
- **Anderson Acceleration**: Yes/No — "Cuts Picard iteration counts by 25-50% on stiff surcharge transitions" — `README.md:129`, `public/index.html:506-512`; emitted as `ANDERSON_ACCEL` — `inpExporter.js:123`.
- **Physics-Based RDII Abstraction Recovery**: `k0`, `kT`, `Tref` — `README.md:130`; `public/index.html:514-529`; emitted as `[RDII_DECAY]` — `inpExporter.js:160-163`.

## 4. 2D Mesh dialog — [ENGINE] (generates the 2D solver mesh; solver options are engine parameters)

`#btn-mesh2d-toolbar` → 3-tab modal (Sources / Quality / Hydraulics) — `MANUAL.md:576`; the "Sources/Quality/Hydraulics" orchestration and `localStorage`-persisted defaults (v4/v5 migrations aligning to the engine's `SolverOptions2D.hpp` / Ref Manual Vol II Ch9 §9.11) — `docs/explanation/04-two-d-mesh-and-webgpu.md:63`.

- Mesh generation: boundary/domain → subcatchment regions → node Steiner vertices → conduit constraints → constraint layers/holes → dedupe → flatten → terrain Z — `docs/explanation/04-two-d-mesh-and-webgpu.md:30-42`.
- Triangulation: production **Shewchuk Triangle WASM** constrained Delaunay (`pQAY`, minAngle 33°, maxArea 200 m², 8000-point budget) with poly2tri fallback — `docs/explanation/04-two-d-mesh-and-webgpu.md:45-52`.
- 2D solver options emitted: `MAX_TIMESTEP`, `DRY_DEPTH`, `COUPLING_CD`, `THETA`, `CFL_NUMBER`, `H_MOVE`, `LTS_TIERS`, `FROUDE_MAX`, `INTEGRATOR EXPLICIT`, `COUPLING_AREA`, etc. — `docs/explanation/04-two-d-mesh-and-webgpu.md:62`.
- 2D is **SI-only** (US units rejected) — `MANUAL.md:414`, `mesh2dInp.js:163`.

## 5. Run + live progress (Run Status) — [ENGINE] (progress is engine sim-time)

- **Run** button guards: ≥1 node, ≥1 OUTFALL, SI units if 2D — `MANUAL.md:414`.
- **Run Status** modal (classic EPA-SWMM style): percent bar + **Days** + **Hrs:Min** fields — `public/index.html:702-752` (worktree) / `:737+` (main); Stop and Minimize/Expand controls — `README.md:142-144`.
- **2D path progress is real engine sim-time**: the worker advances in `stride(…)` chunks and posts `{type:'progress2d', elapsedMs}` from the engine's returned elapsed days — `openSwmm2dWorker.js:313-327`; "drive Run Status UI from simulated time in progress2d" — worktree commit `e9c0b0d`. `readFrame` samples frames between strides — `openSwmm2dWorker.js:158-179`.
- **1D path progress is cosmetic**: an estimate-based `setInterval` bar, capped at 99% — `app.js:1083-1129,1252-1271` (via `MANUAL.md:418`); "simWorker progress messages are dead protocol" — `MANUAL.md:942`.
- Execution backends: persistent `simWorker` (1D), `openSwmm2dWorker` (1D+2D, f64 WASM — default reference), `webgpu/gpu2dWorker` (WebGPU marcher, only when `Net.useGpu2d === true`) — `MANUAL.md:420-427`.

## 6. Results — [ENGINE] (all values come from the engine's `.out`/`.rpt`/2D frames)

- Right panel tabs **Properties / Results / Report** — `README.md:149-150`; tab buttons — `public/index.html:420-433`.
- **Results tables** (`.rpt` parsed): Node Depths, Node Inflows, Link Flows, Subcatchment Runoff (+ Flooding, Outfall Loadings, Conduit Surcharges, Continuity Errors, Engine Errors, Time Series) — `README.md:150`; parsers `results.js:59-366`, KPI cards + continuity chips + sortable/filterable tables with sparklines — `MANUAL.md:449`.
- **Time slider**: play/pause/speed/drag over simulation steps (`AnimationUI`), driven by `ResultStyling.applyToMapForStep` — `README.md:148`; `MANUAL.md:382`.
- **Per-step map coloring** via Mapbox feature-state `resultColor` — `MANUAL.md:370`; binary `.out` path preferred, `.rpt` fallback — `MANUAL.md:449`.
- **2D results**: depth/head/velocity selector, per-frame mesh coloring, synthetic time series on the same slider — `MANUAL.md:449`; `results.js:1291-1492`.
- **Profile plot**: select connected nodes → interactive hydraulic profile (BFS conduit trace + terrain sampling; surcharge color coding red ≥1.0 / amber ≥0.85 / cyan) — `README.md:151`; `profile.js:630`.
- **Time-series plot** modal (`Plot` button) — `MANUAL.md:451`; `plot.js:227`.
- `.out` binary parsing is zero-copy `Float32Array` views — `MANUAL.md:447`.

## 7. 2D mesh rendering + WebGPU — [ENGINE] (renders solver output; WebGPU runs a 2D solver)

- Layer tree card with **12 toggles** for 2D overlays: vertex points, depth isolines, depth contour bands (5 mm dry mask), velocity arrows, elevation bands/isolines — `docs/explanation/04-two-d-mesh-and-webgpu.md:69`; `layerTree.js`.
- WebGL2 Gouraud custom layer (`MeshShadeLayer`) with a 5-stop color ramp, wet-only alpha — `docs/explanation/04-two-d-mesh-and-webgpu.md:70`.
- **WebGPU marcher**: `webgpuMarscher.js` is a bit-exact port of the engine's `InertialEdges.cpp`; 16-binding-bind-group compute pipeline; WGSL kernels ported 1:1 from `InertialKernels.hpp` — `docs/explanation/04-two-d-mesh-and-webgpu.md:74-76`.
- Status: M0–M3 done (statistical parity, split coupling PASS, LTS v2); **M4 (UI WebGPU/WASM toggle) and M5 (benchmark & hosting) pending**; Apple Silicon/Metal (≤10 storage buffers) cannot run it — falls back to WASM — `docs/explanation/04-two-d-mesh-and-webgpu.md:82-94`.
- Honest verdict: GPU 2D is fast (0.13 ms/substep) but the 1D dynamic wave is ~90% of wall time in both backends, so the split is currently **on par with** the engine, not faster — `docs/explanation/04-two-d-mesh-and-webgpu.md:96`.

## 8. Mapbox 3D (terrain + buildings + new 3D network geometry) — [UI-only] (visualization; result colors come from the engine)

- **3D View** toggle ("Toggle 3D terrain & buildings") enables Mapbox 3D terrain + building models — `README.md:107`; button `#btn-toggle-3d` — `public/index.html:181` (worktree).
- **NEW — 3D network geometry** (`#btn-toggle-3d-network` "3D Net", worktree `website` branch only): static 3D extrusions of the SWMM network via Mapbox `fill-extrusion` — `public/network3D.js:1`, toggle wired at `network3D.js:251-257`.
  - Geometry builders are **pure functions exported for Node tests** (`buildGeoJSON`, `nodeFeatures`, `linkFeatures` …) — `network3D.js:2,237-243,265-267`.
  - Nodes → octagonal prisms (junction/storage/divider height = `maxDepth`, outfall = stub) — `network3D.js:73-94`; links → conduits (circular → cylinder-ish strip, height = `geom1`), weirs (crest height), orifices, pumps — `network3D.js:105-145`; conduit path subdivided into ≤64 segments with interpolated base elevations — `network3D.js:54-71`.
  - Layer ids: `swmm-3d-conduits`, `swmm-3d-links-other`, `swmm-3d-nodes`, `swmm-3d-outfalls` — `network3D.js:162-167`.
  - **Result colors mirror onto the 3D extrusions** via `resultColorExpr()` feature-state → `fill-extrusion-color` — `network3D.js:169-173`; commits `c627b1b` (mirror result colors), `41446fb` (replay on 3D activation + DEM fallback for subcatchment slabs), `52ea3e2` (dropped subcatchment 3D rendering — perf).
  - **Live model updates**: `Net.onChange` refreshes the 3D source on every non-move change — `network3D.js:259-263`.
  - Activating pitches the map to 55° — `network3D.js:223`; `map.setTerrain` disabled in 3D mode to avoid purple Terrain-RGB tiles — commit `4f8332e`.

## 9. Street View — [UI-only]

- Pegman button → Google Street View overlay; requires `GOOGLE_MAPS_API_KEY` — `README.md:112`; `street_view_overlay.js`; lazy-loaded Google Maps JS API — `MANUAL.md:192`, `MANUAL.md:380`. Overlay is position-linked to the map; redrawn on time-slider step (`MANUAL.md:382`).

## 10. Units — [UI-only]

- SI (m, mm, LPS) vs US (ft, in, CFS) selector — `README.md:109`; `public/index.html:186-191`; unit-aware property forms via `U(si,us)` helper — `MANUAL.md:284`; 2D runs force SI — `MANUAL.md:414`.

## 11. DEM sampling — [UI-only] (feeds model elevations, not the solver)

- **Sample DEM Elevation** on node placement (sync) and per selected node / **Sample DEM for All Nodes** (async) — `README.md:85,110`; `public/index.html:207`; `app.js:437-543`.
- DEM sources: **Mapbox Terrain DEM** (default) + OpenTopography COP30 / USGS 10m / SRTMGL1 / NASADEM / ANADEM / GEDTM30 (runtime key entry) — `public/index.html:194-204`; also local **GeoTIFF** (geotiff.js) for mesh terrain — `MANUAL.md:150`, `mesh2dTerrain.js:53`.

## 12. Other editor / map niceties

- **Basemaps**: Streets / Satellite / Blank; network-layer toggles (Nodes, Links, Subcatchments, 2D Mesh), Labels, Warnings, Land Cover overlay — `README.md:103-108`; `public/index.html:162-184`.
- **OSM place search** (geocoding via OpenStreetMap) — `README.md:111`; `public/index.html:147-153`.
- **Data editors** behind the Data menu: Curves, LID Controls, Water Quality, Groundwater & Aquifer, Snowpack — `README.md: (Data menu)`, `public/index.html:78-87`; lazy module editors (`MANUAL.md:244`). (LID layer params are parsed but not stored — round-trip relies on `rawSections` — `MANUAL.md:946`.)

## Engine-driven vs UI-only — summary

| Capability | Tag |
|---|---|
| Network editing (nodes/links/subcatchments/raingages), props, undo/redo | **UI-only** |
| Import/export (.json, .inp, shapefile, DXF, GeoJSON, browser storage) | **UI-only** (feeds engine) |
| Simulation Options (flow routing incl. FV, node continuity, Anderson, RDII recovery) | **ENGINE** (serialized into INP) |
| 2D Mesh generation dialog + solver options | **ENGINE** (mesh + `[2D_OPTIONS]`) |
| Run + Run Status progress | **ENGINE** (1D cosmetic; 2D = real sim-time from `progress2d`) |
| Results tables, KPI cards, time slider, map coloring, profile/time-series plots | **ENGINE** (`.out`/`.rpt`/2D frames) |
| 2D overlays (isolines, bands, arrows, WebGL2 layer) | **ENGINE** (renders solver frames) |
| WebGPU marcher backend | **ENGINE** (GPU 2D solver, opt-in) |
| Mapbox 3D terrain + buildings; 3D network extrusions (result-colored) | **UI-only** (visualization; colors from engine results) |
| Street View, units, DEM sampling, basemaps, search, labels/warnings | **UI-only** |