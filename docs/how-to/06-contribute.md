# How to Contribute (Development Workflow)

Edit the frontend, rebuild and change the WASM engine, and test your changes before committing.

## 1. Normal edit loop (frontend)

```bash
cd ~/LocalSWMM
python3 server.py &            # serves on 8080, no cache
# edit public/*.js, reload http://127.0.0.1:8080
```

## 2. Changing the WASM engine

```bash
# 1. edit the engine (submodule) or your fork, commit it there
cd third_party/openswmm-engine
# ... make changes, commit, push to your fork ...
# 2. point LocalSWMM at the new commit
cd ..
git submodule update --init --recursive   # or update the gitlink
# 3. rebuild
npm run build:2d-wasm:sh
# 4. commit the rebuilt public/*.js/.wasm + version stamps
```

Remember: any re-pin must keep the wasm-compat changes (or carry them forward) or the build breaks — see [How to Build the WASM Engine from Source](03-build-from-source.md), section 5.

## 3. Testing your changes

- Unit-ish checks: `node scripts/probe-1d.mjs`, `node scripts/bench-1d.mjs`.
- End-to-end app gate: `node scripts/verify-bellinge.mjs` (headless Chrome, SwiftShader).
- WebGPU gates: `node scripts/run-webgpu-harness.mjs` and `node scripts/test-gpu-worker.mjs` (need headed Chrome with WebGPU).
- Regression for the split 1D leg: `node scripts/verify-1d-split.mjs`.

See [How to Run the Scripts, Benchmarks & Verification Harnesses](04-scripts-and-benchmarks.md) for full usage of every script.

## 4. Conventions to respect

- **Script load order is the module contract** — add new scripts to `index.html` in dependency order; `ui.js` stays last.
- **Expose modules via `window.*`**; never use `import/export` (no bundler).
- **State stays in `Net`**, view state in `App`; styling goes through Mapbox **feature-state**, not data resends.
- Every mutation must go through the `Net` API so it's recorded in undo history and triggers autosave.
- New UI strings are hardcoded English; units use the `U(si, us)` helper.
- Keep `public/config.js` out of commits (git-ignored); never commit real API keys.
