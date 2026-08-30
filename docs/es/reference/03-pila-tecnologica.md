# Pila tecnológica

Todas las tecnologías y frameworks del proyecto y su rol — la UI, el renderizado del mapa, los generadores de malla, el motor, el servidor y el tooling.

## Propiedades clave

Del resumen del proyecto:

- **Sin backend.** El único servidor es un servidor trivial de archivos estáticos + endpoint de salud (`server.py`). Sin base de datos, sin paso de build para la UI, sin bundler.
- **Sin framework de UI.** El frontend son ~15.000 líneas de JavaScript sin dependencias (scripts clásicos + IIFEs) que usa Mapbox GL JS como única librería de runtime pesada.
- **Hidráulica embebida en WASM.** El motor OpenSWMM 6.0.0 se cross-compila para `wasm32-emscripten` con dependencias C++ gestionadas por vcpkg (Eigen, HDF5, nlohmann-json, SUNDIALS).
- **Dos backends de simulación.** Una vía de motor WASM (1D + 1D/2D acoplado) y un backend **WebGPU experimental** que reimplementa el solver 2D explícito local-inercial como kernels de cómputo WGSL y lo ejecuta en paralelo al motor WASM.
- **Dos generadores de malla.** Un generador legado basado en `poly2tri` y el pipeline de producción **Shewchuk Triangle WASM** (npm `triangle-wasm`).

## Pila por capa

| Capa | Tecnología | Notas |
|---|---|---|
| Lenguaje (UI) | JavaScript plano (ES2020+, IIFEs) | Sin TypeScript, sin módulos, sin bundler |
| Renderizado del mapa | Mapbox GL JS v3.1.2 (CDN) | Terreno 3D, edificios, fuentes GeoJSON, capas WebGL2 personalizadas |
| Matemática de coordenadas | proj4js 2.9.0 (CDN) | UTM/proyectado → WGS84 al importar |
| Parsers GIS | shpjs 4.0.4, dxf-parser 1.1.2 (CDN) | Importación de Shapefile + DXF |
| Triangulación 2D | poly2tri 1.5.0 (legado) **y** triangle-wasm 1.0.0 (producción, vendorizado) | Port de Shewchuk Triangle |
| Rasters | geotiff 2.1.3 (CDN) | Muestreo de DEM local (GeoTIFF) |
| Motor | OpenSWMM 6.0.0-alpha (C++20) | Compilado con Emscripten 6.x a WASM |
| Deps C++ | eigen3, hdf5, nlohmann-json, sundials | vía vcpkg, triplet wasm32-emscripten |
| Lenguaje (servidor) | Python 3 stdlib (`http.server`) | Cero dependencias |
| Lenguaje (tooling) | Node.js (≥20) | Scripts de bench/verify/harness, `npm` |
| CI / hosting | GitHub Actions → GitHub Pages | Solo deploy estático |

## Dependencias CDN

**Dependencias CDN cargadas por `index.html`** (todas fijadas por versión, restringidas por CSP a `api.mapbox.com`, `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `unpkg.com`, `maps.googleapis.com`): `mapbox-gl-js@3.1.2`, `proj4js@2.9.0`, `shpjs@4.0.4`, `dxf-parser@1.1.2`, `poly2tri@1.5.0`, `geotiff@2.1.3` y (opcionalmente) la Google Maps JS API.
