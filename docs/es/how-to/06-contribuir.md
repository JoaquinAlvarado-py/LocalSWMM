# Cómo Contribuir (Flujo de Desarrollo)

Edita el frontend, recompila y cambia el motor WASM, y prueba tus cambios antes de committear.

## 1. Bucle de edición normal (frontend)

```bash
cd ~/LocalSWMM
python3 server.py &            # serves on 8080, no cache
# edit public/*.js, reload http://127.0.0.1:8080
```

## 2. Cambiar el motor WASM

```bash
# 1. edit the engine (submodule) or your fork, commit it there
cd third_party/openswmm-engine
# ... make changes, commit, push to your fork ...
# 2. point LocalSWMM at the new commit
cd ..
git submodule update --init --recursive   # or update the gitlink
# 3. recompilar el motor WASM (ver Cómo Compilar el Motor WASM desde el Código Fuente)
emcmake cmake -S cmake/wasm -B build/wasm -G Ninja && cmake --build build/wasm
# 4. commitear los archivos recompilados public/swmm6wasm.{js,wasm} + sellos de versión
```

Recuerda: cualquier re-fijación debe mantener los cambios de compatibilidad de wasm (o llevarlos adelante) o el build se rompe — consulta [Cómo Compilar el Motor WASM desde el Código Fuente](03-compilar-desde-fuente.md), sección 5.

## 3. Probar tus cambios

- Chequeos unitarios: `npm run test:3d`, `node scripts/probe-1d.mjs`, `node scripts/bench-1d.mjs`.
- Compuerta de extremo a extremo de la app: `node scripts/verify-bellinge.mjs` (Chrome headless vía CDP).
- Verificaciones de regresión: `node scripts/verify-1d-split.mjs`.

Consulta [Cómo Ejecutar los Scripts, Benchmarks y Harnesses de Verificación](04-scripts-y-benchmarks.md) para el uso completo de cada script.

## 4. Convenciones a respetar

- **El orden de carga de los scripts es el contrato del módulo** — agrega scripts nuevos a `index.html` en orden de dependencia; `ui.js` queda al final.
- **Expón los módulos vía `window.*`**; nunca uses `import/export` (no hay bundler).
- **El estado se mantiene en `Net`**, el estado de la vista en `App`; el estilo pasa por **feature-state** de Mapbox, no por reenvíos de datos.
- Toda mutación debe pasar por la API de `Net` para quedar registrada en el historial de undo y disparar el autosave.
- Las cadenas de UI nuevas están hardcodeadas en inglés; las unidades usan el helper `U(si, us)`.
- Mantén `public/config.js` fuera de los commits (ignorado por git); nunca commitees claves de API reales.
