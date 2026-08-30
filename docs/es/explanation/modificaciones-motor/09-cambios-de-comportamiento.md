<!-- Parte de la serie de explicación de modificaciones del motor -->

# Cambios de comportamiento por defecto y de plataforma

## Cambios de comportamiento

Además de las extensiones funcionales, el motor introduce cambios de
comportamiento que conviene conocer:

- **Paso de tiempo variable por defecto**: `VARIABLE_STEP`
  por defecto es **0.75** (paso adaptativo por Courant), mientras
  que el manual del SWMM 5.x documenta 0 (paso fijo). Para reproducir el
  comportamiento del SWMM oficial debe fijarse `VARIABLE_STEP 0`.
- **Manejo de unidades de las tolerancias**: la `HEAD_TOLERANCE`
  y el `MIN_SURFAREA` se convierten desde las unidades del
  proyecto al sistema interno (pies) al inicializar, corrigiendo errores
  de factor 3.3–10.8 en modelos SI del motor anterior.
- **Pérdidas de conducto por iteración**: bajo onda dinámica, la
  evaporación y filtración de conductos se recalculan en *cada*
  iteración de Picard (con la compuerta de clase de escurrimiento),
  igual que el motor legado, en lugar de una vez por paso.
- **Recuento de convergencia**: un paso que converge en su último
  intento permitido se cuenta como convergido (solo falla si no converge
  tras `MAX_TRIALS`).
- **Salto de estado estacionario**: `SKIP_STEADY_STATE`
  omite el tránsito cuando no hubo acciones de control, el error de
  continuidad está bajo la tolerancia y los aportes no cambiaron.

## Extensiones de plataforma y formato

- **CRS**: la opción `CRS` en `[OPTIONS]` acepta un
  EPSG o una cadena PROJ, transportando el sistema de referencia espacial
  del modelo (el SWMM oficial no la posee).
- **Claves de extensión**: `ext_options` almacena
  cualquier clave desconocida de `[OPTIONS]` para plugins.
- **IGNORE_2D**: permite desactivar el solver 2D conservando la
  malla en el archivo (para ejecutar el modelo solo 1D).
- **Geopackage**: entrada/salida nativa en GeoPackage
  (incluida la tabla `rdii_decay` de los parámetros de
  recuperación), además del formato `.inp`.
- **API C**: una API en C (con envoltorios) expone todas las
  extensiones (por ejemplo `swmm_rdii_decay_add`).
- **WebAssembly**: el motor se compila a WASM para ejecutarse en el
  navegador (como usa LocalSWMM), con el solver 2D en GPU/WebGPU.
- **Pruebas de soluciones manufacturadas**: el repositorio incluye
  una batería de benchmarks con soluciones analíticas (rotura de presa
  de Ritter, lago en reposo, ondas de Macdonald, curvas de referencia de
  impulsiones, entre otras) que anclan la fidelidad de los solvers.

## Referencias

1. Rossman, L. A. (2017). *Storm Water Management Model Reference
   Manual Volume II — Hydraulics*. U.S. EPA.
2. Sharior, S., Hodges, B. R., & Vasconcelos, J. G. (2023).
   Generalized, dynamic, and transient-storage form of the Preissmann
   slot. *Journal of Hydraulic Engineering*, 149(11).
3. de Almeida, G. A. M., & Bates, P. D. (2013). Applicability of the
   local inertial approximation of the shallow water equations to flood
   modeling. *Water Resources Research*, 49(8).
4. Código fuente del motor OpenSWMM (HydroCouple):
   - `src/engine/hydraulics/DynamicWave.cpp`,
     `src/engine/hydraulics/HydStructures.cpp`,
     `src/engine/hydraulics/fv/ExplicitFvSolver.cpp`
   - `src/engine/2d/` (marchante y acople),
     `src/engine/hydrology/RDII.cpp`,
     `src/engine/core/SimulationOptions.hpp`
5. Manuales de referencia del motor OpenSWMM (Vol. II — Hydraulics,
   cap. 3, 7, 9; Vol. I — Hydrology, cap. 7).
