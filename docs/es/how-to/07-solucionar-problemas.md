# Cómo Solucionar Problemas de Local SWMM

Arregla problemas comunes con el mapa, las simulaciones, el build de WASM, y conoce las particularidades de este codebase.

## Cómo arreglar un mapa en blanco / sin teselas

- `public/config.js` falta o el token está vacío → créalo con un `MAPBOX_ACCESS_TOKEN` válido (consulta [Cómo Configurar Local SWMM](02-configurar.md)).
- ¿El navegador bloqueado por CSP? Revisa la consola en busca de violaciones de CSP contra `api.mapbox.com`.

## Cómo arreglar errores de "Run" inmediatos con una advertencia

- Causa: no hay nodos o no hay un outfall en el modelo.
- Solución: agrega al menos un nodo y un `OUTFALL` conectado a la red.

## Cómo arreglar una corrida que falla en silencio / con errores del motor

1. Revisa la ventana **Run Status** y luego la pestaña **Report**. Para diagnóstico profundo, el worker vuelca las líneas de error del `.rpt` y los primeros 3000 caracteres del INP al fallar (`simWorker.js`).
2. Reproduce en Node: `node scripts/bench-1d.mjs model.inp` imprime los códigos del motor (`SWMM_ERR_LIFECYCLE = 6` es el código de completado normal).

## Cómo arreglar un build de WASM que falla en `PluginFactory.cpp:46: unsupported platform`

- Causa: el submodule se re-fijó sin el commit de compatibilidad de wasm.
- Solución: restaura `85e4be38` (consulta [Cómo Compilar el Motor WASM desde el Código Fuente](03-compilar-desde-fuente.md), sección 5) o vuelve a aplicar los no-ops de Emscripten.

## Cómo arreglar `Could not find zip` durante el bootstrap de vcpkg

- Causa: falta `zip`/`unzip`/`tar` del sistema.
- Solución: en Arch Linux: `sudo pacman -S zip unzip tar`; en Debian/Ubuntu: `sudo apt install zip unzip tar`.

## Cómo arreglar wasm obsoleto servido en caché

- El servidor envía `Cache-Control: no-store`, pero si estás alojando en otro lado, haz un refresh forzado después de recompilar (se usan parámetros de query `swmm6wasm.js?v=<n>` en `index.html`).

## Trampas y particularidades conocidas

1. **Deriva histórica del README:** El inicio rápido del README referenció anteriormente `cd SWMM_3D_Web_UI` y `http://localhost:8000`; el directorio es `LocalSWMM` y el puerto del servidor es `8080`.
2. **Nombres de binarios del motor:** El motor WebAssembly activo se entrega mediante `swmm6wasm.js` y `swmm6wasm.wasm`, cargados por `simWorker.js`.
3. **Mensajes de progreso de `simWorker`:** El worker calcula asíncronamente en bucles de stride; la barra de progreso entrega retroalimentación visual durante el cómputo.
4. **Parseo de salida binaria:** `swmmOutParser.js` parsea los binarios `.out` para máximo rendimiento, con fallback al reporte de texto `.rpt` para tablas resumen.
5. **Comentario en `bench-1d.mjs`:** `bench-1d.mjs` conserva un comentario de cabecera que hace referencia a `probe-1d.mjs`.
6. **Parámetros de capas LID:** Los parámetros de capa LID se preservan en `rawSections` (`inpParser.js`) para garantizar la persistencia fiel en exportaciones INP.
7. **Declaraciones de configuración:** El `config.js` de CI usa `const CONFIG` mientras que las configuraciones locales usan `var`; las búsquedas de `window.CONFIG` son defensivas en ambos casos.
8. **Capas del manifiesto de vcpkg:** El `vcpkg.json` propio del motor se ignora para el build de WASM; solo se aplica el manifiesto raíz.
