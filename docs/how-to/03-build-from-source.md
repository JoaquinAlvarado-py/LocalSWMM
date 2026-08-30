# How to Build the WASM Engine from Source

Build the OpenSWMM engine for WebAssembly with Emscripten and vcpkg, and regenerate the engine binaries in `public/`.

## 1. Toolchain locations

| Tool | Location | Version (reference) |
|---|---|---|
| Emscripten SDK | `.tools/emsdk/` (git-ignored) | `emcc` 6.0.6 |
| vcpkg | `.tools/vcpkg/` (git-ignored) | 2026-07-27 |
| CMake | system (`pacman -S cmake`) | ≥ 4.4.0 required by vcpkg baseline |
| Ninja | system | build generator (`-G Ninja`) |
| Node | system | for scripts + `npm install` |

### Install from scratch (Arch/EndeavourOS)

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

## 2. The build script — `scripts/build-openswmm2d.sh`

The script runs the whole build. What it does, step by step:

1. Locates `.tools/emsdk`, `.tools/vcpkg`, source `cmake/wasm`, build dir `build/openswmm2d-wasm-emscripten`; sources `emsdk_env.sh` if `emcmake` isn't on PATH.
2. Guards: engine submodule present; vcpkg toolchain present.
3. Exports `VCPKG_DEFAULT_TRIPLET=wasm32-emscripten`, `VCPKG_OVERLAY_TRIPLETS=$ROOT/vcpkg-triplets`, `EMCC_SKIP_SANITY_CHECK=1`.
4. `emcmake cmake -S cmake/wasm -B build/openswmm2d-wasm-emscripten -G Ninja` with flags:

| Flag | Value |
|---|---|
| `CMAKE_BUILD_TYPE` | `Release` |
| `CMAKE_TOOLCHAIN_FILE` | `.tools/vcpkg/scripts/buildsystems/vcpkg.cmake` |
| `VCPKG_CHAINLOAD_TOOLCHAIN_FILE` | `$EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake` |
| `VCPKG_TARGET_TRIPLET` / `VCPKG_DEFAULT_TRIPLET` | `wasm32-emscripten` |
| `VCPKG_MANIFEST_DIR` | repo root |
| `VCPKG_MANIFEST_NO_DEFAULT_FEATURES` | `ON` |
| `OPENSWMM_BUILD_2D` | `ON` |
| `OPENSWMM_FORCE_SCALAR` | `ON` (no SIMD on wasm32) |
| `OPENSWMM_ENABLE_LTO` | `OFF` (`.sh`; the `.ps1` uses `ON` + `-msimd128`) |
| `OPENSWMM_WITH_GEOPACKAGE` | `OFF` |
| `OPENSWMM_BUILD_GPU_PLUGIN` | `OFF` |
| `OPENSWMM_BUILD_TESTS` | `OFF` |
| `CMAKE_CROSSCOMPILING_EMULATOR` | `.tools/emsdk/node/*/bin/node` (so `FindOpenMP` can run its probe) |
| `CMAKE_C_FLAGS` / `CMAKE_CXX_FLAGS` | `-fopenmp` (defines `SWMM_USE_OPENMP` → the solver's `#pragma omp` loops go live) |
| `OPENSWMM_INSTALL` | `OFF` |

The wrapper `cmake/wasm/CMakeLists.txt` adds `-pthread` + `-s PTHREAD_POOL_SIZE=4` (+ `PTHREAD_POOL_SIZE_STRICT=0`): the OpenMP loops map to Emscripten pthreads backed by `SharedArrayBuffer`. That makes the build **browser-only** — the page must be cross-origin isolated (COOP/COEP; see `public/_headers` / `server.py`). Models opt in with `THREADS n` in `[OPTIONS]` (default 1, bit-identical results); the 2D solver auto-degrades to 1 thread below `4·THREADS` triangles. A plain-Node reference run (`run-engine-marcher.mjs`) therefore needs a non-threaded build.

5. `cmake --build … --target openswmm2d_wasm --parallel` (the static `libopenswmm.engine.a` links into the modular JS/WASM pair).
6. **Copies** `public/openswmm2d.wasm → public/swmm6wasm.wasm`, `openswmm2d.js → swmm6wasm.js`, and `openswmm2d.worker.js → swmm6wasm.worker.js` (legacy aliases; the worker file is only emitted if the toolchain produces one).
7. **Stamps** `public/openswmm2d.version.json` + `public/swmm6wasm.version.json` with `engineCommit`, `engineDescribe` (`git describe --always --dirty --tags`), `builtAtUtc`.

Run it with `npm run build:2d-wasm:sh` (Linux) or `npm run build:2d-wasm` (Windows PowerShell `.ps1`).

## 3. The vcpkg manifest & triplet

Root `vcpkg.json` deps: **`eigen3`, `hdf5`, `nlohmann-json`, `sundials`**. (HDF5 is needed by the 2D module's `Default2DOutputPlugin`; SUNDIALS is declared but the current explicit marcher no longer uses it.)

`vcpkg-triplets/wasm32-emscripten.cmake` (why each line matters):

| Line | Meaning |
|---|---|
| `VCPKG_TARGET_ARCHITECTURE wasm32` | 32-bit wasm ABI |
| `VCPKG_CRT_LINKAGE static` / `VCPKG_LIBRARY_LINKAGE static` | static only — Emscripten links everything into one `.wasm` |
| `VCPKG_CMAKE_SYSTEM_NAME Emscripten` | vcpkg Emscripten cross-build mode |
| `VCPKG_ENV_PASSTHROUGH_UNTRACKED "EMSDK;EMSDK_NODE;EMSDK_PYTHON;PATH"` | ports inherit the SDK env |
| `VCPKG_CHAINLOAD_TOOLCHAIN_FILE "$ENV{EMSDK}/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake"` | the actual Emscripten platform module |
| `VCPKG_BUILD_TYPE release` | release variants only |

> **Manifest subtlety:** the engine submodule ships its *own* `vcpkg.json` (gtest, sqlite3, kokkos…). Because the WASM wrapper consumes the engine via `add_subdirectory`, vcpkg honors only the **top-level** manifest (`VCPKG_MANIFEST_DIR=$ROOT`), so the root manifest governs the WASM build. `VCPKG_MANIFEST_NO_DEFAULT_FEATURES=ON` keeps the engine's `2d`/`gpu` default features (which would drag in HDF5/Kokkos *again*) out.

## 4. The CMake wrapper — `cmake/wasm/CMakeLists.txt`

The wrapper exists because upstream removed the `OPENSWMM_WASM_INJECT_FILE` hook, so the wasm target can no longer be declared inside the engine tree. The wrapper:

- `add_subdirectory(../../third_party/openswmm-engine …)` (same embedding the upstream Python bindings use).
- `add_executable(openswmm2d_wasm wasm/openswmm2d_exports.cpp)` + `target_link_libraries(openswmm2d_wasm PRIVATE openswmm_engine)`.
- Output `openswmm2d` into `public/`.

**emcc link flags** (`cmake/wasm/CMakeLists.txt:34-48`) and their meaning:

| Flag | Meaning |
|---|---|
| `-s WASM=1` | WebAssembly output |
| `-s MODULARIZE=1`, `-s EXPORT_NAME=createOpenSwmm2D` | wrap output in the factory function |
| `-s EXPORT_ES6=0`, `-s ENVIRONMENT=web,worker` | classic wrapper, usable in main thread + workers |
| `-s ALLOW_MEMORY_GROWTH=1` | heap can grow past `INITIAL_MEMORY` |
| `-s FILESYSTEM=1` | MEMFS virtual FS (for `.inp`/`.rpt`/`.out`) |
| `-s DISABLE_EXCEPTION_CATCHING=0` | keep C++ exceptions |
| `--no-entry` | library module, no `main` |
| `-s EXPORTED_RUNTIME_METHODS=['cwrap','FS','getValue']` | runtime helpers |
| `-s EXPORTED_FUNCTIONS=[…31 symbols…]` | exact C API surface |
| `-s INITIAL_MEMORY=134217728` (128 MiB), `-s STACK_SIZE=5242880` (5 MiB) | memory sizing |
| `-s WASM_ASYNC_COMPILATION=1` | async compile (all callers use `instantiateWasm`) |

`cmake/OpenSwmm2DWasm.cmake` is a **legacy sibling** of the same target (not referenced by the build scripts).

## 5. The engine submodule & the wasm compatibility fix

`third_party/openswmm-engine` is a **git submodule** (`https://github.com/JoaquinAlvarado-py/openswmm.engine.git`). The `experimental` branch pins a commit that is **not buildable for Emscripten out of the box**: `src/engine/plugins/PluginFactory.cpp` uses `dlopen`/`dlsym` and its platform `#if` chain doesn't handle `__EMSCRIPTEN__` (`#error "PluginFactory: unsupported platform"`).

The fix (commit `85e4be38`, *"fix(wasm): emscripten compatibility and build shims for web execution"*, cherry-picked from the engine's `swmm6_rel` branch onto the pinned `2932a5b` and committed locally) makes the wasm build work by:

1. Building `openswmm_engine` and the legacy libraries as **STATIC** under `EMSCRIPTEN` (`src/engine/CMakeLists.txt`, `src/legacy/*/CMakeLists.txt`).
2. Stripping `__attribute__((visibility(...)))` export macros (`include/openswmm/engine/openswmm_engine_export.h`, `openswmm_legacy_solver_export.h`).
3. Adding Emscripten no-ops to `PluginFactory.cpp`: dynamic loading disabled, `discover()` early-returns, `.wasm` treated as a shared-library extension.
4. Re-adding the `OPENSWMM_WASM_INJECT_FILE` include hook in the top-level `CMakeLists.txt`.

The LocalSWMM repo carries commit `83dc0df` *"submodule: pin openswmm-engine with wasm compatibility fix"* which moves the gitlink to `85e4be38`. The engine is otherwise described as `v6.0.0-alpha.1-347-g85e4be38`.

> ⚠️ **If you re-pin the submodule or run `git submodule update`, keep the wasm-compat commit** or the WASM build will fail again at `PluginFactory.cpp`. The prebuilt binaries in `public/` were built from `85e4be38` and are unaffected by the submodule pointer.

## 6. Rebuild the WASM engine

```bash
cd ~/LocalSWMM
npm run build:2d-wasm:sh        # = bash scripts/build-openswmm2d.sh
# outputs: public/openswmm2d.{js,wasm}, public/swmm6wasm.{js,wasm}, *.version.json
```

First build compiles the four vcpkg ports for `wasm32-emscripten` (Eigen/HDF5/nlohmann-json/SUNDIALS) — allow 10–40 minutes. Subsequent builds use the vcpkg binary cache. The rebuilt binaries are **tracked files** — commit them with the engine stamp when they change.
