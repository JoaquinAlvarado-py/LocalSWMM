# The Network Data Model

`class Network` (`network.js:101`), one instance `window.Net`. It is the canonical store for everything the user builds.

## Element shapes

| Collection | Shape |
|---|---|
| `nodes[]` | `{ id, type, lngLat:[lng,lat], props }` |
| `links[]` | `{ id, type, from, to, vertices[], props }` (`vertices` = intermediate coordinates) |
| `subcatchments[]` | `{ id, ring:[[lng,lat]…], props }` |
| `mesh2D[]` | `{ id:'M2D_n', ring, manningN, parentSubcatch, props }` — derived from the indexed mesh |
| `mesh2DIndexed` | Triangle-engine output; see the 2D mesh data model |
| `timeseries` | `{ TS1: [{date,time,value}…] }` |
| `options`, `units` | Simulation options, `'SI'`/`'US'` |
| Metadata | `title`, `counters`, `rawSections`, `curves`, `lidControls`, `pollutants`, `landUses`, `treatments`, `aquifers`, `snowpacks`, `importedLayers` |

## Default properties

**Default props** come from factories: `defaultNodeProps(type)`, `defaultLinkProps(type)`, `defaultSubcatchProps()` (`network.js:30-54`). E.g. JUNCTION `{invertEl, maxDepth:2, initDepth, surDepth, aponded}`; CONDUIT `{roughness:0.013, autoLength:true, xShape:'CIRCULAR', geom1:1.0, barrels:1}`.

## IDs, indexes, GeoJSON cache

- **ID generation** (`nextId`, `network.js:171-181`): per-type counters with prefixes from `ID_PREFIX` (`network.js:19-23`): `J/O/ST/D/RG` nodes, `C/P/W/OR/OL` links, `S` subcatchments, `M2D_` mesh cells.
- **O(1) lookup:** `_nodeMap/_linkMap/_subMap` rebuilt by `rebuildIndexes()` (`network.js:141-150`); `findAny(id)` (`network.js:197-212`) also resolves mesh cells.
- **GeoJSON caches:** `nodesGeoJSON/linksGeoJSON/subcatchmentsGeoJSON/mesh2DGeoJSON` (`network.js:784-865`) invalidated by `_invalidateGeo()`; node moves patch in place (`_patchGeoForMove`, `network.js:350-365`) so drags don't rebuild everything.

## Undo/redo (command pattern)

- History is an array of `{t:'snap', json}` full snapshots and `{t:'cmd', op}` deltas. `HISTORY_LIMIT=100`, snapshots forced every 25 ops (`network.js:25-26`).
- `_record(op)` (`network.js:534-544`) logs deltas; `commit()` (`network.js:524-532`) pushes a snapshot (used after bulk ops like clear/merge).
- Op types (`_applyOp`, `network.js:636-674`): `add`, `del` (cascade to connected links, restore outlet/gage refs), `move`, `props`, `rename`, `units`.
- `undo/redo` (`network.js:565-586`); `_trimHistory` (`network.js:546-560`) drops oldest entries; `canUndo/canRedo` drive toolbar button states.

## Mutations

`addNode` (`226-240`), `addLink` (`242-258`, auto-computes conduit length), `addSubcatchment` (`260-284`, auto-computes area in ha/ac and picks nearest hydraulic node as outlet), `moveNode/commitMove` (`318-336`), `updateProps` (`367-382`), `renameElement` (`384-393`), `deleteElements` (`414-451`), `setUnits` (`453-462`). Every mutation emits `Net.emit()` → `Net.onChange` subscribers re-render (`app.js:632-640`).

## Serialization

`serialize()` (`network.js:465-488`) is the canonical model dump (version 2); `loadState()` (`network.js:490-520`) restores it, rebuilding indexes and the indexed mesh. `rawSections` (verbatim INP text from imports) is preserved so that data the UI has no editor for survives round-trips.
