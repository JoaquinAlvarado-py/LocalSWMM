# Options and Defaults

<!-- Part of the 1D Hydraulics explanation series -->

## Options and defaults

Table `tab:options` summarizes the routing-related options (`SimulationOptions.hpp`) and their defaults.

**Table `tab:options` — Routing-related options and defaults.**

| Option | Default | Purpose |
|--------|---------|---------|
| `FLOW_ROUTING` | DYNWAVE | routing formulation |
| `ROUTING_STEP` | 20 s | fixed routing step |
| `MINIMUM_STEP` | 0.5 s | floor for the CFL step |
| `DRY_STEP` / `WET_STEP` | 3600 / 300 s | runoff step bounds |
| `VARIABLE_STEP` | 0.75 | Courant factor (0 = fixed step) |
| `LENGTHENING_STEP` | 0 | Courant lengthening step |
| `MAX_TRIALS` | 8 | Picard trial limit |
| `HEAD_TOLERANCE` | 0.005 (project units) | node convergence tolerance |
| `SURCHARGE_METHOD` | EXTRAN | EXTRAN / SLOT / DYNAMIC_SLOT |
| `NODE_CONTINUITY` | EXPLICIT | two-branch vs semi-implicit |
| `INERTIAL_DAMPING` | PARTIAL | Froude damping policy |
| `NORMAL_FLOW_LIMITED` | BOTH | slope/Froude normal-flow cap |
| `MIN_SURFAREA` | 12.566 ft$^2$ | nodal area floor |
| `ALLOW_PONDING` | false | allow ponding above the rim |
| `ANDERSON_ACCEL` | false | Anderson acceleration |
| `SKIP_STEADY_STATE` | false | skip steady routing |

## References

1. Rossman, L. A. (2017). *Storm Water Management Model Reference Manual Volume II – Hydraulics*. U.S. EPA.
2. OpenSWMM engine source:
   - `src/engine/hydraulics/Routing.cpp`
   - `src/engine/hydraulics/DynamicWave.cpp`
   - `src/engine/hydraulics/KinematicWave.cpp`
   - `src/engine/hydraulics/HydStructures.cpp`
   - `src/engine/hydraulics/Node.cpp`
   - `src/engine/hydraulics/Link.cpp`
   - `src/engine/hydraulics/Outfall.cpp`
   - `src/engine/hydraulics/Divider.cpp`
   - `src/engine/hydraulics/XSectBatch.cpp`
   - `src/engine/hydraulics/XSectKernels.hpp`
   - `src/engine/core/SimulationOptions.hpp`
   - `src/engine/core/SWMMEngine.cpp`
3. Sharior, S., Hodges, B. R., & Vasconcelos, J. G. (2023). Generalized, dynamic, and transient-storage form of the Preissmann slot. *Journal of Hydraulic Engineering*, 149(11).
4. Sjöberg, A. (1982). Sewer network models dagnum and DIVISION – a brief description. *Swedish Water and Wastewater Works Association*.
5. Roesner, L. A., Nichandros, H. M., Shubinski, R. P., Feldman, A. D., Abbott, J. W., & Delleur, J. W. (1981). *Physical model for combined sewer overflows*. Proc. ASCE.
6. de Almeida, G. A. M., & Bates, P. D. (2013). Applicability of the local inertial approximation of the shallow water equations to flood modeling. *Water Resources Research*, 49(8).
