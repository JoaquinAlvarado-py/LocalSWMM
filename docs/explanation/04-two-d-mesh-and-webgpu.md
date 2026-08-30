# The 2D Mesh & WebGPU Subsystem

The experimental surface-routing work: how the 2D mesh is generated, coupled to the 1D network, serialized into the INP, rendered, and finally re-implemented on the GPU as a WGSL marcher.

Two generations coexist:

1. **Legacy mesh generator** (`mesh2d.js`) — `poly2tri` per-subcatchment triangulation with an earclip fallback ladder.
2. **Production Triangle pipeline** (`mesh2dPslg.js` + `mesh2dTriangle.js` + `mesh2dTerrain.js`) — constrained Delaunay over the whole domain via the vendored Shewchuk Triangle WASM.
3. **WebGPU marcher** (`public/webgpu/`) — a WGSL re-implementation of the engine's explicit local-inertial solver, run in parallel to (and as an alternative to) the WASM 2D solver.

## Coordinate foundation — `mesh2dProj.js`

All mesh geometry uses **local metres relative to an origin centroid** with an equirectangular approximation: `makeTransform(origin)` (`mesh2dProj.js:16`); `METERS_PER_DEGREE_LAT = 111320`; lng scaled by `cos(lat)`. `originFromModel(Net)` (`:43`) = centroid of node + subcatchment vertices. Not a true projection, but adequate for km-scale domains.

## The mesh data model — `Net.setIndexedMesh` (`network.js:874`)

```js
mesh2DIndexed = {
  origin: { lng, lat },
  vertices: [{ x, y, z, lng, lat, tag, nodeId }],       // local metres + geo + rim Z
  triangles: [{ v:[i0,i1,i2], n, tag }],                // n = Manning's, tag = subcatchment id
  vertexNodeMap: [{ vertexIndex, nodeId, cd, area }],   // 1D↔2D coupling rows
  nodeVertexIndex: { nodeId → vertexIndex },
  options: { solver + coupling options }
}
```

The legacy `Net.mesh2D[]` cell array (closed rings, stable `M2D_<i+1>` ids) is derived from it for the map layers. `inpParser.js:496-519` re-hydrates the same shape from `.inp`.

## PSLG construction — `mesh2dPslg.js`

`Mesh2DPslg.fromNetwork(sources, opts)` (`mesh2dPslg.js:128`) builds the Triangle PSLG in numbered phases:

1. **Boundary** (`:185`): a GeoJSON polygon is projected, Douglas-Peucker simplified (`dpSimplify`, `:53`) and densified (`densify`, `:84`); constraint segments with `marker=1`; default background region `attr=0`. Without a boundary, an **auto domain** = convex hull (`convexHull`, `:116`) buffered by `domainBuffer` (default 50 m).
2. **Subcatchments** (`:271`): each becomes a Triangle **region seed** (mapped via `regionAttrToSub`) and optionally a constraint ring (`marker=2`) when `useSubRings`.
3. **Nodes** (`:292`): hydraulic nodes become **Steiner vertices** tagged with their node id (enforcing `minNodeSep`); with `useRimZ`, vertex Z = `invertEl + maxDepth` (rim).
4. **Conduits** (`:327`): conduit paths become constraint segments with unique `marker=100+k`, mapped back via `markerToConduit`.
5. **Constraint layers** (`:349`): imported points/lines/polygons become constraint vertices/segments (`marker=3`); polygons ticked **"block flow (impermeable)"** become **holes** (with a "swallows domain" guard).
6. **Segment dedupe** (`:409`) by `min:max` point key; **crossing-segment removal** (`:422`) via a bbox-grid (25 m buckets) `segsCross` test.
7. **Flatten radius** (`:473`): vertices near a node vertex inherit its rim Z (ponding-basin flattening).
8. **Terrain Z** (`:502`): remaining vertices get `opts.sampleZ(x,y)`.

`_addPt` (`:157`) is a spatial-hash snap-merge inserter; `interiorPoint` (`:33`) picks hole/region seeds.

## Triangulation & terrain — `mesh2dTriangle.js` / `mesh2dTerrain.js`

- `Mesh2DTriangle.triangulate(pslg, quality, ctx)` (`:92`) packs the PSLG into Float64/Int32 arrays and runs Triangle with switches: `pQAY` (PSLG, quiet, attributes, no-boundary-Steiner when requested), `q{minAngle}` (default **33°**), `a{maxArea}` (default 200 m²) or regional area list, `S{maxSteiner}`. Output vertices are matched back by 1 mm `CoordHash` (`:21`); Manning's n comes from region attribute → subcatchment lookup (`manningForSub`, `:36` — priority: land-cover class → `nPerv` → `nImperv` → default).
- `runGeneration(sources, quality, ctx, log)` (`:251`) orchestrates with hard budgets:
  - **`trianglePointBudget` = 8000 points** (Triangle WASM heap is fixed at 16 MB) — big models drop subcatchment rings + conduit constraints and reassign roughness by centroid.
  - **`autoAreaCap`** (`:331`): max area capped to `domainArea/15000`, minAngle clamped to 30°, `maxSteiner` 30000, boundary Steiner disabled.
  - **`maxTriangleRegions` = 256** (`:361`): beyond that all region seeds collapse and tags/n are assigned by centroid.
  - **Fallback** to the poly2tri generator (`:380`) on Triangle failure.
- `Mesh2DTerrain.makeSampler(settings, map)` (`mesh2dTerrain.js:24`): `MAPBOX` → `map.queryTerrainElevation`; `OPENTOPOGRAPHY_*` → OpenTopography bbox API; `GEOTIFF` → geotiff.js `readRasters` with **bilinear interpolation** (`:109`), nodata handling, proj4 reprojection, and `refreshBounds()` exposing the raster footprint as an auto domain.
- `resolveVertexElevations(...)` (`:123`): rim-Z first → sampler → **IDW fallback (k=4)** → 0.
- `thinTerrain(sampler, domain, opts, transform)` (`:152`): **terrain-adaptive thinning** — grid of ≤300×300 candidates scored "most-curved-first" by local surface-normal deviation, accepted with min spacing and edge buffer.

## Coupling & INP serialization

- `Mesh2DCoupling.buildVertexNodeMap(indexed, nodes, opts)` (`mesh2dCoupling.js:5`) dedupes vertex↔node rows; default coupling coefficient `cd = 0.65`.
- `Mesh2DInp.buildInput(baseInp, cells, map, options)` (`mesh2dInp.js:162`) rejects US units (`:163`), prefers the indexed mesh (overlaying current dialog solver options onto stored ones, `:175-184`), and delegates to `Mesh2DExport.buildInline` (`mesh2dExport.js:54`) or `buildExternal` (`:68`, `[2D_MESH_FILE]` + `.2dm`).
- Sections emitted: `;; UNITS: SI (m)`, `;; 2D_ORIGIN lng lat`, `[2D_OPTIONS]`, `[2D_VERTICES]` (`X Y Z TAG`), `[2D_TRIANGLES]` (`V1 V2 V3 MANNINGS_N TAG`), optional `[2D_VERTEX_NODE_MAP]`.
- `Mesh2DExport.optionLines` (`:22`) emits solver options: `MAX_TIMESTEP`, `DRY_DEPTH`, `COUPLING_CD`, `COUPLING_SYNC`, `THETA`, `CFL_NUMBER`, `H_MOVE`, `LTS_TIERS`, `FROUDE_MAX`, `LIMITER_EPSILON`, `FLUX_DH_EPS`, `CELL_CLOSURE`, `FACE_RECONSTRUCTION`, `VFR_MIN_WET_FRAC`, `INTEGRATOR EXPLICIT`, `COUPLING_AREA`, optional `RAINFALL_MODE`, `REPORT_2D`.
- The mesh dialog (`mesh2dDialog.js`) orchestrates everything from a 3-tab modal (Sources/Quality/Hydraulics): `generate()` (`:369`) assembles sources, transform, terrain sampler, quality/ctx, runs `Mesh2DTriangle.runGeneration`, resolves elevations, builds `vertexNodeMap`, and calls `Net.setIndexedMesh`. Defaults (`defaultSettings`, `:16`) persist to `localStorage` with migrations (v4 aligns `LTS_TIERS 4`, `MAX_TIMESTEP 10`, `H_MOVE 0.003`; v5 aligns `THETA 0.8`, `CFL_NUMBER 0.7`, `FROUDE_MAX 1.5`, `COUPLING_SYNC 0`, `FLUX_DH_EPS 0.004`, `VFR_MIN_WET_FRAC 0.01` — all per the engine's `SolverOptions2D.hpp` / Ref Manual Vol II Ch9 §9.11).

## Rendering the 2D simulation

Two complementary layers:

- **GeoJSON overlays — `mesh2dRender.js`:** `Mesh2DLayers.ensure(map)` (`:95`) creates sources/layers for vertex points, depth isolines (`isolines`, `:32`), depth contour **bands** (`contourBands`, `:50` — dry part clipped below the canonical `View2D.DEPTH_MASK_M` (5 mm) so the uniform-rain film stays invisible), velocity arrows (`velocityArrows`, `:89`, threshold `mag < 0.002`, arrow size `√(mag/max)` clamped 0.4–1.8), and elevation bands/isolines. `onStep(step, frame)` (`:127`) rebuilds the vertex depth field (from `frame.vertex.depth` or, when the engine emits per-cell depths, area-weighted from **wet cells only** so wet depths never bleed into dry vertices) each animation frame. Exposed in the layer tree (12 toggles).
- **WebGL2 Gouraud layer — `meshGlLayer.js`:** `MeshShadeLayer` (`:6`) is a Mapbox custom layer (`renderingMode:'2d'`) with GLSL ES 3.0 shaders and a 5-stop color ramp (`#2e7dd1 → #26a69a → #ffca28 → #f57c00 → #d32f2f`). `setField` (`:16`) encodes `t = clamp((v−min)/(max−min))` with wet-only alpha. `Mesh2DGL.ensure` (`:18`) adds `m2d-smooth-depth-fill` and `m2d-mesh-terrain` below the classic per-cell fill (`swmm-2d-mesh-fill`, which is colored per-triangle via feature-state `resultColor`, `results.js:393/433`).

## The WebGPU marcher — `public/webgpu/`

- **`webgpuMarscher.js`** — `buildEdges(mesh)` (`:23`) is a **bit-exact port of the engine's `InertialEdges.cpp`** (per-triangle centroid/area/bed, edge keys by sorted vertex pair, outward normals, Phase-1 interior edges, `cell_lchar = 2·area/xiMax`, per-cell CSR). `WebGPUMarcher` (`:171`) uploads packed SoA buffers and compiles **one compute pipeline with a 16-binding bind group** (`_compile`, `:338`) plus 15 compute pipelines. `advance(t0,t1,rain)` (`:592`) mirrors `ExplicitInertialSolver::advance` — rebuild cadence 4, `K=1` global-dt path, `K>1` LTS macro-cycle, `dtFloor` guards f32 Perot-speed CFL collapse.
- **`shaders/marcher.wgsl`** (the only shader file) — a 1:1 f64→f32 port of `InertialKernels.hpp`. Params travel as a flat `array<f32>` (struct-typed storage bindings misbehave on some drivers). Kernels: `faceFlux` (de Almeida & Bates local-inertial face update + exporter-cell positivity budget `β/3·V`), `cellUpdate` (Perot cell discharge), `lazySources`, `seedActive` (hysteretic activation `h_on = hMove+0.001`, `h_off = hMove−0.001`; coupling cells pinned), `halo`, `couplingExchange` (C¹-regularized orifice `Q = cd·Aeff·√(2g)·φ`, drain capped by `β·V/dt`, spill capped by a per-node drawn ledger), `cflReduce`/`cflArgmin` (atomicMin dt0 bitcast + argmin cell), and the LTS v2 set (`settleAcc`, `tierAssign`, `faceTierAssign`, `degenTier`/`degenFaceTier`, `faceFluxLts`, `cellUpdateLts` with refire = `2^(tier_exp − face_tier)`).
- **`couplingSplit.js`** — the M2 split machinery (worker-safe): `parse2DMesh`/`parse2DOptions` (`:18`/`:43`), `nodeOrder` (`:67`, node index = parse order across JUNCTIONS/OUTFALLS/STORAGE/DIVIDERS sorted by global text position — a fixed walk mis-indexes some INPs), `buildVertexStencil` (`:95`, Jawahar-Kamath partition-of-unity weights), `parseCoupling` (`:144`, crown = `(invert+fullDepth)·len12`; `COUPLING_AREA DEFAULT` → `A = clamp(1.25·Amax_conduit, 0.05, 2.0)` m²; **vertex points resolve to the lowest-bed incident cell**, per `SurfaceRouter2D.cpp:394-412`), `build1DInp` (`:283`, strips 2D sections, forces `ALLOW_PONDING YES`, **preserves the model's own adaptive VARIABLE_STEP** — a former pin to 0 corrupted the 1D solve), `rainMpsAt` (`:331`, gage-mean rain, INTENSITY/CUMULATIVE/VOLUME handling), and the core **`runSplit`** (`:400`): fill each coupling window by time, freeze 1D node state into 9-float `cplF` rows, guard non-finite state (`COUPLING_STATE_NONFINITE`), `marcher.advance`, feed `∫Q` back via `setLatInflow(exch/dtBatch)` (matching the engine's two-window-mean queue delivery), emit frames, compute real mass balance.
- **`gpu2dWorker.js`** — the production worker (same `run2d` contract as `openSwmm2dWorker.js`): loads the WASM engine for the **1D leg only**, requires `maxStorageBuffersPerShaderStage: 16` (`requestGpuDevice`, `:70`; throws `WEBGPU_UNAVAILABLE` otherwise), writes a 1D-only INP, `setPondArea(tri_area)` per coupling node, then `CouplingSplit.runSplit` with a 60 s coupling window.
- **`harness.html`** — M0/M1/M2 validation page. Gates: **conservation ≤ 0.5 %, mean-depth ≤ 1e-3 m, median Pearson correlation ≥ 0.5**; M2 exchange within 5 %, temporal corr ≥ 0.9.

## WebGPU roadmap status (from `WEBGPU_PLAN.md`)

| Milestone | Scope | Status |
|---|---|---|
| M0 | Harness: `navigator.gpu` detect, device, canvas | ✅ (Chrome headed only; headless has no WebGPU) |
| M1 | Global-dt marcher: faceFlux+cellUpdate+rain | ✅ statistical parity |
| M2 | 1D+2D split coupling | ✅ PASS (marcher-cpl: exch Δ≈0, medianCorr 0.865, temporalCorr 1.0) |
| M2.x | Vertex coupling + production worker | ✅ Bellinge runs on GPU |
| M3 | Boundary conditions + LTS v2 | ✅ LTS v2 done; NORMAL_FLOW / SPECIFIED_STAGE pending |
| M4 | renderDepths + UI WebGPU/WASM toggle | pending |
| M5 | Benchmark & hosting | pending |

**Hard limits & honest verdicts recorded in the plan:**

- **Apple Silicon / Metal (≤10 storage buffers) cannot run the backend** — 16 storage buffers exceed Metal's limit; the worker throws `WEBGPU_UNAVAILABLE` and the app falls back to WASM.
- f32/f64 divergence in `max|Δdepth|` is accepted; validation is statistical.
- **Honest performance verdict:** GPU 2D is fast (0.13 ms/substep) but the 1D dynamic wave is ~90 % of wall time in both backends, so the split is currently *on par with* the engine, not faster.
