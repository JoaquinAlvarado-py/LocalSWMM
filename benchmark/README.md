# LocalSWMM WASM Engine Benchmark — 1729-SWMM5-Models

Headless benchmark of the LocalSWMM WebAssembly engine
(`public/swmm6wasm.wasm`, HydroCouple OpenSWMM `v6.0.0-alpha.3-3-gec280d2c`)
against the public regression suite at
[SWMMEnablement/1729-SWMM5-Models](https://github.com/SWMMEnablement/1729-SWMM5-Models)
(1,646 `.inp` models across 22 test folders).

## Layout

```
benchmark/
├── models/                  # sparse blob-filtered clone (*.inp, *.dat, *.txt) — gitignored
├── results/                 # machine-readable outputs — gitignored
│   ├── footprint.json       # per-model static analysis (element counts, size estimates)
│   ├── footprint.csv        # same, as CSV
│   ├── runs-t1.jsonl        # one JSON line per executed model, THREADS=1
│   ├── runs-t4.jsonl        # same, THREADS=4
│   └── benchmark-report.md  # aggregated disk + ETA report
├── out/                     # .rpt/.out artifacts when running with --save-artifacts — gitignored
├── lib/
│   ├── inp-analyze.mjs      # .inp parser: element counts, timing, .out/.rpt size models
│   ├── worker-shim.mjs      # browser-Worker polyfill for the pthread glue under Node
│   ├── validate-out-size.mjs# validates the .out size formula against real outputs
│   ├── dump-out-header.mjs  # dumps a SWMM binary .out prolog/epilog
│   ├── decode-out-props.mjs # byte-level viewer for the .out properties section
│   ├── calib-analysis.mjs   # ms/step vs elements explorer for the calibration runs
│   ├── probe-engine.mjs     # verbose single-model engine lifecycle probe
│   ├── probe-rpt.mjs        # probe: when the engine writes .rpt content
│   └── probe-worker.mjs     # worker_threads browser-protocol round-trip test
├── estimate-footprint.mjs   # walks models/, writes results/footprint.{json,csv}
├── run-bench.mjs            # executes models through the wasm engine
└── summarize.mjs            # aggregates results/ into benchmark-report.md
```

## Usage

```bash
# 1. static inventory + size estimates (no engine needed)
node benchmark/estimate-footprint.mjs

# 2. run models (add SHIM_DEBUG=1 to see pthread worker spawns)
node benchmark/run-bench.mjs --threads 4 --sample 24     # stratified sample
node benchmark/run-bench.mjs --threads 1 --all           # everything runnable
node benchmark/run-bench.mjs --threads 4 --filter NCIMM --limit 5
node benchmark/run-bench.mjs --list                      # show selection, don't run
node benchmark/run-bench.mjs --threads 1 --save-artifacts ...  # keep .rpt/.out in out/

# 3. aggregate into results/benchmark-report.md
node benchmark/summarize.mjs --threads 4
```

### run-bench.mjs options

| flag | default | meaning |
|---|---|---|
| `--threads N` | 4 | `THREADS` value injected into `[OPTIONS]` (engine dynamic-wave OpenMP threads) |
| `--sample N` | – | stratified sample across the compute-load distribution |
| `--all` | – | run every runnable model |
| `--filter SUB` | – | only models whose path contains SUB |
| `--limit N` | – | cap the selection |
| `--list` | – | print the selection and exit |
| `--save-artifacts` | off | dump each run's `.rpt`/`.out` into `benchmark/out/` |
| `--max-out-bytes N` | 1.5 GiB | skip models whose estimated `.out` exceeds N (wasm memory guard) |

Each model runs exactly the way the app runs simulations
(`public/simWorker.js`): fresh engine instance, `.inp` written into the
virtual FS, `swmm_engine_open → initialize → start → stride(10⁷) → end →
report → close`. Wall time, `.rpt`/`.out` sizes and report diagnostics are
appended to `results/runs-tN.jsonl`.

## How the models are fetched

```
git clone --filter=blob:none --no-checkout --depth 1 \
    https://github.com/SWMMEnablement/1729-SWMM5-Models.git models
cd models
git sparse-checkout set --no-cone '*.inp' '*.dat' '*.txt'
git checkout main
```

That downloads only the models and their auxiliary rainfall/time-series files
(~2 GiB) and skips the ~1.6 GiB of XPSWMM packages and pre-computed outputs
in the upstream repo.

## What the .out size estimate is

`lib/inp-analyze.mjs` computes the exact size of the SWMM binary output file
from the input alone:

```
size = 28 (header) + IDs + 16·Np + props + trailer + 24 (closing record)
       + periods · (8 + 4 · (Ns·(8+Np) + Nn·(6+Np) + Nl·(5+Np) + 15))
```

The per-period term is **byte-exact** (validated against real SWMM v5.2.4
outputs to the byte); the per-object property block depends on node/link
*type* as stored by the engine, so `lib/inp-analyze.mjs` uses a least-squares
fit (residual error < 0.01 % of any real file). Validation:

```
node benchmark/lib/validate-out-size.mjs
```

## Engine threading (THREADS option)

The engine parallelises **dynamic-wave routing with OpenMP**
(`#pragma omp parallel num_threads(NumThreads)` in `dynwave.c`), which
Emscripten compiles to its pthread runtime — hence the `shared: true` memory
in the build and the COOP/COEP cross-origin isolation the app requires.

Two engine rules (from `statsrpt.c` / `project.c`):

- `NumThreads = min(THREADS, omp_get_max_threads())`
- `if (Nobjects[LINK] < 4 * NumThreads) NumThreads = 1` — a 4-thread run
  needs ≥ 16 links; smaller networks run single-threaded no matter what.

The engine writes `Number of Threads ........ N` into the `.rpt`; the
benchmark captures that line to verify threading actually engaged.

Because the glue is a browser-pthread build without a Node path, running
with `THREADS > 1` under Node uses `lib/worker-shim.mjs`: a `worker_threads`
polyfill of the browser Worker protocol (`em-pthread` named workers bridged
over `SharedArrayBuffer`). THREADS=1 runs don't need the shim.

## Known constraints found while building this benchmark

- **wasm32 memory ceiling** — the build uses
  `WebAssembly.Memory({initial: 128 MiB, maximum: 2 GiB, shared: true})`
  with in-heap MEMFS. Models whose `.out` approaches ~2 GiB (plus engine
  state) cannot run: the `--max-out-bytes` guard skips them. 15 of the 24
  sampled stratification steps hit models above the guard.
- Models without `[OPTIONS] END_DATE` (14) fail with `SWMM_ERR_PARSE` (5);
  some models fail `start` with `SWMM_ERR_IO` (11) — both recorded in the
  results JSONL.
- **OpenSWMM 6 writes only `[REPORT]`-selected objects to `.out`** (a
  deviation from SWMM 5.2.4, which always wrote everything). Models with
  `NODES <id list>` / `LINKS <id list>` in `[REPORT]` produce much smaller
  outputs than a naive count of all objects suggests — the analyzer models
  this (`lib/inp-analyze.mjs`).
- The v6 `.out` prolog deviates from SWMM 5.2.4 (different variable-count
  records, extra bytes before results); the size model in
  `lib/inp-analyze.mjs` is fitted to real v6-engine outputs — mean error
  ~5 % on completed runs (the residual is dominated by subcatchment-heavy
  models, where the engine's internal subcatchment splitting adds objects).
- The v6 report has no per-step counter (the old "Total Internal Step" line
  is gone); compute calibration therefore uses statically-predicted routing
  steps with a measured correction-factor distribution.
- `estimate-footprint.mjs` treats a bare `REPORT_STEP` number as seconds;
  models relying on hour-only parsing may deviate (visible as `.out`
  actual-vs-estimate deltas in the report).
- Thread benchmarking is timing-sensitive: the first THREADS=4 sample was
  polluted by OneDrive sync load from the fresh clone (one model read 13x
  slower); contested numbers are re-run before being trusted.
