# Engine modifications

The modifications LocalSWMM makes to the HydroCouple OpenSWMM engine: new formulations, new options, and changed defaults.

1. [Anderson acceleration](03-anderson-acceleration) — accelerating the Picard cycle (`ANDERSON_ACCEL`).
2. [Dynamic Preissmann slot](04-dynamic-preissmann-slot) — dynamic vs static slot.
3. [Virtual junctions](05-virtual-junctions) — the `[VIRTUAL_JUNCTIONS]` option.
4. [Finite-volume routing](06-finite-volume-routing) — explicit 1D FV (`FLOW_ROUTING FV`).
5. [RDII decay](08-rdii-decay) — the `[RDII_DECAY]` option.
6. [Behavior changes](09-behavior-changes) — new defaults and platform changes.

The new engine options are summarized in the [Engine options reference](../../reference/01-engine-options).
