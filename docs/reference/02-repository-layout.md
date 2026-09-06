# Repository Layout

The complete source tree of `LocalSWMM` — every path and its role, from the repo root down to the served `public/` directory.

## Directory tree

```
LocalSWMM/
├── README.md                     # User-facing readme (Quick Start, tool usage)
├── CONTEXT.md                    # Domain glossary and technical references
├── server.py                     # Local static + API dev server (port 8080)
├── wrangler.toml                 # Cloudflare Pages deployment configuration
├── package.json / package-lock   # npm scripts for documentation and tests
├── vcpkg.json                    # C++ deps manifest for the WASM build
├── vcpkg-triplets/
│   └── wasm32-emscripten.cmake   # vcpkg overlay triplet for Emscripten
├── cmake/
│   └── wasm/CMakeLists.txt       # Active wrapper that embeds the engine + wasm target
├── scripts/
│   └── *.mjs                     # Test, benchmark, and verification scripts
├── third_party/
│   └── openswmm-engine/          # Git submodule — the OpenSWMM C++ engine
├── assets/                       # Media assets (demo.mp4)
├── wasm-build.log                # Historical Windows build record (reference only)
├── .github/workflows/
│   ├── cloudflare.yml            # Cloudflare Pages production CI/CD deployment
│   └── static.yml                # GitHub Pages static deploy workflow
└── public/                       # <-- everything served by server.py
    ├── index.html                # SPA shell (toolbar, palette, map, panels, modals)
    ├── config.js                 # Git-ignored — API keys (Mapbox etc.)
    ├── *.js                      # App modules (plain scripts, IIFEs)
    ├── swmm6wasm.js / .wasm      # WebAssembly engine build loaded by simWorker.js
    ├── swmm6wasm.version.json    # Engine commit and build stamp
    ├── sample_models/            # Sample models (Bellinge Web, etc.)
    └── vendor/                   # Vendored third-party helper libraries
```

## Index of entries

| Path | Role |
|---|---|
| `README.md` | User-facing readme (Quick Start, tool usage) |
| `CONTEXT.md` | Domain glossary and engineering references |
| `server.py` | Local static dev server and health endpoint (port 8080) |
| `wrangler.toml` | Cloudflare Pages deployment configuration |
| `package.json` / `package-lock` | npm scripts for documentation and test suite |
| `vcpkg.json` | C++ deps manifest for the WASM build |
| `vcpkg-triplets/wasm32-emscripten.cmake` | vcpkg overlay triplet for Emscripten |
| `cmake/wasm/CMakeLists.txt` | Active CMake wrapper that embeds the engine |
| `scripts/*.mjs` | Test, benchmark, and verification scripts |
| `third_party/openswmm-engine/` | Git submodule — the OpenSWMM C++ engine |
| `assets/` | Video and graphic assets (`demo.mp4`) |
| `wasm-build.log` | Historical Windows build record (reference only) |
| `.github/workflows/cloudflare.yml` | Cloudflare Pages automated deployment workflow |
| `.github/workflows/static.yml` | GitHub Pages deployment workflow |
| `public/index.html` | SPA shell (toolbar, palette, map, panels, modals) |
| `public/config.js` | Git-ignored — runtime API keys (Mapbox etc.) |
| `public/*.js` | App modules (~15k lines, plain scripts wrapped in IIFEs) |
| `public/swmm6wasm.js` / `.wasm` | OpenSWMM WebAssembly engine binary |
| `public/swmm6wasm.version.json` | Engine commit and build timestamp |
| `public/sample_models/` | Pre-configured network models (Bellinge Web) |

## Git-ignored artifacts

> Note: `.tools/` (emsdk + vcpkg), `build/`, `node_modules/`, `public/config.js`, and `__pycache__/` are git-ignored local artifacts (`.gitignore`).
