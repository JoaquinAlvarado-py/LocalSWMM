# Local SWMM — Engineering Manual

**Project:** Local SWMM (`LocalSWMM`)
**Repository:** https://github.com/JoaquinAlvarado-py/LocalSWMM
**Active branch:** `experimental`
**Engine submodule:** [`openswmm.engine`](https://github.com/HydroCouple/openswmm.engine) (fork at `JoaquinAlvarado-py/openswmm.engine`), pinned at `85e4be38` (`v6.0.0-alpha.1-347-g85e4be38`)
**Production site:** https://swmm6.is-local.org

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture at a Glance](#2-architecture-at-a-glance)
3. [Repository Layout](#3-repository-layout)
4. [Technology Stack](#4-technology-stack)
5. [Quick Start — Running the App](#5-quick-start--running-the-app)
6. [Configuration & API Keys](#6-configuration--api-keys)
7. [Frontend Architecture](#7-frontend-architecture)
8. [The Network Data Model](#8-the-network-data-model)
9. [Map & Rendering Layer](#9-map--rendering-layer)
10. [Simulation Pipeline](#10-simulation-pipeline)
11. [The WASM Engine Bridge](#11-the-wasm-engine-bridge)
12. [The 2D Mesh & WebGPU Subsystem](#12-the-2d-mesh--webgpu-subsystem)
13. [Data Formats](#13-data-formats)
14. [The Build System](#14-the-build-system)
15. [Scripts, Benchmarks & Verification](#15-scripts-benchmarks--verification)
16. [Server & CI/CD](#16-server--cicd)
17. [Development Workflow](#17-development-workflow)
18. [Troubleshooting](#18-troubleshooting)
19. [Known Gotchas & Oddities](#19-known-gotchas--oddities)
20. [Glossary](#20-glossary)

---

## 1. Project Overview

Local SWMM is a **client-side-only web application** for 2D hydraulic modeling and simulation of stormwater and wastewater networks. Everything — the editor, the mesher, and the SWMM hydraulics engine — runs in the browser. The simulation engine is the HydroCouple **OpenSWMM** engine compiled to **WebAssembly** with Emscripten.

Key properties:

- **No backend.** The only server is a trivial static-file + health endpoint server (`server.py`). No database, no build step for the UI, no bundler.
- **No UI framework.** The frontend is ~15,000 lines of dependency-free JavaScript (classic scripts + IIFEs) using Mapbox GL JS as the only heavyweight runtime library.
- **WASM-embedded hydraulics.** The OpenSWMM 6.0.0 engine is cross-compiled for `wasm32-emscripten` with vcpkg-managed C++ dependencies (Eigen, HDF5, nlohmann-json, SUNDIALS).
- **Two simulation backends.** A WASM engine path (1D + 1D/2D coupled) and an **experimental WebGPU** backend that re-implements the 2D explicit local-inertial solver as WGSL compute kernels and runs it in parallel to the WASM engine.
- **Two mesh generators.** A legacy `poly2tri`-based generator and the production **Shewchuk Triangle WASM** (npm `triangle-wasm`) pipeline.

The experimental branch adds the 2D surface-routing module (mesh generation, 1D↔2D coupling, WebGPU GPU marcher) on top of the 1D network editor.

---

## 2. Architecture at a Glance

```
                        ┌─────────────────────────────────────────────────────────┐
                        │                       BROWSER                          │
                        │                                                        │
  ┌────────────┐        │   ┌───────────────────────  index.html  ────────────┐  │
  │  server.py │───────▶│   │  [35 classic <script> modules, ordered by deps] │  │
  │  static    │        │   └───────────────┬──────────────────────────────────┘  │
  │  :8080     │        │                   │                                    │
  └────────────┘        │                   ▼                                    │
                        │   ┌───────────────────────────────┐                    │
                        │   │  UI layer (ui.js)             │                    │
                        │   │  Map (app.js)  Tools          │                    │
                        │   │  Network store (network.js)   │                    │
                        │   └───────┬───────────────┬───────┘                    │
                        │           │               │                            │
                        │           ▼               ▼                            │
                        │   ┌──────────────────────┐ ┌──────────────────────────┐│
                        │   │ INP serialize        │ │ 2D mesh pipeline         ││
                        │   │ (inpExporter.js)     │ │ (mesh2dPslg → Triangle) ││
                        │   │ INP parse            │ └────────────┬─────────────┘│
                        │   │ (inpParser.js)       │              │              │
                        │   └──────────┬───────────┘              │              │
                        │              │                         ▼              │
                        │              ▼        ┌───────────────────────────────┐│
                        │   ┌─────────────────┐ │   Web Workers                 ││
                        │   │  simWorker.js   │ │  ┌────────────┐ ┌────────────┐││
                        │   │  openSwmm2dWrk  │ │  │ gpu2dWorker│ │  harness   │││
                        │   └───────┬─────────┘ │  │ (WebGPU)   │ │            │││
                        │           │           │  └────────────┘ └────────────┘││
                        │           ▼           └───────────────────────────────┘│
                        │   ┌─────────────────────────────────────────────┐      │
                        │   │   Emscripten WASM:  swmm6wasm.js/.wasm       │      │
                        │   │   openswmm2d.js/.wasm                        │      │
                        │   │   ──────────────────────────────────────     │      │
                        │   │   OpenSWMM engine (C++20, static lib)        │      │
                        │   │   exported C API: swmm_engine_* , swmm_2d_*  │      │
                        │   │   swmm_node_*                                │      │
                        │   └─────────────────────────────────────────────┘      │
                        └─────────────────────────────────────────────────────────┘
```

**Data flow (simulation):** model (`Net`) → `inpExporter.generateInp()` → optional 2D section injection (`Mesh2DInp.buildInput`) → `.inp` string → Worker → `FS.writeFile('/in.inp')` → `swmm_engine_open/initialize/start` → `stride()` loop → `.rpt` + `.out` read back → `swmmOutParser` → `results.js` rendering (tables, map colors, time slider, profile/chart plots).

---

## 3. Repository Layout

```
LocalSWMM/
├── README.md                     # User-facing readme (Quick Start, tool usage)
├── WEBGPU_PLAN.md                # WebGPU backend roadmap (Spanish) + status
├── server.py                     # Local static + API dev server (port 8080)
├── package.json / package-lock   # npm scripts + triangle-wasm devDependency
├── vcpkg.json                    # C++ deps manifest for the WASM build
├── vcpkg-triplets/
│   └── wasm32-emscripten.cmake   # vcpkg overlay triplet for Emscripten
├── cmake/
│   ├── OpenSwmm2DWasm.cmake      # (legacy sibling, not used by build scripts)
│   └── wasm/CMakeLists.txt       # ACTIVE wrapper that embeds the engine + wasm target
├── wasm/
│   └── openswmm2d_exports.cpp    # Source-only TU exposing the C API to Emscripten
├── scripts/
│   ├── build-openswmm2d.sh       # Linux/macOS WASM build (emcmake + vcpkg)
│   ├── build-openswmm2d.ps1      # Windows WASM build
│   └── *.mjs                     # 15 bench/probe/verify/harness scripts (see §15)
├── third_party/
│   └── openswmm-engine/          # GIT SUBMODULE — the OpenSWMM C++ engine
├── assets/                       # demo.mp4
├── wasm-build.log                # Historical Windows build record (reference only)
├── .github/workflows/static.yml  # GitHub Pages deploy (no wasm build in CI)
└── public/                       # <-- everything served by server.py
    ├── index.html                # SPA shell (toolbar, palette, map, panels, modals)
    ├── config.js                 # GITIGNORED — API keys (Mapbox etc.)
    ├── *.js                      # ~47 app modules (~15k lines), plain scripts
    ├── openswmm2d.js / .wasm     # Engine build (factory createOpenSwmm2D)
    ├── swmm6wasm.js / .wasm      # Byte-for-byte copies of openswmm2d.* (legacy name)
    ├── openswmm2d.version.json   # Engine commit stamp (written by build script)
    ├── swmm6wasm.version.json    # Same stamp (twin file)
    ├── sample_models/            # Bellinge sample models + Bellinge2.tif DEM
    ├── vendor/triangle/          # triangle-wasm loader (TriangleWASM wrapper)
    └── webgpu/                   # WebGPU marcher, split, worker, harness, WGSL
```

> Note: `.tools/` (emsdk + vcpkg), `build/`, `node_modules/`, `public/config.js`, `__pycache__/`, and `public/webgpu/fixtures/` are git-ignored local artifacts (`.gitignore`).

---

## 4. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Language (UI) | Plain JavaScript (ES2020+, IIFEs) | No TypeScript, no modules, no bundler |
| Map rendering | Mapbox GL JS v3.1.2 (CDN) | 3D terrain, buildings, GeoJSON sources, custom WebGL2 layers |
| Coordinate math | proj4js 2.9.0 (CDN) | UTM/projected → WGS84 on import |
| GIS parsers | shpjs 4.0.4, dxf-parser 1.1.2 (CDN) | Shapefile + DXF import |
| 2D triangulation | poly2tri 1.5.0 (legacy) **and** triangle-wasm 1.0.0 (production, vendored) | Shewchuk Triangle port |
| Rasters | geotiff 2.1.3 (CDN) | Local DEM (GeoTIFF) sampling |
| Engine | OpenSWMM 6.0.0-alpha (C++20) | Compiled with Emscripten 6.x to WASM |
| C++ deps | eigen3, hdf5, nlohmann-json, sundials | via vcpkg, wasm32-emscripten triplet |
| Language (server) | Python 3 stdlib (`http.server`) | Zero dependencies |
| Language (tooling) | Node.js (≥20) | Bench/verify/harness scripts, `npm` |
| CI / hosting | GitHub Actions → GitHub Pages | Static deploy only |

**CDN dependencies loaded by `index.html`** (all pinned, CSP-restricted to `api.mapbox.com`, `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `unpkg.com`, `maps.googleapis.com`): `mapbox-gl-js@3.1.2`, `proj4js@2.9.0`, `shpjs@4.0.4`, `dxf-parser@1.1.2`, `poly2tri@1.5.0`, `geotiff@2.1.3`, and (optionally) the Google Maps JS API.

---

## 5. Quick Start — Running the App

**Prerequisites:** Python 3 and a modern browser. (Node is only needed for `npm install` and the tooling scripts.)

```bash
git clone --branch experimental https://github.com/JoaquinAlvarado-py/LocalSWMM.git
cd LocalSWMM
python3 server.py          # serves ./public on http://127.0.0.1:8080
```

Open **http://127.0.0.1:8080** and add your Mapbox token to `public/config.js` (see §6) or the basemap won't load.

**Optional JS tooling install:**

```bash
npm install                # installs triangle-wasm (dev dependency, vendored copy)
```

> ⚠️ **Discrepancy:** the README says the project directory is `SWMM_3D_Web_UI` and the URL is `http://localhost:8000`. The actual directory is `LocalSWMM` and the server listens on port **8080** (`server.py:6`).

**To run a sample:** Load **Bellinge Web** from the **Open Model ▾** dropdown, then press **Run**. This is the reference network used throughout the test suite.

---

## 6. Configuration & API Keys

`public/config.js` is **git-ignored** and must exist for the map to work. It defines the global `CONFIG` object with three optional keys:

| Key | Required? | Used for | Where |
|---|---|---|---|
| `MAPBOX_ACCESS_TOKEN` | Yes (map) | Mapbox GL basemaps, terrain DEM, buildings | `app.js:10-14` (`mapboxgl.accessToken`) |
| `GOOGLE_MAPS_API_KEY` | No | Google Street View overlay | `index.html:758-763` (lazy loader) |
| `OPENTOPOGRAPHY_API_KEY` | No | OpenTopography DEM endpoints (COP30, USGS10m, …) | `app.js:446` |

Minimal template:

```js
var CONFIG = {
    MAPBOX_ACCESS_TOKEN: 'pk.…',
    GOOGLE_MAPS_API_KEY: '',
    OPENTOPOGRAPHY_API_KEY: ''
};
```

Notes:

- Mapbox tokens are free at https://account.mapbox.com/. Use a *public* (`pk.…`) token.
- **CI note:** GitHub Pages deployment regenerates `public/config.js` from repository secrets (`MAPBOX_ACCESS_TOKEN`, `GOOGLE_MAPS_API_KEY`, `OPENTOPOGRAPHY_API_KEY`) — see `.github/workflows/static.yml:28-34`. CI emits `const CONFIG`, while local use favors `var CONFIG` (a top-level `const` is *not* visible as `window.CONFIG`; `app.js:446` reads `window.CONFIG` defensively).
- The **OpenTopography API key** can also be typed into the map-settings card at runtime (`#opentopo-api-key`), which takes precedence over `CONFIG`.

---

## 7. Frontend Architecture

### 7.1 Module system and globals

There are **no ES modules, no bundler, no `import`/`export`**. Every file is a classic script wrapped in an IIFE. Modules communicate exclusively through globals attached to `window`. **Script order in `index.html` is the dependency contract** (`index.html:779-810`):

```
config.js → mapbox/proj4/shp/dxf/poly2tri/geotiff (CDN)
→ inpParser → inpExporter → network → swmmOutParser → street_view_overlay
→ swmm6wasm → results → importers → app → tools → profile → plot
→ vendor/triangle → mesh2dProj → mesh2dPslg → mesh2dTerrain → mesh2dTriangle
→ mesh2dCoupling → mesh2dExport → mesh2dRender → meshGlLayer → mesh2d
→ mesh2dInp → mesh2dDialog → layerTree → landcover → curves → lid → quality
→ aquifer → snowpack → ui          (ui.js LAST — it wires every button)
```

The principal global singletons:

| Global | Owner of | Defined at |
|---|---|---|
| `window.map` | Mapbox GL `Map` instance | `app.js:38` |
| `window.App` | UI/app state (`currentStyle`, visibility flags, `selection` Set, `lastRunReport`, `results2D`, `outData`, …) | `app.js:44-58` |
| `window.Net` | `Network` class instance — **single source of truth** for all model data + undo/redo + autosave | `network.js:942` |
| `window.Tools` | Tool state machine (selection, drawing, hit-testing, drag) | `tools.js:291` |
| `window.LayerTree` | 2D mesh layer visibility/opacity | `layerTree.js:38` |
| `window.ResultStyling` | Simulation result coloring engine | `results.js:547` |
| `window.AnimationUI` | Time-slider play/pause | `ui.js:1086` |
| `window.CONFIG` | API keys | `config.js` |
| `window.inpParser` / `window.inpExporter` | INP parse / serialize | `inpParser.js:555`, `inpExporter.js` |
| `window.SWMMOutParser` | `.out` binary parser | `swmmOutParser.js` |
| `window.Mesh2D…` / `window.TriangleWASM` / `window.Mesh2DLayers` / `window.Mesh2DGL` | 2D subsystem | see §12 |
| Module editors (lazy) | `CurveEditor`, `LIDControls`, `QualityEditor`, `AquiferEditor`, `SnowpackEditor`, `TimeSeriesPlot`, `ProfilePlot`, `StreetViewOverlay`, `Importers` | — |

Consequences of this design:

- **State is shared by convention.** `tools.js:8-9` and `ui.js:7-8` capture `window.map`/`window.App` at load time, so `ui.js` must load after `app.js`.
- **Adding a module** means adding a `<script>` tag in the right position in `index.html` and exposing globals; there is no import graph the tooling can validate.
- **Rendering is two-track:** `Net` owns geometry + undo + persistence (data); `App` + Mapbox own view state. Mapbox **feature-state** (`selected`, `hovered`, `resultColor`) is the bridge between them (`app.js:320-325`).

### 7.2 UI shell — `index.html`

The whole app is a CSS grid `#app-grid` (`styles.css:59-73`):

```
grid-template-areas:
  "toolbar toolbar toolbar"
  "palette map     panel"
  "status  status  status"
```

| Container | ID | Contents |
|---|---|---|
| Toolbar | `#toolbar` | Undo/Redo · Save/Load(dropdown)/Export-INP · Options · Mesh2D · TS-plot · **Run** · Clear · Data-menu (Curves/LID/Quality/Aquifer/Snowpack/2D Mesh) |
| Left palette | `#tool-palette` | `[select] [delete]` + Node tools (junction, outfall, storage, divider) + Link tools (conduit, pump, weir, orifice) + Area tools (subcatchment, raingage) |
| Map area | `#map-container` | `#map`, OSM search, map-settings card (basemap / layer toggles / units / DEM source / Sample-DEM-all), layer-tree card, Street View pegman, time-slider panel, profile modal, TS modals |
| Right panel | `#panel-right` | Resizable; tabs **Properties / Results / Report** (`#tab-props`, `#tab-results`, `#tab-report`) |
| Status bar | `#statusbar` | `#sb-tool`, `#sb-nodes`, `#sb-links`, `#sb-subcatchments`, `#sb-gages`, `#sb-coords` |
| Modals | `.modal-overlay`+`.modal-box` | Options, Projection, Import-As, 2D-Mesh (3 tabs), Run-Status (+minimized badge) |

### 7.3 UI framework

**Hand-rolled, dependency-free.** Dynamic content is DOM-string + `innerHTML` (e.g. the properties panel `renderPropsPanel`, `ui.js:842`); all wiring is `addEventListener`. Recurring component classes live in `styles.css`:

- `.tb-btn`, `.tb-btn-run`, `.tb-icon-btn`, `.tb-dropdown`(+`.open`), `.tb-pill`(+`.active`)
- `.tool-btn`(+`.active`, `.tool-btn-danger`), `.tool-divider`, `.tool-group-label`
- `.side-panel`, `.panel-tabs`, `.panel-tab`(+`.active`), `.tab-badge`
- `.modal-overlay`, `.modal-box`, `.modal-actions`
- `.prop-section-title`, `.prop-row`, `.prop-actions`

**Theming** uses CSS variables (`styles.css:6-29`): `--accent`, `--danger`, `--bg-panel`, layout vars `--toolbar-h:44px`, `--statusbar-h:26px`, `--panel-w:280px`, `--palette-w:46px`. `--panel-w` is updated at runtime during resize (`ui.js:236`).

**No i18n.** All strings are hardcoded English. The only "localization" is unit formatting via `const U = (si, us) => Net.units === 'US' ? us : si;` (`ui.js:564`) used by the schema-driven property forms (`FIELD_DEFS`, `ui.js:570-736`).

### 7.4 Tool system — `tools.js`

A single hand-rolled state machine (`window.Tools`):

- Tool registry maps palette `data-tool` names to types: `NODE_TOOL_TYPES` (`junction→JUNCTION`, `outfall→OUTFALL`, `storage→STORAGE`, `divider→DIVIDER`, `raingage→RAINGAGE` — `tools.js:11-17`) and `LINK_TOOL_TYPES` (`conduit`, `pump`, `orifice`, `weir`, `outlet` — `tools.js:18-24`), plus special modes `select`, `subcatchment`, `delete`.
- **`Tools.setTool(name)`** (`tools.js:145-164`) cancels drawing, toggles palette highlight, updates `#sb-tool`, switches the map cursor, and disables `map.doubleClickZoom` in subcatchment mode.
- **Drawing state:** `linkFrom` (first endpoint), `linkVertices[]`, `polyVertices[]`, `dragging`.
- **Hit-testing:** `featureAt(point)` ranks nodes > links > subcatchments > 2D mesh in a 12 px box (`tools.js:216-226`); `snapNodeAt` uses a 24 px box over `swmm-nodes-layer`, skipping rain gages for hydraulic ops (`tools.js:228-239`).
- **All map interactions dispatch through one `map.on('click')` handler** (`tools.js:295-363`) that switches on `Tools.active`: node placement, link drawing (first click must land on a node; subsequent clicks snap), subcatchment vertex push, delete, select. `dblclick` finishes a subcatchment (`tools.js:365-371`). `mousemove` updates the ghost draft and the hover popup (`tools.js:375-423`). `mousedown` drives node dragging (`tools.js:426-470`), coalesced into a single undo step via `Net.commitMove()` on mouseup.
- **Keyboard** (`tools.js:473-505`): `Esc` cancels/clears, `Ctrl+Z`/`Ctrl+Y`/`Ctrl+Shift+Z` undo-redo, `Ctrl+A` select all, `Del`/`Backspace` delete, `Enter` finishes a subcatchment.

> Adding a new tool requires: an entry in `NODE_TOOL_TYPES`/`LINK_TOOL_TYPES`, a branch in the `click` handler, and a palette button.

### 7.5 State persistence

- **Autosave:** every `Net.emit()` triggers `scheduleAutosave()` (`network.js:168`), a 2 s debounce that writes `JSON.stringify(serialize())` to **localStorage** key `openswmm3d.project` (`network.js:677-701`). If localStorage throws (quota), it falls back to **IndexedDB** (DB `openswmm3d`, store `kv`) (`network.js:703-718`). Restore prefers localStorage, then IndexedDB (`network.js:734-737`), gated on ≥1 node/link.
- **Save / Load:** `Net.downloadProject()` produces a pretty-printed `*.oswmm.json` (`network.js:774-781`); load goes through `Net.loadState(data, true)` (`network.js:490-520`). JSON and GeoJSON files are both accepted (GeoJSON routes to the import/projection dialogs).
- **Panel geometry** is also persisted: right-panel width in `localStorage['panel-w']`, layer-tree state in `localStorage['swmm-2d-layer-tree']` (`layerTree.js:8-9`).

---

## 8. The Network Data Model

`class Network` (`network.js:101`), one instance `window.Net`. It is the canonical store for everything the user builds.

### 8.1 Element shapes

| Collection | Shape |
|---|---|
| `nodes[]` | `{ id, type, lngLat:[lng,lat], props }` |
| `links[]` | `{ id, type, from, to, vertices[], props }` (`vertices` = intermediate coordinates) |
| `subcatchments[]` | `{ id, ring:[[lng,lat]…], props }` |
| `mesh2D[]` | `{ id:'M2D_n', ring, manningN, parentSubcatch, props }` — derived from the indexed mesh |
| `mesh2DIndexed` | Triangle-engine output; see §12.2 |
| `timeseries` | `{ TS1: [{date,time,value}…] }` |
| `options`, `units` | Simulation options, `'SI'`/`'US'` |
| Metadata | `title`, `counters`, `rawSections`, `curves`, `lidControls`, `pollutants`, `landUses`, `treatments`, `aquifers`, `snowpacks`, `importedLayers` |

**Default props** come from factories: `defaultNodeProps(type)`, `defaultLinkProps(type)`, `defaultSubcatchProps()` (`network.js:30-54`). E.g. JUNCTION `{invertEl, maxDepth:2, initDepth, surDepth, aponded}`; CONDUIT `{roughness:0.013, autoLength:true, xShape:'CIRCULAR', geom1:1.0, barrels:1}`.

### 8.2 IDs, indexes, GeoJSON cache

- **ID generation** (`nextId`, `network.js:171-181`): per-type counters with prefixes from `ID_PREFIX` (`network.js:19-23`): `J/O/ST/D/RG` nodes, `C/P/W/OR/OL` links, `S` subcatchments, `M2D_` mesh cells.
- **O(1) lookup:** `_nodeMap/_linkMap/_subMap` rebuilt by `rebuildIndexes()` (`network.js:141-150`); `findAny(id)` (`network.js:197-212`) also resolves mesh cells.
- **GeoJSON caches:** `nodesGeoJSON/linksGeoJSON/subcatchmentsGeoJSON/mesh2DGeoJSON` (`network.js:784-865`) invalidated by `_invalidateGeo()`; node moves patch in place (`_patchGeoForMove`, `network.js:350-365`) so drags don't rebuild everything.

### 8.3 Undo/redo (command pattern)

- History is an array of `{t:'snap', json}` full snapshots and `{t:'cmd', op}` deltas. `HISTORY_LIMIT=100`, snapshots forced every 25 ops (`network.js:25-26`).
- `_record(op)` (`network.js:534-544`) logs deltas; `commit()` (`network.js:524-532`) pushes a snapshot (used after bulk ops like clear/merge).
- Op types (`_applyOp`, `network.js:636-674`): `add`, `del` (cascade to connected links, restore outlet/gage refs), `move`, `props`, `rename`, `units`.
- `undo/redo` (`network.js:565-586`); `_trimHistory` (`network.js:546-560`) drops oldest entries; `canUndo/canRedo` drive toolbar button states.

### 8.4 Mutations

`addNode` (`226-240`), `addLink` (`242-258`, auto-computes conduit length), `addSubcatchment` (`260-284`, auto-computes area in ha/ac and picks nearest hydraulic node as outlet), `moveNode/commitMove` (`318-336`), `updateProps` (`367-382`), `renameElement` (`384-393`), `deleteElements` (`414-451`), `setUnits` (`453-462`). Every mutation emits `Net.emit()` → `Net.onChange` subscribers re-render (`app.js:632-640`).

### 8.5 Serialization

`serialize()` (`network.js:465-488`) is the canonical model dump (version 2); `loadState()` (`network.js:490-520`) restores it, rebuilding indexes and the indexed mesh. `rawSections` (verbatim INP text from imports) is preserved so that data the UI has no editor for survives round-trips.

---

## 9. Map & Rendering Layer

### 9.1 Map initialization — `app.js`

- Default view: La Serena, Chile (`DEFAULT_CENTER = [-71.254, -29.908]`, `DEFAULT_ZOOM = 15.2` — `app.js:7-8`).
- `MAP_STYLES` (`app.js:16-25`): `streets` (`mapbox://styles/mapbox/streets-v12`), `satellite` (`satellite-streets-v12`), and a hand-built `blank` style (light background).
- `new mapboxgl.Map({… pitch:0, bearing:0, antialias:true, boxZoom:false })` stored as `window.map` (`app.js:27-38`), plus Navigation + Scale controls.

### 9.2 Layer stack — `ensureNetworkLayers` (`app.js:114-274`)

Sources and layers (source → layer ids):

| Source | Layers | Purpose |
|---|---|---|
| `draft` | `draft-line/fill/points` | Ghost geometry while drawing |
| `swmm-2d-mesh` | `swmm-2d-mesh-fill`, `swmm-2d-mesh-line` | 2D mesh cells (fill colored by results) |
| `swmm-subcatchments` | `swmm-subcatchments-fill`, `swmm-subcatchments-line` (dashed) | Drainage areas |
| `swmm-links` | `swmm-links-hit` (invisible 14 px), `swmm-links-layer`, `swmm-links-arrows` | Links + flow arrows |
| `swmm-nodes` | `swmm-nodes-layer` (circle, `promoteId:'id'`), `swmm-nodes-labels` | Nodes + labels |
| master plan / constraints | — | Imported background layers |

**Styling architecture:** color expressions `nodeColorExpr/linkColorExpr` (`app.js:77-89`) compose with `selectedCase(sel,hov,base)` (`app.js:91-94`) and `resultOr(base)` (`app.js:97-99`), which lets simulation result colors override base colors through Mapbox **feature-state** (`selected`, `hovered`, `resultColor`) — set via `window.setElementState` (`app.js:320-325`). This is why selection/hover/result styling needs no data re-send.

### 9.3 Re-render & DEM

- `refreshNetworkData()` (`app.js:276-293`) resends all sources + restores selection feature-state; `refreshNetworkDataForMove()` (`app.js:299-310`) is rAF-throttled and updates only nodes/links during drags.
- `map.on('style.load')` (`app.js:622-629`) re-runs layer creation after basemap swaps.
- **DEM elevation sampling** (`sampleDEMElevationAsync`, `app.js:437-495`): (1) in-memory mesh terrain sampler, else (2) OpenTopography point API for non-Mapbox sources (COP30/USGS10m/SRTMGL1/NASADEM/ANADEM/GEDTM30), else (3) Mapbox terrain-DEM + `map.queryTerrainElevation`. `sampleAllNodesDEM()` (`app.js:522-543`) loops all nodes. The synchronous variant (`sampleDEMElevation`, `app.js:497-520`) runs at node placement.

### 9.4 Overlays

- **Street View:** `street_view_overlay.js` (pegman + overlay), requires `GOOGLE_MAPS_API_KEY`.
- **OSM search:** `#osm-search` geocodes via OpenStreetMap.
- **Time slider:** `AnimationUI` (`ui.js:1086-1152`) — `setRange(maxSteps)`, `updateDisplay()` (calls `ResultStyling.applyToMapForStep`, `Tools.updateHoverPopup`, `ProfilePlot.update`, `StreetViewOverlay.scheduleRedraw`), `play()` (rAF loop at 500 ms/speed).
- **2D overlays:** GeoJSON isolines/bands/arrows (`mesh2dRender.js`) and a WebGL2 Gouraud custom layer (`meshGlLayer.js`) — see §12.5.

---

## 10. Simulation Pipeline

### 10.1 End-to-end flow

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

### 10.2 Pre-flight validation

`runSimulation` (`app.js:1392-1489`) aborts with a warning if: no nodes; no `OUTFALL`; or a 2D mesh is present while units are US (`app.js:1402-1406` — 2D is SI-only).

### 10.3 Duration estimate (cosmetic progress)

`estimateSimDurationMs(inpText, networkSize)` (`app.js:1083-1129`) parses `[OPTIONS]` START/END and `ROUTING_STEP` from the INP and extrapolates wall-clock time. The 1D Run-Status progress bar is driven by a `setInterval` against this estimate, capped at 99% then asymptoting to 100% (`app.js:1252-1271`).

### 10.4 Web Workers

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

### 10.5 1D vs 2D execution inside the engine

- **`simWorker.js`** — 1D-only blocking runner: writes one `.inp` to MEMFS, calls `stride(engine, 10_000_000, …)` once to run to completion, reads `/rpt.rpt` and `/out.out`, transfers the bytes. No frame sampling (`simWorker.js:76-81`).
- **`openSwmm2dWorker.js`** — 1D+2D runner: same lifecycle but advances in `stride(…, stepsPerYield=256)` chunks and **samples per-triangle frames in JS between strides** (`readFrame`, `openSwmm2dWorker.js:158-179`) — this is what produces the 2D animation timeline. Also reads 2D diagnostics (mass balance, solver steps, max velocity) and the report. No `.out` parsing on this path.
- **`webgpu/gpu2dWorker.js`** — same `results2d` contract, but the 2D advance runs on the GPU marcher (see §12.6) instead of the WASM solver.

### 10.6 Results

**`.out` binary parser — `swmmOutParser.js`:** reads the SWMM output-file footer (last six INT32s: `idNamesOffset, objPropsOffset, resultsOffset, numPeriods, errCode, magicEnd`), validates magic `516114522`, parses headers and variable counts, and exposes **zero-copy `Float32Array` views** over period records (`readResults`, `swmmOutParser.js:132-180`). Hot paths: `getTimeSeries(type,index,varIndex)` (cached, `:184-209`) and `getStepData(type,step,varIndex)` for per-step map coloring (`:212-230`).

**Presentation — `results.js`:** `.rpt` text is parsed once into summary tables (`parseNodeDepths`, `parseLinkFlows`, `parseFlooding`, `parseNodeInflows`, `parseOutfallLoadings`, `parseConduitSurcharges`, `parseSubcatchmentRunoffs`, `parseContinuityErrors`, `parseEngineErrors`, `parseTimeSeries` — `results.js:59-366`). `ResultStyling` (`results.js:369-547`) owns coloring: `applyToMapForStep(step)` (`:402-518`) paints 2D mesh frames first, then the optimized binary `.out` path, then the `.rpt` fallback. `displayResults` (`:790-1288`) builds KPI cards, continuity chips, color legends, sortable/filterable result tables with `IntersectionObserver` lazy sparklines, and fly-to-on-click. `display2DResults` (`:1291-1492`) colors the mesh per frame, exposes a depth/head/velocity selector, and drives the same time slider via a synthetic time series.

**Plotting:** `profile.js` `ProfilePlot.openForNodes` (`:630`) BFS-traces conduits, samples terrain, and draws a hydraulic profile (capacity color coding: red ≥1.0 surcharged, amber ≥0.85, cyan normal). `plot.js` `TimeSeriesPlot` (`:227`) charts multi-series time series from binary `.out` (preferred) or `.rpt` fallback.

---

## 11. The WASM Engine Bridge

### 11.1 The shipped binaries

`public/` contains **two identical engine builds** (same factory, same size 4,614,086 bytes, same stamp):

- `openswmm2d.js` + `openswmm2d.wasm` — used by `openSwmm2dWorker.js`, `gpu2dWorker.js`, and all `scripts/*.mjs`.
- `swmm6wasm.js` + `swmm6wasm.wasm` — a copy used by `simWorker.js` (legacy name).

Both are 2-line Emscripten glue exporting the factory **`createOpenSwmm2D`** (`swmm6wasm.js:1-2`). The `.version.json` files record the engine commit/describe/date (written by the build script).

### 11.2 Module instantiation

The wasm is **compiled once, instantiated per run** (~10–50 ms per re-instantiation, per `simWorker.js:8-12`):

```js
// simWorker.js:19-63 (condensed)
const module = await WebAssembly.compileStreaming(fetch('swmm6wasm.wasm')); // once
const factory = createOpenSwmm2D({ noInitialRun: true,
    instantiateWasm: (imports, cb) => WebAssembly.instantiate(module, imports).then(m => cb(m.instance)) });
const engine = await factory();   // fresh instance each run
```

`wasm/openswmm2d_exports.cpp` is deliberately **source-only** (6 lines): it includes the engine's public headers and nothing else, so Emscripten exports the C API as library functions without pulling in `main`/run lifecycle.

### 11.3 Exported C API (31 symbols in `EXPORTED_FUNCTIONS`)

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

### 11.4 JS wrapper layer — `openSwmm2dWorker.js`

- `bindApi(Module)` (`:79-107`) wraps every symbol with `Module.cwrap`; `optional()` returns `null` for symbols absent from a build, so one worker handles multiple engine configurations.
- `check(code, op, Module, reportPath, payload)` (`:109-148`) throws rich errors; on failure it dumps the `.rpt` (filtered error lines or last 1500 chars) and the first 3000 chars of the INP as `stderr` messages — this is your first stop when a simulation "fails silently".
- `readFrame(Module, api, engine, count, elapsedMs)` (`:158-179`) mallocs depth/head/velocity arrays, bulk-reads them, returns Float64Arrays, frees in `finally`.
- `readVelocity(...)` (`:196-229`) reconstructs **cell-centered physical velocity** from edge flux + edge geometry via a least-squares solve of `(NᵀN)v = Nᵀq` (q = flux/length), converting specific discharge to velocity (`/h`); dry cells (`h ≤ dryDepth`) are zeroed.
- `readDiagnostics(...)` (`:231-257`) reads mass balance, solver internal steps, max-velocity stats.
- `run(payload)` (`:259-368`) is the 2D run loop: write `/model2d.inp` (+ optional mesh file) → lifecycle `open→initialize→start` with `check()` after each → `do/while` `stride(engine, 256, …)` sampling frames at `frameIntervalMs` → final frame + diagnostics → `end→report` → post `results2d`.

### 11.5 Memory management

- All pointers come from `Module._malloc(bytes)` and are freed with `Module._free(ptr)`; scalar reads use `Module.getValue(ptr, 'double'|'i32')`; the code never touches raw HEAP views directly.
- Files go to the Emscripten MEMFS virtual filesystem: `FS.writeFile('/in.inp', inpText)`, `FS.readFile('/rpt.rpt', {encoding:'utf8'})`, `FS.readFile('/out.out')` returning a `Uint8Array` **view on the wasm heap**. The worker slices a copy out (`outBytes.buffer.slice(...)`, `simWorker.js:162`) so the heap buffer can be detached on transfer.
- 2D worker unlinks its temp files in `finally` (`openSwmm2dWorker.js:364-366`).

---

## 12. The 2D Mesh & WebGPU Subsystem

This is the experimental surface-routing work. Two generations coexist:

1. **Legacy mesh generator** (`mesh2d.js`) — `poly2tri` per-subcatchment triangulation with an earclip fallback ladder.
2. **Production Triangle pipeline** (`mesh2dPslg.js` + `mesh2dTriangle.js` + `mesh2dTerrain.js`) — constrained Delaunay over the whole domain via the vendored Shewchuk Triangle WASM.
3. **WebGPU marcher** (`public/webgpu/`) — a WGSL re-implementation of the engine's explicit local-inertial solver, run in parallel to (and as an alternative to) the WASM 2D solver.

### 12.1 Coordinate foundation — `mesh2dProj.js`

All mesh geometry uses **local metres relative to an origin centroid** with an equirectangular approximation: `makeTransform(origin)` (`mesh2dProj.js:16`); `METERS_PER_DEGREE_LAT = 111320`; lng scaled by `cos(lat)`. `originFromModel(Net)` (`:43`) = centroid of node + subcatchment vertices. Not a true projection, but adequate for km-scale domains.

### 12.2 The mesh data model — `Net.setIndexedMesh` (`network.js:874`)

```js
mesh2DIndexed = {
  origin: { lng, lat },
  vertices: [{ x, y, z, lng, lat, tag, nodeId }],       // local metres + geo + rim Z
  triangles: [{ v:[i0,i1,i2], n, tag }],                // n = Manning's, tag = subcatchment id
  vertexNodeMap: [{ vertexIndex, nodeId, cd, area }],   // 1D↔2D coupling rows
  nodeVertexIndex: { nodeId → vertexIndex },
  options: { solver + coupling options }
}
```

The legacy `Net.mesh2D[]` cell array (closed rings, stable `M2D_<i+1>` ids) is derived from it for the map layers. `inpParser.js:496-519` re-hydrates the same shape from `.inp`.

### 12.3 PSLG construction — `mesh2dPslg.js`

`Mesh2DPslg.fromNetwork(sources, opts)` (`mesh2dPslg.js:128`) builds the Triangle PSLG in numbered phases:

1. **Boundary** (`:185`): a GeoJSON polygon is projected, Douglas-Peucker simplified (`dpSimplify`, `:53`) and densified (`densify`, `:84`); constraint segments with `marker=1`; default background region `attr=0`. Without a boundary, an **auto domain** = convex hull (`convexHull`, `:116`) buffered by `domainBuffer` (default 50 m).
2. **Subcatchments** (`:271`): each becomes a Triangle **region seed** (mapped via `regionAttrToSub`) and optionally a constraint ring (`marker=2`) when `useSubRings`.
3. **Nodes** (`:292`): hydraulic nodes become **Steiner vertices** tagged with their node id (enforcing `minNodeSep`); with `useRimZ`, vertex Z = `invertEl + maxDepth` (rim).
4. **Conduits** (`:327`): conduit paths become constraint segments with unique `marker=100+k`, mapped back via `markerToConduit`.
5. **Constraint layers** (`:349`): imported points/lines/polygons become constraint vertices/segments (`marker=3`); polygons ticked **"block flow (impermeable)"** become **holes** (with a "swallows domain" guard).
6. **Segment dedupe** (`:409`) by `min:max` point key; **crossing-segment removal** (`:422`) via a bbox-grid (25 m buckets) `segsCross` test.
7. **Flatten radius** (`:473`): vertices near a node vertex inherit its rim Z (ponding-basin flattening).
8. **Terrain Z** (`:502`): remaining vertices get `opts.sampleZ(x,y)`.

`_addPt` (`:157`) is a spatial-hash snap-merge inserter; `interiorPoint` (`:33`) picks hole/region seeds.

### 12.4 Triangulation & terrain — `mesh2dTriangle.js` / `mesh2dTerrain.js`

- `Mesh2DTriangle.triangulate(pslg, quality, ctx)` (`:92`) packs the PSLG into Float64/Int32 arrays and runs Triangle with switches: `pQAY` (PSLG, quiet, attributes, no-boundary-Steiner when requested), `q{minAngle}` (default **33°**), `a{maxArea}` (default 200 m²) or regional area list, `S{maxSteiner}`. Output vertices are matched back by 1 mm `CoordHash` (`:21`); Manning's n comes from region attribute → subcatchment lookup (`manningForSub`, `:36` — priority: land-cover class → `nPerv` → `nImperv` → default).
- `runGeneration(sources, quality, ctx, log)` (`:251`) orchestrates with hard budgets:
  - **`trianglePointBudget` = 8000 points** (Triangle WASM heap is fixed at 16 MB) — big models drop subcatchment rings + conduit constraints and reassign roughness by centroid.
  - **`autoAreaCap`** (`:331`): max area capped to `domainArea/15000`, minAngle clamped to 30°, `maxSteiner` 30000, boundary Steiner disabled.
  - **`maxTriangleRegions` = 256** (`:361`): beyond that all region seeds collapse and tags/n are assigned by centroid.
  - **Fallback** to the poly2tri generator (`:380`) on Triangle failure.
- `Mesh2DTerrain.makeSampler(settings, map)` (`mesh2dTerrain.js:24`): `MAPBOX` → `map.queryTerrainElevation`; `OPENTOPOGRAPHY_*` → OpenTopography bbox API; `GEOTIFF` → geotiff.js `readRasters` with **bilinear interpolation** (`:109`), nodata handling, proj4 reprojection, and `refreshBounds()` exposing the raster footprint as an auto domain.
- `resolveVertexElevations(...)` (`:123`): rim-Z first → sampler → **IDW fallback (k=4)** → 0.
- `thinTerrain(sampler, domain, opts, transform)` (`:152`): **terrain-adaptive thinning** — grid of ≤300×300 candidates scored "most-curved-first" by local surface-normal deviation, accepted with min spacing and edge buffer.

### 12.5 Coupling & INP serialization

- `Mesh2DCoupling.buildVertexNodeMap(indexed, nodes, opts)` (`mesh2dCoupling.js:5`) dedupes vertex↔node rows; default coupling coefficient `cd = 0.65`.
- `Mesh2DInp.buildInput(baseInp, cells, map, options)` (`mesh2dInp.js:162`) rejects US units (`:163`), prefers the indexed mesh (overlaying current dialog solver options onto stored ones, `:175-184`), and delegates to `Mesh2DExport.buildInline` (`mesh2dExport.js:54`) or `buildExternal` (`:68`, `[2D_MESH_FILE]` + `.2dm`).
- Sections emitted: `;; UNITS: SI (m)`, `;; 2D_ORIGIN lng lat`, `[2D_OPTIONS]`, `[2D_VERTICES]` (`X Y Z TAG`), `[2D_TRIANGLES]` (`V1 V2 V3 MANNINGS_N TAG`), optional `[2D_VERTEX_NODE_MAP]`.
- `Mesh2DExport.optionLines` (`:22`) emits solver options: `MAX_TIMESTEP`, `DRY_DEPTH`, `COUPLING_CD`, `COUPLING_SYNC`, `THETA`, `CFL_NUMBER`, `H_MOVE`, `LTS_TIERS`, `FROUDE_MAX`, `LIMITER_EPSILON`, `FLUX_DH_EPS`, `CELL_CLOSURE`, `FACE_RECONSTRUCTION`, `VFR_MIN_WET_FRAC`, `INTEGRATOR EXPLICIT`, `COUPLING_AREA`, optional `RAINFALL_MODE`, `REPORT_2D`.
- The mesh dialog (`mesh2dDialog.js`) orchestrates everything from a 3-tab modal (Sources/Quality/Hydraulics): `generate()` (`:369`) assembles sources, transform, terrain sampler, quality/ctx, runs `Mesh2DTriangle.runGeneration`, resolves elevations, builds `vertexNodeMap`, and calls `Net.setIndexedMesh`. Defaults (`defaultSettings`, `:16`) persist to `localStorage` with migrations (v4 aligns `LTS_TIERS 4`, `MAX_TIMESTEP 10`, `H_MOVE 0.003`; v5 aligns `THETA 0.8`, `CFL_NUMBER 0.7`, `FROUDE_MAX 1.5`, `COUPLING_SYNC 0`, `FLUX_DH_EPS 0.004`, `VFR_MIN_WET_FRAC 0.01` — all per the engine's `SolverOptions2D.hpp` / Ref Manual Vol II Ch9 §9.11).

### 12.6 Rendering the 2D simulation

Two complementary layers:

- **GeoJSON overlays — `mesh2dRender.js`:** `Mesh2DLayers.ensure(map)` (`:95`) creates sources/layers for vertex points, depth isolines (`isolines`, `:32`), depth contour **bands** (`contourBands`, `:50` — dry part clipped below the canonical `View2D.DEPTH_MASK_M` (5 mm) so the uniform-rain film stays invisible), velocity arrows (`velocityArrows`, `:89`, threshold `mag < 0.002`, arrow size `√(mag/max)` clamped 0.4–1.8), and elevation bands/isolines. `onStep(step, frame)` (`:127`) rebuilds the vertex depth field (from `frame.vertex.depth` or, when the engine emits per-cell depths, area-weighted from **wet cells only** so wet depths never bleed into dry vertices) each animation frame. Exposed in the layer tree (12 toggles).
- **WebGL2 Gouraud layer — `meshGlLayer.js`:** `MeshShadeLayer` (`:6`) is a Mapbox custom layer (`renderingMode:'2d'`) with GLSL ES 3.0 shaders and a 5-stop color ramp (`#2e7dd1 → #26a69a → #ffca28 → #f57c00 → #d32f2f`). `setField` (`:16`) encodes `t = clamp((v−min)/(max−min))` with wet-only alpha. `Mesh2DGL.ensure` (`:18`) adds `m2d-smooth-depth-fill` and `m2d-mesh-terrain` below the classic per-cell fill (`swmm-2d-mesh-fill`, which is colored per-triangle via feature-state `resultColor`, `results.js:393/433`).

### 12.7 The WebGPU marcher — `public/webgpu/`

- **`webgpuMarscher.js`** — `buildEdges(mesh)` (`:23`) is a **bit-exact port of the engine's `InertialEdges.cpp`** (per-triangle centroid/area/bed, edge keys by sorted vertex pair, outward normals, Phase-1 interior edges, `cell_lchar = 2·area/xiMax`, per-cell CSR). `WebGPUMarcher` (`:171`) uploads packed SoA buffers and compiles **one compute pipeline with a 16-binding bind group** (`_compile`, `:338`) plus 15 compute pipelines. `advance(t0,t1,rain)` (`:592`) mirrors `ExplicitInertialSolver::advance` — rebuild cadence 4, `K=1` global-dt path, `K>1` LTS macro-cycle, `dtFloor` guards f32 Perot-speed CFL collapse.
- **`shaders/marcher.wgsl`** (the only shader file) — a 1:1 f64→f32 port of `InertialKernels.hpp`. Params travel as a flat `array<f32>` (struct-typed storage bindings misbehave on some drivers). Kernels: `faceFlux` (de Almeida & Bates local-inertial face update + exporter-cell positivity budget `β/3·V`), `cellUpdate` (Perot cell discharge), `lazySources`, `seedActive` (hysteretic activation `h_on = hMove+0.001`, `h_off = hMove−0.001`; coupling cells pinned), `halo`, `couplingExchange` (C¹-regularized orifice `Q = cd·Aeff·√(2g)·φ`, drain capped by `β·V/dt`, spill capped by a per-node drawn ledger), `cflReduce`/`cflArgmin` (atomicMin dt0 bitcast + argmin cell), and the LTS v2 set (`settleAcc`, `tierAssign`, `faceTierAssign`, `degenTier`/`degenFaceTier`, `faceFluxLts`, `cellUpdateLts` with refire = `2^(tier_exp − face_tier)`).
- **`couplingSplit.js`** — the M2 split machinery (worker-safe): `parse2DMesh`/`parse2DOptions` (`:18`/`:43`), `nodeOrder` (`:67`, node index = parse order across JUNCTIONS/OUTFALLS/STORAGE/DIVIDERS sorted by global text position — a fixed walk mis-indexes some INPs), `buildVertexStencil` (`:95`, Jawahar-Kamath partition-of-unity weights), `parseCoupling` (`:144`, crown = `(invert+fullDepth)·len12`; `COUPLING_AREA DEFAULT` → `A = clamp(1.25·Amax_conduit, 0.05, 2.0)` m²; **vertex points resolve to the lowest-bed incident cell**, per `SurfaceRouter2D.cpp:394-412`), `build1DInp` (`:283`, strips 2D sections, forces `ALLOW_PONDING YES`, **preserves the model's own adaptive VARIABLE_STEP** — a former pin to 0 corrupted the 1D solve), `rainMpsAt` (`:331`, gage-mean rain, INTENSITY/CUMULATIVE/VOLUME handling), and the core **`runSplit`** (`:400`): fill each coupling window by time, freeze 1D node state into 9-float `cplF` rows, guard non-finite state (`COUPLING_STATE_NONFINITE`), `marcher.advance`, feed `∫Q` back via `setLatInflow(exch/dtBatch)` (matching the engine's two-window-mean queue delivery), emit frames, compute real mass balance.
- **`gpu2dWorker.js`** — the production worker (same `run2d` contract as `openSwmm2dWorker.js`): loads the WASM engine for the **1D leg only**, requires `maxStorageBuffersPerShaderStage: 16` (`requestGpuDevice`, `:70`; throws `WEBGPU_UNAVAILABLE` otherwise), writes a 1D-only INP, `setPondArea(tri_area)` per coupling node, then `CouplingSplit.runSplit` with a 60 s coupling window.
- **`harness.html`** — M0/M1/M2 validation page (see §15, `run-webgpu-harness.mjs`). Gates: **conservation ≤ 0.5 %, mean-depth ≤ 1e-3 m, median Pearson correlation ≥ 0.5**; M2 exchange within 5 %, temporal corr ≥ 0.9.

### 12.8 WebGPU roadmap status (from `WEBGPU_PLAN.md`)

| Milestone | Scope | Status |
|---|---|---|
| M0 | Harness: `navigator.gpu` detect, device, canvas | ✅ (Chrome headed only; headless has no WebGPU) |
| M1 | Global-dt marcher: faceFlux+cellUpdate+rain | ✅ statistical parity |
| M2 | 1D+2D split coupling | ✅ PASS (marcher-cpl: exch Δ≈0, medianCorr 0.865, temporalCorr 1.0) |
| M2.x | Vertex coupling + production worker | ✅ Bellinge runs on GPU |
| M3 | Boundary conditions + LTS v2 | ✅ LTS v2 done; NORMAL_FLOW / SPECIFIED_STAGE pending |
| M4 | renderDepths + UI WebGPU/WASM toggle | pending |
| M5 | Benchmark & hosting | pending |

**Hard limits & honest verdicts recorded in the plan:**

- **Apple Silicon / Metal (≤10 storage buffers) cannot run the backend** — 16 storage buffers exceed Metal's limit; the worker throws `WEBGPU_UNAVAILABLE` and the app falls back to WASM.
- f32/f64 divergence in `max|Δdepth|` is accepted; validation is statistical.
- **Honest performance verdict:** GPU 2D is fast (0.13 ms/substep) but the 1D dynamic wave is ~90 % of wall time in both backends, so the split is currently *on par with* the engine, not faster.

---

## 13. Data Formats

### 13.1 Project file (`.oswmm.json`)

The JSON produced by `Net.serialize()` (`network.js:465-488`) — a full snapshot of `{title, units, options, nodes, links, subcatchments, mesh2D, mesh2DIndexed, timeseries, curves, lidControls, lidUsages, pollutants, landUses, treatments, aquifers, snowpacks, snowpackAssignments, rawSections, …}`. This is what **Save** writes and **Load** reads.

### 13.2 INP dialect (standard SWMM + 2D extensions)

Written by `inpExporter.generateInp` (`inpExporter.js:7-715`) in a stable section order:

```
[TITLE] [OPTIONS] [EVAPORATION] [RAINGAGES] [RDII_DECAY]
[SUBCATCHMENTS] [SUBAREAS] [INFILTRATION]
[JUNCTIONS] [OUTFALLS] [STORAGE] [DIVIDERS]
[CONDUITS] [LOSSES] [PUMPS] [WEIRS] [ORIFICES] [OUTLETS] [XSECTIONS]
[TIMESERIES] [TAGS] [REPORT]
[COORDINATES] [VERTICES] [POLYGONS] [SYMBOLS]
  2D mesh sections:
  ;; UNITS: SI (m)
  ;; 2D_ORIGIN <lng> <lat>
  [2D_OPTIONS]
  [2D_VERTICES]  X Y Z TAG
  [2D_TRIANGLES] V1 V2 V3 MANNINGS_N TAG
  [2D_VERTEX_NODE_MAP]   (optional)
  [2D_MESH_FILE] FILE <name>.2dm   (external mode)
[CURVES] [LID_CONTROLS] [LID_USAGE] [POLLUTANTS] [LANDUSES] [BUILDUP] [WASHOFF]
[TREATMENT] [AQUIFERS] [GROUNDWATER] [SNOWPACKS] [SNOWPACK_ASSIGNMENT]
+ any unrecognized rawSections re-emitted verbatim (inpExporter.js:696-712)
```

Key export behaviors: option precedence UI value → `opt.raw` → default (`inpExporter.js:47-50`); `REPORT_STEP` heuristic from imported value → first gage interval → 1 h (`:54-69`); OUTFALL column-shift for stage types (`:207-215`); WEIR ROADWAY handling (`:287-295`); `REPORT` whitelist (`:390-403`).

The parser (`inpParser.js:7-29`) is **lossless**: every section is kept tokenized (`sections`) *and* raw (`rawSections`), so anything the UI can't edit survives export.

### 13.3 `.out` binary format (SWMM output)

Parsed by `swmmOutParser.js` (§10.6): footer magic `516114522`, version/flow-units header, length-prefixed ID name tables, variable counts per object class, and per-period Float32 records for subcatchments (8 vars), nodes (6), links (5), and system (14). Exposed as zero-copy typed-array views.

### 13.4 `.2dm` mesh file (external mode)

`Mesh2DExport.build2dmText` (`mesh2dExport.js:40`) emits the same `2D_VERTICES`/`2D_TRIANGLES`/`2D_OPTIONS` content as standalone text referenced via `[2D_MESH_FILE]`.

---

## 14. The Build System

### 14.1 Toolchain locations

| Tool | Location | Version (reference) |
|---|---|---|
| Emscripten SDK | `.tools/emsdk/` (git-ignored) | `emcc` 6.0.6 |
| vcpkg | `.tools/vcpkg/` (git-ignored) | 2026-07-27 |
| CMake | system (`pacman -S cmake`) | ≥ 4.4.0 required by vcpkg baseline |
| Ninja | system | build generator (`-G Ninja`) |
| Node | system | for scripts + `npm install` |

**Install from scratch (Arch/EndeavourOS):**

```bash
sudo pacman -S --needed base-devel nodejs npm cmake ninja curl zip unzip tar git
git clone --branch experimental <repo> && cd LocalSWMM
git submodule update --init --recursive          # fetch third_party/openswmm-engine
mkdir -p .tools
git clone --depth 1 https://github.com/emscripten-core/emsdk.git .tools/emsdk
cd .tools/emsdk && ./emsdk install latest && ./emsdk activate latest && cd ../..
git clone --depth 1 https://github.com/microsoft/vcpkg.git .tools/vcpkg
cd .tools/vcpkg && ./bootstrap-vcpkg.sh -disableMetrics && cd ../..
npm install
```

### 14.2 The build script — `scripts/build-openswmm2d.sh`

1. Locates `.tools/emsdk`, `.tools/vcpkg`, source `cmake/wasm`, build dir `build/openswmm2d-wasm-emscripten`; sources `emsdk_env.sh` if `emcmake` isn't on PATH.
2. Guards: engine submodule present; vcpkg toolchain present.
3. Exports `VCPKG_DEFAULT_TRIPLET=wasm32-emscripten`, `VCPKG_OVERLAY_TRIPLETS=$ROOT/vcpkg-triplets`, `EMCC_SKIP_SANITY_CHECK=1`.
4. `emcmake cmake -S cmake/wasm -B build/openswmm2d-wasm-emscripten -G Ninja` with flags:

| Flag | Value |
|---|---|
| `CMAKE_BUILD_TYPE` | `Release` |
| `CMAKE_TOOLCHAIN_FILE` | `.tools/vcpkg/scripts/buildsystems/vcpkg.cmake` |
| `VCPKG_CHAINLOAD_TOOLCHAIN_FILE` | `$EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake` |
| `VCPKG_TARGET_TRIPLET` / `VCPKG_DEFAULT_TRIPLET` | `wasm32-emscripten` |
| `VCPKG_MANIFEST_DIR` | repo root |
| `VCPKG_MANIFEST_NO_DEFAULT_FEATURES` | `ON` |
| `OPENSWMM_BUILD_2D` | `ON` |
| `OPENSWMM_FORCE_SCALAR` | `ON` (no SIMD on wasm32) |
| `OPENSWMM_ENABLE_LTO` | `OFF` (`.sh`; the `.ps1` uses `ON` + `-msimd128`) |
| `OPENSWMM_WITH_GEOPACKAGE` | `OFF` |
| `OPENSWMM_BUILD_GPU_PLUGIN` | `OFF` |
| `OPENSWMM_BUILD_TESTS` | `OFF` |
| `CMAKE_CROSSCOMPILING_EMULATOR` | `.tools/emsdk/node/*/bin/node` (so `FindOpenMP` can run its probe) |
| `CMAKE_C_FLAGS` / `CMAKE_CXX_FLAGS` | `-fopenmp` (defines `SWMM_USE_OPENMP` → the solver's `#pragma omp` loops go live) |
| `OPENSWMM_INSTALL` | `OFF` |

The wrapper `cmake/wasm/CMakeLists.txt` adds `-pthread` +
`-s PTHREAD_POOL_SIZE=4` (+ `PTHREAD_POOL_SIZE_STRICT=0`): the OpenMP loops map
to Emscripten pthreads backed by `SharedArrayBuffer`. That makes the build
**browser-only** — the page must be cross-origin isolated (COOP/COEP; see
`public/_headers` / `server.py`). Models opt in with `THREADS n` in `[OPTIONS]`
(default 1, bit-identical results); the 2D solver auto-degrades to 1 thread
below `4·THREADS` triangles. A plain-Node reference run (`run-engine-marcher.mjs`)
therefore needs a non-threaded build.

5. `cmake --build … --target openswmm2d_wasm --parallel` (the static `libopenswmm.engine.a` links into the modular JS/WASM pair).
6. **Copies** `public/openswmm2d.wasm → public/swmm6wasm.wasm`, `openswmm2d.js → swmm6wasm.js`, and `openswmm2d.worker.js → swmm6wasm.worker.js` (legacy aliases; the worker file is only emitted if the toolchain produces one).
7. **Stamps** `public/openswmm2d.version.json` + `public/swmm6wasm.version.json` with `engineCommit`, `engineDescribe` (`git describe --always --dirty --tags`), `builtAtUtc`.

Run it with `npm run build:2d-wasm:sh` (Linux) or `npm run build:2d-wasm` (Windows PowerShell `.ps1`).

### 14.3 The vcpkg manifest & triplet

Root `vcpkg.json` deps: **`eigen3`, `hdf5`, `nlohmann-json`, `sundials`**. (HDF5 is needed by the 2D module's `Default2DOutputPlugin`; SUNDIALS is declared but the current explicit marcher no longer uses it.)

`vcpkg-triplets/wasm32-emscripten.cmake` (why each line matters):

| Line | Meaning |
|---|---|
| `VCPKG_TARGET_ARCHITECTURE wasm32` | 32-bit wasm ABI |
| `VCPKG_CRT_LINKAGE static` / `VCPKG_LIBRARY_LINKAGE static` | static only — Emscripten links everything into one `.wasm` |
| `VCPKG_CMAKE_SYSTEM_NAME Emscripten` | vcpkg Emscripten cross-build mode |
| `VCPKG_ENV_PASSTHROUGH_UNTRACKED "EMSDK;EMSDK_NODE;EMSDK_PYTHON;PATH"` | ports inherit the SDK env |
| `VCPKG_CHAINLOAD_TOOLCHAIN_FILE "$ENV{EMSDK}/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake"` | the actual Emscripten platform module |
| `VCPKG_BUILD_TYPE release` | release variants only |

> **Manifest subtlety:** the engine submodule ships its *own* `vcpkg.json` (gtest, sqlite3, kokkos…). Because the WASM wrapper consumes the engine via `add_subdirectory`, vcpkg honors only the **top-level** manifest (`VCPKG_MANIFEST_DIR=$ROOT`), so the root manifest governs the WASM build. `VCPKG_MANIFEST_NO_DEFAULT_FEATURES=ON` keeps the engine's `2d`/`gpu` default features (which would drag in HDF5/Kokkos *again*) out.

### 14.4 The CMake wrapper — `cmake/wasm/CMakeLists.txt`

The wrapper exists because upstream removed the `OPENSWMM_WASM_INJECT_FILE` hook, so the wasm target can no longer be declared inside the engine tree. The wrapper:

- `add_subdirectory(../../third_party/openswmm-engine …)` (same embedding the upstream Python bindings use).
- `add_executable(openswmm2d_wasm wasm/openswmm2d_exports.cpp)` + `target_link_libraries(openswmm2d_wasm PRIVATE openswmm_engine)`.
- Output `openswmm2d` into `public/`.

**emcc link flags** (`cmake/wasm/CMakeLists.txt:34-48`) and their meaning:

| Flag | Meaning |
|---|---|
| `-s WASM=1` | WebAssembly output |
| `-s MODULARIZE=1`, `-s EXPORT_NAME=createOpenSwmm2D` | wrap output in the factory function |
| `-s EXPORT_ES6=0`, `-s ENVIRONMENT=web,worker` | classic wrapper, usable in main thread + workers |
| `-s ALLOW_MEMORY_GROWTH=1` | heap can grow past `INITIAL_MEMORY` |
| `-s FILESYSTEM=1` | MEMFS virtual FS (for `.inp`/`.rpt`/`.out`) |
| `-s DISABLE_EXCEPTION_CATCHING=0` | keep C++ exceptions |
| `--no-entry` | library module, no `main` |
| `-s EXPORTED_RUNTIME_METHODS=['cwrap','FS','getValue']` | runtime helpers |
| `-s EXPORTED_FUNCTIONS=[…31 symbols…]` | exact C API surface (see §11.3) |
| `-s INITIAL_MEMORY=134217728` (128 MiB), `-s STACK_SIZE=5242880` (5 MiB) | memory sizing |
| `-s WASM_ASYNC_COMPILATION=1` | async compile (all callers use `instantiateWasm`) |

`cmake/OpenSwmm2DWasm.cmake` is a **legacy sibling** of the same target (not referenced by the build scripts).

### 14.5 The engine submodule & the wasm compatibility fix

`third_party/openswmm-engine` is a **git submodule** (`https://github.com/JoaquinAlvarado-py/openswmm.engine.git`). The `experimental` branch pins a commit that is **not buildable for Emscripten out of the box**: `src/engine/plugins/PluginFactory.cpp` uses `dlopen`/`dlsym` and its platform `#if` chain doesn't handle `__EMSCRIPTEN__` (`#error "PluginFactory: unsupported platform"`).

The fix (commit `85e4be38`, *"fix(wasm): emscripten compatibility and build shims for web execution"*, cherry-picked from the engine's `swmm6_rel` branch onto the pinned `2932a5b` and committed locally) makes the wasm build work by:

1. Building `openswmm_engine` and the legacy libraries as **STATIC** under `EMSCRIPTEN` (`src/engine/CMakeLists.txt`, `src/legacy/*/CMakeLists.txt`).
2. Stripping `__attribute__((visibility(...)))` export macros (`include/openswmm/engine/openswmm_engine_export.h`, `openswmm_legacy_solver_export.h`).
3. Adding Emscripten no-ops to `PluginFactory.cpp`: dynamic loading disabled, `discover()` early-returns, `.wasm` treated as a shared-library extension.
4. Re-adding the `OPENSWMM_WASM_INJECT_FILE` include hook in the top-level `CMakeLists.txt`.

The LocalSWMM repo carries commit `83dc0df` *"submodule: pin openswmm-engine with wasm compatibility fix"* which moves the gitlink to `85e4be38`. The engine is otherwise described as `v6.0.0-alpha.1-347-g85e4be38`.

> ⚠️ **If you re-pin the submodule or run `git submodule update`, keep the wasm-compat commit** or the WASM build will fail again at `PluginFactory.cpp`. The prebuilt binaries in `public/` were built from `85e4be38` and are unaffected by the submodule pointer.

### 14.6 Rebuilding the WASM engine

```bash
cd ~/LocalSWMM
npm run build:2d-wasm:sh        # = bash scripts/build-openswmm2d.sh
# outputs: public/openswmm2d.{js,wasm}, public/swmm6wasm.{js,wasm}, *.version.json
```

First build compiles the four vcpkg ports for `wasm32-emscripten` (Eigen/HDF5/nlohmann-json/SUNDIALS) — allow 10–40 minutes. Subsequent builds use the vcpkg binary cache. The rebuilt binaries are **tracked files** — commit them with the engine stamp when they change.

---

## 15. Scripts, Benchmarks & Verification

All run from the repo root with `node scripts/<name>.mjs`. The common pattern: shim `globalThis.self/window`, load `public/openswmm2d.js`, instantiate `openswmm2d.wasm` synchronously in Node, wrap the C API with `Module.cwrap`. Several spawn `server.py` + a Chrome instance via CDP.

### 15.1 Benchmarks & probes (engine in Node)

| Script | Purpose | Usage |
|---|---|---|
| `bench-1d-bellinge.mjs` | Per-stride / per-window / freeze / cplF costs on Bellinge; projects 48 h wall time | no args |
| `bench-1d.mjs` | Bare 1D stride benchmark; JSON output | `node bench-1d.mjs <inp> [--wasm <path>] [--tag <l>] [--keep-vs]` |
| `probe-1d.mjs` | Per-step junction head/depth dump (capped 80 steps) | `node probe-1d.mjs <inp>` |
| `probe-1d-coupl.mjs` | Split-like 1D load: `setPondArea` + alternating `setLatInflow`; dt histogram | no args (Bellinge fixture) |
| `probe-1d-nan.mjs` | Full 48 h 1D run scanning heads/depths/volumes for NaN/Inf | `node probe-1d-nan.mjs [VS]` |
| `probe-cpl.mjs` | Per-stride coupling volume deltas from the 10-slot mass-balance buffer | `node probe-cpl.mjs <inp>` |
| `run-engine-marcher.mjs` | Reference 2D run: per-frame depth/head/velocity + node heads + mass balance → JSON. Requires a **non-threaded** wasm build (the threaded build needs a browser) | `node run-engine-marcher.mjs <inp> <out.json> [--frames N] [--interval <sec>] [--wasm <p>]` |
| `bench-wasm-threads.mjs` | **Threaded-engine gate:** runs the production `openSwmm2dWorker.js` in cross-origin-isolated Chrome at THREADS 1 vs N; reports wall time + bit-identical continuity | CDP 9225 | `node bench-wasm-threads.mjs [--inp <p>] [--threads 1,4] [--minutes <n>]` |

### 15.2 Synthetic input generators

| Script | Purpose | Usage |
|---|---|---|
| `make-marcher-inp.mjs` | M1 closed-basin 2D INP (WALL boundaries, sine-bed) | `node make-marcher-inp.mjs <nx> <ny> <dx> <rainMmHr> <min> <out.inp>` |
| `make-marcher-cpl-inp.mjs` | M2 1D↔2D coupling INP (storage S1 + conduit + outfall, cell 0 coupled) | `node make-marcher-cpl-inp.mjs <out.inp>` |

### 15.3 Chrome/CDP end-to-end harnesses

| Script | Purpose | Port | Usage |
|---|---|---|---|
| `verify-bellinge.mjs` | **Flagship gate:** headless Chrome loads the app, projects Bellinge to EPSG:25832, auto-loads `Bellinge2.tif`, generates the mesh, runs the whole 48 h model through the app's own worker, asserts frames/depths/mass-balance/continuity | CDP 9222 | no args; writes `scripts/verify-out/` |
| `verify-1d-split.mjs` | Regression gate for the split's 1D leg (uses production `couplingSplit.js`; fails on non-finite coupling heads) | — | `node verify-1d-split.mjs <inp> [--wasm <p>] [--tol <%>] [--hours <n>] [--json]` |
| `test-gpu-worker.mjs` | Drives the production `gpu2dWorker.js` through the app's `run2d` contract in headed Chrome | CDP 9224 | `node test-gpu-worker.mjs [--inp <p>]` |
| `bench-gpu-coupl.mjs` | Per-window GPU split timings (`strideMs/freezeMs/advanceMs/exchMs/dt0/substeps`), extrapolates 48 h wall time | CDP 9225 | `node bench-gpu-coupl.mjs [--windows N] [--lts N] [--cadence N] [--dtfloor N] [--dbgcell N] [--inp <p>]` |
| `run-webgpu-harness.mjs` | Drives `public/webgpu/harness.html` M1/M2 parity + bench in **headed** Chrome (headless has no WebGPU); stages fixtures into `public/webgpu/fixtures/` from `scripts/verify-out/` | CDP 9223 | `node run-webgpu-harness.mjs [fixture…] [--coupled] [--bench] [--lts N] [--hours N]` |
| `test-2d-render.mjs` | Render-pipeline smoke test: velocity arrows, contour bands regression, robust frame-max, WebGL2 shader compile, `display2DResults` finiteness | CDP 9225 | no args |

> **Note:** `public/webgpu/fixtures/` is **not committed** — the harness scripts generate/stage it from `scripts/verify-out/`. If a fixture is missing, run the generator first (`make-marcher-*.mjs`) or `verify-bellinge.mjs`.

---

## 16. Server & CI/CD

### 16.1 `server.py`

A zero-dependency static server (Python stdlib):

| Aspect | Value |
|---|---|
| Bind | `127.0.0.1` only |
| Port | **8080** |
| Document root | `<repo>/public` |
| Endpoints | `GET /api/status` → `{"status":"running","msg":"3D Map Prototype Server Online"}`; everything else = static GET |
| Headers | `Cache-Control: no-store` (fresh wasm/JS every reload) |
| CORS | `Access-Control-Allow-Origin: *` on OPTIONS + `/api/status` |
| Concurrency | `ThreadingTCPServer`, `daemon_threads=True` |

Scripts auto-spawn it when `http://127.0.0.1:8080/api/status` is unreachable.

### 16.2 CI — `.github/workflows/static.yml`

**GitHub Pages deploy only — there is no WASM build in CI.** The engine is built locally on `experimental` and the artifacts are committed to `public/`.

1. Triggers: push to `main` + `experimental`, or manual dispatch.
2. Checkout (v4, no `submodules: recursive` — prebuilt wasm ships in `public/`).
3. **Generate `public/config.js` from secrets** (`MAPBOX_ACCESS_TOKEN`, `GOOGLE_MAPS_API_KEY`, `OPENTOPOGRAPHY_API_KEY`).
4. Upload `./public` as a Pages artifact → deploy with `actions/deploy-pages@v4`.

---

## 17. Development Workflow

### 17.1 Normal edit loop (frontend)

```bash
cd ~/LocalSWMM
python3 server.py &            # serves on 8080, no cache
# edit public/*.js, reload http://127.0.0.1:8080
```

### 17.2 Changing the WASM engine

```bash
# 1. edit the engine (submodule) or your fork, commit it there
cd third_party/openswmm-engine
# ... make changes, commit, push to your fork ...
# 2. point LocalSWMM at the new commit
cd ..
git submodule update --init --recursive   # or update the gitlink
# 3. rebuild
npm run build:2d-wasm:sh
# 4. commit the rebuilt public/*.js/.wasm + version stamps
```

Remember: any re-pin must keep the wasm-compat changes (or carry them forward) or the build breaks (§14.5).

### 17.3 Testing your changes

- Unit-ish checks: `node scripts/probe-1d.mjs`, `node scripts/bench-1d.mjs`.
- End-to-end app gate: `node scripts/verify-bellinge.mjs` (headless Chrome, SwiftShader).
- WebGPU gates: `node scripts/run-webgpu-harness.mjs` and `node scripts/test-gpu-worker.mjs` (need headed Chrome with WebGPU).
- Regression for the split 1D leg: `node scripts/verify-1d-split.mjs`.

### 17.4 Conventions to respect

- **Script load order is the module contract** — add new scripts to `index.html` in dependency order; `ui.js` stays last.
- **Expose modules via `window.*`**; never use `import/export` (no bundler).
- **State stays in `Net`**, view state in `App`; styling goes through Mapbox **feature-state**, not data resends.
- Every mutation must go through the `Net` API so it's recorded in undo history and triggers autosave.
- New UI strings are hardcoded English; units use the `U(si, us)` helper.
- Keep `public/config.js` out of commits (git-ignored); never commit real API keys.

---

## 18. Troubleshooting

### The map is blank / no tiles
- `public/config.js` missing or token empty → create it with a valid `MAPBOX_ACCESS_TOKEN` (§6).
- Browser blocked by CSP? Check the console for CSP violations against `api.mapbox.com`.

### "Run" errors immediately with a warning
- No nodes, no outfall, or **US units with a 2D mesh** (2D is SI-only) — `app.js:1402-1406`.

### Simulation fails silently / engine errors
- Check the **Run Status** window, then the **Report** tab. For deep diagnostics, the worker dumps the `.rpt` error lines and the first 3000 chars of the INP on failure (`openSwmm2dWorker.js:109-148`).
- Reproduce in Node: `node scripts/run-engine-marcher.mjs model.inp out.json` prints engine codes (`SWMM_ERR_LIFECYCLE = 6` is the "natural completion" code).

### WASM build fails at `PluginFactory.cpp:46: unsupported platform`
- The submodule was re-pinned without the wasm-compat commit. Restore `85e4be38` (see §14.5) or re-apply the Emscripten no-ops.

### `Could not find zip` during vcpkg bootstrap
- Missing system `zip`/`unzip`/`tar`; on Arch: `sudo pacman -S zip unzip tar`.

### 2D run on this machine falls back to WASM
- `navigator.gpu` absent or `maxStorageBuffersPerShaderStage < 16` (e.g. Apple Silicon/Metal). This is expected; the WASM path is the reference.

### Mesh generation fails on huge domains
- The Triangle WASM heap is fixed at 16 MB; the budget caps (`trianglePointBudget=8000`, `autoAreaCap`) kick in automatically. Reduce domain area or minAngle.

### Stale wasm served
- The server sends `Cache-Control: no-store`, but if you're hosting elsewhere, hard-refresh after rebuilding (`swmm6wasm.js?v=<n>` query params are used at `index.html:790-810`).

### Fixture files missing for WebGPU scripts
- Regenerate: `node scripts/make-marcher-inp.mjs …` / `node scripts/make-marcher-cpl-inp.mjs …` or run `verify-bellinge.mjs` once to populate `scripts/verify-out/`.

---

## 19. Known Gotchas & Oddities

1. **README drift:** README Quick Start says `cd SWMM_3D_Web_UI` and `http://localhost:8000`; the actual dir is `LocalSWMM` and the port is `8080`.
2. **Two identical engine binaries** (`openswmm2d.*` and `swmm6wasm.*`) are byte-for-byte copies — keep them in sync (the build script does).
3. **`simWorker` progress messages are dead protocol:** the worker never posts them and `app.js:1275` ignores them; the 1D progress bar is a time-based cosmetic.
4. **`.out` parsing is 1D-only:** the 2D path carries per-frame JS arrays instead and explicitly nulls `App.outData` (`app.js:1443`).
5. **`bench-1d.mjs` carries a stale "probe-1d.mjs" header comment.**
6. **Windows-only hard-coding** in `bench-gpu-coupl.mjs` and `run-webgpu-harness.mjs` (hard-coded Chrome path).
7. **LID layer parameters are parsed but not stored** (`inpParser.js:411-424`) — LID round-trips rely on `rawSections`.
8. **CI `config.js` uses `const CONFIG`** while local configs use `var`; `window.CONFIG` lookups (`app.js:446`) are defensive either way.
9. **The `harness.html` "lessons"** document historical VARIABLE_STEP pinning that was later proven wrong — read the 2026-08-06 entries in `WEBGPU_PLAN.md` before "fixing" anything in `couplingSplit.js`.
10. **Vertex-coupled live head reconstruction** (`stCnt>0`) exists in the WGSL kernel but the split clears stencil pointers — the live path uses the lowest-bed cell head.
11. **NATURAL_NEIGHBOUR rainfall** is not modelled by the marcher (uniform gage mean only).
12. **vcpkg manifest layering:** the engine's own `vcpkg.json` is ignored for the wasm build; only the root manifest applies.

---

## 20. Glossary

| Term | Meaning |
|---|---|
| **SWMM** | EPA Storm Water Management Model; the hydrology/hydraulics reference |
| **OpenSWMM** | The C++20 re-implementation used here (HydroCouple); MIT-licensed |
| **WASM / Emscripten** | WebAssembly + the LLVM toolchain that compiles C++ to it |
| **INP** | SWMM input text file (`.inp`); the model serialization consumed by the engine |
| **RPT / OUT** | Engine text report / binary results files |
| **PSLG** | Planar Straight-Line Graph — the constrained triangulation input to Triangle |
| **Triangle** | Shewchuk's Delaunay triangulator; here compiled to WASM (`triangle-wasm`) |
| **CDT** | Constrained Delaunay Triangulation |
| **PSLC** | Planar Straight-Line **Cell** graph (the mesh2dPslg module's term) |
| **1D / 2D** | Pipe/network model vs. overland surface-routing mesh model |
| **LTS** | Local Time Stepping — the 2D solver's tiered substep scheme |
| **CFL** | Courant–Friedrichs–Lewy stability condition |
| **CD / coupling** | Flow coefficient / 1D↔2D exchange coefficient (default 0.65) |
| **cplF / cplS** | Coupling float/state buffers between the WASM 1D engine and the GPU 2D marcher |
| **M0–M5** | WebGPU milestone phases in `WEBGPU_PLAN.md` |
| **MEMFS** | Emscripten's in-memory virtual filesystem (`.inp`/`.rpt`/`.out` live there) |
| **feature-state** | Mapbox GL JS per-feature mutable styling state |
| **Indexed mesh** | `Net.mesh2DIndexed`: the canonical Triangle-engine mesh output |

---

*Manual generated from the `experimental` branch state (engine `85e4be38`, built `2026-08-11T04:30:05Z`). All file:line references are against the committed sources at that revision.*
