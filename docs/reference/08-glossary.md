# Glossary

Alphabetical list of the project's terms and their meanings. Merges the engineering-manual glossary with the domain glossary of `CONTEXT.md`; where the domain glossary defines a term in Spanish, the Spanish term is kept in parentheses.

## 1D / 2D

Pipe/network model vs. overland surface-routing mesh model.

## CD / coupling

Flow coefficient / 1D↔2D exchange coefficient (default 0.65).

## CDT

Constrained Delaunay Triangulation.

## CFL

Courant–Friedrichs–Lewy stability condition.

## cplF / cplS

Coupling float/state buffers between the WASM 1D engine and the GPU 2D marcher.

## EngineClient

Seam of the frontend between the UI and the engine, with two switchable implementations: local (WASM in the browser) and remote (via API).
_Avoid_: engine module, engine wrapper.

## Engine worker pool (Pool de workers del motor)

Set of native processes on the server that execute runs, one per core, taking work from a queue.
_Avoid_: thread, except OpenMP inside a worker.

## feature-state

Mapbox GL JS per-feature mutable styling state.

## Indexed mesh

`Net.mesh2DIndexed`: the canonical Triangle-engine mesh output.

## INP

SWMM input text file (`.inp`); the model serialization consumed by the engine.

## Local mode / API mode (Modo local / Modo API)

The two execution paths of the EngineClient: WASM engine in the browser (offline) vs engine on the server via API (default).

## LTS

Local Time Stepping — the 2D solver's tiered substep scheme.

## M0–M5

WebGPU milestone phases in `WEBGPU_PLAN.md`.

## MEMFS

Emscripten's in-memory virtual filesystem (`.inp`/`.rpt`/`.out` live there).

## OpenSWMM

The C++20 re-implementation used here (HydroCouple); MIT-licensed.

## PSLG

Planar Straight-Line Graph — the constrained triangulation input to Triangle.

## PSLC

Planar Straight-Line **Cell** graph (the mesh2dPslg module's term).

## RPT / OUT

Engine text report / binary results files.

## Run (Corrida)

A complete execution of a simulation model (1D+2D) with lifecycle: queued → running → finished (or failed). It is identified by an ID and is what the user triggers with Run.
_Avoid_: job, run, simulation (the simulation is the modeled phenomenon; the run is the execution).

## Run progress (Progreso de corrida)

Live state of a run: sim-time reached, fraction of the total, phase. Queryable by ID; it is what paints the Run Status UI.

## Run results (Resultados de corrida)

Finished product of a run: JSON tables (1D series per node/link/subcatchment and 2D frames captured live) plus the binary `.out` and `.rpt` files for export.

## SWMM

EPA Storm Water Management Model; the hydrology/hydraulics reference.

## System status (Estado del sistema)

Aggregated health endpoint: app version, worker pool state, active runs. Queryable for scripts, CI and debugging.
_Avoid_: health endpoint, run status (that is the progress of a specific run).

## Triangle

Shewchuk's Delaunay triangulator; here compiled to WASM (`triangle-wasm`).

## WASM / Emscripten

WebAssembly + the LLVM toolchain that compiles C++ to it.
