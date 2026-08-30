# PPT-03 — Compiling OpenSWMM C++ → WASM with Emscripten, and the tradeoffs of a browser engine

Research notes for a technical presentation about **LocalSWMM** (web app that runs the C++ HydroCouple OpenSWMM 6 engine, compiled to WebAssembly with Emscripten, 100% in the browser).

Repo sources are cited as paths; code reads were done on the `website` worktree (`/home/nekzoh/Dev/LocalSWMM-network3d`), docs on `main` (`/home/nekzoh/Dev/LocalSWMM`). External claims cite official Emscripten / web.dev / MDN / GitHub URLs.

---

## Topic C — The compiling process: C++ → JS/WASM with Emscripten (as done in LocalSWMM)

### C.0 The one-line pipeline

C++20 OpenSWMM engine (a git submodule) + four vcpkg C++ deps → `clang`/`LLVM` (via `emcc`) → a single `.wasm` binary plus a JS "glue" loader, exposed to the browser through an explicitly exported C API (`swmm_engine_*`, `swmm_2d_*`, `swmm_node_*`), with `.inp`/`.rpt`/`.out` files passing through Emscripten's virtual filesystem. `public/swmm6wasm.js`/`.wasm` are byte-for-byte copies of the canonical `public/openswmm2d.js`/`.wasm` outputs.

### C.1 The general Emscripten pipeline (from official docs)

- **clang + LLVM → wasm**: Emscripten feeds C/C++ into clang+LLVM, transforms the compiled result into a Wasm binary, and generates the JS glue code needed to load/run it. By itself Wasm cannot directly access the DOM — it can only call JS with primitives, so the glue is required. (https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Concepts#porting_from_cc)
- **LLVM wasm backend**: since Emscripten `1.39.0` (Oct 2019) the upstream LLVM Wasm backend emits WebAssembly by default; it uses wasm object files (codegen at compile step → faster links) and `wasm-ld` as the linker. `-sWASM=0` disables it. (https://emscripten.org/docs/compiling/WebAssembly.html#backends)
- **Output is a pair**: `emcc` produces a `.wasm` plus a `.js` "main target" that loads and wires up the Wasm, setting up imports/exports. The `.wasm` is *not standalone* — it needs the JS to feed it the right imports (e.g. syscalls). (https://emscripten.org/docs/compiling/WebAssembly.html#compiler-output)
- **Async compilation**: Wasm is compiled asynchronously by default (`WASM_ASYNC_COMPILATION=1`); you must wait for compilation (e.g. `onRuntimeInitialized`) before calling code. (https://emscripten.org/docs/compiling/WebAssembly.html#wasm-files-and-compilation)
- **Serving**: the server should send `application/wasm` MIME so the browser can *streaming-compile* the binary while it downloads; gzip is recommended. (https://emscripten.org/docs/compiling/WebAssembly.html#web-server-setup)

### C.2 Toolchain layout in this repo

| Tool | Where | Reference |
|---|---|---|
| Emscripten SDK | `.tools/emsdk/` (git-ignored) | `docs/how-to/03-build-from-source.md:7-9` |
| vcpkg | `.tools/vcpkg/` (git-ignored) | `docs/how-to/03-build-from-source.md:7-9` |
| Engine source | `third_party/openswmm-engine/` (git submodule) | `scripts/build-openswmm2d.sh:18-21`, `docs/reference/02-repository-layout.md:25-26` |
| Build script | `scripts/build-openswmm2d.sh` (Linux) / `build-openswmm2d.ps1` (Windows) | `package.json` scripts `build:2d-wasm` / `build:2d-wasm:sh` |
| CMake wrapper | `cmake/wasm/CMakeLists.txt` (active) | `cmake/OpenSwmm2DWasm.cmake` is a legacy sibling not used by the build scripts (`docs/reference/02-repository-layout.md:17`) |
| C API shim TU | `wasm/openswmm2d_exports.cpp` | `docs/reference/02-repository-layout.md:19-20` |

The doc pins the reference Emscripten version at **`emcc` 6.0.6** and vcpkg at **2026-07-27** (`docs/how-to/03-build-from-source.md:9-10`).

### C.3 vcpkg deps and the `wasm32-emscripten` triplet

- **Manifest** — `vcpkg.json` declares `eigen3`, `hdf5`, `nlohmann-json`, `sundials` (`vcpkg.json:4-9`). Per the build doc, HDF5 is needed by the 2D module's `Default2DOutputPlugin`; SUNDIALS is declared but the current explicit marcher no longer uses it (`docs/how-to/03-build-from-source.md:66`). The `wasm-build.log` (historical Windows build record) shows the resolved port versions: `eigen3 5.0.1`, `hdf5 2.1.1#1` (+ `libaec`, `zlib`), `nlohmann-json 3.12.0#2`, `sundials 7.8.0` (`wasm-build.log`).
- **Triplet** — `vcpkg-triplets/wasm32-emscripten.cmake`:
  - `VCPKG_TARGET_ARCHITECTURE wasm32`, `VCPKG_CRT_LINKAGE static` + `VCPKG_LIBRARY_LINKAGE static` (Emscripten links everything into one `.wasm`), `VCPKG_CMAKE_SYSTEM_NAME Emscripten`, `VCPKG_BUILD_TYPE release`, env passthrough of `EMSDK;EMSDK_NODE;EMSDK_PYTHON;PATH`, and `VCPKG_CHAINLOAD_TOOLCHAIN_FILE` pointing at the SDK's `Platform/Emscripten.cmake` (`vcpkg-triplets/wasm32-emscripten.cmake:1-7`; meaning per `docs/how-to/03-build-from-source.md:68-77`).
- **Manifest subtlety** — the engine submodule ships its *own* `vcpkg.json`; because the wasm wrapper consumes the engine via `add_subdirectory`, vcpkg honors only the top-level manifest (`VCPKG_MANIFEST_DIR=$ROOT`), so the root manifest governs the WASM build. `VCPKG_MANIFEST_NO_DEFAULT_FEATURES=ON` keeps the engine's `2d`/`gpu` default features from dragging HDF5/Kokkos in twice (`docs/how-to/03-build-from-source.md:79`).

### C.4 The build scripts (`build-openswmm2d.sh` / `.ps1`)

Both scripts (Linux bash and Windows PowerShell are near-identical):

1. **Locate the SDKs** — source `emsdk_env.sh` if `emcmake` isn't on PATH (sh), or wire `EMSDK`/`EMSDK_NODE`/`EMSDK_PYTHON`/`PATH` manually (ps1) (`build-openswmm2d.sh:12-16`, `build-openswmm2d.ps1:12-23`).
2. **Guards** — engine submodule present; vcpkg toolchain present (`build-openswmm2d.sh:18-26`).
3. **Env** — `VCPKG_DEFAULT_TRIPLET=wasm32-emscripten`, `VCPKG_OVERLAY_TRIPLETS=$ROOT/vcpkg-triplets`, `EMCC_SKIP_SANITY_CHECK=1` (`build-openswmm2d.sh:28-30`).
4. **Configure** — `emcmake cmake -S cmake/wasm -B build/openswmm2d-wasm-emscripten -G Ninja` with:
   - `CMAKE_TOOLCHAIN_FILE` = vcpkg toolchain; `VCPKG_CHAINLOAD_TOOLCHAIN_FILE` = the Emscripten platform module.
   - Engine options: `OPENSWMM_BUILD_2D=ON`, `OPENSWMM_FORCE_SCALAR=ON` (doc: "no SIMD on wasm32"), `OPENSWMM_ENABLE_LTO=OFF` (`.sh`) vs `ON` (`.ps1`), `OPENSWMM_WITH_GEOPACKAGE=OFF`, `OPENSWMM_BUILD_GPU_PLUGIN=OFF`, `OPENSWMM_BUILD_TESTS=OFF`, `OPENSWMM_INSTALL=OFF` (`build-openswmm2d.sh:40-58`, `build-openswmm2d.ps1:52-71`).
   - **OpenMP detection trick**: `CMAKE_CROSSCOMPILING_EMULATOR` = the emsdk's `node` binary, so CMake's `FindOpenMP` can *compile-and-run* its probe with `emcc`; `-fopenmp` in `CMAKE_C_FLAGS`/`CMAKE_CXX_FLAGS` defines `SWMM_USE_OPENMP` so the solver's `#pragma omp` loops go live. Without the node emulator, OpenMP is silently compiled out. (`build-openswmm2d.sh:37-58`, `docs/how-to/03-build-from-source.md:52-53`). The `.ps1` additionally passes `-msimd128` (`build-openswmm2d.ps1:70-71`).
5. **Build** — `cmake --build … --target openswmm2d_wasm --parallel`; the static `libopenswmm.engine.a` links into the modular JS/WASM pair (`docs/how-to/03-build-from-source.md:58`).
6. **Alias + stamp** — copies `openswmm2d.wasm→swmm6wasm.wasm`, `openswmm2d.js→swmm6wasm.js` (and `.worker.js` if emitted); writes `openswmm2d.version.json` / `swmm6wasm.version.json` with `engineCommit`, `engineDescribe` (`git describe --always --dirty --tags`), `builtAtUtc` (`build-openswmm2d.sh:62-88`). The committed binaries in `public/` stamp `v6.0.0-alpha.3-3-gec280d2c`, built 2026-08-12 (`public/swmm6wasm.version.json`).
7. **Build time** — first build compiles the four vcpkg ports for `wasm32-emscripten`, allow 10–40 minutes; later builds use the vcpkg binary cache (`docs/how-to/03-build-from-source.md:130`).

### C.5 The CMake wrapper and how the C API is exported

`cmake/wasm/CMakeLists.txt` exists because upstream removed the `OPENSWMM_WASM_INJECT_FILE` hook, so the wasm target can no longer be declared inside the engine tree. It embeds the engine the same way the upstream Python bindings do:

- `add_subdirectory(third_party/openswmm-engine …)` (`cmake/wasm/CMakeLists.txt:13-16`).
- `add_executable(openswmm2d_wasm wasm/openswmm2d_exports.cpp)` + `target_link_libraries(... openswmm_engine)` (`cmake/wasm/CMakeLists.txt:20-24`).
- `OUTPUT_NAME openswmm2d`, `RUNTIME_OUTPUT_DIRECTORY public/` (`cmake/wasm/CMakeLists.txt:29-32`).

**The exports TU** — `wasm/openswmm2d_exports.cpp` includes `<openswmm/engine/openswmm_2d.h>` and `<openswmm/engine/openswmm_engine.h>` and defines nothing else: "The browser hosts OpenSWMM through its exported C API; there is no program entry point." Keeping it source-only avoids Emscripten's `main`/run lifecycle interfering with modular worker init (`wasm/openswmm2d_exports.cpp:1-6`).

**Link flags** (`cmake/wasm/CMakeLists.txt:34-60`), mapped to Emscripten semantics:

| Flag | Meaning | Emscripten reference |
|---|---|---|
| `-s WASM=1` | WebAssembly output | https://emscripten.org/docs/compiling/WebAssembly.html#setup |
| `-s MODULARIZE=1`, `-s EXPORT_NAME=createOpenSwmm2D` | wrap output in the factory function the worker calls | `cmake/wasm/CMakeLists.txt:36-38` |
| `-s EXPORT_ES6=0`, `-s ENVIRONMENT=web,worker` | classic wrapper, usable on main thread + in workers | `cmake/wasm/CMakeLists.txt:37,39` |
| `-s ALLOW_MEMORY_GROWTH=1` | heap can grow past `INITIAL_MEMORY` | `cmake/wasm/CMakeLists.txt:40` |
| `-s FILESYSTEM=1` | MEMFS virtual FS (for `.inp`/`.rpt`/`.out`) | `cmake/wasm/CMakeLists.txt:41` |
| `-s DISABLE_EXCEPTION_CATCHING=0` | keep C++ exceptions (they're off by default at `-O1+`) | `cmake/wasm/CMakeLists.txt:42`; https://emscripten.org/docs/optimizing/Optimizing-Code.html#c-exceptions |
| `--no-entry` | library module, no `main` | `cmake/wasm/CMakeLists.txt:43` |
| `-s EXPORTED_RUNTIME_METHODS=['cwrap','FS','getValue']` | runtime helpers kept alive across minification | `cmake/wasm/CMakeLists.txt:55` |
| `-s EXPORTED_FUNCTIONS=[…31 symbols…]` | the exact C API surface (`swmm_engine_*`, `swmm_2d_*`, `swmm_node_*`, plus `_malloc`/`_free`) | `cmake/wasm/CMakeLists.txt:56` |
| `-s INITIAL_MEMORY=134217728` (128 MiB), `-s STACK_SIZE=5242880` (5 MiB) | memory sizing | `cmake/wasm/CMakeLists.txt:57-58` |
| `-s WASM_ASYNC_COMPILATION=1` | async compile; all callers use `instantiateWasm` | `cmake/wasm/CMakeLists.txt:59` |

On `EXPORTED_FUNCTIONS` / `EXPORTED_RUNTIME_METHODS` (the task's "EXCEPTED_FUNCTIONS" is a typo): `EXPORTED_FUNCTIONS` is the *entire* list of symbols kept alive (everything else is dead-code-eliminated); names need the leading `_`; at `-O2+` code is minified, so exporting is what lets you call functions by their original name. `EXPORTED_RUNTIME_METHODS` keeps runtime helpers like `cwrap`/`ccall`/`FS` reachable. (https://emscripten.org/docs/porting/connecting_cpp_and_javascript/Interacting-with-code.html#calling-compiled-c-functions-from-javascript-using-ccall-cwrap)

### C.6 Threading: OpenMP → pthreads → SharedArrayBuffer

- The wrapper links with `-pthread`, `PTHREAD_POOL_SIZE=4`, `PTHREAD_POOL_SIZE_STRICT=0` (`cmake/wasm/CMakeLists.txt:52-54`). The comment explains the design: "the OpenMP solver loops map to Emscripten pthreads and need SharedArrayBuffer, so the page must be cross-origin isolated (COOP/COEP — `public/_headers` on Cloudflare Pages). THREADS n in the model `[OPTIONS]` opts in; default 1 stays bit-identical to the scalar build. PTHREAD_POOL_SIZE pre-spawns the workers (on-demand spawn with pool 0 hangs once a parallel region first needs threads in this self-reuse worker model), so the build is browser-only: the Node reference harness needs a non-threaded build." (`cmake/wasm/CMakeLists.txt:44-54`).
- **Emscripten's view of pthreads**: implemented on `SharedArrayBuffer`, which browsers gate behind COOP/COEP headers — "Pthreads code will not work in deployed environment unless these headers are correctly set." Enable with `-pthread` at compile *and* link; `-sPTHREAD_POOL_SIZE` pre-creates a worker pool; it is **not possible** to build one binary that uses threads when available and falls back single-threaded — you need two builds. (https://emscripten.org/docs/porting/pthreads.html)
- **Main-thread blocking caveat**: `Atomics.wait` doesn't work on the main browser thread, so `pthread_join`/futex waits there use a busy-wait (unresponsive tab, wasted power) — with worker-pool-0 and on-demand spawn you can even hang. LocalSWMM avoids this by running the engine inside a Web Worker (`public/simWorker.js:1-12`), so the wasm "main application thread" *is* a worker. (https://emscripten.org/docs/porting/pthreads.html#blocking-on-the-main-browser-thread)
- **`-pthread` + `ALLOW_MEMORY_GROWTH`** is explicitly flagged as "especially tricky" (JS memory views may be stale) — LocalSWMM uses both (`cmake/wasm/CMakeLists.txt:40,52`). (https://emscripten.org/docs/porting/pthreads.html#special-considerations)

### C.7 The engine-side wasm compatibility fix

The pinned engine is *not* Emscripten-buildable out of the box: `src/engine/plugins/PluginFactory.cpp` uses `dlopen`/`dlsym` and its platform `#if` chain has no `__EMSCRIPTEN__` branch (→ `#error "PluginFactory: unsupported platform"`). A cherry-picked commit `85e4be38` "fix(wasm): emscripten compatibility and build shims for web execution" makes it work by: building `openswmm_engine` and legacy libs as **STATIC** under `EMSCRIPTEN`; stripping `__attribute__((visibility(...)))` export macros; adding Emscripten no-ops to `PluginFactory.cpp` (dynamic loading disabled, `discover()` early-returns, `.wasm` treated as a shared-library extension); re-adding the `OPENSWMM_WASM_INJECT_FILE` hook. The repo pins the gitlink to that commit (`83dc0df`). (`docs/how-to/03-build-from-source.md:107-120`)

### C.8 Loading in the browser — `swmm6wasm.js`/`.wasm` at runtime

`swmm6wasm.*` are byte-for-byte copies of `openswmm2d.*` made by the build scripts (`docs/reference/02-repository-layout.md:35,67`; `build-openswmm2d.sh:62-68`). The runtime flow (`public/simWorker.js`):

1. `simWorker.js` is a dedicated Web Worker that keeps the engine off the UI thread and **persists across runs** (`simWorker.js:1-12`).
2. `importScripts('swmm6wasm.js?v=<BUILD_STAMP>')` loads the modular glue (`simWorker.js:16-17`); the wasm factory is `createOpenSwmm2D` (the `EXPORT_NAME`) (`simWorker.js:46`).
3. The binary is fetched and **compiled once**: `fetch('swmm6wasm.wasm?v=…')` → `WebAssembly.compileStreaming` (falling back to `compile(arrayBuffer)` if the MIME type is wrong), pre-warmed as soon as the worker starts while the user is still editing (`simWorker.js:20-38`).
4. Each run **instantiates a fresh engine** (fresh memory + FS) from the cached compiled module via Emscripten's `instantiateWasm` hook; a fresh instance per run is required because repeated `callMain` on one instance fails on some builds, but re-instantiating a compiled module costs only ~10–50 ms (`simWorker.js:8-12,40-69`).
5. Model in, results out via the virtual filesystem + exported C API: `Module.FS.writeFile('/in.inp', inpText)` → `cwrap('swmm_engine_create'/'open'/'initialize'/'start'/'stride'/'end'/'report'/'close'/'destroy')`, with a `stride()` loop over up to 10,000,000 steps, then `FS.readFile('/rpt.rpt')` and `FS.readFile('/out.out')` transferred back to the main thread (`simWorker.js:93-179`). This matches the architecture doc's data flow: `.inp` string → worker → `FS.writeFile('/in.inp')` → `swmm_engine_open/initialize/start` → `stride()` loop → `.rpt` + `.out` read back → `swmmOutParser` (`docs/explanation/01-architecture.md:62`).
6. Emscripten's pthread model reuses the host script (no separate `.worker.js`); the worker re-executes itself as `em-pthread` when spawned as a pthread worker, and skips its own message handler then so the glue's SharedArrayBuffer distribution loop is not clobbered (`simWorker.js:73-76,380-383`).

On the FS: Emscripten provides a virtual file system (MEMFS mounted at `/`) so native synchronous libc file APIs run unmodified; with MEMFS everything is in-memory and lost on reload (`https://emscripten.org/docs/porting/files/file_systems_overview.html`).

### C.9 The real constraint: GitHub Pages cannot serve COOP/COEP

Primary source — the repo's own workflow comment in `.github/workflows/static.yml:3-6`:

> "NOTE: GitHub Pages cannot set COOP/COEP headers, so the threaded 2D wasm (pthreads/SharedArrayBuffer) will NOT run on this deployment. Deploy via Cloudflare Pages instead — see .github/workflows/cloudflare.yml and public/_headers."

Corroborated in `docs/how-to/05-deploy.md:5` ("GitHub Pages does not allow custom headers and cannot serve the threaded build. **Use Cloudflare Pages.**") and `docs/how-to/05-deploy.md:39`. The production headers are defined in `public/_headers`:

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: credentialless
```

(`public/_headers`) — `credentialless` chosen so Mapbox/Google/OpenTopography CDN resources load without CORP headers (`docs/how-to/05-deploy.md:19`). The local dev server mirrors them (`server.py` sends `Cross-Origin-Opener-Policy: same-origin` / `Cross-Origin-Embedder-Policy: credentialless`, so the threaded engine works at `http://127.0.0.1:8080` out of the box; `docs/how-to/01-run-locally.md:50`).

Why this matters: `SharedArrayBuffer` (hence pthreads) is gated behind COOP/COEP by browsers (https://web.dev/articles/cross-origin-isolation-guide — "Cross-origin isolation enables a web page to use powerful features such as SharedArrayBuffer"; and https://emscripten.org/docs/porting/pthreads.html — "Browsers … are gating [SharedArrayBuffer] behind Cross Origin Opener Policy (COOP) and Cross Origin Embedder Policy (COEP) headers. Pthreads code will not work in deployed environment unless these headers are correctly set."). GitHub Pages is a static host (https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages) that does not let a site set its own HTTP headers; the repo treats that as fact in its workflow. **Caveat on verification:** GitHub's own Pages docs do not state "no custom headers" verbatim in the page checked; the repo's `static.yml` comment and deploy doc are the authoritative in-repo verification, and they agree with the well-known GitHub Pages limitation. Cloudflare Pages serves the app in production at `https://swmm6.is-local.org` (`docs/how-to/05-deploy.md:3`).

### C.10 Size / performance facts observed in this project

- Shipped artifacts: `swmm6wasm.wasm` = **4,835,456 bytes (~4.8 MB)**, `swmm6wasm.js` glue = **91,085 bytes (~91 KB)** (`public/`). The `_headers` file gives the wasm+js a `Cache-Control: public, max-age=31536000, immutable` (`public/_headers`).
- Emscripten guidance: wasm typically compiles *smaller and faster to parse* than equivalent JS; serve with `application/wasm` to stream-compile and enable gzip (`https://emscripten.org/docs/compiling/WebAssembly.html#web-server-setup`); Binaryen runs whole-program Wasm optimizations at link (`https://emscripten.org/docs/optimizing/Optimizing-Code.html#how-emscripten-optimizes`).
- **SIMD nuance**: the `.sh` build forces `OPENSWMM_FORCE_SCALAR=ON` ("no SIMD on wasm32") with LTO off, while the `.ps1` build enables LTO and adds `-msimd128` (`docs/how-to/03-build-from-source.md:47-48`; `build-openswmm2d.sh:48`; `build-openswmm2d.ps1:63,70-71`). Emscripten's `-msimd128` targets WebAssembly SIMD (Chrome ≥91, Firefox ≥89, Safari ≥16.4), but many x86 SSE intrinsics only compile via emulation with real performance penalties (`https://emscripten.org/docs/porting/simd.html`).
- Memory: `INITIAL_MEMORY=134217728` (128 MiB) with growth allowed (`cmake/wasm/CMakeLists.txt:40,57`). Wasm32 → 32-bit pointers; the app's mesh/2D state and `.out` buffers live in that linear memory.

---

## Topic D — Advantages vs disadvantages: WASM-in-browser engine vs native/server engine

Project's own framing first, then well-established WASM tradeoffs. (Context: `CONTEXT.md` documents the scaling plan — a native server-side engine with a worker pool, an API to consume runs, and aggregate system status.)

### D.0 How the project frames it

- **Client-side-only**: "a client-side-only web application for 2D hydraulic modeling, where everything — the editor, the mesher, and the SWMM hydraulics engine — runs in the browser. The simulation engine is the HydroCouple **OpenSWMM** engine compiled to **WebAssembly** with Emscripten." (`docs/explanation/01-architecture.md:3-7`)
- **No backend**: "The only server is a trivial static-file + health endpoint server (`server.py`). No database, no build step for the UI, no bundler." (`docs/explanation/01-architecture.md:13`; `docs/reference/03-technology-stack.md:9`)
- **WASM-embedded hydraulics**: "The OpenSWMM 6.0.0 engine is cross-compiled for `wasm32-emscripten` with vcpkg-managed C++ dependencies (Eigen, HDF5, nlohmann-json, SUNDIALS)." (`docs/reference/03-technology-stack.md:11`); two simulation backends exist — the WASM engine path and an experimental WebGPU path (`docs/explanation/01-architecture.md:16`).
- README positions it for end users: runs "directly in your web browser thanks to WebAssembly", needs only "a modern web browser with WebAssembly support", plus Python 3 only to run the local static server (`README.md:12,20-41`).

### D.1 Advantages of the WASM-in-browser engine

1. **Privacy / no data leaves the device.** Model and results never touch a server — the only server is static files + `GET /api/status` (`server.py`; `docs/how-to/05-deploy.md:43`). No account, no upload, no database (`docs/explanation/01-architecture.md:13`). This is the strongest argument for the in-browser engine vs a hosted one.
2. **Offline-capable.** Runs from a static host or `python server.py` on any machine (`README.md:38-42`); project state autosaves to `localStorage` (fallback IndexedDB) (`docs/explanation/01-architecture.md:150`). A native/server engine would require a running service.
3. **Zero-install, cross-platform.** Ships as static files; requires only WebAssembly support in the browser (`README.md:22`). "WebAssembly code can be executed at near-native speed across different platforms by taking advantage of common hardware capabilities" and runs in a sandbox (`https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Concepts`). One binary runs on Windows/macOS/Linux/mobile browsers — no per-OS engine builds.
4. **No server cost, scales to zero.** Deploy is a static upload (`.github/workflows/static.yml`, `cloudflare.yml`); a server engine needs a running pool of native workers (the `CONTEXT.md` roadmap).
5. **Reuses the exact C++ codebase.** The engine is a git submodule; the same C++20 sources build natively *and* to wasm (the wasm target is just another CMake executable over the same `openswmm_engine` static lib — `cmake/wasm/CMakeLists.txt:20-24`). Native performance is not lost in principle: "Emscripten-compiled code can often be close to the speed of a native build" (`https://emscripten.org/docs/optimizing/Optimizing-Code.html#troubleshooting-poor-performance`).
6. **Sandboxed security.** Wasm runs in a "safe, sandboxed execution environment … enforce[ing] the browser's same-origin and permissions policies" (`https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Concepts#webassembly_goals`).
7. **Stale-code elimination + streaming.** Dead code elimination and Binaryen shrink the shipped wasm; streaming compile + gzip make the 4.8 MB engine load acceptably (see C.10).

### D.2 Disadvantages / constraints of the WASM-in-browser engine

1. **Threading is gated on cross-origin isolation.** The OpenMP→pthreads path needs `SharedArrayBuffer`, which browsers only give to COOP/COEP-served pages (`https://emscripten.org/docs/porting/pthreads.html`). Consequences in this project:
   - **GitHub Pages can't run the threaded build** — `static.yml:3-6` comment, `docs/how-to/05-deploy.md:5`. Production requires Cloudflare Pages (or any host that can set headers).
   - The worker model is pinned: `PTHREAD_POOL_SIZE=4`, on-demand spawn hangs, so the build is browser-only and a *separate* non-threaded build is needed for Node harnesses (`cmake/wasm/CMakeLists.txt:44-54`).
   - You **cannot** ship one binary that uses threads when available and falls back single-threaded — two builds required (`https://emscripten.org/docs/porting/pthreads.html`).
   - Cross-origin isolation has side effects (blocks non-opted-in cross-origin resources; breaks popup communication) (`https://web.dev/articles/cross-origin-isolation-guide`).
   - A native server engine would get unrestricted OpenMP/native threads on every core without any of this ceremony.
2. **SIMD is partial.** The Linux build forces scalar (`OPENSWMM_FORCE_SCALAR=ON`, "no SIMD on wasm32") (`docs/how-to/03-build-from-source.md:47`); the Windows build opts into `-msimd128`, but many native SSE/AVX intrinsics only run via emulation with significant slowdowns (`https://emscripten.org/docs/porting/simd.html`). Native x86 builds use the full AVX/FMA sets.
3. **Browser memory limits.** Wasm linear memory starts at `INITIAL_MEMORY=128 MiB` with `ALLOW_MEMORY_GROWTH` (`cmake/wasm/CMakeLists.txt:40,57`); wasm32 has a 32-bit address space and browsers impose per-tab limits — Emscripten itself notes you may hit memory limits/fragmentation for very large modules (`https://emscripten.org/docs/optimizing/Optimizing-Code.html#very-large-codebases`). 2D meshes + `.out` buffers + in-memory FS all compete for that heap. A server engine could use 64-bit addressing and GBs of RAM.
4. **Load size / first-compile cost.** ~4.8 MB wasm + ~91 KB glue (`public/`) is just the engine; the app adds ~15k lines of dependency-free JS plus CDN libraries (`docs/reference/03-technology-stack.md:10,19-23`). Compilation is async and must finish before the first run (`https://emscripten.org/docs/compiling/WebAssembly.html#wasm-files-and-compilation`) — LocalSWMM mitigates by pre-warming compilation in the worker at startup (`simWorker.js:38`).
5. **Build complexity and fragility.** Building needs emsdk + vcpkg + an overlay triplet + a node emulator just so `FindOpenMP` runs; first build takes 10–40 minutes (`docs/how-to/03-build-from-source.md:130`). The pinned engine needed a hand-patched wasm-compat commit (`docs/how-to/03-build-from-source.md:107-120`) and must not be re-pinned without it (`docs/how-to/03-build-from-source.md:120`). This is bespoke tooling a server engine would not need.
6. **Debuggability is weaker.** DWARF debug info costs link time and work (`https://emscripten.org/docs/optimizing/Optimizing-Code.html#link-times`); exceptions are off by default at `-O1+` (this project re-enables with `DISABLE_EXCEPTION_CATCHING=0`), and the engine's MSVC-only exception handling "compiles to nothing under Emscripten" so a partial `.rpt`/`.out` must not be trusted (`public/simWorker.js:148-159`). Server-side you'd debug with a normal native debugger.
7. **Per-client, not per-cluster, horsepower.** Every browser tab compiles and runs its own engine; throughput is bounded by the *user's* machine and one tab, not by a central pool. The project's own scaling plan (`CONTEXT.md`) is precisely this limit: add a server-side native pool with workers, an API, and aggregated status for runs that are too heavy for a browser tab.
8. **Browser-thread semantics leak into engine code.** `pthread_create` on the main thread can't synchronously start work (needs event-loop return or a pre-spawned pool — `https://emscripten.org/docs/porting/pthreads.html#special-considerations`); blocking waits on the main thread busy-wait (`https://emscripten.org/docs/porting/pthreads.html#blocking-on-the-main-browser-thread`). The project sidesteps it by living inside a Web Worker (`simWorker.js`), which is extra architecture a native engine wouldn't need.

### D.3 Bottom line (project-shaped)

The WASM engine buys **privacy, offline, zero-install, cross-platform distribution, and near-native scalar speed** for free, at the cost of **constrained parallelism (SharedArrayBuffer/COOP/COEP), partial SIMD, browser memory ceilings, a heavyweight bespoke build, weaker debuggability, and per-client (not cluster) throughput**. The `CONTEXT.md` plan is the natural synthesis: keep the in-browser WASM path for the common case and add a native server pool for runs that outgrow a single tab.

---

### Not fully verified

- GitHub Pages' "cannot set custom headers" is asserted by the repo (`static.yml:3-6`, `docs/how-to/05-deploy.md:5`) and consistent with GitHub's static-hosting model (`about-github-pages`), but GitHub's docs page checked does not state "no custom HTTP headers" verbatim — treat that external clause as community-known, not doc-quoted.
- Emscripten docs were fetched as the current `6.0.9-git` (dev) build; the repo's reference toolchain is `emcc 6.0.6`, so page wording may drift slightly.
- Exact wasm sizes were measured on the `website` worktree's committed binaries; other branches may differ.