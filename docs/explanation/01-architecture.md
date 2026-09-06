# Architecture

An architectural overview of LocalSWMM: its client-side structure, module dependencies, global state management, and end-to-end simulation data pipeline.

## Core Architectural Decisions

LocalSWMM is designed from the ground up to execute all hydraulic modeling tasks directly inside the user's browser without reliance on a server-side computing backend.

- **No backend required:** The Python server (`server.py`) is merely a local static file server and health endpoint (`GET /api/status`).
- **Dependency-free UI:** Built with ~15,000 lines of standard JavaScript structured via IIFEs, with Mapbox GL JS providing interactive map rendering.
- **WASM-embedded hydraulics:** The OpenSWMM engine is cross-compiled for `wasm32-emscripten` with C++ dependencies (Eigen, HDF5, nlohmann-json, SUNDIALS), executing inside a dedicated Web Worker (`simWorker.js`).

## Architecture at a glance

```
                        ┌─────────────────────────────────────────────────────────┐
                        │                       BROWSER                          │
                        │                                                        │
  ┌────────────┐        │   ┌───────────────────────  index.html  ────────────┐  │
  │  server.py │───────▶│   │  [classic <script> modules, ordered by deps]     │  │
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
                        │   ┌──────────────────────┐                             │
                        │   │ INP serialize        │                             │
                        │   │ (inpExporter.js)     │                             │
                        │   │ INP parse            │                             │
                        │   │ (inpParser.js)       │                             │
                        │   └──────────┬───────────┘                             │
                        │              │                                         │
                        │              ▼                                         │
                        │   ┌─────────────────┐                                  │
                        │   │  simWorker.js   │ (Web Worker)                     │
                        │   └───────┬─────────┘                                  │
                        │           │                                            │
                        │           ▼                                            │
                        │   ┌─────────────────────────────────────────────┐      │
                        │   │   Emscripten WASM:  swmm6wasm.js/.wasm       │      │
                        │   │   ──────────────────────────────────────     │      │
                        │   │   OpenSWMM engine (C++20, static lib)        │      │
                        │   │   exported C API: swmm_engine_*              │      │
                        │   └─────────────────────────────────────────────┘      │
                        └─────────────────────────────────────────────────────────┘
```

**Data flow (simulation):** model (`Net`) → `inpExporter.generateInp()` → `.inp` string → Worker (`simWorker.js`) → `FS.writeFile('/in.inp')` → `swmm_engine_open/initialize/start` → `stride()` loop → `.rpt` + `.out` read back → `swmmOutParser` → `results.js` rendering (tables, map colors, time slider, profile/chart plots).

## Module system and globals

There are **no ES modules, no bundler, no `import`/`export`**. Every file is a classic script wrapped in an IIFE. Modules communicate exclusively through globals attached to `window`. **Script order in `index.html` is the dependency contract**:

```
config.js → mapbox/proj4/shp/dxf/geotiff (CDN)
→ inpParser → inpExporter → network → swmmOutParser → street_view_overlay
→ swmm6wasm → results → importers → app → tools → profile → plot
→ landcover → curves → lid → quality → aquifer → snowpack → ui
(ui.js LAST — it wires every button)
```

The principal global singletons:

| Global | Owner of | Defined at |
|---|---|---|
| `window.map` | Mapbox GL `Map` instance | `app.js` |
| `window.App` | UI/app state (`currentStyle`, visibility flags, `selection` Set, `lastRunReport`, `outData`, …) | `app.js` |
| `window.Net` | `Network` class instance — **single source of truth** for all model data + undo/redo + autosave | `network.js` |
| `window.Tools` | Tool state machine (selection, drawing, hit-testing, drag) | `tools.js` |
| `window.ResultStyling` | Simulation result coloring engine | `results.js` |
| `window.AnimationUI` | Time-slider play/pause | `ui.js` |
| `window.CONFIG` | API keys | `config.js` |
| `window.inpParser` / `window.inpExporter` | INP parse / serialize | `inpParser.js`, `inpExporter.js` |
| `window.SWMMOutParser` | `.out` binary parser | `swmmOutParser.js` |
| Module editors (lazy) | `CurveEditor`, `LIDControls`, `QualityEditor`, `AquiferEditor`, `SnowpackEditor`, `TimeSeriesPlot`, `ProfilePlot`, `StreetViewOverlay`, `Importers` | — |

Consequences of this design:

- **State is shared by convention.** `tools.js` and `ui.js` capture `window.map`/`window.App` at load time, so `ui.js` must load after `app.js`.
- **Adding a module** means adding a `<script>` tag in the right position in `index.html` and exposing globals; there is no import graph the tooling can validate.
- **Rendering is two-track:** `Net` owns geometry + undo + persistence (data); `App` + Mapbox own view state. Mapbox **feature-state** (`selected`, `hovered`, `resultColor`) is the bridge between them.

## UI shell — `index.html`

The whole app is a CSS grid `#app-grid`:

```
grid-template-areas:
  "toolbar toolbar toolbar"
  "palette map     panel"
  "status  status  status"
```

| Container | ID | Contents |
|---|---|---|
| Toolbar | `#toolbar` | Undo/Redo · Save/Load(dropdown)/Export-INP · Options · TS-plot · **Run** · Clear · Data-menu (Curves/LID/Quality/Aquifer/Snowpack) |
| Left palette | `#tool-palette` | `[select] [delete]` + Node tools (junction, outfall, storage, divider) + Link tools (conduit, pump, weir, orifice) + Area tools (subcatchment, raingage) |
| Map area | `#map-container` | `#map`, OSM search, map-settings card (basemap / layer toggles / units / DEM source / Sample-DEM-all), Street View pegman, time-slider panel, profile modal, TS modals |
| Right panel | `#panel-right` | Resizable; tabs **Properties / Results / Report** (`#tab-props`, `#tab-results`, `#tab-report`) |
| Status bar | `#statusbar` | `#sb-tool`, `#sb-nodes`, `#sb-links`, `#sb-subcatchments`, `#sb-gages`, `#sb-coords` |
| Modals | `.modal-overlay`+`.modal-box` | Options, Projection, Import-As, Run-Status (+minimized badge) |

## UI framework

**Hand-rolled, dependency-free.** Dynamic content is DOM-string + `innerHTML` (e.g. the properties panel `renderPropsPanel`); all wiring is `addEventListener`. Recurring component classes live in `styles.css`:

- `.tb-btn`, `.tb-btn-run`, `.tb-icon-btn`, `.tb-dropdown`(+`.open`), `.tb-pill`(+`.active`)
- `.tool-btn`(+`.active`, `.tool-btn-danger`), `.tool-divider`, `.tool-group-label`
- `.side-panel`, `.panel-tabs`, `.panel-tab`(+`.active`), `.tab-badge`
- `.modal-overlay`, `.modal-box`, `.modal-actions`
- `.prop-section-title`, `.prop-row`, `.prop-actions`

**Theming** uses CSS variables: `--accent`, `--danger`, `--bg-panel`, layout vars `--toolbar-h:44px`, `--statusbar-h:26px`, `--panel-w:280px`, `--palette-w:46px`. `--panel-w` is updated at runtime during resize.

**No i18n.** All strings are hardcoded English. The only "localization" is unit formatting via `const U = (si, us) => Net.units === 'US' ? us : si;` used by the schema-driven property forms (`FIELD_DEFS`).

## Tool system — `tools.js`

A single hand-rolled state machine (`window.Tools`):

- Tool registry maps palette `data-tool` names to types: `NODE_TOOL_TYPES` (`junction→JUNCTION`, `outfall→OUTFALL`, `storage→STORAGE`, `divider→DIVIDER`, `raingage→RAINGAGE`) and `LINK_TOOL_TYPES` (`conduit`, `pump`, `orifice`, `weir`, `outlet`), plus special modes `select`, `subcatchment`, `delete`.
- **`Tools.setTool(name)`** cancels drawing, toggles palette highlight, updates `#sb-tool`, switches the map cursor, and disables `map.doubleClickZoom` in subcatchment mode.
- **Drawing state:** `linkFrom` (first endpoint), `linkVertices[]`, `polyVertices[]`, `dragging`.
- **Hit-testing:** `featureAt(point)` ranks nodes > links > subcatchments in a 12 px box; `snapNodeAt` uses a 24 px box over `swmm-nodes-layer`, skipping rain gages for hydraulic ops.
- **All map interactions dispatch through one `map.on('click')` handler** that switches on `Tools.active`: node placement, link drawing (first click must land on a node; subsequent clicks snap), subcatchment vertex push, delete, select. `dblclick` finishes a subcatchment. `mousemove` updates the ghost draft and the hover popup. `mousedown` drives node dragging, coalesced into a single undo step via `Net.commitMove()` on mouseup.
- **Keyboard:** `Esc` cancels/clears, `Ctrl+Z`/`Ctrl+Y`/`Ctrl+Shift+Z` undo-redo, `Ctrl+A` select all, `Del`/`Backspace` delete, `Enter` finishes a subcatchment.

> Adding a new tool requires: an entry in `NODE_TOOL_TYPES`/`LINK_TOOL_TYPES`, a branch in the `click` handler, and a palette button.

## State persistence

- **Autosave:** every `Net.emit()` triggers `scheduleAutosave()`, a 2 s debounce that writes `JSON.stringify(serialize())` to **localStorage** key `openswmm3d.project`. If localStorage throws (quota), it falls back to **IndexedDB** (DB `openswmm3d`, store `kv`). Restore prefers localStorage, then IndexedDB, gated on ≥1 node/link.
- **Save / Load:** `Net.downloadProject()` produces a pretty-printed `*.oswmm.json`; load goes through `Net.loadState(data, true)`. JSON and GeoJSON files are both accepted (GeoJSON routes to the import/projection dialogs).
- **Panel geometry** is also persisted: right-panel width in `localStorage['panel-w']`.
