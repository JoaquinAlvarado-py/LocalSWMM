# PPT-07: How Google Street View rendering works in LocalSWMM

End-to-end explanation of the Street View overlay. The implementation lives in
`public/street_view_overlay.js` (identical copies exist in `/home/nekzoh/Dev/LocalSWMM` and
`/home/nekzoh/Dev/LocalSWMM-network3d`); the UI wiring is in `public/ui.js` + `public/index.html`.
All citations are to the LocalSWMM repo.

> Feature summary: a Google `StreetViewPanorama` is embedded in a Mapbox-based editor. On every
> panorama POV change, the SWMM network (nodes / links / subcatchments) is extracted from the model,
> re-projected from lat/lng onto the Street View image plane with a pinhole-style spherical camera model
> (terrain-corrected via Mapbox terrain sampling or the Google Elevation API), and drawn onto an HTML
> canvas that floats above the panorama.

---

## 1. Activation: the Pegman button and choosing a location

**The button.** A `#btn-pegman` toolbar button (a person-shaped SVG) toggles Street View:
`public/index.html:220-223`. It toggles a `.active` class, shows/hides the `#street-view-wrapper`
panel, and calls `StreetViewOverlay.init()` / `.destroy()` accordingly (`public/ui.js:534-549`).
The panel (`#street-view-wrapper` → `#street-view-container` + a drag-to-resize handle +
`#btn-close-sv`) is declared at `public/index.html:225-230`. The close button destroys the overlay
and re-hides the panel (`public/ui.js:551-557`). Dragging `#sv-resize-handle` re-sizes the panel via a
`--sv-height` CSS custom property and calls `StreetViewOverlay.resize()` on mouseup
(`public/ui.js:560-593`).

**Picking the location — init.** `initStreetView()` (`street_view_overlay.js:498-569`):
1. Seeds the initial position from the current Mapbox camera: `map.getCenter()`, falling back to
   La Serena, Chile `{lat:-29.908, lng:-71.254}` (`street_view_overlay.js:502-506`).
2. Creates `new google.maps.StreetViewService()` and calls
   `getPanorama({ location: initialPos, radius: 100 }, cb)` to find the nearest pano
   (`street_view_overlay.js:508-509`).
3. On `status === 'OK'`, constructs the `google.maps.StreetViewPanorama(container, {...})` with the
   panorama's `latLng` and an initial POV seeded from the Mapbox bearing
   (`street_view_overlay.js:511-520`). If there is no coverage it `alert()`s in Spanish and closes
   the panel (`street_view_overlay.js:558-562`).

**Picking the location — dragging the Pegman.** A Mapbox `mapboxgl.Marker` styled as a yellow
Pegman with a white drop-shadow is created, made draggable, and added at the initial position
(`street_view_overlay.js:527-541`). Its `dragend` handler moves the panorama:
`panorama.setPosition({ lat, lng })` (`street_view_overlay.js:543-546`). Conversely, the panorama's
`position_changed` event moves the Mapbox marker and camera (`onPositionChanged`,
`street_view_overlay.js:445-465`).

`mapboxgl` is the Mapbox GL JS global (loaded at `public/index.html:804`); `window.map` is the shared
Mapbox instance, set at `public/app.js:38` (and used throughout the overlay).

## 2. Google Maps JS API pieces

- **Loader.** `public/index.html:791-801`: after `config.js` is read, an inline script checks
  `CONFIG.GOOGLE_MAPS_API_KEY`; if present it dynamically appends
  `<script src="https://maps.googleapis.com/maps/api/js?key=...">` to `<head>`; if missing it
  `console.warn`s. The overlay module (`street_view_overlay.js`) is a separate classic script loaded at
  `public/index.html:819` — it never touches `google.*` at parse time, only inside
  `initStreetView()`, which runs on user click, by which point the API script has loaded. The docs
  call this the "lazy loader" (`docs/how-to/02-configure.md:10`, `docs/explanation/03-map-and-rendering.md:34`).
- **StreetViewService** — `new google.maps.StreetViewService()` + `getPanorama({location, radius})`
  to resolve a lat/lng to the nearest pano (`street_view_overlay.js:508-509`).
- **StreetViewPanorama** — `new google.maps.StreetViewPanorama(container, {position, pov:{heading,pitch,zoom}, ...controls})`
  renders the interactive pano and exposes its camera state via `getPosition()` (lat/lng) and
  `getPov()` (heading / pitch / zoom) (`street_view_overlay.js:511-520`, read back at
  `street_view_overlay.js:346-353`).
- **POV** — heading (0–360°, 0 = north), pitch (−90 down … +90 up), zoom (field-of-view scale).
  `getFocal()` derives the pinhole focal length from zoom + image width (see §3).
- **ElevationService** — `new google.maps.ElevationService()` + `getElevationForLocations()` for the
  terrain-correction fallback (`street_view_overlay.js:522-523`, `171-193`, `195-224`). Creation is
  wrapped in try/catch (`street_view_overlay.js:522-523`).
- **Events** — `panorama.addListener('pov_changed', scheduleRedraw)` and
  `panorama.addListener('position_changed', onPositionChanged)`; removed on destroy via
  `google.maps.event.removeListener` (`street_view_overlay.js:549-550`, `572-573`).

## 3. Projection math: `project(camLL, ptLL, heading, pitch, f, W, H)`

**Model.** Each network vertex is treated as a point on a sphere of radius `EARTH_R = 6371000` m
centered on the camera. `project()` (`street_view_overlay.js:233-279`) computes where the ray from
the camera to that vertex pierces the image plane tangent to the view direction — a gnomonic
projection through a pinhole camera. Steps:

1. **Range & azimuth.** `haversine()` gives the great-circle distance `d`
   (`street_view_overlay.js:40-45`); `bearing()` gives the azimuth `bear` from camera to point
   (`street_view_overlay.js:47-53`). Points closer than 0.1 m or beyond `MAX_DIST_M = 150` m are
   rejected (`street_view_overlay.js:234-235`).
2. **Terrain correction** (`street_view_overlay.js:239-261`): the elevation difference
   `dElev = vertexElev − cameraElev` is subtracted from the nominal Street View camera height,
   `effectiveH = CAM_HEIGHT(2.5 m) − dElev`. The point's vertical angle is then
   `pitchPt = −atan2(effectiveH, d) * R2D` — a point below the camera plane (positive `effectiveH`)
   gets a negative pitch, above it a positive pitch, matching Google's pitch sign convention
   (`street_view_overlay.js:261-262`).
3. **Spherical direction.** `(lam = bearing, phi = pitchPt)` is the point's direction on the unit
   sphere; `(lam0 = heading, phi0 = pitch)` is the camera view direction
   (`street_view_overlay.js:264-267`).
4. **Angular distance from view center** via the spherical law of cosines:
   `cosC = sinφ0·sinφ + cosφ0·cosφ·cos(λ−λ0)` (`street_view_overlay.js:269-270`). If `cosC ≤ 0.01`
   (> ~89° off center) the point is behind/off-screen and returns `null` (`street_view_overlay.js:272`).
5. **Gnomonic tangent-plane projection** (pierce point of the ray on the plane tangent at the view
   direction):
   - `xNorm = cosφ·sin(λ−λ0) / cosC`
   - `yNorm = (cosφ0·sinφ − sinφ0·cosφ·cos(λ−λ0)) / cosC`
   (`street_view_overlay.js:274-276`)
6. **Scale to pixels, center, flip Y:** `{ x: W/2 + f·xNorm, y: H/2 − f·yNorm }`
   (`street_view_overlay.js:278`). `f` is the focal length in px; `W`, `H` are the overlay canvas
   pixel size; the `−` on y flips because canvas Y grows downward.

**Focal length / FOV.** `getFocal(zoom, W)` (`street_view_overlay.js:227-231`) approximates the
pano lens: horizontal FOV `hFov = 180 / 2^zoom` degrees (clamped to [1°, 170°]), then
`f = (W/2) / tan(hFov/2)`. So `f` comes from the Google `pov.zoom` and the current canvas width —
the "panorama size" enters through `W` (canvas width) and zoom rather than the pano tile dimensions.

**Terrain sources for `dElev`** (`street_view_overlay.js:241-259`), in priority order:
1. **Mapbox Terrain Elevation** — `window.map.queryTerrainElevation([lng, lat])` at both the vertex
   and the camera (`street_view_overlay.js:244-247`). Free, local, and matches the 3D mesh the app
   already uses (`docs/explanation/03-map-and-rendering.md:30`). Used when both samples return
   non-null (`street_view_overlay.js:249-251`).
2. **Google Elevation API fallback** — `dElev = vertElev − camElevation` from the elevation cache
   (`street_view_overlay.js:252-258`).

**Elevation fetching pipeline** (when Mapbox terrain is unavailable):
- `collectUncachedVertices(camLL)` (`street_view_overlay.js:137-169`) walks every feature, densifies
  each ring, drops points beyond `MAX_DIST_M`, and returns only keys missing from `elevCache`
  (deduplicated). The cache key is `lat.toFixed(5) + ',' + lng.toFixed(5)` (~1.1 m grid;
  `street_view_overlay.js:55-57`).
- `fetchElevations()` batches requests into groups of 500 and calls
  `elevService.getElevationForLocations` per batch, storing `r.elevation` per key
  (`street_view_overlay.js:171-193`). `REQUEST_DENIED` latches `elevApiDenied` so all future fetches
  are skipped and the overlay degrades to no terrain correction (`street_view_overlay.js:187`, `196`).
- `updateElevations(camLL)` (`street_view_overlay.js:195-224`) first gets the camera elevation
  (cached or one-shot), records it as `camElevation`, then fetches the uncached vertices and calls
  `scheduleRedraw()`. Re-fetching is gated on movement: `onPositionChanged` only calls
  `updateElevations` when the camera has moved more than `MOVE_THRESH_M = 3` m since the last fetch
  (`street_view_overlay.js:458-464`).

## 4. The overlay: re-projection, drawing, and camera sync

**Canvas.** `createCanvas()` (`street_view_overlay.js:468-496`) appends an absolutely-positioned
`<canvas id="sv-overlay-canvas">` over `#street-view-container` with `pointerEvents: none`, z-index
1000, sized by a `ResizeObserver` on the container.

**Data source.** `extractMapboxFeatures()` (`street_view_overlay.js:95-134`) pulls the network
directly from the SWMM model: `net.nodesGeoJSON()` and `net.linksGeoJSON()` (via `window.App.network`
or `window.Net`), tagging each feature with `_svColor` from `window.SWMM_COLORS`
(node/link type → color). This is the same GeoJSON the Mapbox layers use
(`docs/explanation/03-map-and-rendering.md:11-24`).

**Densification.** Long lines are subdivided to ≤ `DENSIFY_STEP_M = 5` m so the projection stays
faithful when the curve is far from the camera (`densifyToLL`, `street_view_overlay.js:60-79`). A
`WeakMap` keyed on the coordinates array (`densifyCachedLL`, `street_view_overlay.js:84-92`) gives
free cache invalidation when Network.js swaps out the coords array.

**Render loop** (`render()`, `street_view_overlay.js:338-433`):
1. Bail if no canvas, no panorama, or the panorama is hidden (`street_view_overlay.js:339`).
2. Read the camera: `panorama.getPosition()` → `camLL`; `getPov()` → `heading`, `pitch`, `zoom`;
   `f = getFocal(zoom, W)` (`street_view_overlay.js:346-354`).
3. Clear the canvas, then for each feature call `extractMapboxStyle()` for color/width and dispatch
   on geometry type (`street_view_overlay.js:356-419`):
   - `LineString`/`MultiLineString` → stroke each densified polyline via `drawLL()`.
   - `Polygon`/`MultiPolygon` → `drawLL(…, close=true)` then fill (translucent indigo) + stroke.
   - `Point`/`MultiPoint` → project each vertex and draw an r=8 px circle, white outline.
   `drawLL()` (`street_view_overlay.js:323-336`) walks the densified points, calls `project()` per
   point, `moveTo` on the first visible point and `lineTo` after; a `null` projection breaks the
   current sub-path (handles points behind the camera).
4. **Style.** `extractMapboxStyle()` (`street_view_overlay.js:282-320`) prefers live simulation
   result colors when `ResultStyling.active`: node depth / link flow normalized to `nodeMinMax` /
   `linkMinMax` and passed through `window.rampColor` (the shared color ramp defined at
   `public/results.js:23`); otherwise the SWMM type color. Line/polygon width 6, point width 2.

**Mapbox ⇄ Street View camera sync** (`street_view_overlay.js:421-432`):
- `map.setBearing(heading)` — matches Mapbox bearing to SV heading.
- `map.setPitch((pitch + 90) / 2)` clamped to 85 — maps SV pitch (−90…+90) onto Mapbox pitch
  (0…85). The comment flags this as approximate.
- The Pegman marker's `setRotation(heading)` keeps its arrow aligned.

**Redraw scheduling.** `scheduleRedraw()` (`street_view_overlay.js:435-443`) is a dirty-flag +
single-`requestAnimationFrame` coalescer: any number of calls within a frame collapse into one
`render()`. Triggered by `pov_changed` (`street_view_overlay.js:549`), `position_changed`
(`street_view_overlay.js:550`), elevation fetches, result/animation steps
(`public/results.js:480-482`, `public/ui.js:1149-1150` — the time-slider's `updateDisplay` calls
`StreetViewOverlay.scheduleRedraw`), and canvas resizes. A `map.on('render', …)` redraw hook was
explicitly removed because it caused CPU thrashing rendering thousands of items at 60 fps while
panning (`street_view_overlay.js:552-555`).

## 5. Dependencies and limits

**Config / keys.**
- `GOOGLE_MAPS_API_KEY` — optional key in `public/config.js`, written into the page by the inline
  loader at `public/index.html:791-801`; documented as "Google Street View overlay" / "lazy loader"
  (`docs/how-to/02-configure.md:10,18`; `docs/explanation/03-map-and-rendering.md:34`). If missing,
  the app warns and the Street View button silently does nothing useful.
- CI injects the key from repo secrets into `config.js` on build
  (`.github/workflows/static.yml:32`, `.github/workflows/cloudflare.yml:25`).
- The Mapbox GL map itself is the other hard dependency (`window.map` at `public/app.js:38`); the
  overlay reaches into Mapbox terrain (`queryTerrainElevation`) and the marker API directly.

**Google API usage & async.** The Maps JS API is injected dynamically at parse time
(`index.html:791-801`); `street_view_overlay.js` is loaded before `app.js`/`ui.js`
(`index.html:814-834`) but only touches `google.maps` inside user-triggered `initStreetView()`, so
no explicit load-callback is needed. The Google **Elevation API** is only exercised as a fallback
when Mapbox terrain elevation isn't available; it is quota/billing-sensitive, batched 500/request,
and cached per 5-decimal lat/lng; `REQUEST_DENIED` permanently degrades to no terrain correction
(`street_view_overlay.js:171-193`).

**Known approximations.**
- Fixed `CAM_HEIGHT = 2.5 m` for the SV camera regardless of the actual pano (`street_view_overlay.js:14`).
- The pinhole/gnomonic model with `hFov = 180/2^zoom` (`getFocal`) is an approximation of Google's
  real pano lens/FOV (`street_view_overlay.js:227-231`).
- Mapbox pitch mapping `(pitch+90)/2` clamped to 85 is explicitly approximate
  (`street_view_overlay.js:424-427`).
- Elevations are only refreshed when the camera moves > 3 m (`MOVE_THRESH_M`, `street_view_overlay.js:15,458-464`).
- `queryTerrainElevation` reflects the Mapbox DEM/mesh, which can differ from the ground height the
  Google pano was captured at.
- Hard render cutoff at 150 m and 5 m densification step cap cost/accuracy
  (`street_view_overlay.js:12-13`).
- No redraw on Mapbox `render` events (CPU throttling); overlay redraws on SV POV/position changes
  and animation steps only (`street_view_overlay.js:552-555`).
- No pano coverage → alert + auto-close (`street_view_overlay.js:558-562`).