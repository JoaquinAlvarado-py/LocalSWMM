# Capa de mapa y renderizado

Cómo se usa Mapbox GL JS como el canvas de todo el editor: la instancia del mapa, el stack de fuentes/capas, el estilado vía feature-state, el comportamiento de re-renderizado, el muestreo DEM y los overlays encima.

## Inicialización del mapa — `app.js`

- Vista por defecto: La Serena, Chile (`DEFAULT_CENTER = [-71.254, -29.908]`, `DEFAULT_ZOOM = 15.2` — `app.js:7-8`).
- `MAP_STYLES` (`app.js:16-25`): `streets` (`mapbox://styles/mapbox/streets-v12`), `satellite` (`satellite-streets-v12`) y un estilo `blank` construido a mano (fondo claro).
- `new mapboxgl.Map({… pitch:0, bearing:0, antialias:true, boxZoom:false })` guardado como `window.map` (`app.js:27-38`), más los controles de Navegación y Escala.

## Stack de capas — `ensureNetworkLayers` (`app.js:114-274`)

Fuentes y capas (fuente → ids de capa):

| Fuente | Capas | Propósito |
|---|---|---|
| `draft` | `draft-line/fill/points` | Geometría fantasma mientras se dibuja |
| `swmm-2d-mesh` | `swmm-2d-mesh-fill`, `swmm-2d-mesh-line` | Celdas de la malla 2D (relleno coloreado por resultados) |
| `swmm-subcatchments` | `swmm-subcatchments-fill`, `swmm-subcatchments-line` (discontinua) | Áreas de drenaje |
| `swmm-links` | `swmm-links-hit` (invisible 14 px), `swmm-links-layer`, `swmm-links-arrows` | Enlaces + flechas de flujo |
| `swmm-nodes` | `swmm-nodes-layer` (círculo, `promoteId:'id'`), `swmm-nodes-labels` | Nodos + etiquetas |
| plan maestro / constraints | — | Capas de fondo importadas |

**Arquitectura de estilado:** las expresiones de color `nodeColorExpr/linkColorExpr` (`app.js:77-89`) se componen con `selectedCase(sel,hov,base)` (`app.js:91-94`) y `resultOr(base)` (`app.js:97-99`), lo que permite que los colores de los resultados de simulación sobreescriban los colores base a través del **feature-state** de Mapbox (`selected`, `hovered`, `resultColor`) — establecido vía `window.setElementState` (`app.js:320-325`). Por eso el estilado de selección/hover/resultados no necesita re-envío de datos.

## Re-renderizado y DEM

- `refreshNetworkData()` (`app.js:276-293`) reenvía todas las fuentes + restaura el feature-state de selección; `refreshNetworkDataForMove()` (`app.js:299-310`) está limitado por rAF y actualiza solo nodos/enlaces durante los arrastres.
- `map.on('style.load')` (`app.js:622-629`) re-ejecuta la creación de capas tras los cambios de mapa base.
- **Muestreo de elevación DEM** (`sampleDEMElevationAsync`, `app.js:437-495`): (1) sampler de terreno de la malla en memoria, o si no (2) API de puntos de OpenTopography para fuentes no-Mapbox (COP30/USGS10m/SRTMGL1/NASADEM/ANADEM/GEDTM30), o si no (3) DEM de terreno de Mapbox + `map.queryTerrainElevation`. `sampleAllNodesDEM()` (`app.js:522-543`) recorre todos los nodos. La variante síncrona (`sampleDEMElevation`, `app.js:497-520`) corre al colocar un nodo.

## Overlays

- **Street View:** `street_view_overlay.js` (pegman + overlay), requiere `GOOGLE_MAPS_API_KEY`.
- **Búsqueda OSM:** `#osm-search` geocodifica vía OpenStreetMap.
- **Deslizador de tiempo:** `AnimationUI` (`ui.js:1086-1152`) — `setRange(maxSteps)`, `updateDisplay()` (llama a `ResultStyling.applyToMapForStep`, `Tools.updateHoverPopup`, `ProfilePlot.update`, `StreetViewOverlay.scheduleRedraw`), `play()` (bucle rAF a 500 ms/velocidad).
- **Overlays 2D:** isolíneas/bandas/flechas GeoJSON (`mesh2dRender.js`) y una capa custom Gouraud WebGL2 (`meshGlLayer.js`) — ver el subsistema de malla 2D y WebGPU.
