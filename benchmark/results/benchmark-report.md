# LocalSWMM wasm engine — 1729-SWMM5-Models benchmark plan

Generated 2026-09-11T17:49:21.576Z · static analysis of 1646 .inp models

## Suite partition (wasm32 shared-memory ceiling ≈ 2 GiB)

| set | models | .inp | .out est | .rpt est |
|---|---|---|---|---|
| runnable (outEst ≤ 1536.0 MiB) | 1589 | 1.59 GiB | 52.96 GiB | 0.43 GiB |
| exceeds wasm memory | 15 | 0.12 GiB | 85.65 GiB | 0.07 GiB |
| no/zero duration | 42 | 0.22 GiB | 0.02 GiB | 0.09 GiB |
| **full suite** | **1646** | **1.94 GiB** | **138.62 GiB** | **0.58 GiB** |

## Calibration sample, THREADS=4 (24 completed, 1 failed)

| model | wall sim | steps | ms/step | out actual vs est |
|---|---|---|---|---|
| SWMM5_NCIMM\210_H&H_Elements.inp | 196.80 s | 525,540 | 0.3745 | 3.77% |
| Semi_Real_Models\210_H&H_Elements.inp | 173.25 s | 525,540 | 0.3297 | 3.77% |
| EPA\force_main_gravity_example.inp | 97.29 s | 86,400 | 1.1260 | -0.43% |
| SWMM5_NCIMM\1845_H&H_Elements.inp | 97.28 s | 8,280 | 11.7489 | 1.13% |
| SWMM5_NCIMM\1658_H&H_Elements.inp | 75.03 s | 28,080 | 2.6720 | 0.01% |
| SWMM5_NCIMM\usgs_runoff.inp | 48.69 s | 2,880 | 16.9056 | 5.51% |
| SWMM5_NCIMM\117_H&H_Elements_SI_Units.inp | 28.14 s | 172,800 | 0.1628 | 0.00% |
| Simon_EPA\Session18_GreenvilleSnowmelt.inp | 24.14 s | 14,400 | 1.6767 | 0.23% |
| OWA_USER\user5_force_main_hw.inp | 21.13 s | 2,878 | 7.3433 | -0.00% |
| OWA_USER\user3_gothic.inp | 10.96 s | 43,200 | 0.2537 | 26.90% |
| SWMM5_NCIMM\2020_Nodes_Low_DWF.inp | 6.67 s | 3,600 | 1.8531 | 1.23% |
| SWMM5_NCIMM\20_Subs_1050_Nodes.inp | 6.57 s | 17,280 | 0.3800 | 2.08% |
| LEW_CHI_SWMM5.2\Tests_CHI\CoS-Reduced-Inlets.inp | 3.61 s | 21,600 | 0.1671 | 0.24% |
| EPA\air_release_valve.inp | 1.65 s | 1,152 | 1.4306 | 9.90% |
| OWA_USER\user1_all_open_shapes.inp | 0.95 s | 5,040 | 0.1881 | 0.01% |

- .out size formula error on completed runs: max 54.27%, mean 5.044%
- .rpt heuristic factor (measured/estimated): median 1.16, range 0.54–2.14

## THREADS 1 vs 4 (same model, same machine)

| model | links | t1 | t4 | speedup |
|---|---|---|---|---|
| SWMM5_NCIMM\2020_Nodes_Low_DWF.inp | 2096 | 22.32 s | 6.67 s | 3.35x |
| SWMM5_NCIMM\20_Subs_1050_Nodes.inp | 1102 | 3.69 s | 6.57 s | 0.56x |
| SWMM5_NCIMM\1845_H&H_Elements.inp | 954 | 105.11 s | 97.28 s | 1.08x |
| Simon_EPA\Session18_GreenvilleSnowmelt.inp | 942 | 61.62 s | 24.14 s | 2.55x |
| SWMM5_NCIMM\1658_H&H_Elements.inp | 488 | 143.40 s | 75.03 s | 1.91x |
| EPA\force_main_gravity_example.inp | 298 | 62.07 s | 97.29 s | 0.64x |
| OWA_USER\user5_force_main_hw.inp | 276 | 33.88 s | 21.13 s | 1.60x |
| OWA_USER\user3_gothic.inp | 139 | 12.24 s | 10.96 s | 1.12x |
| LEW_CHI_SWMM5.2\Tests_CHI\CoS-Reduced-Inlets.inp | 121 | 5.69 s | 3.61 s | 1.58x |
| OWA_USER\user1_all_open_shapes.inp | 59 | 1.01 s | 0.95 s | 1.07x |
| SWMM5_NCIMM\117_H&H_Elements_SI_Units.inp | 57 | 36.13 s | 28.14 s | 1.28x |
| Semi_Real_Models\210_H&H_Elements.inp | 57 | 202.29 s | 173.25 s | 1.17x |
| LEW_CHI_SWMM5.2\Tests_CHI\Example7-Final.inp | 23 | 0.04 s | 0.04 s | 0.95x |
| EPA\air_release_valve.inp | 15 | 1.86 s | 1.65 s | 1.13x |
| Orifices\extran3_bottom_orifice_si_units.inp | 10 | 0.02 s | 0.01 s | 1.50x |
| Weirs\extran4_trapezoidal.inp | 10 | 0.00 s | 0.00 s | 1.00x |
| Hydraulics\extran1_rect_open.inp | 9 | 0.00 s | 0.00 s | 0.67x |
| SWMM5_NCIMM\usgs_runoff.inp | 6 | 61.14 s | 48.69 s | 1.26x |
| Hydraulics\PUMP_STATION.inp | 4 | 0.01 s | 0.01 s | 1.09x |
| Hydrology\MASTER_GW.inp | 4 | 0.01 s | 0.01 s | 1.00x |
| OWA_ROUTING\routing_divider.inp | 4 | 0.05 s | 0.06 s | 0.84x |
| SWMM5_NCIMM\HUFF_DISTRIBUTIONS.inp | 0 | 0.00 s | 0.00 s | 1.00x |
| Hydrology\Subarea Routing.inp | 0 | 0.18 s | 0.10 s | 1.79x |

- median speedup on nets with ≥ 16 links (parallel-eligible): 1.17x
- models below the 16-link eligibility bar run single-threaded regardless of THREADS (engine rule, statsrpt.c)

## ETA for the runnable suite with THREADS=4
- cost model from 17 sample models: 0.00124 ms per routing step per element (median); floor 0.002 ms/step
- correction factor (measured/predicted): median ×1.04, P10–P90 ×0.19–×8.23, max ×910
- 1169 of 1589 runnable models use VARIABLE_STEP: their true step count can exceed the static estimate under surcharge (the factor band absorbs this)
- **point estimate: 29.9 h** (P10–P90: 5.4 h – 9.8 days); pathological models can exceed it (worst sample factor ×910)
- per model: median 0.8 s, mean 67.7 s
- sequential runs, one model at a time, on this machine (4 threads per run)

Top 10 slowest (drives the total):

| model | est. steps | ETA |
|---|---|---|
| SWMM5_NCIMM\A5.inp | 172,800 | 2.3 h |
| SWMM5_NCIMM\3363_Nodes.inp | 345,600 | 62.2 min |
| SWMM5_NCIMM\8394_H&H_Elements.inp | 345,600 | 62.2 min |
| SWMM5_NCIMM\10033_H_Elements.inp | 259,200 | 55.8 min |
| SWMM5_NCIMM\13Mile_Run_SWMM5_Calib9.inp | 3,814,559 | 47.3 min |
| SWMM5_NCIMM\Long_PS_Model.inp | 17,539,200 | 41.2 min |
| Special\many_Isolated_Nodes.inp | 1,652,400 | 39.8 min |
| SWMM5_NCIMM\24650_Nodes.inp | 34,560 | 36.9 min |
| SWMM5_NCIMM\49500_H&H_SI_Units_Elements.inp | 34,560 | 36.9 min |
| SWMM5_NCIMM\MainRivers-SW5-Feb09OFupdate.inp | 282,240 | 35.5 min |

## Full-suite (theoretical, ignoring the wasm memory ceiling)
- On a native build (no 2 GiB wasm limit), all 1646 models would produce ≈ 138.62 GiB of .out + ≈ 0.67 GiB of .rpt.
- The 15 over-ceiling models are dominated by SWMM5_NCIMM stress tests and z1000Years long-duration runs.
