# Arquitectura

El panorama general: una aplicación web solo-cliente para modelado hidráulico 2D, donde todo — el editor, el generador de mallas y el motor hidráulico SWMM — se ejecuta en el navegador.

## Diseño solo-cliente

Local SWMM es una **aplicación web solo-cliente** para modelado y simulación hidráulica 2D de redes de aguas lluvias y aguas servidas. Todo — el editor, el generador de mallas y el motor hidráulico SWMM — se ejecuta en el navegador. El motor de simulación es el motor **OpenSWMM** de HydroCouple compilado a **WebAssembly** con Emscripten.

La rama experimental agrega el módulo de tránsito superficial 2D (generación de mallas, acoplamiento 1D↔2D, marcher GPU WebGPU) sobre el editor de red 1D.

## Propiedades clave

- **Sin backend.** El único servidor es un trivial servidor de archivos estáticos + endpoint de salud (`server.py`). Sin base de datos, sin paso de build para la UI, sin bundler.
- **Sin framework de UI.** El frontend son ~15.000 líneas de JavaScript sin dependencias (scripts clásicos + IIFEs) con Mapbox GL JS como única librería runtime pesada.
- **Hidráulica embebida en WASM.** El motor OpenSWMM 6.0.0 está cross-compilado para `wasm32-emscripten` con dependencias C++ gestionadas por vcpkg (Eigen, HDF5, nlohmann-json, SUNDIALS).
- **Dos backends de simulación.** Una vía de motor WASM (1D + 1D/2D acoplado) y un backend **experimental WebGPU** que reimplementa el solver 2D explícito local-inercial como kernels de cómputo WGSL y lo ejecuta en paralelo al motor WASM.
- **Dos generadores de mallas.** Un generador legado basado en `poly2tri` y el pipeline de producción **Triangle WASM de Shewchuk** (npm `triangle-wasm`).

## Arquitectura de un vistazo

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

**Flujo de datos (simulación):** modelo (`Net`) → `inpExporter.generateInp()` → inyección opcional de secciones 2D (`Mesh2DInp.buildInput`) → string `.inp` → Worker → `FS.writeFile('/in.inp')` → `swmm_engine_open/initialize/start` → bucle `stride()` → lectura de `.rpt` + `.out` → `swmmOutParser` → renderizado de `results.js` (tablas, colores del mapa, deslizador de tiempo, gráficos de perfil/series).

## Sistema de módulos y globales

No hay **módulos ES, bundler ni `import`/`export`**. Cada archivo es un script clásico envuelto en un IIFE. Los módulos se comunican exclusivamente a través de globales adjuntas a `window`. **El orden de los scripts en `index.html` es el contrato de dependencias** (`index.html:779-810`):

```
config.js → mapbox/proj4/shp/dxf/poly2tri/geotiff (CDN)
→ inpParser → inpExporter → network → swmmOutParser → street_view_overlay
→ swmm6wasm → results → importers → app → tools → profile → plot
→ vendor/triangle → mesh2dProj → mesh2dPslg → mesh2dTerrain → mesh2dTriangle
→ mesh2dCoupling → mesh2dExport → mesh2dRender → meshGlLayer → mesh2d
→ mesh2dInp → mesh2dDialog → layerTree → landcover → curves → lid → quality
→ aquifer → snowpack → ui          (ui.js LAST — it wires every button)
```

Los singletons globales principales:

| Global | Dueño de | Definido en |
|---|---|---|
| `window.map` | Instancia `Map` de Mapbox GL | `app.js:38` |
| `window.App` | Estado de UI/app (`currentStyle`, flags de visibilidad, Set `selection`, `lastRunReport`, `results2D`, `outData`, …) | `app.js:44-58` |
| `window.Net` | Instancia de la clase `Network` — **fuente única de verdad** de todos los datos del modelo + deshacer/rehacer + autoguardado | `network.js:942` |
| `window.Tools` | Máquina de estados de herramientas (selección, dibujo, hit-testing, arrastre) | `tools.js:291` |
| `window.LayerTree` | Visibilidad/opacidad de las capas de la malla 2D | `layerTree.js:38` |
| `window.ResultStyling` | Motor de coloreado de los resultados de simulación | `results.js:547` |
| `window.AnimationUI` | Reproducir/pausa del deslizador de tiempo | `ui.js:1086` |
| `window.CONFIG` | Claves de API | `config.js` |
| `window.inpParser` / `window.inpExporter` | Parse / serialización INP | `inpParser.js:555`, `inpExporter.js` |
| `window.SWMMOutParser` | Parser del binario `.out` | `swmmOutParser.js` |
| `window.Mesh2D…` / `window.TriangleWASM` / `window.Mesh2DLayers` / `window.Mesh2DGL` | Subsistema 2D | ver el subsistema de malla 2D y WebGPU |
| Editores de módulo (lazy) | `CurveEditor`, `LIDControls`, `QualityEditor`, `AquiferEditor`, `SnowpackEditor`, `TimeSeriesPlot`, `ProfilePlot`, `StreetViewOverlay`, `Importers` | — |

Consecuencias de este diseño:

- **El estado se comparte por convención.** `tools.js:8-9` y `ui.js:7-8` capturan `window.map`/`window.App` en tiempo de carga, por lo que `ui.js` debe cargar después de `app.js`.
- **Agregar un módulo** significa agregar una etiqueta `<script>` en la posición correcta de `index.html` y exponer globales; no hay grafo de imports que el tooling pueda validar.
- **El renderizado es de doble vía:** `Net` es dueño de la geometría + deshacer + persistencia (datos); `App` + Mapbox son dueños del estado de vista. El **feature-state** de Mapbox (`selected`, `hovered`, `resultColor`) es el puente entre ambos (`app.js:320-325`).

## Cáscara de UI — `index.html`

Toda la app es un grid CSS `#app-grid` (`styles.css:59-73`):

```
grid-template-areas:
  "toolbar toolbar toolbar"
  "palette map     panel"
  "status  status  status"
```

| Contenedor | ID | Contenido |
|---|---|---|
| Barra de herramientas | `#toolbar` | Deshacer/Rehacer · Guardar/Cargar(dropdown)/Exportar-INP · Opciones · Mesh2D · Gráfico-TS · **Run** · Limpiar · Menú de datos (Curvas/LID/Calidad/Acuífero/Nieve/Malla 2D) |
| Paleta izquierda | `#tool-palette` | `[seleccionar] [eliminar]` + herramientas de nodo (nodo de unión, emisario, estanque, divisor) + herramientas de enlace (conducto, bomba, vertedero, orificio) + herramientas de área (subcuenca, pluviómetro) |
| Área del mapa | `#map-container` | `#map`, búsqueda OSM, tarjeta de ajustes del mapa (mapa base / toggles de capas / unidades / fuente DEM / Sample-DEM-all), tarjeta de árbol de capas, pegman de Street View, panel de deslizador de tiempo, modal de perfil, modales de series de tiempo |
| Panel derecho | `#panel-right` | Redimensionable; pestañas **Propiedades / Resultados / Reporte** (`#tab-props`, `#tab-results`, `#tab-report`) |
| Barra de estado | `#statusbar` | `#sb-tool`, `#sb-nodes`, `#sb-links`, `#sb-subcatchments`, `#sb-gages`, `#sb-coords` |
| Modales | `.modal-overlay`+`.modal-box` | Opciones, Proyección, Importar-como, Malla-2D (3 pestañas), Estado-de-corrida (+badge minimizado) |

## Marco de UI

**Hecho a mano, sin dependencias.** El contenido dinámico es DOM-string + `innerHTML` (p. ej. el panel de propiedades `renderPropsPanel`, `ui.js:842`); todo el cableado es `addEventListener`. Las clases de componentes recurrentes viven en `styles.css`:

- `.tb-btn`, `.tb-btn-run`, `.tb-icon-btn`, `.tb-dropdown`(+`.open`), `.tb-pill`(+`.active`)
- `.tool-btn`(+`.active`, `.tool-btn-danger`), `.tool-divider`, `.tool-group-label`
- `.side-panel`, `.panel-tabs`, `.panel-tab`(+`.active`), `.tab-badge`
- `.modal-overlay`, `.modal-box`, `.modal-actions`
- `.prop-section-title`, `.prop-row`, `.prop-actions`

**Temas** usa variables CSS (`styles.css:6-29`): `--accent`, `--danger`, `--bg-panel`, variables de layout `--toolbar-h:44px`, `--statusbar-h:26px`, `--panel-w:280px`, `--palette-w:46px`. `--panel-w` se actualiza en runtime durante el redimensionamiento (`ui.js:236`).

**Sin i18n.** Todos los strings están hardcodeados en inglés. La única "localización" es el formateo de unidades vía `const U = (si, us) => Net.units === 'US' ? us : si;` (`ui.js:564`) usado por los formularios de propiedades guiados por esquema (`FIELD_DEFS`, `ui.js:570-736`).

## Sistema de herramientas — `tools.js`

Una única máquina de estados hecha a mano (`window.Tools`):

- El registro de herramientas mapea los nombres `data-tool` de la paleta a tipos: `NODE_TOOL_TYPES` (`junction→JUNCTION`, `outfall→OUTFALL`, `storage→STORAGE`, `divider→DIVIDER`, `raingage→RAINGAGE` — `tools.js:11-17`) y `LINK_TOOL_TYPES` (`conduit`, `pump`, `orifice`, `weir`, `outlet` — `tools.js:18-24`), más los modos especiales `select`, `subcatchment`, `delete`.
- **`Tools.setTool(name)`** (`tools.js:145-164`) cancela el dibujo, conmuta el resaltado de la paleta, actualiza `#sb-tool`, cambia el cursor del mapa y deshabilita `map.doubleClickZoom` en modo subcuenca.
- **Estado de dibujo:** `linkFrom` (primer extremo), `linkVertices[]`, `polyVertices[]`, `dragging`.
- **Hit-testing:** `featureAt(point)` ordena nodos > enlaces > subcuencas > malla 2D en una caja de 12 px (`tools.js:216-226`); `snapNodeAt` usa una caja de 24 px sobre `swmm-nodes-layer`, saltándose los pluviómetros para las operaciones hidráulicas (`tools.js:228-239`).
- **Todas las interacciones con el mapa se despachan por un único handler `map.on('click')`** (`tools.js:295-363`) que conmuta según `Tools.active`: colocación de nodos, dibujo de enlaces (el primer clic debe caer sobre un nodo; los clics siguientes se ajustan), empuje de vértices de subcuenca, eliminar, seleccionar. `dblclick` termina una subcuenca (`tools.js:365-371`). `mousemove` actualiza el borrador fantasma y el popup de hover (`tools.js:375-423`). `mousedown` maneja el arrastre de nodos (`tools.js:426-470`), coalescido en un único paso de deshacer vía `Net.commitMove()` en mouseup.
- **Teclado** (`tools.js:473-505`): `Esc` cancela/limpia, `Ctrl+Z`/`Ctrl+Y`/`Ctrl+Shift+Z` deshacer-rehacer, `Ctrl+A` seleccionar todo, `Del`/`Backspace` eliminar, `Enter` termina una subcuenca.

> Agregar una herramienta nueva requiere: una entrada en `NODE_TOOL_TYPES`/`LINK_TOOL_TYPES`, una rama en el handler de `click` y un botón de paleta.

## Persistencia de estado

- **Autoguardado:** cada `Net.emit()` dispara `scheduleAutosave()` (`network.js:168`), un debounce de 2 s que escribe `JSON.stringify(serialize())` en **localStorage** bajo la clave `openswmm3d.project` (`network.js:677-701`). Si localStorage lanza una excepción (cupo), cae a **IndexedDB** (DB `openswmm3d`, store `kv`) (`network.js:703-718`). La restauración prefiere localStorage y luego IndexedDB (`network.js:734-737`), condicionada a ≥1 nodo/enlace.
- **Guardar / Cargar:** `Net.downloadProject()` produce un `*.oswmm.json` pretty-printed (`network.js:774-781`); la carga pasa por `Net.loadState(data, true)` (`network.js:490-520`). Se aceptan tanto archivos JSON como GeoJSON (el GeoJSON se enruta a los diálogos de import/proyección).
- **La geometría de los paneles** también se persiste: ancho del panel derecho en `localStorage['panel-w']`, estado del árbol de capas en `localStorage['swmm-2d-layer-tree']` (`layerTree.js:8-9`).
