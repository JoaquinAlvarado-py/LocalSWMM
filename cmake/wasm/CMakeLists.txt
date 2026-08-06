cmake_minimum_required(VERSION 3.21)

# Wrapper project for the WebAssembly build of the OpenSWMM engine.
#
# Upstream removed the OPENSWMM_WASM_INJECT_FILE hook from its top-level
# CMakeLists, so the `openswmm2d_wasm` target can no longer be declared from
# inside the engine tree. This wrapper embeds the engine via add_subdirectory
# (the same embedding the upstream python bindings use) and declares the
# Emscripten executable that exposes the engine C API to the browser.

project(OpenSwmm2DWasm C CXX)

add_subdirectory(
    ${CMAKE_CURRENT_LIST_DIR}/../../third_party/openswmm-engine
    ${CMAKE_CURRENT_BINARY_DIR}/openswmm-engine
)

set(CMAKE_EXECUTABLE_SUFFIX ".js")

add_executable(openswmm2d_wasm
    "${CMAKE_CURRENT_LIST_DIR}/../../wasm/openswmm2d_exports.cpp"
)

target_link_libraries(openswmm2d_wasm PRIVATE openswmm_engine)
target_include_directories(openswmm2d_wasm PRIVATE
    "${CMAKE_CURRENT_LIST_DIR}/../../third_party/openswmm-engine/include"
)

set_target_properties(openswmm2d_wasm PROPERTIES
    OUTPUT_NAME "openswmm2d"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_LIST_DIR}/../../public"
)

target_link_options(openswmm2d_wasm PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_ES6=0"
    "SHELL:-s EXPORT_NAME=createOpenSwmm2D"
    "SHELL:-s ENVIRONMENT=web,worker"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s FILESYSTEM=1"
    "SHELL:-s DISABLE_EXCEPTION_CATCHING=0"
    "SHELL:--no-entry"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['cwrap','FS','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_swmm_engine_create','_swmm_engine_destroy','_swmm_engine_open','_swmm_engine_initialize','_swmm_engine_start','_swmm_engine_step','_swmm_engine_stride','_swmm_engine_end','_swmm_engine_report','_swmm_engine_close','_swmm_2d_triangle_count','_swmm_2d_get_depths_bulk','_swmm_2d_get_heads_bulk','_swmm_2d_get_stat_max_velocities','_swmm_2d_get_continuity_error','_swmm_2d_get_solver_steps','_swmm_2d_get_mass_balance','_swmm_2d_vertex_count','_swmm_2d_get_edge_flux_bulk','_swmm_2d_edge_get_geometry_bulk','_swmm_2d_vertex_get_render_depths_bulk','_swmm_2d_vertex_get_heads_bulk','_swmm_2d_vertex_get_xyz_bulk','_swmm_node_count','_swmm_node_get_heads_bulk','_swmm_node_get_depths_bulk','_swmm_node_get_volumes_bulk','_swmm_node_set_lateral_inflow','_swmm_node_set_pond_area']"
    "SHELL:-s INITIAL_MEMORY=134217728"
    "SHELL:-s STACK_SIZE=5242880"
    "SHELL:-s WASM_ASYNC_COMPILATION=1"
)
