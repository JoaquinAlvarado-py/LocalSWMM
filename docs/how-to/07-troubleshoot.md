# How to Troubleshoot Local SWMM

Fix common problems with the map, runs, the WASM build, and the WebGPU path, and learn the known gotchas of this codebase.

## How to fix a blank map / no tiles

- `public/config.js` missing or token empty → create it with a valid `MAPBOX_ACCESS_TOKEN` (see [How to Configure Local SWMM](02-configure.md)).
- Browser blocked by CSP? Check the console for CSP violations against `api.mapbox.com`.

## How to fix "Run" errors immediately with a warning

- Cause: no nodes, no outfall, or **US units with a 2D mesh** (2D is SI-only) — `app.js:1402-1406`.
- Fix: add at least one node and one `OUTFALL`; switch units to SI if a 2D mesh is present.

## How to fix a simulation that fails silently / with engine errors

1. Check the **Run Status** window, then the **Report** tab. For deep diagnostics, the worker dumps the `.rpt` error lines and the first 3000 chars of the INP on failure (`openSwmm2dWorker.js:109-148`).
2. Reproduce in Node: `node scripts/run-engine-marcher.mjs model.inp out.json` prints engine codes (`SWMM_ERR_LIFECYCLE = 6` is the "natural completion" code).

## How to fix a WASM build failing at `PluginFactory.cpp:46: unsupported platform`

- Cause: the submodule was re-pinned without the wasm-compat commit.
- Fix: restore `85e4be38` (see [How to Build the WASM Engine from Source](03-build-from-source.md), section 5) or re-apply the Emscripten no-ops.

## How to fix `Could not find zip` during vcpkg bootstrap

- Cause: missing system `zip`/`unzip`/`tar`.
- Fix: on Arch: `sudo pacman -S zip unzip tar`.

## How to handle a 2D run that falls back to WASM

- Cause: `navigator.gpu` absent or `maxStorageBuffersPerShaderStage < 16` (e.g. Apple Silicon/Metal).
- Fix: none needed — this is expected; the WASM path is the reference.

## How to fix mesh generation failures on huge domains

- The Triangle WASM heap is fixed at 16 MB; the budget caps (`trianglePointBudget=8000`, `autoAreaCap`) kick in automatically. Reduce domain area or minAngle.

## How to fix stale wasm being served

- The server sends `Cache-Control: no-store`, but if you're hosting elsewhere, hard-refresh after rebuilding (`swmm6wasm.js?v=<n>` query params are used at `index.html:790-810`).

## How to fix fixture files missing for WebGPU scripts

- Regenerate: `node scripts/make-marcher-inp.mjs …` / `node scripts/make-marcher-cpl-inp.mjs …` or run `verify-bellinge.mjs` once to populate `scripts/verify-out/`.

## Known gotchas & oddities

1. **README drift:** README Quick Start says `cd SWMM_3D_Web_UI` and `http://localhost:8000`; the actual dir is `LocalSWMM` and the port is `8080`.
2. **Two identical engine binaries** (`openswmm2d.*` and `swmm6wasm.*`) are byte-for-byte copies — keep them in sync (the build script does).
3. **`simWorker` progress messages are dead protocol:** the worker never posts them and `app.js:1275` ignores them; the 1D progress bar is a time-based cosmetic.
4. **`.out` parsing is 1D-only:** the 2D path carries per-frame JS arrays instead and explicitly nulls `App.outData` (`app.js:1443`).
5. **`bench-1d.mjs` carries a stale "probe-1d.mjs" header comment.**
6. **Windows-only hard-coding** in `bench-gpu-coupl.mjs` and `run-webgpu-harness.mjs` (hard-coded Chrome path).
7. **LID layer parameters are parsed but not stored** (`inpParser.js:411-424`) — LID round-trips rely on `rawSections`.
8. **CI `config.js` uses `const CONFIG`** while local configs use `var`; `window.CONFIG` lookups (`app.js:446`) are defensive either way.
9. **The `harness.html` "lessons"** document historical VARIABLE_STEP pinning that was later proven wrong — read the 2026-08-06 entries in `WEBGPU_PLAN.md` before "fixing" anything in `couplingSplit.js`.
10. **Vertex-coupled live head reconstruction** (`stCnt>0`) exists in the WGSL kernel but the split clears stencil pointers — the live path uses the lowest-bed cell head.
11. **NATURAL_NEIGHBOUR rainfall** is not modelled by the marcher (uniform gage mean only).
12. **vcpkg manifest layering:** the engine's own `vcpkg.json` is ignored for the wasm build; only the root manifest applies.
