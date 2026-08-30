# Glosario

Lista alfabética de los términos del proyecto y sus significados. Fusiona el glosario del manual de ingeniería con el glosario de dominio de `CONTEXT.md`; cuando el glosario de dominio define un término en español, ese término se usa como primario, con el inglés entre paréntesis.

## 1D / 2D

Modelo de tuberías/red vs. modelo de malla de tránsito superficial por el terreno.

## CD / coupling

Coeficiente de flujo / coeficiente de intercambio 1D↔2D (por defecto 0.65).

## CDT

Triangulación de Delaunay restringida (Constrained Delaunay Triangulation).

## CFL

Condición de estabilidad de Courant–Friedrichs–Lewy.

## cplF / cplS

Búferes de acople de flujo/estado entre el motor 1D WASM y el marchante 2D GPU.

## EngineClient

Seam del frontend entre la UI y el motor, con dos implementaciones conmutables: local (WASM en el navegador) y remota (vía API).
_Evitar_: módulo del motor, wrapper del motor.

## Pool de workers del motor (Engine worker pool)

Conjunto de procesos nativos en el servidor que ejecutan corridas, uno por núcleo, tomando trabajo de una cola.
_Evitar_: hilo, thread (salvo OpenMP dentro de un worker).

## feature-state

Estado mutable de estilo por feature de Mapbox GL JS.

## Malla indexada (Indexed mesh)

`Net.mesh2DIndexed`: la salida canónica de malla del motor Triangle.

## INP

Archivo de texto de entrada de SWMM (`.inp`); la serialización del modelo que consume el motor.

## Modo local / Modo API (Local mode / API mode)

Las dos vías de ejecución del EngineClient: motor WASM en el navegador (sin conexión) vs motor en el servidor vía API (default).

## LTS

Local Time Stepping — el esquema de subpasos en niveles del solver 2D.

## M0–M5

Fases de hitos de WebGPU en `WEBGPU_PLAN.md`.

## MEMFS

Sistema de archivos virtual en memoria de Emscripten (`.inp`/`.rpt`/`.out` viven ahí).

## OpenSWMM

La reimplementación en C++20 usada aquí (HydroCouple); licencia MIT.

## PSLG

Grafo planar de líneas rectas (Planar Straight-Line Graph) — la entrada de triangulación restringida para Triangle.

## PSLC

Grafo planar de **celdas** de líneas rectas (Planar Straight-Line **Cell** graph) — el término del módulo mesh2dPslg.

## RPT / OUT

Reporte de texto del motor / archivos binarios de resultados.

## Corrida (Run)

Una ejecución completa de un modelo de simulación (1D+2D) con ciclo de vida: encolada → corriendo → terminada (o fallida). Se identifica por un ID y es lo que el usuario dispara con Run.
_Evitar_: job, run, simulación (la simulación es el fenómeno modelado; la corrida es la ejecución).

## Progreso de corrida (Run progress)

Estado en vivo de una corrida: sim-time alcanzado, fracción del total, fase. Consultable por ID; es lo que pinta la UI de Run Status.

## Resultados de corrida (Run results)

Producto terminado de una corrida: tablas JSON (series 1D por nodo/enlace/subcuenca y frames 2D capturados en vivo) más los archivos binarios `.out` y `.rpt` para export.

## SWMM

EPA Storm Water Management Model; la referencia de hidrología/hidráulica.

## Estado del sistema (System status)

Endpoint agregado de salud: versión de la app, estado del pool de workers, corridas activas. Consultable para scripts, CI y depuración.
_Evitar_: health endpoint, status de corrida (eso es el progreso de una corrida concreta).

## Triangle

El triangulador de Delaunay de Shewchuk; aquí compilado a WASM (`triangle-wasm`).

## WASM / Emscripten

WebAssembly + el toolchain de LLVM que compila C++ a WASM.
