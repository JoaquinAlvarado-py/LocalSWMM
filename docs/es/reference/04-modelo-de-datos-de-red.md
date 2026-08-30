# El modelo de datos de red

`class Network` (`network.js:101`), una única instancia `window.Net`. Es el store canónico de todo lo que el usuario construye.

## Formas de los elementos

| Colección | Forma |
|---|---|
| `nodes[]` | `{ id, type, lngLat:[lng,lat], props }` |
| `links[]` | `{ id, type, from, to, vertices[], props }` (`vertices` = coordenadas intermedias) |
| `subcatchments[]` | `{ id, ring:[[lng,lat]…], props }` |
| `mesh2D[]` | `{ id:'M2D_n', ring, manningN, parentSubcatch, props }` — derivado de la malla indexada |
| `mesh2DIndexed` | Salida del motor Triangle; ver el modelo de datos de la malla 2D |
| `timeseries` | `{ TS1: [{date,time,value}…] }` |
| `options`, `units` | Opciones de simulación, `'SI'`/`'US'` |
| Metadata | `title`, `counters`, `rawSections`, `curves`, `lidControls`, `pollutants`, `landUses`, `treatments`, `aquifers`, `snowpacks`, `importedLayers` |

## Propiedades por defecto

Las **props por defecto** vienen de factories: `defaultNodeProps(type)`, `defaultLinkProps(type)`, `defaultSubcatchProps()` (`network.js:30-54`). Por ejemplo, JUNCTION `{invertEl, maxDepth:2, initDepth, surDepth, aponded}`; CONDUIT `{roughness:0.013, autoLength:true, xShape:'CIRCULAR', geom1:1.0, barrels:1}`.

## IDs, índices, caché GeoJSON

- **Generación de IDs** (`nextId`, `network.js:171-181`): contadores por tipo con prefijos de `ID_PREFIX` (`network.js:19-23`): nodos `J/O/ST/D/RG`, enlaces `C/P/W/OR/OL`, subcuencas `S`, celdas de malla `M2D_`.
- **Búsqueda O(1):** `_nodeMap/_linkMap/_subMap` reconstruidos por `rebuildIndexes()` (`network.js:141-150`); `findAny(id)` (`network.js:197-212`) también resuelve celdas de malla.
- **Cachés GeoJSON:** `nodesGeoJSON/linksGeoJSON/subcatchmentsGeoJSON/mesh2DGeoJSON` (`network.js:784-865`) invalidadas por `_invalidateGeo()`; los movimientos de nodo se parchean in place (`_patchGeoForMove`, `network.js:350-365`) para que los drags no reconstruyan todo.

## Undo/redo (patrón de comandos)

- El historial es un arreglo de snapshots completos `{t:'snap', json}` y deltas `{t:'cmd', op}`. `HISTORY_LIMIT=100`, con snapshots forzados cada 25 ops (`network.js:25-26`).
- `_record(op)` (`network.js:534-544`) registra deltas; `commit()` (`network.js:524-532`) empuja un snapshot (usado después de ops masivas como clear/merge).
- Tipos de op (`_applyOp`, `network.js:636-674`): `add`, `del` (en cascada a los enlaces conectados, restaura refs de outlet/gage), `move`, `props`, `rename`, `units`.
- `undo/redo` (`network.js:565-586`); `_trimHistory` (`network.js:546-560`) elimina las entradas más antiguas; `canUndo/canRedo` manejan los estados de los botones de la toolbar.

## Mutaciones

`addNode` (`226-240`), `addLink` (`242-258`, auto-computa el largo del conducto), `addSubcatchment` (`260-284`, auto-computa el área en ha/ac y elige el nodo hidráulico más cercano como outlet), `moveNode/commitMove` (`318-336`), `updateProps` (`367-382`), `renameElement` (`384-393`), `deleteElements` (`414-451`), `setUnits` (`453-462`). Cada mutación emite `Net.emit()` → los suscriptores de `Net.onChange` re-renderizan (`app.js:632-640`).

## Serialización

`serialize()` (`network.js:465-488`) es el volcado canónico del modelo (versión 2); `loadState()` (`network.js:490-520`) lo restaura, reconstruyendo índices y la malla indexada. `rawSections` (texto INP verbatim de las importaciones) se preserva para que los datos que la UI no tiene editor sobrevivan los round-trips.
