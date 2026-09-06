# How to Troubleshoot Local SWMM

Fix common problems with the map, simulations, the WASM build, and learn the known gotchas of this codebase.

## How to fix a blank map / no tiles

- `public/config.js` missing or token empty → create it with a valid `MAPBOX_ACCESS_TOKEN` (see [How to Configure Local SWMM](02-configure.md)).
- Browser blocked by CSP? Check the console for CSP violations against `api.mapbox.com`.

## How to fix "Run" errors immediately with a warning

- Cause: no nodes or no outfall in the model.
- Fix: add at least one node and one `OUTFALL` connected to the network.

## How to fix a simulation that fails silently / with engine errors

1. Check the **Run Status** window, then the **Report** tab. For deep diagnostics, the worker dumps the `.rpt` error lines and the first 3000 characters of the INP on failure (`simWorker.js`).
2. Reproduce in Node: `node scripts/bench-1d.mjs model.inp` prints engine error codes (`SWMM_ERR_LIFECYCLE = 6` is the normal completion code).

## How to fix a WASM build failing at `PluginFactory.cpp:46: unsupported platform`

- Cause: the submodule was re-pinned without the wasm-compat commit.
- Fix: restore `85e4be38` (see [How to Build the WASM Engine from Source](03-build-from-source.md), section 5) or re-apply the Emscripten no-ops.

## How to fix `Could not find zip` during vcpkg bootstrap

- Cause: missing system `zip`/`unzip`/`tar`.
- Fix: on Arch Linux: `sudo pacman -S zip unzip tar`; on Debian/Ubuntu: `sudo apt install zip unzip tar`.

## How to fix stale wasm being served

- The server sends `Cache-Control: no-store`, but if you're hosting elsewhere, hard-refresh after rebuilding (`swmm6wasm.js?v=<n>` query params are used in `index.html`).

## Known gotchas & oddities

1. **README drift:** README Quick Start historically referenced `cd SWMM_3D_Web_UI` and `http://localhost:8000`; the directory is `LocalSWMM` and the server port is `8080`.
2. **Engine binary naming:** The active WebAssembly engine is delivered via `swmm6wasm.js` and `swmm6wasm.wasm`, loaded by `simWorker.js`.
3. **`simWorker` progress messages:** The worker completes calculations asynchronously in stride loops; the progress bar provides visual feedback during computation.
4. **Binary output parsing:** `swmmOutParser.js` parses `.out` binary files for performance, with `.rpt` parsing providing summary table fallbacks.
5. **`bench-1d.mjs` comment:** `bench-1d.mjs` carries a legacy header comment referring to `probe-1d.mjs`.
6. **LID layer parameters:** LID layer parameters are parsed into `rawSections` (`inpParser.js`) so that round-trips preserve the model configuration accurately.
7. **Config declarations:** CI `config.js` uses `const CONFIG` while local configs use `var`; `window.CONFIG` lookups are defensive either way.
8. **vcpkg manifest layering:** The engine's own `vcpkg.json` is ignored for the WASM build; only the root manifest applies.
