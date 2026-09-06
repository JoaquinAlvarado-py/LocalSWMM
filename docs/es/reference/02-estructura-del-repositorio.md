# Estructura del repositorio

El árbol de código completo de `LocalSWMM` — cada ruta y su rol, desde la raíz del repo hasta el directorio `public/` servido.

## Árbol de directorios

```
LocalSWMM/
├── README.md                     # Readme orientado al usuario (Quick Start, uso de herramientas)
├── CONTEXT.md                    # Glosario de dominio y referencias técnicas
├── server.py                     # Servidor de desarrollo local estático + API (puerto 8080)
├── wrangler.toml                 # Configuración de despliegue en Cloudflare Pages
├── package.json / package-lock   # Scripts de npm para documentación y pruebas
├── vcpkg.json                    # Manifiesto de dependencias C++ para el build WASM
├── vcpkg-triplets/
│   └── wasm32-emscripten.cmake   # Triplet de overlay de vcpkg para Emscripten
├── cmake/
│   └── wasm/CMakeLists.txt       # Wrapper ACTIVO que embebe el motor + target wasm
├── scripts/
│   └── *.mjs                     # Scripts de prueba, benchmark y verificación
├── third_party/
│   └── openswmm-engine/          # Submódulo git — el motor C++ de OpenSWMM
├── assets/                       # Recursos multimedia (demo.mp4)
├── wasm-build.log                # Registro histórico de build en Windows (solo referencia)
├── .github/workflows/
│   ├── cloudflare.yml            # Despliegue automatizado de CI/CD en Cloudflare Pages
│   └── static.yml                # Workflow de despliegue en GitHub Pages
└── public/                       # <-- todo lo que sirve server.py
    ├── index.html                # Shell SPA (toolbar, paleta, mapa, paneles, modales)
    ├── config.js                 # Ignorado por git — claves de API en runtime (Mapbox, etc.)
    ├── *.js                      # Módulos de la app (scripts planos, IIFEs)
    ├── swmm6wasm.js / .wasm      # Build del motor WebAssembly cargado por simWorker.js
    ├── swmm6wasm.version.json    # Sello de commit y compilación del motor
    ├── sample_models/            # Modelos de red preconfigurados (Bellinge Web, etc.)
    └── vendor/                   # Librerías de terceros vendorizadas
```

## Índice de entradas

| Ruta | Rol |
|---|---|
| `README.md` | Readme orientado al usuario (Quick Start, uso de herramientas) |
| `CONTEXT.md` | Glosario de dominio y referencias de ingeniería |
| `server.py` | Servidor estático local y endpoint de salud (puerto 8080) |
| `wrangler.toml` | Configuración de despliegue en Cloudflare Pages |
| `package.json` / `package-lock` | Scripts de npm para documentación y suite de pruebas |
| `vcpkg.json` | Manifiesto de dependencias C++ para el build WASM |
| `vcpkg-triplets/wasm32-emscripten.cmake` | Triplet de overlay de vcpkg para Emscripten |
| `cmake/wasm/CMakeLists.txt` | Wrapper de CMake que embebe el motor |
| `scripts/*.mjs` | Scripts de pruebas, benchmark y verificación |
| `third_party/openswmm-engine/` | Submódulo git — el motor C++ de OpenSWMM |
| `assets/` | Video y gráficos (`demo.mp4`) |
| `wasm-build.log` | Registro histórico de build en Windows (solo referencia) |
| `.github/workflows/cloudflare.yml` | Despliegue automatizado de producción en Cloudflare Pages |
| `.github/workflows/static.yml` | Workflow de despliegue estático en GitHub Pages |
| `public/index.html` | Shell SPA (toolbar, paleta, mapa, paneles, modales) |
| `public/config.js` | Ignorado por git — claves de API en runtime (Mapbox, etc.) |
| `public/*.js` | Módulos de la app (~15k líneas, scripts planos envueltos en IIFEs) |
| `public/swmm6wasm.js` / `.wasm` | Binario WebAssembly del motor OpenSWMM |
| `public/swmm6wasm.version.json` | Timestamp y commit de compilación del motor |
| `public/sample_models/` | Modelos de red preconfigurados (Bellinge Web) |

## Artefactos ignorados por git

> Nota: `.tools/` (emsdk + vcpkg), `build/`, `node_modules/`, `public/config.js` y `__pycache__/` son artefactos locales ignorados por git (`.gitignore`).
