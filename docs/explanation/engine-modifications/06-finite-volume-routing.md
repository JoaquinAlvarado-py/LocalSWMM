<!-- Part of the engine modifications explanation series -->

# Explicit 1D finite volume routing (`FLOW_ROUTING FV`)

## Motivation

Official SWMM only offers implicit schemes with linearization (dynamic
wave) or kinematic/steady waves. The dynamic wave solver, although it is the
industry standard, has well-documented difficulties with transcritical flow,
the propagation of sharp fronts and the dry/wet transition. The
`FLOW_ROUTING FV` extension adds an *explicit and conservative* 1D
finite volume solver of Godunov type, which natively solves transcritical
flow and handles dry/wet without the ad hoc branches of the dynamic wave.

## Solver architecture

The solver lives in `src/engine/hydraulics/fv/`. Each conduit is
discretized into cells (by default at least `FV_MIN_CELLS` = 4 per
conduit, or with a target length `FV_CELL_LENGTH`); the conserved state
of each cell is the hydraulic area $A$ and the flow $Q$. The global time
step obeys the Courant condition, and the solver sub-steps internally to its
own CFL limit, so the routing step (reporting/forcing) does not need to
shrink for stability.

The main options (keys `FV_*` in `[OPTIONS]`) are:

| Option | Default | Description |
|---|---|---|
| `FV_CFL` | 0.5 | Courant number |
| `FV_RIEMANN` | HLLC | Riemann solver (HLL / HLLC) |
| `FV_ORDER` | 1 | spatial order (1 = Godunov, 2 = MUSCL–Hancock) |
| `FV_LIMITER` | MINMOD | slope limiter (MINMOD/VANLEER/SUPERBEE) |
| `FV_CELL_LENGTH` | 0 | target $\Delta x$ (0 = cells floor only) |
| `FV_MIN_CELLS` | 4 | cells floor per conduit |
| `FV_SLOT_CELERITY` | 100 ft/s | pressure celerity (slot width) |
| `FV_NODE_COUPLING` | SEMI_IMPLICIT | node–cell coupling |
| `FV_STRUCTURE_COUPLING` | SUBSTEP | when structures are re-evaluated |
| `FV_LTS` | true | local time stepping |
| `FV_LTS_MAX_TIERS` | 6 | maximum LTS levels |
| `FV_DISPERSION` | 0 | longitudinal dispersion coefficient |

*Table: Options of the 1D finite volume solver.*

## Key designs

- **Algebraic nodes**: junction chambers are not states with area (as in
  the dynamic wave, where the working area belongs to the conduits); a
  degree-2 node without lateral inflow passes flows directly as a face,
  and the remaining nodes solve their head from the instantaneous flow
  balance per substep. This eliminates the millisecond step limit that a
  chamber area imposed on the whole model.
- **Semi-implicit node–cell coupling**: the flow of each coupling face is
  linearized in the node head, which takes the node out of the explicit
  stability limit (the chamber, not the pipe, was the limiting factor of
  the substep). Conservation is not altered: the corrected flow is what
  both the node and the cell see. With
  `FV_NODE_PICARD_SWEEPS` > 1, area, width and Riemann flows are
  re-evaluated in each sweep.
- **Local time stepping (LTS)**: stiff cells (short, pressurized
  conduits) advance at their own $\Delta t = 2^k\,\Delta t_0$ while the
  rest advance at the global step; when the split separates nothing, the
  solver falls back to the bit-for-bit global step path.
- **Structures**: pump/orifice/weir/outfall equations are re-evaluated by
  default in *every* explicit substep (`FV_STRUCTURE_COUPLING
  SUBSTEP`), which is physically exact; the alternative is once per
  routing step.
- **Backends**: the same scalar kernel is compiled for CPU, OpenMP and
  devices (CUDA/HIP/SYCL via Kokkos plugins); the result must be bit
  for bit identical across backends.
