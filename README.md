# Local SWMM Documentation
 
Local SWMM is a web application for 2D modeling and hydraulic simulation of stormwater and wastewater networks, check it by yourselft at https://swmm6.is-local.org

## Overview

Local SWMM provides an interactive map interface to build, edit, and simulate urban drainage systems.
It uses Mapbox GL JS for 3D terrain and building visualization.
It uses the [HydroCouple OpenSWMM engine](https://github.com/HydroCouple/openswmm.engine) to execute hydraulic simulations directly in your web browser thanks to WebAssembly.



https://github.com/user-attachments/assets/6ea0af51-125d-4b7d-a6ba-e0452cfae368



## System Requirements

- A modern web browser with WebAssembly support. [check here if you can porperly use it on your browser](https://caniuse.com/wasm).
- Python 3 installed on your computer (to run the local web server if you want to modify aspects of the program).

## Quick Start Guide

Follow these steps if you want to start the application on your computer instead of the web version:

1. Open your terminal or command prompt.
2. Clone this repository:
   ```bash
   git clone https://github.com/JoaquinAlvarado-py/LocalSWMM.git
   ```
3. Navigate to the project directory:
   ```bash
   cd SWMM_3D_Web_UI
   ```
4. Start the local web server:
   ```bash
   python server.py
   ```
5. Open your web browser and go to `http://localhost:8000`.

## User Interface Overview

The user interface contains five main areas:

- **Top Toolbar**: Perform file operations, change simulation options, and run simulations.
- **Left Tool Palette**: Select map objects or draw network elements.
- **Map View**: View and edit your drainage network over interactive 2D or 3D maps.
- **Right Side Panel**: Inspect element properties or view simulation result tables.
- **Bottom Status Bar**: View current tool selection, element counts, and cursor coordinates.

## File Operations

Use the **Top Toolbar** buttons for file management:

- **Save**: Click **Save** to export your model to a `.json` file or save to browser storage.
- **Load / Import**:
  - **Open Model (.json)**: Load a previously saved Local SWMM project file.
  - **Load from Browser Storage**: Restore your saved project state from local browser memory.
  - **Import SWMM .inp Model**: Import a standard SWMM input model file (`.inp`).
  - **Import GIS Shapefile (.zip)**: Import GIS vector data from a compressed shapefile (`.zip`).
  - **Import CAD Drawing (.dxf)**: Import drawing entities from an AutoCAD file (`.dxf`).
  - **Load Sample Models**: Load pre-configured sample models (Bellinge Web, Bellinge Self-Contained, or Bellinge No Pervious).
- **Export INP**: Export the active network layout to a standard SWMM input file (`.inp`).
- **Undo / Redo**: Click **Undo** (`Ctrl+Z`) to revert your last action. Click **Redo** (`Ctrl+Shift+Z`) to reapply an action.
- **Clear**: Remove all nodes, links, and subcatchments from the current map.

## Network Editing Tools

Select a drawing tool from the **Left Tool Palette** to create or edit map elements:

### General Tools

- **Select Tool** (`Esc`): Click map elements to select them. Drag nodes to move their position.
- **Delete Tool** (`Del`): Click an element on the map to remove it.

### Node Tools

- **Junction**: Click on the map to add a standard junction node.
- **Outfall**: Click on the map to add an outfall boundary node.
- **Storage**: Click on the map to add a storage unit node.
- **Divider**: Click on the map to add a flow divider node.
- **DEM Elevation Sampling**: When you place a node on the map, the application automatically extracts terrain elevation from Mapbox DEM. Click **Sample DEM Elevation** in the **Properties** panel to update elevation for a selected node.

### Link Tools

- **Conduit**: Click a start node and an end node to draw a conduit link.
- **Pump**: Click a start node and an end node to draw a pump link.
- **Weir**: Click a start node and an end node to draw a weir structure.
- **Orifice**: Click a start node and an end node to draw an orifice structure.

### Hydrology Tools

- **Subcatchment**: Click multiple points on the map to draw a subcatchment polygon. Double-click to close the polygon.
- **Rain Gage**: Click on the map to add a rain gage object.

## Map View and Settings

Click the **Gear Icon** on the map to open the **Map Settings** menu:

- **Basemap**: Select **Streets**, **Satellite**, or **Blank** basemap tiles.
- **Network Layers**: Toggle visibility for **Nodes**, **Links**, and **Subcatchments**.
- **Display Toggles**:
  - **Labels**: Show or hide text labels on network elements.
  - **3D View**: Enable or disable 3D terrain elevation and 3D building models.
  - **Warnings**: Show or hide network error warning indicators.
- **Units**: Select **SI** (meters, millimeters, LPS) or **US** (feet, inches, CFS) unit systems.
- **Sample DEM for All Nodes**: Click **Sample DEM for All Nodes** to extract terrain elevation from Mapbox DEM for all network nodes.
- **OSM Place Search**: Enter a place name or address into the top search bar to center the map.
- **Google Street View (Pegman)**: Click the **Pegman** button and click the map to view real-world street imagery.

## Import Options and Coordinate Systems

When you import file layers, select the correct coordinate options:

1. **WGS84 (lon/lat degrees)**: Standard geographic coordinates.
2. **UTM / Projected (EPSG code)**: Projected coordinate system. Enter your EPSG code (for example `EPSG:32719`).
3. **Local coordinates**: Scales and centers local spatial data near your active map location.

You can import GIS and CAD files as active **Network elements** or as background **Master plan** reference layers.

## Simulation Options

Click **Options** on the **Top Toolbar** to configure solver settings:

- **Node Continuity**: Select **Legacy (Default)** or **SEMI_IMPLICIT (Enhanced)** formulation.
- **Anderson Acceleration**: Select **Yes** to accelerate Picard iteration convergence on stiff surcharge transitions.
- **Physics-Based RDII Abstraction Recovery**: Enter recovery parameters (`k0`, `kT`, `Tref`) for rainfall infiltration recovery.

## Running Simulations and Analyzing Results

Follow these steps to execute a simulation and review results:

1. Ensure your network contains at least one outfall node and connected conduits.
2. Click **Run** on the **Top Toolbar**.
3. Monitor progress in the **Run Status** window.

### Run Status Window Controls

- **Progress Tracking**: View real-time calculation progress percentage and simulated time (`Days` and `Hrs:Min`).
- **Stop Simulation**: Click **Stop** on the **Run Status** window to stop the simulation immediately.
- **Minimize Window**: Click **Minimize** to shrink the status window into a floating badge. Click **Expand** on the floating badge to restore the window.

### Viewing Results

- **Time Slider Panel**: Use the bottom animation bar to play, pause, change speed, or drag to a specific time step.
- **Properties Tab**: Click any node or link to view its geometric properties and calculated flow values.
- **Results Tab**: Select result categories to view summary tables (Node Depths, Node Inflows, Link Flows, and Subcatchment Runoff).
- **Water Elevation Profile**: Select connected nodes and click **Profile** to view an interactive hydraulic profile plot.

## License

The user interface code is licensed under the [MIT License](LICENSE).
The simulation engine is provided by the [HydroCouple OpenSWMM project](https://github.com/HydroCouple/openswmm.engine).
