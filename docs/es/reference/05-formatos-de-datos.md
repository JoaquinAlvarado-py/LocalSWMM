# Formatos de datos

Los tres formatos de datos que la app lee y escribe: el archivo de proyecto, el dialecto INP y el binario `.out`.

## Archivo de proyecto (`.oswmm.json`)

El JSON producido por `Net.serialize()` (`network.js:465-488`) — un snapshot completo de `{title, units, options, nodes, links, subcatchments, timeseries, curves, lidControls, lidUsages, pollutants, landUses, treatments, aquifers, snowpacks, snowpackAssignments, rawSections, …}`. Es lo que **Save** escribe y **Load** lee.

## Dialecto INP (SWMM estándar)

Escrito por `inpExporter.generateInp` (`inpExporter.js:7-715`) en un orden de secciones estable:

```
[TITLE] [OPTIONS] [EVAPORATION] [RAINGAGES] [RDII_DECAY]
[SUBCATCHMENTS] [SUBAREAS] [INFILTRATION]
[JUNCTIONS] [OUTFALLS] [STORAGE] [DIVIDERS]
[CONDUITS] [LOSSES] [PUMPS] [WEIRS] [ORIFICES] [OUTLETS] [XSECTIONS]
[TIMESERIES] [TAGS] [REPORT]
[COORDINATES] [VERTICES] [POLYGONS] [SYMBOLS]
[CURVES] [LID_CONTROLS] [LID_USAGE] [POLLUTANTS] [LANDUSES] [BUILDUP] [WASHOFF]
[TREATMENT] [AQUIFERS] [GROUNDWATER] [SNOWPACKS] [SNOWPACK_ASSIGNMENT]
+ any unrecognized rawSections re-emitted verbatim (inpExporter.js:696-712)
```

Comportamientos clave de exportación: precedencia de opciones valor de UI → `opt.raw` → default (`inpExporter.js:47-50`); heurística de `REPORT_STEP` desde el valor importado → primer intervalo de gage → 1 h (`:54-69`); desplazamiento de columna OUTFALL para tipos stage (`:207-215`); manejo de WEIR ROADWAY (`:287-295`); whitelist de `REPORT` (`:390-403`).

El parser (`inpParser.js:7-29`) es **sin pérdidas**: cada sección se conserva tokenizada (`sections`) *y* cruda (`rawSections`), para que todo lo que la UI no puede editar sobreviva al export.

## Formato binario `.out` (salida de SWMM)

Parseado por `swmmOutParser.js`: magic del footer `516114522`, header de versión/unidades de flujo, tablas de nombres de IDs con largo prefijado, conteos de variables por clase de objeto y registros Float32 por período para subcuencas (8 vars), nodos (6), enlaces (5) y sistema (14). Expuesto como vistas typed-array de zero-copy.

Disposición del footer: los últimos seis INT32 son `idNamesOffset, objPropsOffset, resultsOffset, numPeriods, errCode, magicEnd`; se valida el valor magic `516114522`. Caminos calientes: `getTimeSeries(type,index,varIndex)` (cacheado) y `getStepData(type,step,varIndex)` para el coloreado del mapa por paso.
