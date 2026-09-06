# Data Formats

The three data formats the app reads and writes: the project file, the INP dialect, and the `.out` binary.

## Project file (`.oswmm.json`)

The JSON produced by `Net.serialize()` (`network.js:465-488`) — a full snapshot of `{title, units, options, nodes, links, subcatchments, timeseries, curves, lidControls, lidUsages, pollutants, landUses, treatments, aquifers, snowpacks, snowpackAssignments, rawSections, …}`. This is what **Save** writes and **Load** reads.

## INP dialect (standard SWMM)

Written by `inpExporter.generateInp` (`inpExporter.js:7-715`) in a stable section order:

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

Key export behaviors: option precedence UI value → `opt.raw` → default (`inpExporter.js:47-50`); `REPORT_STEP` heuristic from imported value → first gage interval → 1 h (`:54-69`); OUTFALL column-shift for stage types (`:207-215`); WEIR ROADWAY handling (`:287-295`); `REPORT` whitelist (`:390-403`).

The parser (`inpParser.js:7-29`) is **lossless**: every section is kept tokenized (`sections`) *and* raw (`rawSections`), so anything the UI can't edit survives export.

## `.out` binary format (SWMM output)

Parsed by `swmmOutParser.js`: footer magic `516114522`, version/flow-units header, length-prefixed ID name tables, variable counts per object class, and per-period Float32 records for subcatchments (8 vars), nodes (6), links (5), and system (14). Exposed as zero-copy typed-array views.

Footer layout: the last six INT32s are `idNamesOffset, objPropsOffset, resultsOffset, numPeriods, errCode, magicEnd`; the magic value `516114522` is validated. Hot paths: `getTimeSeries(type,index,varIndex)` (cached) and `getStepData(type,step,varIndex)` for per-step map coloring.
