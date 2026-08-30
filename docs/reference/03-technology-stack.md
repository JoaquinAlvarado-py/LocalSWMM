# Technology Stack

Every technology and framework in the project and its role — the UI, the map rendering, the meshers, the engine, the server, and the tooling.

## Key properties

From the project overview:

- **No backend.** The only server is a trivial static-file + health endpoint server (`server.py`). No database, no build step for the UI, no bundler.
- **No UI framework.** The frontend is ~15,000 lines of dependency-free JavaScript (classic scripts + IIFEs) using Mapbox GL JS as the only heavyweight runtime library.
- **WASM-embedded hydraulics.** The OpenSWMM 6.0.0 engine is cross-compiled for `wasm32-emscripten` with vcpkg-managed C++ dependencies (Eigen, HDF5, nlohmann-json, SUNDIALS).
- **Two simulation backends.** A WASM engine path (1D + 1D/2D coupled) and an **experimental WebGPU** backend that re-implements the 2D explicit local-inertial solver as WGSL compute kernels and runs it in parallel to the WASM engine.
- **Two mesh generators.** A legacy `poly2tri`-based generator and the production **Shewchuk Triangle WASM** (npm `triangle-wasm`) pipeline.

## Stack by layer

| Layer | Technology | Notes |
|---|---|---|
| Language (UI) | Plain JavaScript (ES2020+, IIFEs) | No TypeScript, no modules, no bundler |
| Map rendering | Mapbox GL JS v3.1.2 (CDN) | 3D terrain, buildings, GeoJSON sources, custom WebGL2 layers |
| Coordinate math | proj4js 2.9.0 (CDN) | UTM/projected → WGS84 on import |
| GIS parsers | shpjs 4.0.4, dxf-parser 1.1.2 (CDN) | Shapefile + DXF import |
| 2D triangulation | poly2tri 1.5.0 (legacy) **and** triangle-wasm 1.0.0 (production, vendored) | Shewchuk Triangle port |
| Rasters | geotiff 2.1.3 (CDN) | Local DEM (GeoTIFF) sampling |
| Engine | OpenSWMM 6.0.0-alpha (C++20) | Compiled with Emscripten 6.x to WASM |
| C++ deps | eigen3, hdf5, nlohmann-json, sundials | via vcpkg, wasm32-emscripten triplet |
| Language (server) | Python 3 stdlib (`http.server`) | Zero dependencies |
| Language (tooling) | Node.js (≥20) | Bench/verify/harness scripts, `npm` |
| CI / hosting | GitHub Actions → GitHub Pages | Static deploy only |

## CDN dependencies

**CDN dependencies loaded by `index.html`** (all pinned, CSP-restricted to `api.mapbox.com`, `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `unpkg.com`, `maps.googleapis.com`): `mapbox-gl-js@3.1.2`, `proj4js@2.9.0`, `shpjs@4.0.4`, `dxf-parser@1.1.2`, `poly2tri@1.5.0`, `geotiff@2.1.3`, and (optionally) the Google Maps JS API.
