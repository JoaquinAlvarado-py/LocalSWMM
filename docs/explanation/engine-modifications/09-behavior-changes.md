<!-- Part of the engine modifications explanation series -->

# Default behavior and platform changes

## Behavior changes

In addition to the functional extensions, the engine introduces behavior
changes worth knowing about:

- **Variable time step by default**: `VARIABLE_STEP`
  defaults to **0.75** (Courant-adaptive step), whereas the SWMM 5.x
  manual documents 0 (fixed step). To reproduce the official SWMM
  behavior, `VARIABLE_STEP 0` must be set.
- **Tolerance unit handling**: the `HEAD_TOLERANCE` and the
  `MIN_SURFAREA` are converted from the project units to the internal
  system (feet) at initialization, correcting factor 3.3–10.8 errors in
  SI models of the previous engine.
- **Conduit losses per iteration**: under dynamic wave, conduit
  evaporation and infiltration are recomputed in *every* Picard iteration
  (with the routing-class gate), as in the legacy engine, instead of once
  per step.
- **Convergence counting**: a step that converges on its last allowed
  attempt is counted as converged (it only fails if it does not converge
  after `MAX_TRIALS`).
- **Steady-state skip**: `SKIP_STEADY_STATE` skips the routing
  when there were no control actions, the continuity error is under
  tolerance and the inflows did not change.

## Platform and format extensions

- **CRS**: the `CRS` option in `[OPTIONS]` accepts an
  EPSG or a PROJ string, carrying the spatial reference system of the
  model (official SWMM does not have it).
- **Extension keys**: `ext_options` stores any unknown
  `[OPTIONS]` key for plugins.
- **IGNORE_2D**: allows disabling the 2D solver while keeping the
  mesh in the file (to run the model 1D only).
- **Geopackage**: native GeoPackage input/output (including the
  `rdii_decay` table of the recovery parameters), in addition to the
  `.inp` format.
- **C API**: a C API (with wrappers) exposes all the extensions (for
  example `swmm_rdii_decay_add`).
- **WebAssembly**: the engine is compiled to WASM to run in the browser
  (as LocalSWMM uses it), with the 2D solver on GPU/WebGPU.
- **Manufactured solution tests**: the repository includes a battery of
  benchmarks with analytical solutions (Ritter dam break, lake at rest,
  Macdonald waves, pump discharge reference curves, among others) that
  anchor the fidelity of the solvers.

## References

1. Rossman, L. A. (2017). *Storm Water Management Model Reference
   Manual Volume II — Hydraulics*. U.S. EPA.
2. Sharior, S., Hodges, B. R., & Vasconcelos, J. G. (2023).
   Generalized, dynamic, and transient-storage form of the Preissmann
   slot. *Journal of Hydraulic Engineering*, 149(11).
3. de Almeida, G. A. M., & Bates, P. D. (2013). Applicability of the
   local inertial approximation of the shallow water equations to flood
   modeling. *Water Resources Research*, 49(8).
4. Source code of the OpenSWMM engine (HydroCouple):
   - `src/engine/hydraulics/DynamicWave.cpp`,
     `src/engine/hydraulics/HydStructures.cpp`,
     `src/engine/hydraulics/fv/ExplicitFvSolver.cpp`
   - `src/engine/2d/` (marching scheme and coupling),
     `src/engine/hydrology/RDII.cpp`,
     `src/engine/core/SimulationOptions.hpp`
5. OpenSWMM engine reference manuals (Vol. II — Hydraulics, ch. 3, 7, 9;
   Vol. I — Hydrology, ch. 7).
