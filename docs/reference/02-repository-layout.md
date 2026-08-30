# Repository Layout

The complete source tree of `LocalSWMM` — every path and its role, from the repo root down to the served `public/` directory.

## Directory tree

```
LocalSWMM/
├── README.md                     # User-facing readme (Quick Start, tool usage)
├── WEBGPU_PLAN.md                # WebGPU backend roadmap (Spanish) + status
├── server.py                     # Local static + API dev server (port 8080)
├── package.json / package-lock   # npm scripts + triangle-wasm devDependency
├── vcpkg.json                    # C++ deps manifest for the WASM build
├── vcpkg-triplets/
│   └── wasm32-emscripten.cmake   # vcpkg overlay triplet for Emscripten
├── cmake/
│   ├── OpenSwmm2DWasm.cmake      # (legacy sibling, not used by build scripts)
│   └── wasm/CMakeLists.txt       # ACTIVE wrapper that embeds the engine + wasm target
├── wasm/
│   └── openswmm2d_exports.cpp    # Source-only TU exposing the C API to Emscripten
├── scripts/
│   ├── build-openswmm2d.sh       # Linux/macOS WASM build (emcmake + vcpkg)
│   ├── build-openswmm2d.ps1      # Windows WASM build
│   └── *.mjs                     # 15 bench/probe/verify/harness scripts (see §15)
├── third_party/
│   └── openswmm-engine/          # GIT SUBMODULE — the OpenSWMM C++ engine
├── assets/                       # demo.mp4
├── wasm-build.log                # Historical Windows build record (reference only)
├── .github/workflows/static.yml  # GitHub Pages deploy (no wasm build in CI)
└── public/                       # <-- everything served by server.py
    ├── index.html                # SPA shell (toolbar, palette, map, panels, modals)
    ├── config.js                 # GITIGNORED — API keys (Mapbox etc.)
    ├── *.js                      # ~47 app modules (~15k lines), plain scripts
    ├── openswmm2d.js / .wasm     # Engine build (factory createOpenSwmm2D)
    ├── swmm6wasm.js / .wasm      # Byte-for-byte copies of openswmm2d.* (legacy name)
    ├── openswmm2d.version.json   # Engine commit stamp (written by build script)
    ├── swmm6wasm.version.json    # Same stamp (twin file)
    ├── sample_models/            # Bellinge sample models + Bellinge2.tif DEM
    ├── vendor/triangle/          # triangle-wasm loader (TriangleWASM wrapper)
    └── webgpu/                   # WebGPU marcher, split, worker, harness, WGSL
```

## Index of entries

| Path | Role |
|---|---|
| `README.md` | User-facing readme (Quick Start, tool usage) |
| `WEBGPU_PLAN.md` | WebGPU backend roadmap (Spanish) + status |
| `server.py` | Local static + API dev server (port 8080) |
| `package.json` / `package-lock` | npm scripts + triangle-wasm devDependency |
| `vcpkg.json` | C++ deps manifest for the WASM build |
| `vcpkg-triplets/wasm32-emscripten.cmake` | vcpkg overlay triplet for Emscripten |
| `cmake/OpenSwmm2DWasm.cmake` | Legacy sibling, not used by build scripts |
| `cmake/wasm/CMakeLists.txt` | ACTIVE wrapper that embeds the engine + wasm target |
| `wasm/openswmm2d_exports.cpp` | Source-only TU exposing the C API to Emscripten |
| `scripts/build-openswmm2d.sh` | Linux/macOS WASM build (emcmake + vcpkg) |
| `scripts/build-openswmm2d.ps1` | Windows WASM build |
| `scripts/*.mjs` | 15 bench/probe/verify/harness scripts |
| `third_party/openswmm-engine/` | GIT SUBMODULE — the OpenSWMM C++ engine |
| `assets/` | demo.mp4 |
| `wasm-build.log` | Historical Windows build record (reference only) |
| `.github/workflows/static.yml` | GitHub Pages deploy (no wasm build in CI) |
| `public/index.html` | SPA shell (toolbar, palette, map, panels, modals) |
| `public/config.js` | GITIGNORED — API keys (Mapbox etc.) |
| `public/*.js` | ~47 app modules (~15k lines), plain scripts |
| `public/openswmm2d.js` / `.wasm` | Engine build (factory `createOpenSwmm2D`) |
| `public/swmm6wasm.js` / `.wasm` | Byte-for-byte copies of `openswmm2d.*` (legacy name) |
| `public/openswmm2d.version.json` | Engine commit stamp (written by build script) |
| `public/swmm6wasm.version.json` | Same stamp (twin file) |
| `public/sample_models/` | Bellinge sample models + `Bellinge2.tif` DEM |
| `public/vendor/triangle/` | triangle-wasm loader (TriangleWASM wrapper) |
| `public/webgpu/` | WebGPU marcher, split, worker, harness, WGSL |

Everything under `public/` is what `server.py` serves.

## Git-ignored artifacts

> Note: `.tools/` (emsdk + vcpkg), `build/`, `node_modules/`, `public/config.js`, `__pycache__/`, and `public/webgpu/fixtures/` are git-ignored local artifacts (`.gitignore`).
