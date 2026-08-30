# Scripts, Benchmarks & Verification

The 15 `.mjs` scripts in `scripts/` plus the two shell build scripts — what each does and how to run it.

All run from the repo root with `node scripts/<name>.mjs`. The common pattern: shim `globalThis.self/window`, load `public/openswmm2d.js`, instantiate `openswmm2d.wasm` synchronously in Node, wrap the C API with `Module.cwrap`. Several spawn `server.py` + a Chrome instance via CDP.

## Benchmarks & probes (engine in Node)

| Script | Purpose | Usage |
|---|---|---|
| `bench-1d-bellinge.mjs` | Per-stride / per-window / freeze / cplF costs on Bellinge; projects 48 h wall time | no args |
| `bench-1d.mjs` | Bare 1D stride benchmark; JSON output | `node bench-1d.mjs <inp> [--wasm <path>] [--tag <l>] [--keep-vs]` |
| `probe-1d.mjs` | Per-step junction head/depth dump (capped 80 steps) | `node probe-1d.mjs <inp>` |
| `probe-1d-coupl.mjs` | Split-like 1D load: `setPondArea` + alternating `setLatInflow`; dt histogram | no args (Bellinge fixture) |
| `probe-1d-nan.mjs` | Full 48 h 1D run scanning heads/depths/volumes for NaN/Inf | `node probe-1d-nan.mjs [VS]` |
| `probe-cpl.mjs` | Per-stride coupling volume deltas from the 10-slot mass-balance buffer | `node probe-cpl.mjs <inp>` |
| `run-engine-marcher.mjs` | Reference 2D run: per-frame depth/head/velocity + node heads + mass balance → JSON. Requires a **non-threaded** wasm build (the threaded build needs a browser) | `node run-engine-marcher.mjs <inp> <out.json> [--frames N] [--interval <sec>] [--wasm <p>]` |
| `bench-wasm-threads.mjs` | **Threaded-engine gate:** runs the production `openSwmm2dWorker.js` in cross-origin-isolated Chrome at THREADS 1 vs N; reports wall time + bit-identical continuity | CDP 9225 | `node bench-wasm-threads.mjs [--inp <p>] [--threads 1,4] [--minutes <n>]` |

## Synthetic input generators

| Script | Purpose | Usage |
|---|---|---|
| `make-marcher-inp.mjs` | M1 closed-basin 2D INP (WALL boundaries, sine-bed) | `node make-marcher-inp.mjs <nx> <ny> <dx> <rainMmHr> <min> <out.inp>` |
| `make-marcher-cpl-inp.mjs` | M2 1D↔2D coupling INP (storage S1 + conduit + outfall, cell 0 coupled) | `node make-marcher-cpl-inp.mjs <out.inp>` |

## Chrome/CDP end-to-end harnesses

| Script | Purpose | Port | Usage |
|---|---|---|---|
| `verify-bellinge.mjs` | **Flagship gate:** headless Chrome loads the app, projects Bellinge to EPSG:25832, auto-loads `Bellinge2.tif`, generates the mesh, runs the whole 48 h model through the app's own worker, asserts frames/depths/mass-balance/continuity | CDP 9222 | no args; writes `scripts/verify-out/` |
| `verify-1d-split.mjs` | Regression gate for the split's 1D leg (uses production `couplingSplit.js`; fails on non-finite coupling heads) | — | `node verify-1d-split.mjs <inp> [--wasm <p>] [--tol <%>] [--hours <n>] [--json]` |
| `test-gpu-worker.mjs` | Drives the production `gpu2dWorker.js` through the app's `run2d` contract in headed Chrome | CDP 9224 | `node test-gpu-worker.mjs [--inp <p>]` |
| `bench-gpu-coupl.mjs` | Per-window GPU split timings (`strideMs/freezeMs/advanceMs/exchMs/dt0/substeps`), extrapolates 48 h wall time | CDP 9225 | `node bench-gpu-coupl.mjs [--windows N] [--lts N] [--cadence N] [--dtfloor N] [--dbgcell N] [--inp <p>]` |
| `run-webgpu-harness.mjs` | Drives `public/webgpu/harness.html` M1/M2 parity + bench in **headed** Chrome (headless has no WebGPU); stages fixtures into `public/webgpu/fixtures/` from `scripts/verify-out/` | CDP 9223 | `node run-webgpu-harness.mjs [fixture…] [--coupled] [--bench] [--lts N] [--hours N]` |
| `test-2d-render.mjs` | Render-pipeline smoke test: velocity arrows, contour bands regression, robust frame-max, WebGL2 shader compile, `display2DResults` finiteness | CDP 9225 | no args |

## Build scripts

| Script | Purpose | Usage |
|---|---|---|
| `build-openswmm2d.sh` | Linux/macOS WASM build (emcmake + vcpkg) | `npm run build:2d-wasm:sh` |
| `build-openswmm2d.ps1` | Windows WASM build | `npm run build:2d-wasm` |

## Fixtures note

> **Note:** `public/webgpu/fixtures/` is **not committed** — the harness scripts generate/stage it from `scripts/verify-out/`. If a fixture is missing, run the generator first (`make-marcher-*.mjs`) or `verify-bellinge.mjs`.
