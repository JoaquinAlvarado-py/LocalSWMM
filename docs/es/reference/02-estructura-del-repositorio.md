# Estructura del repositorio

El árbol de código completo de `LocalSWMM` — cada ruta y su rol, desde la raíz del repo hasta el directorio `public/` servido.

## Árbol de directorios

```
LocalSWMM/
├── README.md                     # Readme orientado al usuario (Quick Start, uso de herramientas)
├── WEBGPU_PLAN.md                # Roadmap del backend WebGPU (español) + estado
├── server.py                     # Servidor de desarrollo local estático + API (puerto 8080)
├── package.json / package-lock   # Scripts de npm + devDependency de triangle-wasm
├── vcpkg.json                    # Manifiesto de dependencias C++ para el build WASM
├── vcpkg-triplets/
│   └── wasm32-emscripten.cmake   # Triplet de overlay de vcpkg para Emscripten
├── cmake/
│   ├── OpenSwmm2DWasm.cmake      # (hermano legado, no usado por los scripts de build)
│   └── wasm/CMakeLists.txt       # Wrapper ACTIVO que embebe el motor + el target wasm
├── wasm/
│   └── openswmm2d_exports.cpp    # TU solo-fuente que expone la API C a Emscripten
├── scripts/
│   ├── build-openswmm2d.sh       # Build WASM para Linux/macOS (emcmake + vcpkg)
│   ├── build-openswmm2d.ps1      # Build WASM para Windows
│   └── *.mjs                     # 15 scripts de bench/probe/verify/harness (ver §15)
├── third_party/
│   └── openswmm-engine/          # GIT SUBMODULE — el motor C++ de OpenSWMM
├── assets/                       # demo.mp4
├── wasm-build.log                # Registro histórico de build en Windows (solo referencia)
├── .github/workflows/static.yml  # Deploy de GitHub Pages (sin build wasm en CI)
└── public/                       # <-- todo lo que sirve server.py
    ├── index.html                # Shell SPA (toolbar, paleta, mapa, paneles, modales)
    ├── config.js                 # GITIGNORED — claves de API (Mapbox, etc.)
    ├── *.js                      # ~47 módulos de la app (~15k líneas), scripts planos
    ├── openswmm2d.js / .wasm     # Build del motor (factory createOpenSwmm2D)
    ├── swmm6wasm.js / .wasm      # Copias byte a byte de openswmm2d.* (nombre legado)
    ├── openswmm2d.version.json   # Sello del commit del motor (escrito por el script de build)
    ├── swmm6wasm.version.json    # Mismo sello (archivo gemelo)
    ├── sample_models/            # Modelos de ejemplo Bellinge + DEM Bellinge2.tif
    ├── vendor/triangle/          # Loader de triangle-wasm (wrapper TriangleWASM)
    └── webgpu/                   # Marchante WebGPU, split, worker, harness, WGSL
```

## Índice de entradas

| Ruta | Rol |
|---|---|
| `README.md` | Readme orientado al usuario (Quick Start, uso de herramientas) |
| `WEBGPU_PLAN.md` | Roadmap del backend WebGPU (español) + estado |
| `server.py` | Servidor de desarrollo local estático + API (puerto 8080) |
| `package.json` / `package-lock` | Scripts de npm + devDependency de triangle-wasm |
| `vcpkg.json` | Manifiesto de dependencias C++ para el build WASM |
| `vcpkg-triplets/wasm32-emscripten.cmake` | Triplet de overlay de vcpkg para Emscripten |
| `cmake/OpenSwmm2DWasm.cmake` | Hermano legado, no usado por los scripts de build |
| `cmake/wasm/CMakeLists.txt` | Wrapper ACTIVO que embebe el motor + el target wasm |
| `wasm/openswmm2d_exports.cpp` | TU solo-fuente que expone la API C a Emscripten |
| `scripts/build-openswmm2d.sh` | Build WASM para Linux/macOS (emcmake + vcpkg) |
| `scripts/build-openswmm2d.ps1` | Build WASM para Windows |
| `scripts/*.mjs` | 15 scripts de bench/probe/verify/harness |
| `third_party/openswmm-engine/` | GIT SUBMODULE — el motor C++ de OpenSWMM |
| `assets/` | demo.mp4 |
| `wasm-build.log` | Registro histórico de build en Windows (solo referencia) |
| `.github/workflows/static.yml` | Deploy de GitHub Pages (sin build wasm en CI) |
| `public/index.html` | Shell SPA (toolbar, paleta, mapa, paneles, modales) |
| `public/config.js` | GITIGNORED — claves de API (Mapbox, etc.) |
| `public/*.js` | ~47 módulos de la app (~15k líneas), scripts planos |
| `public/openswmm2d.js` / `.wasm` | Build del motor (factory `createOpenSwmm2D`) |
| `public/swmm6wasm.js` / `.wasm` | Copias byte a byte de `openswmm2d.*` (nombre legado) |
| `public/openswmm2d.version.json` | Sello del commit del motor (escrito por el script de build) |
| `public/swmm6wasm.version.json` | Mismo sello (archivo gemelo) |
| `public/sample_models/` | Modelos de ejemplo Bellinge + DEM `Bellinge2.tif` |
| `public/vendor/triangle/` | Loader de triangle-wasm (wrapper TriangleWASM) |
| `public/webgpu/` | Marchante WebGPU, split, worker, harness, WGSL |

Todo lo que está bajo `public/` es lo que sirve `server.py`.

## Artefactos ignorados por git

> Nota: `.tools/` (emsdk + vcpkg), `build/`, `node_modules/`, `public/config.js`, `__pycache__/` y `public/webgpu/fixtures/` son artefactos locales ignorados por git (`.gitignore`).
