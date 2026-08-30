# Cómo Compilar el Motor WASM desde el Código Fuente

Compila el motor OpenSWMM para WebAssembly con Emscripten y vcpkg, y regenera los binarios del motor en `public/`.

## 1. Ubicaciones del toolchain

| Herramienta | Ubicación | Versión (referencia) |
|---|---|---|
| SDK de Emscripten | `.tools/emsdk/` (ignorado por git) | `emcc` 6.0.6 |
| vcpkg | `.tools/vcpkg/` (ignorado por git) | 2026-07-27 |
| CMake | sistema (`pacman -S cmake`) | ≥ 4.4.0 requerido por la línea base de vcpkg |
| Ninja | sistema | generador de build (`-G Ninja`) |
| Node | sistema | para scripts + `npm install` |

### Instalar desde cero (Arch/EndeavourOS)

```bash
sudo pacman -S --needed base-devel nodejs npm cmake ninja curl zip unzip tar git
git clone --branch experimental <repo> && cd LocalSWMM
git submodule update --init --recursive          # fetch third_party/openswmm-engine
mkdir -p .tools
git clone --depth 1 https://github.com/emscripten-core/emsdk.git .tools/emsdk
cd .tools/emsdk && ./emsdk install latest && ./emsdk activate latest && cd ../..
git clone --depth 1 https://github.com/microsoft/vcpkg.git .tools/vcpkg
cd .tools/vcpkg && ./bootstrap-vcpkg.sh -disableMetrics && cd ../..
npm install
```

## 2. El script de build — `scripts/build-openswmm2d.sh`

El script ejecuta todo el build. Lo que hace, paso a paso:

1. Localiza `.tools/emsdk`, `.tools/vcpkg`, el código fuente `cmake/wasm`, el directorio de build `build/openswmm2d-wasm-emscripten`; carga `emsdk_env.sh` si `emcmake` no está en PATH.
2. Guardas: submodule del motor presente; toolchain de vcpkg presente.
3. Exporta `VCPKG_DEFAULT_TRIPLET=wasm32-emscripten`, `VCPKG_OVERLAY_TRIPLETS=$ROOT/vcpkg-triplets`, `EMCC_SKIP_SANITY_CHECK=1`.
4. `emcmake cmake -S cmake/wasm -B build/openswmm2d-wasm-emscripten -G Ninja` con las banderas:

| Bandera | Valor |
|---|---|
| `CMAKE_BUILD_TYPE` | `Release` |
| `CMAKE_TOOLCHAIN_FILE` | `.tools/vcpkg/scripts/buildsystems/vcpkg.cmake` |
| `VCPKG_CHAINLOAD_TOOLCHAIN_FILE` | `$EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake` |
| `VCPKG_TARGET_TRIPLET` / `VCPKG_DEFAULT_TRIPLET` | `wasm32-emscripten` |
| `VCPKG_MANIFEST_DIR` | raíz del repo |
| `VCPKG_MANIFEST_NO_DEFAULT_FEATURES` | `ON` |
| `OPENSWMM_BUILD_2D` | `ON` |
| `OPENSWMM_FORCE_SCALAR` | `ON` (sin SIMD en wasm32) |
| `OPENSWMM_ENABLE_LTO` | `OFF` (`.sh`; el `.ps1` usa `ON` + `-msimd128`) |
| `OPENSWMM_WITH_GEOPACKAGE` | `OFF` |
| `OPENSWMM_BUILD_GPU_PLUGIN` | `OFF` |
| `OPENSWMM_BUILD_TESTS` | `OFF` |
| `CMAKE_CROSSCOMPILING_EMULATOR` | `.tools/emsdk/node/*/bin/node` (para que `FindOpenMP` pueda ejecutar su prueba) |
| `CMAKE_C_FLAGS` / `CMAKE_CXX_FLAGS` | `-fopenmp` (define `SWMM_USE_OPENMP` → los bucles `#pragma omp` del solver se activan) |
| `OPENSWMM_INSTALL` | `OFF` |

El wrapper `cmake/wasm/CMakeLists.txt` agrega `-pthread` + `-s PTHREAD_POOL_SIZE=4` (+ `PTHREAD_POOL_SIZE_STRICT=0`): los bucles OpenMP se asignan a pthreads de Emscripten respaldados por `SharedArrayBuffer`. Eso hace que el build sea **solo de navegador** — la página debe tener aislamiento de origen cruzado (COOP/COEP; consulta `public/_headers` / `server.py`). Los modelos optan con `THREADS n` en `[OPTIONS]` (predeterminado 1, resultados bit idénticos); el solver 2D degrada automáticamente a 1 thread por debajo de `4·THREADS` triángulos. Por lo tanto, una corrida de referencia en Node simple (`run-engine-marcher.mjs`) necesita un build sin threads.

5. `cmake --build … --target openswmm2d_wasm --parallel` (el `libopenswmm.engine.a` estático se enlaza en el par modular JS/WASM).
6. **Copia** `public/openswmm2d.wasm → public/swmm6wasm.wasm`, `openswmm2d.js → swmm6wasm.js` y `openswmm2d.worker.js → swmm6wasm.worker.js` (alias heredados; el archivo de worker solo se emite si el toolchain produce uno).
7. **Sella** `public/openswmm2d.version.json` + `public/swmm6wasm.version.json` con `engineCommit`, `engineDescribe` (`git describe --always --dirty --tags`), `builtAtUtc`.

Ejecútalo con `npm run build:2d-wasm:sh` (Linux) o `npm run build:2d-wasm` (Windows PowerShell `.ps1`).

## 3. El manifiesto y el triplet de vcpkg

Dependencias de la raíz `vcpkg.json`: **`eigen3`, `hdf5`, `nlohmann-json`, `sundials`**. (HDF5 lo necesita el `Default2DOutputPlugin` del módulo 2D; SUNDIALS está declarado pero el marcher explícito actual ya no lo usa.)

`vcpkg-triplets/wasm32-emscripten.cmake` (por qué importa cada línea):

| Línea | Significado |
|---|---|
| `VCPKG_TARGET_ARCHITECTURE wasm32` | ABI wasm de 32 bits |
| `VCPKG_CRT_LINKAGE static` / `VCPKG_LIBRARY_LINKAGE static` | solo estático — Emscripten enlaza todo en un solo `.wasm` |
| `VCPKG_CMAKE_SYSTEM_NAME Emscripten` | modo de compilación cruzada de vcpkg para Emscripten |
| `VCPKG_ENV_PASSTHROUGH_UNTRACKED "EMSDK;EMSDK_NODE;EMSDK_PYTHON;PATH"` | los ports heredan el entorno del SDK |
| `VCPKG_CHAINLOAD_TOOLCHAIN_FILE "$ENV{EMSDK}/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake"` | el módulo de plataforma real de Emscripten |
| `VCPKG_BUILD_TYPE release` | solo variantes de release |

> **Sutileza del manifiesto:** el submodule del motor trae su *propio* `vcpkg.json` (gtest, sqlite3, kokkos…). Como el wrapper de WASM consume el motor vía `add_subdirectory`, vcpkg solo honra el manifiesto de **nivel superior** (`VCPKG_MANIFEST_DIR=$ROOT`), por lo que el manifiesto raíz rige el build de WASM. `VCPKG_MANIFEST_NO_DEFAULT_FEATURES=ON` mantiene fuera las características predeterminadas `2d`/`gpu` del motor (que arrastrarían HDF5/Kokkos *de nuevo*).

## 4. El wrapper de CMake — `cmake/wasm/CMakeLists.txt`

El wrapper existe porque el upstream eliminó el hook `OPENSWMM_WASM_INJECT_FILE`, por lo que el target de wasm ya no se puede declarar dentro del árbol del motor. El wrapper:

- `add_subdirectory(../../third_party/openswmm-engine …)` (el mismo embedding que usan los bindings de Python del upstream).
- `add_executable(openswmm2d_wasm wasm/openswmm2d_exports.cpp)` + `target_link_libraries(openswmm2d_wasm PRIVATE openswmm_engine)`.
- Salida `openswmm2d` en `public/`.

**Banderas de enlace de emcc** (`cmake/wasm/CMakeLists.txt:34-48`) y su significado:

| Bandera | Significado |
|---|---|
| `-s WASM=1` | salida WebAssembly |
| `-s MODULARIZE=1`, `-s EXPORT_NAME=createOpenSwmm2D` | envuelve la salida en la función de fábrica |
| `-s EXPORT_ES6=0`, `-s ENVIRONMENT=web,worker` | wrapper clásico, usable en el hilo principal + workers |
| `-s ALLOW_MEMORY_GROWTH=1` | el heap puede crecer más allá de `INITIAL_MEMORY` |
| `-s FILESYSTEM=1` | FS virtual MEMFS (para `.inp`/`.rpt`/`.out`) |
| `-s DISABLE_EXCEPTION_CATCHING=0` | conserva las excepciones C++ |
| `--no-entry` | módulo de librería, sin `main` |
| `-s EXPORTED_RUNTIME_METHODS=['cwrap','FS','getValue']` | helpers de runtime |
| `-s EXPORTED_FUNCTIONS=[…31 símbolos…]` | superficie exacta de la API C |
| `-s INITIAL_MEMORY=134217728` (128 MiB), `-s STACK_SIZE=5242880` (5 MiB) | dimensionamiento de memoria |
| `-s WASM_ASYNC_COMPILATION=1` | compilación asíncrona (todos los llamadores usan `instantiateWasm`) |

`cmake/OpenSwmm2DWasm.cmake` es un **hermano heredado** del mismo target (no referenciado por los scripts de build).

## 5. El submodule del motor y el fix de compatibilidad de wasm

`third_party/openswmm-engine` es un **submodule de git** (`https://github.com/JoaquinAlvarado-py/openswmm.engine.git`). La rama `experimental` fija un commit que **no es compilable para Emscripten tal cual**: `src/engine/plugins/PluginFactory.cpp` usa `dlopen`/`dlsym` y su cadena de `#if` de plataforma no maneja `__EMSCRIPTEN__` (`#error "PluginFactory: unsupported platform"`).

El fix (commit `85e4be38`, *"fix(wasm): emscripten compatibility and build shims for web execution"*, cherry-picked de la rama `swmm6_rel` del motor sobre el fijado `2932a5b` y commiteado localmente) hace que el build de wasm funcione al:

1. Compilar `openswmm_engine` y las librerías heredadas como **STATIC** bajo `EMSCRIPTEN` (`src/engine/CMakeLists.txt`, `src/legacy/*/CMakeLists.txt`).
2. Eliminar las macros de exportación `__attribute__((visibility(...)))` (`include/openswmm/engine/openswmm_engine_export.h`, `openswmm_legacy_solver_export.h`).
3. Agregar no-ops de Emscripten a `PluginFactory.cpp`: carga dinámica deshabilitada, `discover()` retorna temprano, `.wasm` tratado como extensión de librería compartida.
4. Re-agregar el hook de include `OPENSWMM_WASM_INJECT_FILE` en el `CMakeLists.txt` de nivel superior.

El repo LocalSWMM lleva el commit `83dc0df` *"submodule: pin openswmm-engine with wasm compatibility fix"* que mueve el gitlink a `85e4be38`. El motor por lo demás se describe como `v6.0.0-alpha.1-347-g85e4be38`.

> ⚠️ **Si re-fijas el submodule o ejecutas `git submodule update`, mantén el commit de compatibilidad de wasm** o el build de WASM volverá a fallar en `PluginFactory.cpp`. Los binarios precompilados en `public/` se compilaron desde `85e4be38` y no se ven afectados por el puntero del submodule.

## 6. Recompila el motor WASM

```bash
cd ~/LocalSWMM
npm run build:2d-wasm:sh        # = bash scripts/build-openswmm2d.sh
# outputs: public/openswmm2d.{js,wasm}, public/swmm6wasm.{js,wasm}, *.version.json
```

El primer build compila los cuatro ports de vcpkg para `wasm32-emscripten` (Eigen/HDF5/nlohmann-json/SUNDIALS) — permite de 10 a 40 minutos. Los builds siguientes usan la caché binaria de vcpkg. Los binarios recompilados son **archivos trackeados** — commiteálos junto con el sello del motor cuando cambien.
