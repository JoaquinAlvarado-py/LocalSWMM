# Simulation Orchestration

<!-- Part of the 1D Hydraulics explanation series -->

## Simulation orchestration

### The overall time-stepping loop

The engine is a single-step API. Each call to `SWMMEngine::step()` executes exactly one routing step (or one runoff-only step when routing is disabled). The sequence within a step is (`SWMMEngine.cpp:941`):

1. Compute the routing time step $dt_{\mathrm{next}}$. If the variable-step option is enabled, the Courant-limited step is

   $$dt_{\mathrm{cfl}} = \text{router.getAdaptiveStep}(\text{routing\_step},\ \text{variable\_step}),$$

   then $dt_{\mathrm{next}} = \min(\text{routing\_step},\ dt_{\mathrm{cfl}})$ clamped to the remaining simulation duration.
2. Save the old hydraulic state (`ctx.save_state()`).
3. Reset the per-step mass-balance accumulators.
4. Run the pipeline:
   1. `stepRunoff($dt$)` — hydrology (always);
   2. if routing is enabled: `stepRouting($dt$)` (hydraulics + quality), `updateStatistics($dt$)`, `updateRoutingMassBalance($dt$)`;
   3. `computeFinalStorage()`.
5. Advance the simulation clock and post output snapshots.

### Runoff and routing clocks

The hydrology and hydraulics run on *independent* clocks:

- The **runoff clock** advances at the wet step (300 s default) or dry step (3600 s default), shortened to align with rain-gage boundaries. `stepRunoff` runs multiple runoff sub-steps within one routing step ($\text{while } t_{\mathrm{runoff}} < t_{\mathrm{routing}} + dt$).
- The **routing clock** advances by $dt$ (the routing step) each `step()` call.

After the runoff sub-steps, the wet-weather lateral inflow delivered to nodes is obtained by *linear interpolation* between the bracketing runoff evaluations: with $f = (t_{\mathrm{elapsed}} - t_{\mathrm{runoff,old}}) / (t_{\mathrm{runoff,new}} - t_{\mathrm{runoff,old}})$,

$$Q_{\mathrm{runoff}} = (1-f)\,Q_{\mathrm{runoff}}^{\mathrm{old}} + f\,Q_{\mathrm{runoff}}^{\mathrm{new}},$$

plus runon and groundwater contributions. These are scattered into `nodes.runoff_inflow` / `nodes.gw_inflow`.

### Lateral inflows

Every routing step, the lateral inflows are assembled from decomposed source buffers in legacy order (`assembleLateralInflows`, `SWMMEngine.cpp:5691`):

$$Q_{\mathrm{lat}} = Q_{\mathrm{ext}} + Q_{\mathrm{dwf}} + Q_{\mathrm{wet}} + Q_{\mathrm{gw}} + Q_{\mathrm{rdii}} + Q_{\mathrm{iface}} + Q_{\mathrm{user}} + Q_{\mathrm{coupling}},$$

where the terms are external/inflow time series, dry-weather flow, wet-weather (runoff) inflow, groundwater inflow, RDII, interface-file inflow, user-forced inflow, and 1D–2D coupling inflow respectively.

### The routing step

`Router::step(ctx, dt, evap_rate, non_conduit_fn)` (`Routing.cpp:308`) performs, in order:

1. **initNodeFlows** — initialize each node's inflow from lateral flow and outflow from losses (storage evaporation and Green–Ampt exfiltration, jointly capped against the stored volume); set overflow from excess stored volume.
2. **computeConduitLosses** — conduit evaporation (open sections) and seepage loss rates. For DYNWAVE this is instead recomputed per Picard iteration inside the solver.
3. **setAllOutfallDepths** — set the outfall boundary stages ([Outfall boundary conditions](10-structures-and-boundaries.md)).
4. **Solver dispatch** — KINWAVE, DYNWAVE, FV, or STEADY.
5. **computeDividerFlows** — apply flow-divider logic.
6. **updateLinkStates** — recompute node heads $H = z_{\mathrm{inv}} + d$.

Inside the dynamic-wave solver, the non-conduit callback computes pump/orifice/weir/outlet flows inside the Picard iteration, in link-index order, with immediate scatter into the node inflow/outflow accumulators.
