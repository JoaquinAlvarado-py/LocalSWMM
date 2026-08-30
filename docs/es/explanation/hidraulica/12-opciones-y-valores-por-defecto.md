# Opciones y valores por defecto

<!-- Parte de la serie de explicación de Hidráulica 1D -->

La Tabla 5 resume las opciones relacionadas con el tránsito (`SimulationOptions.hpp`) y sus valores por defecto.

| Opción | Defecto | Propósito |
|---|---|---|
| `FLOW_ROUTING` | DYNWAVE | formulación de tránsito |
| `ROUTING_STEP` | 20 s | paso de tránsito fijo |
| `MINIMUM_STEP` | 0.5 s | piso del paso CFL |
| `DRY_STEP` / `WET_STEP` | 3600 / 300 s | límites del paso de escorrentía |
| `VARIABLE_STEP` | 0.75 | factor de Courant (0 = paso fijo) |
| `LENGTHENING_STEP` | 0 | paso de alargamiento de Courant |
| `MAX_TRIALS` | 8 | límite de intentos de Picard |
| `HEAD_TOLERANCE` | 0.005 (unidades del proyecto) | tolerancia de convergencia de nodo |
| `SURCHARGE_METHOD` | EXTRAN | EXTRAN / SLOT / DYNAMIC_SLOT |
| `NODE_CONTINUITY` | EXPLICIT | dos ramas vs. semi-implícita |
| `INERTIAL_DAMPING` | PARTIAL | política de amortiguación por Froude |
| `NORMAL_FLOW_LIMITED` | BOTH | tope de caudal normal por pendiente/Froude |
| `MIN_SURFAREA` | 12.566 ft² | piso del área de nodo |
| `ALLOW_PONDING` | false | permite encharcamiento sobre el brocal |
| `ANDERSON_ACCEL` | false | aceleración de Anderson |
| `SKIP_STEADY_STATE` | false | omite el tránsito en régimen permanente |

## Referencias

1. Rossman, L. A. (2017). *Storm Water Management Model Reference Manual Volume II – Hydraulics*. U.S. EPA.
2. Código fuente del motor OpenSWMM:
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
