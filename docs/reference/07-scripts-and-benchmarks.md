# Scripts, Benchmarks & Verification

The suite of testing and verification scripts in `scripts/` — what each does and how to run it.

All run from the repo root with `node scripts/<name>.mjs`. The common pattern: shim `globalThis.self/window`, load `public/swmm6wasm.js`, instantiate `swmm6wasm.wasm` in Node, and wrap the C API with `Module.cwrap`. Several spawn `server.py` + a Chrome instance via CDP.

## Benchmarks & probes (engine in Node)

| Script | Purpose | Usage |
|---|---|---|
| `bench-1d-bellinge.mjs` | Per-stride and per-window benchmark costs on Bellinge model; projects 48 h wall time | no args |
| `bench-1d.mjs` | Bare 1D stride benchmark; JSON output | `node bench-1d.mjs <inp> [--wasm <path>] [--tag <l>] [--keep-vs]` |
| `probe-1d.mjs` | Per-step junction head/depth dump (capped 80 steps) | `node probe-1d.mjs <inp>` |
| `probe-1d-nan.mjs` | Full 48 h 1D run scanning heads/depths/volumes for NaN/Inf anomalies | `node probe-1d-nan.mjs [VS]` |
| `bench-wasm-threads.mjs` | **Threaded-engine benchmark:** runs `simWorker.js` in cross-origin-isolated Chrome at THREADS 1 vs N; reports wall time + bit-identical continuity | `node bench-wasm-threads.mjs [--inp <p>] [--threads 1,4] [--minutes <n>]` |

## Chrome/CDP end-to-end harnesses & unit tests

| Script | Purpose | Port | Usage |
|---|---|---|---|
| `test-network3d.mjs` | Unit test suite for 3D network geometry (polygon generation, link paths, feature mapping) | — | `npm run test:3d` |
| `verify-bellinge.mjs` | **Automated verification gate:** headless Chrome loads the app, loads Bellinge Web, executes the simulation via `simWorker.js`, and verifies output continuity | CDP 9222 | no args; writes `scripts/verify-out/` |
| `verify-1d-split.mjs` | Regression gate for the 1D simulation leg; verifies finite hydraulic heads | — | `node verify-1d-split.mjs <inp> [--wasm <p>] [--tol <%>] [--hours <n>] [--json]` |
| `verify-lchar.mjs` | Characteristic length verification | — | `node verify-lchar.mjs <inp>` |
