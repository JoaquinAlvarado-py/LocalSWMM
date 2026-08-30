# 1D Hydraulics

The equation-level description of the 1D hydraulic calculation process of the LocalSWMM engine, transcribed from the engine source code. Read in order; later articles build on earlier ones.

1. [Conceptual model](01-conceptual-model) — scope, node–link model, state variables, the four routing formulations.
2. [Model components](02-model-components) — node data, link data, slope and length, conduit lengthening.
3. [Simulation orchestration](03-simulation-orchestration) — the time-stepping loop, runoff and routing clocks, lateral inflows.
4. [Cross-section geometry](04-cross-section-geometry) — the four geometric relations, Manning and the section factor.
5. [Routing formulations](05-routing-formulations) — steady flow and kinematic wave.
6. [Dynamic wave solver](06-dynamic-wave-solver) — St. Venant equations, finite differences, the Picard iteration.
7. [Link momentum kernel](07-link-momentum-kernel) — velocity, Froude number, the six momentum terms, flow limiting.
8. [Node continuity](08-node-continuity) — explicit and semi-implicit updates, flooding and ponding.
9. [Surcharge methods](09-surcharge-methods) — EXTRAN and static/dynamic Preissmann slot.
10. [Structures & boundaries](10-structures-and-boundaries) — pumps, orifices, weirs, outlets, outfalls, dividers.
11. [Stability & time stepping](11-stability-and-time-stepping) — Courant condition, mass balance.
12. [Options & defaults](12-options-and-defaults) — the engine's configuration surface.

The original LaTeX source is [1d_hydraulics.tex](../../sources/1d_hydraulics.tex). A Spanish mirror lives at [Hidráulica 1D](/es/explanation/hidraulica/).
