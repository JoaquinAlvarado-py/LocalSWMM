# LocalSWMM

Local SWMM es una aplicación web para modelado y simulación hidráulica 1D+2D (OpenSWMM). Hoy el motor corre 100% en el navegador (WASM); el plan de escalamiento añade una vía servidor-side: un servicio nativo con pool de workers que ejecuta corridas, una API para consumirlas y un estado agregado para monitorear todo.

## Language

**Corrida**:
Una ejecución completa de un modelo de simulación (1D+2D) con ciclo de vida: encolada → corriendo → terminada (o fallida). Se identifica por un ID y es lo que el usuario dispara con Run.
_Avoid_: job, run, simulación (la simulación es el fenómeno modelado; la corrida es la ejecución)

**Pool de workers del motor**:
Conjunto de procesos nativos en el servidor que ejecutan corridas, uno por núcleo, tomando trabajo de una cola.
_Avoid_: hilo, thread (salvo OpenMP dentro de un worker)

**EngineClient**:
Seam del frontend entre la UI y el motor, con dos implementaciones conmutables: local (WASM en el navegador) y remota (vía API).
_Avoid_: módulo del motor, wrapper del motor

**Modo local / Modo API**:
Las dos vías de ejecución del EngineClient: motor WASM en el navegador (sin conexión) vs motor en el servidor vía API (default).

**Estado del sistema**:
Endpoint agregado de salud: versión de la app, estado del pool de workers, corridas activas. Consultable para scripts, CI y depuración.
_Avoid_: health endpoint, status de corrida (eso es el progreso de una corrida concreta)

**Progreso de corrida**:
Estado en vivo de una corrida: sim-time alcanzado, fracción del total, fase. Consultable por ID; es lo que pinta la UI de Run Status.

**Resultados de corrida**:
Producto terminado de una corrida: tablas JSON (series 1D por nodo/link/subcatchment y frames 2D capturados en vivo) más los archivos binarios `.out` y `.rpt` para export.
