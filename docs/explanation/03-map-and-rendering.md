# Map & Rendering Layer

How Mapbox GL JS is used as the canvas for the whole editor: the map instance, the source/layer stack, styling through feature-state, re-render behavior, DEM sampling, and the overlays on top.

## Map initialization — `app.js`

- Default view: La Serena, Chile (`DEFAULT_CENTER = [-71.254, -29.908]`, `DEFAULT_ZOOM = 15.2` — `app.js:7-8`).
- `MAP_STYLES` (`app.js:16-25`): `streets` (`mapbox://styles/mapbox/streets-v12`), `satellite` (`satellite-streets-v12`), and a hand-built `blank` style (light background).
- `new mapboxgl.Map({… pitch:0, bearing:0, antialias:true, boxZoom:false })` stored as `window.map` (`app.js:27-38`), plus Navigation + Scale controls.

## Layer stack — `ensureNetworkLayers` (`app.js:114-274`)

Sources and layers (source → layer ids):

| Source | Layers | Purpose |
|---|---|---|
| `draft` | `draft-line/fill/points` | Ghost geometry while drawing |
| `swmm-subcatchments` | `swmm-subcatchments-fill`, `swmm-subcatchments-line` (dashed) | Drainage areas |
| `swmm-links` | `swmm-links-hit` (invisible 14 px), `swmm-links-layer`, `swmm-links-arrows` | Links + flow arrows |
| `swmm-nodes` | `swmm-nodes-layer` (circle, `promoteId:'id'`), `swmm-nodes-labels` | Nodes + labels |
| master plan / constraints | — | Imported background layers |

**Styling architecture:** color expressions `nodeColorExpr/linkColorExpr` compose with `selectedCase(sel,hov,base)` and `resultOr(base)`, which lets simulation result colors override base colors through Mapbox **feature-state** (`selected`, `hovered`, `resultColor`) — set via `window.setElementState`. This is why selection/hover/result styling needs no data re-send.

## Re-render & DEM

- `refreshNetworkData()` resends all sources + restores selection feature-state; `refreshNetworkDataForMove()` is rAF-throttled and updates only nodes/links during drags.
- `map.on('style.load')` re-runs layer creation after basemap swaps.
- **DEM elevation sampling** (`sampleDEMElevationAsync`): (1) OpenTopography point API for non-Mapbox sources (COP30/USGS10m/SRTMGL1/NASADEM/ANADEM/GEDTM30), else (2) Mapbox terrain-DEM + `map.queryTerrainElevation`. `sampleAllNodesDEM()` loops all nodes. The synchronous variant (`sampleDEMElevation`) runs at node placement.

## Overlays

- **Street View:** `street_view_overlay.js` (pegman + overlay), requires `GOOGLE_MAPS_API_KEY`.
- **OSM search:** `#osm-search` geocodes via OpenStreetMap.
- **Time slider:** `AnimationUI` — `setRange(maxSteps)`, `updateDisplay()` (calls `ResultStyling.applyToMapForStep`, `Tools.updateHoverPopup`, `ProfilePlot.update`, `StreetViewOverlay.scheduleRedraw`), `play()` (rAF loop at 500 ms/speed).
