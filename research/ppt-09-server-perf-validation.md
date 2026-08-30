# PPT-09 — Validation: is a hosted server faster than the in-browser WASM engine?

Measured answer to the question *"will running the OpenSWMM engine on a hosted server
(native processes, one per core) be faster than the current in-browser WASM engine?"*

Domain terms follow `CONTEXT.md` (corrida, pool de workers del motor, EngineClient,
Modo local / Modo API). This brief extends `research/ppt-08-server-migration.md` and
`research/ppt-03-emscripten-compile-proscons.md`, which cover the architecture and the
WASM-vs-native tradeoffs; this file adds **measured wall-clock numbers**.

---

## 1. TL;DR

**Moving the engine to a hosted server does NOT make a single corrida faster if the server
runs the same WASM binary.** Measured on the Bellinge model, a dedicated Node process (the
server-process proxy) and the in-browser Web Worker run the same 1D workload at the **same
wall time** (~14.4 s vs ~14.9 s for the full 8 h Bellinge 1D model). They are the same
compiled code, single-threaded.

The server wins only through the factors the pool adds, none of which the proxy test
exercises:

1. **A native build** — the shipped wasm is `wasm32` **scalar** (`OPENSWMM_FORCE_SCALAR=ON`,
   no SIMD; `scripts/build-openswmm2d.sh:48`) with OpenMP mapped to Emscripten pthreads. A
   native x86 build gets full AVX/FMA + real OpenMP threads at near-zero overhead.
2. **Stronger hardware** — the browser path is bounded by the *user's* machine; a server
   pool is centralized.
3. **Concurrency** — one process per core runs many corridas in parallel; a single run's
   wall time doesn't change, aggregate throughput does.

Measured threading evidence in this brief: the same 2D-coupled model ran **72.4 s**
single-threaded (Node scalar) vs **52.2 s** in-browser with `THREADS 2` (Emscripten
pthreads) — a ~1.4× speedup that native OpenMP would achieve with far less overhead and
scale to more cores.

**Recommendation: proceed with the server migration, but only if it pairs the pool with a
native build (or better hardware). Running the wasm binary server-side is not faster by
itself.**

---

## 2. Method

"Faster" is wall-clock time of a full corrida. To isolate the execution-environment factor
from the code factor, the **same engine workload** was run two ways on the **same machine**
(this dev box, Node v26.7.0, headless Chrome):

| Run | Engine | Environment | Model |
|---|---|---|---|
| A | wasm, **scalar** build | dedicated **Node process** (server-process proxy) | Bellinge 1D, 8 h |
| B | wasm, threaded build (`THREADS 1`) | in-browser **Web Worker** (`simWorker.js`) | Bellinge 1D, 8 h |
| C | wasm, scalar build | dedicated **Node process** | Bellinge full (2D-coupled), 8 h |
| D | wasm, threaded build (`THREADS 2`) | in-browser **Web Worker** (`simWorker.js`) | Bellinge full (2D-coupled), 8 h |

Model sources: `scripts/verify-out/bellinge-8h.inp` (website worktree) and a derived
1D-only variant with the `[2D_*]` sections stripped and `THREADS` forced to 1
(`research/ppt-08-server-migration.md` documents that the 1D dynamic wave is the wall-time
bottleneck, so the 1D-only case is the common one).

### Tooling note (why a scalar build was needed)

The shipped wasm is built with `-pthread` + `PTHREAD_POOL_SIZE=4`
(`cmake/wasm/CMakeLists.txt:44-54`). Emscripten's threaded build **pre-spawns a pthread
worker pool at glue init**, which needs a real worker script file — it cannot run in a
plain Node process (`ReferenceError: Worker is not defined`). This is the documented
"browser-only" limitation (`docs/how-to/03-build-from-source.md:56`). To get a
Node-runnable binary, `cmake/wasm/CMakeLists.txt` was extended with
`option(OPENSWMM_WASM_THREADED ...)` (default ON) so `-pthread`/`PTHREAD_POOL_SIZE` are
omitted when it is OFF; the scalar build is configured with OpenMP disabled
(`CMAKE_DISABLE_FIND_PACKAGE_OpenMP=TRUE`) and outputs to a build-local dir. This is the
same "non-threaded build" the Node reference harnesses already required, now first-class.

### Harnesses

- Node: `node scripts/probe-1d.mjs`-style loop — `stride(engine,1)` until the sim ends,
  timing the whole 8 h run. (Harness: `/tmp/opencode/probe-node.mjs`.)
- Browser: CDP harness that loads the app (`http://127.0.0.1:8080/`, COOP/COEP served by
  `server.py`), creates the real `simWorker.js` worker, posts `{type:'run', inpText}` and
  polls for `done`. (Harness: `/tmp/opencode/bench-browser-1d.mjs`.)
- Threading: same CDP approach against `openSwmm2dWorker.js` at `THREADS 1` vs `4`
  (`/tmp/opencode/bench-browser-2d.mjs`).

---

## 3. Results (wall time, one full corrida each)

| Case | Wall time |
|---|---|
| **A.** 1D-only, 8 h — Node scalar process | **14.4 s** (14 374 / 14 458 ms, two runs) |
| **B.** 1D-only, 8 h — in-browser worker, `THREADS 1` | **14.9 s** (14 901 ms) |
| **C.** Full 2D-coupled, 8 h — Node scalar process | **72.4 s** (72 391 ms) |
| **D.** Full 2D-coupled, 8 h — in-browser worker, `THREADS 2` | **52.2 s** (52 219 ms) |
| **E.** 1D-only, 8 h — **native** build, `THREADS 1` | **12.0 / 12.6 s** (11 967 / 12 627 ms) |
| **F.** 1D-only, 8 h — **native** build, `THREADS 2` | **10.8 s** (10 825 ms) |
| **G.** 1D-only, 8 h — **native** build, `THREADS 4` | **11.8 s** (11 844 ms) |

The native build (`cmake -S third_party/openswmm-engine`, OpenMP 5.2, LTO, SIMD on, 2D off)
runs the same `stride` loop through the same C API as the wasm probe
(`/tmp/opencode/probe-native.cpp`), same model, same 18 913 routing steps.

Immediate reads:

- **A ≈ B.** A dedicated server process and a browser Web Worker run the same 1D wasm at
  the same speed on equal hardware. The execution environment is not a factor; the compute
  is.
- **E vs A: native is only ~1.2× the wasm for the 1D wave** (14.4 s → 12.0 s). The 1D
  dynamic-wave solver does not vectorize — it is a serial, node-link-coupled implicit
  solve, so SIMD/LTO/native codegen buy little. (The wasm is already `-O3`, though scalar.)
- **F/G: native OpenMP threads barely help the 1D wave** (1→2 threads ≈ 1.1×; 4 threads no
  better than 1). The engine's OpenMP parallel loops are in the *2D explicit solver*, not
  the 1D wave. The 1D bottleneck is algorithmically serial.
- **C → D.** `THREADS 2` (OpenMP → Emscripten pthreads) cut a 2D-coupled run from 72.4 s
  to 52.2 s (~1.4×) in the browser — the 2D mesh is the parallelizable part, and native
  OpenMP gives that same parallelism at lower overhead and more cores.
- **1D dominates.** The 2D-coupled 8 h run (72.4 s scalar) is ~5× the 1D-only 8 h run
  (14.4 s) — consistent with the docs' "the 1D dynamic wave is ~90 % of wall time in both
  backends" (`docs/explanation/04-two-d-mesh-and-webgpu.md:96`). 2D adds mesh work on top.
- **48 h projection from these numbers**: 1D-only ≈ 72 s native / 86 s wasm; full
  2D-coupled (scalar) ≈ 7 min. (The older "48 h wall time" projection in
  `docs/reference/07-scripts-and-benchmarks.md` was a per-window extrapolation from
  `bench-1d-bellinge.mjs` including its artificial freeze/cplF overhead; the direct
  full-run timings here supersede it.)

**Consequence for "make it faster":** neither a native build nor more cores moves the 1D
wave much. The bottleneck is the algorithm (serial implicit 1D solve). The path to
EPANET-like speed is changing the math — the engine's explicit 1D `FLOW_ROUTING FV` solver
or porting the 1D wave to the WebGPU marcher — not compiling natively.

---

## 4. Why "server" ≠ "faster" (decomposition)

The wall time of one corrida is dominated by engine compute. That compute is identical in
the browser and in a Node server process when the binary is the same. The levers that a
hosted server actually pulls:

1. **Native ISA + compiler.** The wasm build is scalar wasm32 (`OPENSWMM_FORCE_SCALAR=ON`,
   `scripts/build-openswmm2d.sh:48`; "no SIMD on wasm32", `docs/how-to/03-build-from-source.md:47`).
   Native x86-64 with SSE/AVX is the well-known reason Emscripten docs hedge wasm as
   "often close to native" rather than equal
   (`https://emscripten.org/docs/optimizing/Optimizing-Code.html`). For a compute-bound
   float-heavy solver this is the biggest single uplift available.
2. **Real OpenMP.** In-browser, OpenMP is emulated with Emscripten pthreads on a
   `SharedArrayBuffer` behind COOP/COEP, capped by `PTHREAD_POOL_SIZE=4`, and models must
   opt in with `THREADS` (`cmake/wasm/CMakeLists.txt:44-54`; `docs/how-to/05-deploy.md:5`).
   Natively it is real threads, no caps, no isolation ceremony
   (`research/ppt-03-emscripten-compile-proscons.md`, §D.2.1).
3. **Hardware.** Browser = user's laptop/phone, thermal + one tab. Server = chosen box,
   N cores, no throttle.
4. **Throughput, not latency.** The pool runs corridas concurrently (one process per core,
   `CONTEXT.md:11-13`). N users or N queued corridas complete in parallel. Single-run
   latency is unchanged by the pool itself.

The counter-factor — **network** — is negligible for these payloads:

- Results download for the 8 h 1D run: `.out` = **1.17 MB**, `.rpt` = 500 KB
  (measured in the browser harness `outSize`/`rptSize`). A 48 h model scales ~linearly:
  ≈ 7 MB. At even 50 Mbps that is ~1 s of transfer vs minutes of compute.
- Input upload: the `.inp` text for Bellinge is ~2.9 MB (`public/webgpu/fixtures/bellinge.inp`),
  plus a `.2dm` mesh for 2D. Same order — seconds at worst on WAN.
- The 2D **frames** are the one payload that can balloon (`research/ppt-08-server-migration.md:4.3`
  estimates ~350 MB for a 48 h model if every frame is kept). That is a results-format
  decision (decimate, f32, stream), not a reason to avoid the server.

---

## 5. Verdict and what "faster" requires

| Scenario | Is the hosted server faster? | Why |
|---|---|---|
| Same wasm binary, equal hardware, 1 run | **No** (≈ equal) | Measured: 14.4 s vs 14.9 s |
| Native binary, same hardware, 1 run | **Only ~1.2×** | Measured: 12.0 s (1D wave doesn't vectorize) |
| Native + threads (2D-coupled runs) | **Yes, ~1.4×+** | OpenMP helps the 2D mesh, not the 1D wave |
| Better hardware (1D) | **Little** | 1D wave is serial; cores don't help |
| Many concurrent corridas | **Yes** | Pool parallelism (throughput) |

The "native is 1.5–3× faster" hypothesis from §5 did not hold for the 1D wave: it is a
serial, non-vectorizing solve, so native buys ~1.2× and OpenMP threads buy ~nothing. The
remaining big lever is **algorithmic**: the engine's explicit 1D `FLOW_ROUTING FV` solver,
or porting the 1D wave to the WebGPU marcher (as already done for 2D), which turns the
serial implicit solve into a parallelizable local stencil.

### Pre-conditions for proceeding (unchanged from ppt-08)

- Sandbox per worker process (arbitrary `.inp` upload = code execution surface,
  `research/ppt-08-server-migration.md:4.5`).
- Per-corrida resource caps (CPU/memory/wall), result persistence, cancel.
- CORS/auth widened beyond `Access-Control-Allow-Origin: *`
  (`server.py:20-25`).

---

## 6. Artifacts left in the tree by this validation

- `cmake/wasm/CMakeLists.txt` (website worktree): added `OPENSWMM_WASM_THREADED` option
  (default ON) and `OPENSWMM2D_OUTPUT_DIR` cache var — makes the Node-runnable scalar
  build a first-class target. **Keep**; it is the missing capability the Node harnesses
  referenced.
- `/home/nekzoh/Dev/LocalSWMM/build/openswmm2d-wasm-scalar/` (gitignored): the scalar
  wasm used for runs A/C. Rebuildable with:
  `emcmake cmake -S cmake/wasm -B build/openswmm2d-wasm-scalar -G Ninja -DOPENSWMM_WASM_THREADED=OFF -DCMAKE_DISABLE_FIND_PACKAGE_OpenMP=TRUE ...`
- `/home/nekzoh/Dev/LocalSWMM/cmake/wasm/CMakeLists.txt`: a throwaway copy of the wrapper
  so the build could run from the main worktree (website worktree lacks the engine
  submodule + `.tools/`). Safe to delete.
- Harnesses: `/tmp/opencode/probe-node.mjs`, `bench-browser-1d.mjs`, `bench-browser-2d.mjs`
  (temp; the CDP classes come from `scripts/bench-wasm-threads.mjs`).

---

## 7. Citations (primary sources)

- Measured runs: harnesses above; models `scripts/verify-out/bellinge-8h.inp` and the
  derived 1D variant (website worktree).
- `scripts/bench-wasm-threads.mjs` — the browser 2D threaded gate this brief's harnesses
  adapt (in-page `run2d` contract, `THREADS` rewrite).
- `scripts/probe-1d.mjs`, `scripts/bench-1d-bellinge.mjs` — Node wasm harness pattern and
  the per-window projection that this brief's full-run timings supersede.
- `public/simWorker.js` — the in-browser 1D worker driven by harness B/D (message contract
  `run` → `done`).
- `public/openSwmm2dWorker.js` — the 2D worker driven by the threading check (`results2d`).
- `scripts/build-openswmm2d.sh:37-58` — threaded build flags, scalar forcing, OpenMP
  detection.
- `cmake/wasm/CMakeLists.txt` (edited) — `-pthread`/`PTHREAD_POOL_SIZE` gating; the
  "browser-only" comment this fix makes accurate.
- `docs/how-to/03-build-from-source.md:56` — "Node reference harness needs a non-threaded
  build" (the constraint this validation hit).
- `docs/explanation/04-two-d-mesh-and-webgpu.md:96` — 1D dynamic wave ≈ 90 % of wall time.
- `research/ppt-08-server-migration.md`, `research/ppt-03-emscripten-compile-proscons.md` —
  prior architecture/performance analysis this brief builds on.
- `CONTEXT.md` — the pool/API/EngineClient plan the validation targets.