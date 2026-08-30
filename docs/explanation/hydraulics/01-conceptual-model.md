# The 1D Hydraulic Calculation Process

*of the LocalSWMM project (HydroCouple OpenSWMM engine)*

*Technical Reference Document — August 2026*

<!-- Part of the 1D Hydraulics explanation series -->
<!-- Original LaTeX source: docs/sources/1d_hydraulics.tex -->

*This document provides a complete, equation-level description of the one-dimensional (1D) hydraulic calculation process used by the LocalSWMM web application. All hydraulic computations are executed by the HydroCouple **OpenSWMM** engine, which is compiled to WebAssembly and runs inside the browser. The engine solves the de Saint-Venant equations on a node–link network. Four routing formulations are available: *steady flow*, *kinematic wave*, *dynamic wave* (the default), and an explicit *finite-volume* scheme. This document explains the conceptual model, the governing equations, the finite-difference schemes, the iterative solution procedure, the node-continuity and surcharge algorithms, the computation of non-conduit hydraulic structures, the cross-section geometry functions, boundary conditions, adaptive time stepping, and the mass-balance accounting. Every equation is transcribed from the engine source code (see the References for the file list) and cross-referenced to the engine's Reference Manuals where applicable.*

## Introduction

### Scope

This document covers the *one-dimensional* hydraulic (flow-routing) calculations of the LocalSWMM project. LocalSWMM is a browser-based web application for stormwater and wastewater network modeling; it embeds the HydroCouple OpenSWMM engine (C++) compiled to WebAssembly. The 1D hydraulic component solves unsteady, gradually varied, one-dimensional flow through a network of *nodes* (junctions, storage units, dividers, outfalls) and *links* (conduits, pumps, orifices, weirs, outlets). The 2D overland-flow module and its 1D–2D coupling are out of scope except where they interact with the 1D solver (e.g. through lateral inflows and the ponded-area coupling).

The engine is a *distributed discrete-time simulation model*: it advances a state vector over a sequence of time steps,

$$\boldsymbol{X}_{t} = f\!\left(\boldsymbol{X}_{t-1}, \boldsymbol{I}_{t}, \boldsymbol{P}\right), \qquad \boldsymbol{Y}_{t} = g\!\left(\boldsymbol{X}_{t}, \boldsymbol{P}\right),$$

where $\boldsymbol{X}$ is the state vector, $\boldsymbol{I}$ external inputs, $\boldsymbol{P}$ fixed parameters, and $\boldsymbol{Y}$ the outputs.

### The node–link conceptual model

The conveyance portion of a drainage system is a network of nodes and links. **Nodes** are points that represent:

- **Junctions** — points where links join, with invert elevation, height-to-rim, optional surcharge (pressure) depth, and optional ponded surface area.
- **Outfalls** — terminal boundary nodes with a prescribed stage condition (free, normal, fixed, tidal, or time-series) and an optional flap gate.
- **Storage units** — nodes with a surface-area–versus–depth relation and real storage volume; they never pressurize.
- **Flow dividers** — nodes that split inflow between a continuation link and a diversion link (cutoff, overflow, tabular, or weir; active under kinematic wave, treated as junctions under dynamic wave).

**Links** connect nodes. The link types are:

- **Conduits** — pipes and open channels of arbitrary cross-section, described by Manning's equation and a set of cross-section geometry tables.
- **Pumps** — governed by pump curves (five curve types or an ideal-pump model) with on/off depth hysteresis.
- **Orifices** — bottom or side openings with weir/orifice discharge behavior.
- **Weirs** — transverse, side-flow, V-notch, or trapezoidal weirs with an optional transition to orifice flow under submergence.
- **Outlets** — head or depth rating curves (tabular or functional).

### State variables and internal units

Under flow routing the fundamental state variables are exactly three (Table `tab:statevars`):

**Table `tab:statevars` — The three fundamental flow-routing state variables.**

| Symbol | Description |
|--------|-------------|
| $H$ | Hydraulic head of water at a node |
| $Q$ | Flow rate in a link |
| $A$ | Flow area in a link (inferred from $Q$ and geometry) |

All other quantities are derived from these three variables, the external inputs, and the fixed input parameters. Internally the engine carries out all calculations in **feet** (length), **seconds** (time), **cfs** (flow), **ft$^2$** (area), and **ft$^3$** (volume). Project input values in SI (metric) or US units are converted to these internal units at parse time; the conversion factors are

$$
\begin{aligned}
  \mathrm{Ucf}[\mathrm{LENGTH}] &=
    \begin{cases} 1.0 & \text{(US)} \\ 0.3048 & \text{(SI)} \end{cases}, \\
  \mathrm{Ucf}[\mathrm{VOLUME}] &=
    \begin{cases} 1.0 & \text{(US)} \\ 0.02832 & \text{(SI)} \end{cases},
\end{aligned}
$$

(note that the SI volume factor is the legacy *truncated* value, not $0.3048^3$, deliberately preserved for floating-point parity with the legacy SWMM engine). Flow conversion uses $\mathrm{Qcf} = \{1.0,\ 448.831,\ 0.64632,\ 0.02832,\ 28.317,\ 2.4466\}$ for cfs/gpm/MGD/cms/LPS/MLD.

### The four routing formulations

The engine selects the flow-routing method with the `FLOW_ROUTING` option. Table `tab:routing` summarizes the four methods.

**Table `tab:routing` — The four 1D routing formulations of the engine.**

| Method | Governing equations | Features |
|--------|---------------------|----------|
| Steady flow | continuity + Manning normal depth | pass-through, no storage/backwater |
| Kinematic wave | continuity + uniform-flow rating | no backwater, reversal, or surcharge |
| Dynamic wave (default) | full St. Venant | backwater, losses, reversal, surcharge |
| Finite volume (explicit) | St. Venant, Godunov/HLLC | transcritical flow, native dry/wet |

The dynamic wave is the default and is treated in the greatest depth here. Each routing method is invoked from a common `Router` orchestrator.
