# Getting Started with Local SWMM

In this tutorial you will learn what Local SWMM is, what you need to run it, and how to open the app and complete your first simulation with a built-in sample model.

## What you'll be doing

By the end of this lesson you will have:

- opened the Local SWMM web application,
- explored its five main interface areas,
- loaded a sample drainage network, and
- run a hydraulic simulation and inspected its results.

## What Local SWMM is

Local SWMM is a **client-side-only web application** for 2D hydraulic modeling and simulation of stormwater and wastewater networks. Everything — the editor, the mesher, and the SWMM hydraulics engine — runs in the browser. The simulation engine is the HydroCouple **OpenSWMM** engine compiled to **WebAssembly** with Emscripten.

Key properties:

- **No backend.** The only server is a trivial static-file + health endpoint server (`server.py`). No database, no build step for the UI, no bundler.
- **No UI framework.** The frontend is ~15,000 lines of dependency-free JavaScript (classic scripts + IIFEs) using Mapbox GL JS as the only heavyweight runtime library.
- **WASM-embedded hydraulics.** The OpenSWMM 6.0.0 engine is cross-compiled for `wasm32-emscripten` with vcpkg-managed C++ dependencies (Eigen, HDF5, nlohmann-json, SUNDIALS).
- **Two simulation backends.** A WASM engine path (1D + 1D/2D coupled) and an **experimental WebGPU** backend that re-implements the 2D explicit local-inertial solver as WGSL compute kernels and runs it in parallel to the WASM engine.
- **Two mesh generators.** A legacy `poly2tri`-based generator and the production **Shewchuk Triangle WASM** (npm `triangle-wasm`) pipeline.

The app provides an interactive map interface to build, edit, and simulate urban drainage systems. It uses Mapbox GL JS for 3D terrain and building visualization, and the [HydroCouple OpenSWMM engine](https://github.com/HydroCouple/openswmm.engine) to execute hydraulic simulations directly in your web browser thanks to WebAssembly. You can try it yourself at https://swmm6.is-local.org — a demo video is available at https://github.com/user-attachments/assets/6ea0af51-125d-4b7d-a6ba-e0452cfae368 (a `demo.mp4` is also bundled in the repo under `assets/`).

## Prerequisites

- A modern web browser with WebAssembly support. [Check here if you can properly use it on your browser](https://caniuse.com/wasm).
- Python 3 installed on your computer — only if you want to run the app from your own machine. (Node is only needed for `npm install` and the tooling scripts.)

You do not need to install anything to use the production site, and you do not need to build anything from source for this lesson.

## Step 1 — Open the app

The fastest way to start is the production site: **https://swmm6.is-local.org**.

If you prefer to run the app on your own computer instead, follow the guide [How to Run the App Locally](../how-to/01-run-locally.md) first, then come back.

## Step 2 — Get to know the interface

The user interface contains five main areas:

- **Top Toolbar**: Perform file operations, change simulation options, and run simulations.
- **Left Tool Palette**: Select map objects or draw network elements.
- **Map View**: View and edit your drainage network over interactive 2D or 3D maps.
- **Right Side Panel**: Inspect element properties or view simulation result tables.
- **Bottom Status Bar**: View current tool selection, element counts, and cursor coordinates.

## Step 3 — Load a sample model

The project ships pre-configured sample models:

1. On the **Top Toolbar**, open the **Open Model ▾** dropdown.
2. Choose **Load Sample Models**.
3. Load **Bellinge Web** (the alternatives are **Bellinge Self-Contained** and **Bellinge No Pervious**).

You should now see the reference network on the map. **Bellinge Web** is the reference network used throughout the test suite.

## Step 4 — Run the simulation

1. Press **Run** on the **Top Toolbar**.
2. Monitor progress in the **Run Status** window. It shows:
   - **Progress Tracking**: real-time calculation progress percentage and simulated time (`Days` and `Hrs:Min`).
   - **Stop Simulation**: click **Stop** to stop the simulation immediately.
   - **Minimize Window**: click **Minimize** to shrink the status window into a floating badge. Click **Expand** on the floating badge to restore the window.

## Step 5 — Look at the results

- **Time Slider Panel**: use the bottom animation bar to play, pause, change speed, or drag to a specific time step.
- **Properties Tab**: click any node or link to view its geometric properties and calculated flow values.
- **Results Tab**: select result categories to view summary tables (Node Depths, Node Inflows, Link Flows, and Subcatchment Runoff).
- **Water Elevation Profile**: select connected nodes and click **Profile** to view an interactive hydraulic profile plot.

## What you should see at the end

- A finished run: the **Run Status** window reaches 100 %, and the **Results** and **Report** tabs in the right panel are populated.
- An animated timeline: the **Time Slider** plays back the simulated period, and result colors update on the map.
- You are now ready to build your own network — continue with [Build Your First Drainage Network](02-your-first-network.md).
