# Architecture

The big picture: a client-side-only web application for 2D hydraulic modeling, where everything — the editor, the mesher, and the SWMM hydraulics engine — runs in the browser.

## Client-side-only design

Local SWMM is a **client-side-only web application** for 2D hydraulic modeling and simulation of stormwater and wastewater networks. Everything — the editor, the mesher, and the SWMM hydraulics engine — runs in the browser. The simulation engine is the HydroCouple **OpenSWMM** engine compiled to **WebAssembly** with Emscripten.

The experimental branch adds the 2D surface-routing module (mesh generation, 1D↔2D coupling, WebGPU GPU marcher) on top of the 1D network editor.

## Key properties

- **No backend.** The only server is a trivial static-file + health endpoint server (`server.py`). No database, no build step for the UI, no bundler.
- **No UI framework.** The frontend is ~15,000 lines of dependency-free JavaScript (classic scripts + IIFEs) using Mapbox GL JS as the only heavyweight runtime library.
- **WASM-embedded hydraulics.** The OpenSWMM 6.0.0 engine is cross-compiled for `wasm32-emscripten` with vcpkg-managed C++ dependencies (Eigen, HDF5, nlohmann-json, SUNDIALS).
- **Two simulation backends.** A WASM engine path (1D + 1D/2D coupled) and an **experimental WebGPU** backend that re-implements the 2D explicit local-inertial solver as WGSL compute kernels and runs it in parallel to the WASM engine.
- **Two mesh generators.** A legacy `poly2tri`-based generator and the production **Shewchuk Triangle WASM** (npm `triangle-wasm`) pipeline.

## Architecture at a glance

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

## Module system and globals

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
| `window.Mesh2D…` / `window.TriangleWASM` / `window.Mesh2DLayers` / `window.Mesh2DGL` | 2D subsystem | see the 2D mesh & WebGPU subsystem |
| Module editors (lazy) | `CurveEditor`, `LIDControls`, `QualityEditor`, `AquiferEditor`, `SnowpackEditor`, `TimeSeriesPlot`, `ProfilePlot`, `StreetViewOverlay`, `Importers` | — |

Consequences of this design:

- **State is shared by convention.** `tools.js:8-9` and `ui.js:7-8` capture `window.map`/`window.App` at load time, so `ui.js` must load after `app.js`.
- **Adding a module** means adding a `<script>` tag in the right position in `index.html` and exposing globals; there is no import graph the tooling can validate.
- **Rendering is two-track:** `Net` owns geometry + undo + persistence (data); `App` + Mapbox own view state. Mapbox **feature-state** (`selected`, `hovered`, `resultColor`) is the bridge between them (`app.js:320-325`).

## UI shell — `index.html`

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

## UI framework

**Hand-rolled, dependency-free.** Dynamic content is DOM-string + `innerHTML` (e.g. the properties panel `renderPropsPanel`, `ui.js:842`); all wiring is `addEventListener`. Recurring component classes live in `styles.css`:

- `.tb-btn`, `.tb-btn-run`, `.tb-icon-btn`, `.tb-dropdown`(+`.open`), `.tb-pill`(+`.active`)
- `.tool-btn`(+`.active`, `.tool-btn-danger`), `.tool-divider`, `.tool-group-label`
- `.side-panel`, `.panel-tabs`, `.panel-tab`(+`.active`), `.tab-badge`
- `.modal-overlay`, `.modal-box`, `.modal-actions`
- `.prop-section-title`, `.prop-row`, `.prop-actions`

**Theming** uses CSS variables (`styles.css:6-29`): `--accent`, `--danger`, `--bg-panel`, layout vars `--toolbar-h:44px`, `--statusbar-h:26px`, `--panel-w:280px`, `--palette-w:46px`. `--panel-w` is updated at runtime during resize (`ui.js:236`).

**No i18n.** All strings are hardcoded English. The only "localization" is unit formatting via `const U = (si, us) => Net.units === 'US' ? us : si;` (`ui.js:564`) used by the schema-driven property forms (`FIELD_DEFS`, `ui.js:570-736`).

## Tool system — `tools.js`

A single hand-rolled state machine (`window.Tools`):

- Tool registry maps palette `data-tool` names to types: `NODE_TOOL_TYPES` (`junction→JUNCTION`, `outfall→OUTFALL`, `storage→STORAGE`, `divider→DIVIDER`, `raingage→RAINGAGE` — `tools.js:11-17`) and `LINK_TOOL_TYPES` (`conduit`, `pump`, `orifice`, `weir`, `outlet` — `tools.js:18-24`), plus special modes `select`, `subcatchment`, `delete`.
- **`Tools.setTool(name)`** (`tools.js:145-164`) cancels drawing, toggles palette highlight, updates `#sb-tool`, switches the map cursor, and disables `map.doubleClickZoom` in subcatchment mode.
- **Drawing state:** `linkFrom` (first endpoint), `linkVertices[]`, `polyVertices[]`, `dragging`.
- **Hit-testing:** `featureAt(point)` ranks nodes > links > subcatchments > 2D mesh in a 12 px box (`tools.js:216-226`); `snapNodeAt` uses a 24 px box over `swmm-nodes-layer`, skipping rain gages for hydraulic ops (`tools.js:228-239`).
- **All map interactions dispatch through one `map.on('click')` handler** (`tools.js:295-363`) that switches on `Tools.active`: node placement, link drawing (first click must land on a node; subsequent clicks snap), subcatchment vertex push, delete, select. `dblclick` finishes a subcatchment (`tools.js:365-371`). `mousemove` updates the ghost draft and the hover popup (`tools.js:375-423`). `mousedown` drives node dragging (`tools.js:426-470`), coalesced into a single undo step via `Net.commitMove()` on mouseup.
- **Keyboard** (`tools.js:473-505`): `Esc` cancels/clears, `Ctrl+Z`/`Ctrl+Y`/`Ctrl+Shift+Z` undo-redo, `Ctrl+A` select all, `Del`/`Backspace` delete, `Enter` finishes a subcatchment.

> Adding a new tool requires: an entry in `NODE_TOOL_TYPES`/`LINK_TOOL_TYPES`, a branch in the `click` handler, and a palette button.

## State persistence

- **Autosave:** every `Net.emit()` triggers `scheduleAutosave()` (`network.js:168`), a 2 s debounce that writes `JSON.stringify(serialize())` to **localStorage** key `openswmm3d.project` (`network.js:677-701`). If localStorage throws (quota), it falls back to **IndexedDB** (DB `openswmm3d`, store `kv`) (`network.js:703-718`). Restore prefers localStorage, then IndexedDB (`network.js:734-737`), gated on ≥1 node/link.
- **Save / Load:** `Net.downloadProject()` produces a pretty-printed `*.oswmm.json` (`network.js:774-781`); load goes through `Net.loadState(data, true)` (`network.js:490-520`). JSON and GeoJSON files are both accepted (GeoJSON routes to the import/projection dialogs).
- **Panel geometry** is also persisted: right-panel width in `localStorage['panel-w']`, layer-tree state in `localStorage['swmm-2d-layer-tree']` (`layerTree.js:8-9`).
