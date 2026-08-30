# Build Your First Drainage Network and Run a Simulation

In this tutorial you will build a small stormwater network from scratch — nodes, links, and a subcatchment — set its parameters, run a simulation, and inspect the results, all through the app's user interface.

## What you'll build

A small drainage network: a few nodes connected by conduits and ending in an outfall, plus a subcatchment that drains into the network. You'll use the drawing tools in the **Left Tool Palette**, set element properties in the right panel, and finish by running the simulation and reading its results.

## Before you start

Open the app: use the production site at https://swmm6.is-local.org, or follow [How to Run the App Locally](../how-to/01-run-locally.md). If this is your first time, work through [Getting Started with Local SWMM](01-getting-started.md) first.

## Step 1 — Choose your units

1. Click the **Gear Icon** on the map to open the **Map Settings** menu.
2. Under **Units**, select **SI** (meters, millimeters, LPS) or **US** (feet, inches, CFS).

Note for later: if you add a 2D mesh to your model, **2D is SI-only** — a run with a 2D mesh present while units are US is rejected with a warning.

## Step 2 — Add nodes

1. In the **Left Tool Palette**, pick a **Node tool** — **Junction**, **Outfall**, **Storage**, or **Divider**.
2. **Click on the map** to place a node of that type.

Two things to notice:

- When you place a node, the application **automatically extracts terrain elevation from Mapbox DEM**. You can click **Sample DEM Elevation** in the **Properties** panel to update the elevation for a selected node.
- Every element receives an auto-generated ID: nodes use the prefixes `J` (junction), `O` (outfall), `ST` (storage), `D` (divider), `RG` (rain gage); links use `C`, `P`, `W`, `OR`, `OL`; subcatchments use `S`.

You must place at least **one outfall**: the app refuses to run a model with no nodes or no `OUTFALL`.

## Step 3 — Connect the nodes with links

1. In the **Left Tool Palette**, pick the **Conduit** tool (or **Pump**, **Weir**, or **Orifice** for other link types).
2. **Click a start node and an end node** to draw the link.

The conduit's length is computed automatically. New conduits come with sensible defaults: `roughness:0.013`, `autoLength:true`, `xShape:'CIRCULAR'`, `geom1:1.0`, `barrels:1`.

## Step 4 — Add a subcatchment and a rain gage

1. Pick the **Subcatchment** tool, then **click multiple points on the map** to draw the subcatchment polygon. **Double-click** to close the polygon.
2. Pick the **Rain Gage** tool and **click on the map** to add a rain gage object.

When you close a subcatchment, its area is computed automatically (in ha/ac) and the **nearest hydraulic node is picked as its outlet**.

Tip: with the **Select Tool** (`Esc`) you can click elements to select them and **drag nodes to move their position**. Undo with `Ctrl+Z`, redo with `Ctrl+Shift+Z`; `Del`/`Backspace` deletes the selected element.

## Step 5 — Set parameters

1. Click an element with the **Select Tool** to show its properties in the **Properties** tab of the right panel.
2. Edit the values you need.
3. For solver-wide settings, click **Options** on the **Top Toolbar**:
   - **Node Continuity**: select **Legacy (Default)** or **SEMI_IMPLICIT (Enhanced)** formulation.
   - **Anderson Acceleration**: select **Yes** to accelerate Picard iteration convergence on stiff surcharge transitions.
   - **Physics-Based RDII Abstraction Recovery**: enter recovery parameters (`k0`, `kT`, `Tref`) for rainfall infiltration recovery.

## Step 6 — Save your work

- **Save**: click **Save** to export your model to a `.json` file (a pretty-printed `*.oswmm.json` project file) or save to browser storage.
- The app also autosaves for you: every change is stored to browser storage after a short debounce (localStorage key `openswmm3d.project`, with an IndexedDB fallback), and restored on next load.
- **Load / Import** (from the **Open Model ▾** dropdown) lets you reopen project files, restore from browser storage, or import `.inp`, shapefile (`.zip`), and `.dxf` files.

## Step 7 — Run the simulation

1. Make sure your network contains **at least one outfall node and connected conduits**.
2. Click **Run** on the **Top Toolbar**.
3. Monitor progress in the **Run Status** window (progress percentage and simulated time in `Days` and `Hrs:Min`). You can **Stop** the simulation or **Minimize** it into a floating badge at any time.

If the run aborts immediately with a warning, the causes are: no nodes, no `OUTFALL`, or **US units with a 2D mesh** (2D is SI-only).

## Step 8 — Inspect the results

- **Time Slider Panel**: use the bottom animation bar to play, pause, change speed, or drag to a specific time step. The map colors update per step.
- **Properties Tab**: click any node or link to view its geometric properties and **calculated flow values**.
- **Results Tab**: select result categories to view summary tables — Node Depths, Node Inflows, Link Flows, and Subcatchment Runoff.
- **Water Elevation Profile**: select connected nodes and click **Profile** to view an interactive hydraulic profile plot.

## What you should see at the end

- A network with nodes (including an outfall), links, and a subcatchment, each with an ID and editable properties.
- A completed run with populated **Results** and **Report** tabs in the right panel.
- An animated playback of the simulation on the map via the time slider.

## Next steps

- **Add a 2D mesh** for overland surface routing: use the **Mesh2D** button or the **Data** menu (**2D Mesh**) to open the mesh dialog, a 3-tab modal (**Sources / Quality / Hydraulics**) that generates the surface mesh. Remember 2D requires SI units.
- Learn more about the model behind the UI in the reference sections of this documentation.
