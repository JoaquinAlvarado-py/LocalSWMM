# Engine modifications

The modifications LocalSWMM makes to the HydroCouple OpenSWMM engine: new formulations, new options, and changed defaults.

1. [Introduction & rewrite](01-introduction-and-rewrite) — context and the architectural rewrite as the base.
2. [Semi-implicit node continuity](02-semi-implicit-node-continuity) — the `NODE_CONTINUITY` formulation.
3. [Anderson acceleration](03-anderson-acceleration) — accelerating the Picard cycle (`ANDERSON_ACCEL`).
4. [Dynamic Preissmann slot](04-dynamic-preissmann-slot) — dynamic vs static slot.
5. [Virtual junctions](05-virtual-junctions) — the `[VIRTUAL_JUNCTIONS]` option.
6. [Finite-volume routing](06-finite-volume-routing) — explicit 1D FV (`FLOW_ROUTING FV`).
7. [2D module & coupling](07-2d-module-and-coupling) — the 2D module and 1D–2D coupling.
8. [RDII decay](08-rdii-decay) — the `[RDII_DECAY]` option.
9. [Behavior changes](09-behavior-changes) — new defaults and platform changes.

The new engine options are summarized in the [Engine options reference](../../reference/01-engine-options).
