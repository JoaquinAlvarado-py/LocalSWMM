<!-- Part of the engine modifications explanation series -->

# New engine options

The following table summarizes the options and sections that HydroCouple
adds on top of official SWMM.

| Option / section | What it adds | Default value |
|---|---|---|
| `NODE_CONTINUITY` | unified semi-implicit node continuity | EXPLICIT (legacy) |
| `ANDERSON_ACCEL` | Anderson acceleration of the Picard loop | NO |
| `SURCHARGE_METHOD` | third surcharge method: DYNAMIC_SLOT | EXTRAN (legacy) |
| `DPS_CELERITY` / `DPS_ALPHA` / `DPS_DECAY_TIME` | dynamic slot parameters | 25 m/s, 3, 0.5 s |
| `[VIRTUAL_JUNCTIONS]` | sealed zero-storage nodes with momentum transmission | --- |
| `VIRTUAL_JUNCTION_MOMENTUM` | convective correction across the virtual junction | BASIC |
| `FLOW_ROUTING FV` | explicit 1D finite volume solver | DYNWAVE (legacy) |
| `FV_*` | FV solver options (CFL, Riemann, order, LTS, ...) | see the [FV solver options table](../explanation/engine-modifications/06-finite-volume-routing.md) |
| `[2D_VERTICES]`<br>`[2D_TRIANGLES]` | local-inertial shallow water 2D mesh | --- |
| `[2D_OPTIONS]` | 2D marching scheme and coupling options (`COUPLING_CD`, `COUPLING_SYNC`, ...) | COUPLING_CD 0.65 |
| `IGNORE_2D` | disables the 2D solver while keeping the mesh | NO |
| `[RDII_DECAY]` | exponential recovery of the RDII abstraction with temperature ($k_0$, $k_T$, $T_{\mathrm{ref}}$) | --- |
| `THREADS` | bit-exact OpenMP solver threads | 1 |
| `CRS` | spatial reference system (EPSG/PROJ) | empty |
| `SKIP_STEADY_STATE` | skips routing in steady state | NO |

*Table: New OpenSWMM engine options and sections with respect to official
US EPA SWMM.*
