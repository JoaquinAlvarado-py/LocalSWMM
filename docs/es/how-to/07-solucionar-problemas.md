# Cómo Solucionar Problemas de Local SWMM

Arregla problemas comunes con el mapa, las corridas, el build de WASM y la ruta WebGPU, y conoce las trampas conocidas de este codebase.

## Cómo arreglar un mapa en blanco / sin teselas

- `public/config.js` falta o el token está vacío → créalo con un `MAPBOX_ACCESS_TOKEN` válido (consulta [Cómo Configurar Local SWMM](02-configurar.md)).
- ¿El navegador bloqueado por CSP? Revisa la consola en busca de violaciones de CSP contra `api.mapbox.com`.

## Cómo arreglar errores de "Run" inmediatos con una advertencia

- Causa: sin nodos, sin outfall, o **unidades US con una malla 2D** (2D es solo SI) — `app.js:1402-1406`.
- Fix: agrega al menos un nodo y un `OUTFALL`; cambia las unidades a SI si hay una malla 2D presente.

## Cómo arreglar una corrida que falla en silencio / con errores del motor

1. Revisa la ventana **Run Status** y luego la pestaña **Report**. Para diagnóstico profundo, el worker vuelca las líneas de error del `.rpt` y los primeros 3000 caracteres del INP al fallar (`openSwmm2dWorker.js:109-148`).
2. Reproduce en Node: `node scripts/run-engine-marcher.mjs model.inp out.json` imprime los códigos del motor (`SWMM_ERR_LIFECYCLE = 6` es el código de "completado natural").

## Cómo arreglar un build de WASM que falla en `PluginFactory.cpp:46: unsupported platform`

- Causa: el submodule se re-fijó sin el commit de compatibilidad de wasm.
- Fix: restaura `85e4be38` (consulta [Cómo Compilar el Motor WASM desde el Código Fuente](03-compilar-desde-fuente.md), sección 5) o vuelve a aplicar los no-ops de Emscripten.

## Cómo arreglar `Could not find zip` durante el bootstrap de vcpkg

- Causa: falta `zip`/`unzip`/`tar` del sistema.
- Fix: en Arch: `sudo pacman -S zip unzip tar`.

## Cómo manejar una corrida 2D que cae de vuelta a WASM

- Causa: `navigator.gpu` ausente o `maxStorageBuffersPerShaderStage < 16` (p. ej., Apple Silicon/Metal).
- Fix: no se necesita ninguno — esto es esperado; la ruta WASM es la referencia.

## Cómo arreglar fallas de generación de malla en dominios enormes

- El heap de Triangle WASM está fijado en 16 MB; los límites de presupuesto (`trianglePointBudget=8000`, `autoAreaCap`) se activan automáticamente. Reduce el área del dominio o el minAngle.

## Cómo arreglar wasm obsoleto servido en caché

- El servidor envía `Cache-Control: no-store`, pero si estás alojando en otro lado, haz un refresh forzado después de recompilar (se usan parámetros de query `swmm6wasm.js?v=<n>` en `index.html:790-810`).

## Cómo arreglar fixtures faltantes para los scripts de WebGPU

- Regenera: `node scripts/make-marcher-inp.mjs …` / `node scripts/make-marcher-cpl-inp.mjs …` o ejecuta `verify-bellinge.mjs` una vez para poblar `scripts/verify-out/`.

## Trampas y rarezas conocidas

1. **Deriva del README:** el Inicio Rápido del README dice `cd SWMM_3D_Web_UI` y `http://localhost:8000`; el directorio real es `LocalSWMM` y el puerto es `8080`.
2. **Dos binarios de motor idénticos** (`openswmm2d.*` y `swmm6wasm.*`) son copias byte por byte — mantenlos sincronizados (el script de build lo hace).
3. **Los mensajes de progreso de `simWorker` son protocolo muerto:** el worker nunca los publica y `app.js:1275` los ignora; la barra de progreso 1D es cosmética basada en tiempo.
4. **El parseo de `.out` es solo 1D:** la ruta 2D lleva arreglos JS por frame en su lugar y pone explícitamente `App.outData` en null (`app.js:1443`).
5. **`bench-1d.mjs` lleva un comentario de cabecera "probe-1d.mjs" obsoleto.**
6. **Hard-coding solo de Windows** en `bench-gpu-coupl.mjs` y `run-webgpu-harness.mjs` (ruta de Chrome hardcodeada).
7. **Los parámetros de la capa LID se parsean pero no se almacenan** (`inpParser.js:411-424`) — los round-trips de LID dependen de `rawSections`.
8. **El `config.js` de CI usa `const CONFIG`** mientras que las configuraciones locales usan `var`; las búsquedas de `window.CONFIG` (`app.js:446`) son defensivas en cualquier caso.
9. **Las "lecciones" de `harness.html`** documentan una fijación histórica de VARIABLE_STEP que luego se demostró incorrecta — lee las entradas del 2026-08-06 en `WEBGPU_PLAN.md` antes de "arreglar" nada en `couplingSplit.js`.
10. **La reconstrucción de altura en vivo acoplada por vértices** (`stCnt>0`) existe en el kernel WGSL, pero el split limpia los punteros de stencil — la ruta en vivo usa la altura de la celda de lecho más baja.
11. **La precipitación NATURAL_NEIGHBOUR** no la modela el marcher (solo media uniforme del gage).
12. **Capas del manifiesto de vcpkg:** el `vcpkg.json` propio del motor se ignora para el build de wasm; solo se aplica el manifiesto raíz.
