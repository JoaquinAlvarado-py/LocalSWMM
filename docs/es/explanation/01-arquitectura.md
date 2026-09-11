# Arquitectura

Una visión arquitectónica general de LocalSWMM: su estructura de solo-cliente, dependencias de módulos, gestión del estado global y el flujo de datos de simulación de extremo a extremo.

## Decisiones arquitectónicas clave

LocalSWMM está diseñado desde sus cimientos para ejecutar todas las tareas de modelado hidráulico directamente dentro del navegador del usuario sin depender de un clúster de cómputo en el servidor.

- **Sin backend requerido:** El servidor Python (`server.py`) es meramente un servidor local de archivos estáticos y endpoint de salud (`GET /api/status`).
- **UI sin dependencias de frameworks:** Construida con ~15.000 líneas de JavaScript estándar estructurado con IIFEs, con Mapbox GL JS como motor de renderizado de mapas interactivos 2D/3D.
- **Hidráulica embebida en WASM:** El motor OpenSWMM está compilado de forma cruzada para `wasm32-emscripten` con dependencias C++ (Eigen, HDF5, nlohmann-json, SUNDIALS), ejecutándose dentro de un Web Worker dedicado (`simWorker.js`).

## Arquitectura de un vistazo

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

**Flujo de datos (simulación):** modelo (`Net`) → `inpExporter.generateInp()` → string `.inp` → Worker (`simWorker.js`) → `FS.writeFile('/in.inp')` → `swmm_engine_open/initialize/start` → bucle `stride()` → lectura de `.rpt` + `.out` → `swmmOutParser` → renderizado de `results.js` (tablas, colores del mapa, deslizador de tiempo, gráficos de perfil/series).

## Sistema de módulos y globales

No hay **módulos ES, bundler ni `import`/`export`**. Cada archivo es un script clásico envuelto en un IIFE. Los módulos se comunican exclusivamente a través de globales adjuntas a `window`. **El orden de los scripts en `index.html` es el contrato de dependencias**:

```
config.js → mapbox/proj4/shp/dxf/geotiff (CDN)
→ inpParser → inpExporter → network → swmmOutParser → street_view_overlay
→ swmm6wasm → results → importers → app → tools → profile → plot
→ curves → lid → quality → aquifer → snowpack → ui
(ui.js AL FINAL — conecta cada botón)
```

Los singletons globales principales:

| Global | Dueño de | Definido en |
|---|---|---|
| `window.map` | Instancia `Map` de Mapbox GL | `app.js` |
| `window.App` | Estado de UI/app (`currentStyle`, flags de visibilidad, Set `selection`, `lastRunReport`, `outData`, …) | `app.js` |
| `window.Net` | Instancia de la clase `Network` — **fuente única de verdad** de todos los datos del modelo + deshacer/rehacer + autoguardado | `network.js` |
| `window.Tools` | Máquina de estados de herramientas (selección, dibujo, hit-testing, arrastre) | `tools.js` |
| `window.ResultStyling` | Motor de coloreado de los resultados de simulación | `results.js` |
| `window.AnimationUI` | Reproducir/pausa del deslizador de tiempo | `ui.js` |
| `window.CONFIG` | Claves de API | `config.js` |
| `window.inpParser` / `window.inpExporter` | Parse / serialización INP | `inpParser.js`, `inpExporter.js` |
| `window.SWMMOutParser` | Parser del binario `.out` | `swmmOutParser.js` |
| Editores de módulo (lazy) | `CurveEditor`, `LIDControls`, `QualityEditor`, `AquiferEditor`, `SnowpackEditor`, `TimeSeriesPlot`, `ProfilePlot`, `StreetViewOverlay`, `Importers` | — |

Consecuencias de este diseño:

- **El estado se comparte por convención.** `tools.js` y `ui.js` capturan `window.map`/`window.App` en tiempo de carga, por lo que `ui.js` debe cargar después de `app.js`.
- **Agregar un módulo** significa agregar una etiqueta `<script>` en la posición correcta de `index.html` y exponer globales; no hay grafo de imports que el tooling pueda validar.
- **El renderizado es de doble vía:** `Net` es dueño de la geometría + deshacer + persistencia (datos); `App` + Mapbox son dueños del estado de vista. El **feature-state** de Mapbox (`selected`, `hovered`, `resultColor`) es el puente entre ambos.

## Cáscara de UI — `index.html`

Toda la app es un grid CSS `#app-grid`:

```
grid-template-areas:
  "toolbar toolbar toolbar"
  "palette map     panel"
  "status  status  status"
```

| Contenedor | ID | Contenido |
|---|---|---|
| Barra de herramientas | `#toolbar` | Deshacer/Rehacer · Guardar/Cargar(dropdown)/Exportar-INP · Opciones · Gráfico-TS · **Run** · Limpiar · Menú de datos (Curvas/LID/Calidad/Acuífero/Nieve) |
| Paleta izquierda | `#tool-palette` | `[seleccionar] [eliminar]` + herramientas de nodo (nodo de unión, emisario, estanque, divisor) + herramientas de enlace (conducto, bomba, vertedero, orificio) + herramientas de área (subcuenca, pluviómetro) |
| Área del mapa | `#map-container` | `#map`, búsqueda OSM, tarjeta de ajustes del mapa (mapa base / toggles de capas / unidades / fuente DEM / Sample-DEM-all), pegman de Street View, panel de deslizador de tiempo, modal de perfil, modales de series de tiempo |
| Panel derecho | `#panel-right` | Redimensionable; pestañas **Propiedades / Resultados / Reporte** (`#tab-props`, `#tab-results`, `#tab-report`) |
| Barra de estado | `#statusbar` | `#sb-tool`, `#sb-nodes`, `#sb-links`, `#sb-subcatchments`, `#sb-gages`, `#sb-coords` |
| Modales | `.modal-overlay`+`.modal-box` | Opciones, Proyección, Importar-como, Estado-de-corrida (+badge minimizado) |

## Marco de UI

**Hecho a mano, sin dependencias.** El contenido dinámico es DOM-string + `innerHTML` (p. ej. el panel de propiedades `renderPropsPanel`); todo el cableado es `addEventListener`. Las clases de componentes recurrentes viven en `styles.css`:

- `.tb-btn`, `.tb-btn-run`, `.tb-icon-btn`, `.tb-dropdown`(+`.open`), `.tb-pill`(+`.active`)
- `.tool-btn`(+`.active`, `.tool-btn-danger`), `.tool-divider`, `.tool-group-label`
- `.side-panel`, `.panel-tabs`, `.panel-tab`(+`.active`), `.tab-badge`
- `.modal-overlay`, `.modal-box`, `.modal-actions`
- `.prop-section-title`, `.prop-row`, `.prop-actions`

**Temas** usa variables CSS: `--accent`, `--danger`, `--bg-panel`, variables de layout `--toolbar-h:44px`, `--statusbar-h:26px`, `--panel-w:280px`, `--palette-w:46px`. `--panel-w` se actualiza en runtime durante el redimensionamiento.

**Sin i18n.** Todos los strings están hardcodeados en inglés. La única "localización" es el formateo de unidades vía `const U = (si, us) => Net.units === 'US' ? us : si;` usado por los formularios de propiedades guiados por esquema (`FIELD_DEFS`).

## Sistema de herramientas — `tools.js`

Una única máquina de estados hecha a mano (`window.Tools`):

- El registro de herramientas mapea los nombres `data-tool` de la paleta a tipos: `NODE_TOOL_TYPES` (`junction→JUNCTION`, `outfall→OUTFALL`, `storage→STORAGE`, `divider→DIVIDER`, `raingage→RAINGAGE`) y `LINK_TOOL_TYPES` (`conduit`, `pump`, `orifice`, `weir`, `outlet`), más los modos especiales `select`, `subcatchment`, `delete`.
- **`Tools.setTool(name)`** cancela el dibujo, conmuta el resaltado de la paleta, actualiza `#sb-tool`, cambia el cursor del mapa y deshabilita `map.doubleClickZoom` en modo subcuenca.
- **Estado de dibujo:** `linkFrom` (primer extremo), `linkVertices[]`, `polyVertices[]`, `dragging`.
- **Hit-testing:** `featureAt(point)` ordena nodos > enlaces > subcuencas en una caja de 12 px; `snapNodeAt` usa una caja de 24 px sobre `swmm-nodes-layer`, saltándose los pluviómetros para las operaciones hidráulicas.
- **Todas las interacciones con el mapa se despachan por un único handler `map.on('click')`** que conmuta según `Tools.active`: colocación de nodos, dibujo de enlaces (el primer clic debe caer sobre un nodo; los clics siguientes se ajustan), empuje de vértices de subcuenca, eliminar, seleccionar. `dblclick` termina una subcuenca. `mousemove` actualiza el borrador fantasma y el popup de hover. `mousedown` maneja el arrastre de nodos, coalescido en un único paso de deshacer vía `Net.commitMove()` en mouseup.
- **Teclado:** `Esc` cancela/limpia, `Ctrl+Z`/`Ctrl+Y`/`Ctrl+Shift+Z` deshacer-rehacer, `Ctrl+A` seleccionar todo, `Del`/`Backspace` eliminar, `Enter` termina una subcuenca.

> Agregar una herramienta nueva requiere: una entrada en `NODE_TOOL_TYPES`/`LINK_TOOL_TYPES`, una rama en el handler de `click` y un botón de paleta.

## Persistencia de estado

- **Autoguardado:** cada `Net.emit()` dispara `scheduleAutosave()`, un debounce de 2 s que escribe `JSON.stringify(serialize())` en **localStorage** bajo la clave `openswmm3d.project`. Si localStorage lanza una excepción (cupo), cae a **IndexedDB** (DB `openswmm3d`, store `kv`). La restauración prefiere localStorage y luego IndexedDB, condicionada a ≥1 nodo/enlace.
- **Guardar / Cargar:** `Net.downloadProject()` produce un `*.oswmm.json` pretty-printed; la carga pasa por `Net.loadState(data, true)`. Se aceptan tanto archivos JSON como GeoJSON (el GeoJSON se enruta a los diálogos de import/proyección).
- **La geometría de los paneles** también se persiste: ancho del panel derecho en `localStorage['panel-w']`.
