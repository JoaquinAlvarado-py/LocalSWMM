set(CMAKE_EXECUTABLE_SUFFIX ".js")

if(TARGET openswmm2d_wasm)
    return()
endif()

add_executable(openswmm2d_wasm
    "${CMAKE_CURRENT_LIST_DIR}/../wasm/openswmm2d_exports.cpp"
)

target_link_libraries(openswmm2d_wasm PRIVATE openswmm_engine)
target_include_directories(openswmm2d_wasm PRIVATE
    "${CMAKE_CURRENT_LIST_DIR}/../third_party/openswmm-engine/include"
)

set_target_properties(openswmm2d_wasm PROPERTIES
    OUTPUT_NAME "openswmm2d"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_LIST_DIR}/../public"
)

target_link_options(openswmm2d_wasm PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_ES6=0"
    "SHELL:-s EXPORT_NAME=createOpenSwmm2D"
    "SHELL:-s ENVIRONMENT=web,worker"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s FILESYSTEM=1"
    "SHELL:--no-entry"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['cwrap','FS','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_swmm_engine_create','_swmm_engine_destroy','_swmm_engine_open','_swmm_engine_initialize','_swmm_engine_start','_swmm_engine_step','_swmm_engine_stride','_swmm_engine_end','_swmm_engine_report','_swmm_engine_close','_swmm_2d_triangle_count','_swmm_2d_get_depths_bulk','_swmm_2d_get_heads_bulk','_swmm_2d_get_stat_max_velocities','_swmm_2d_get_continuity_error','_swmm_2d_get_solver_steps','_swmm_2d_get_mass_balance']"
    "SHELL:-s INITIAL_MEMORY=134217728"
    "SHELL:-s STACK_SIZE=5242880"
    "SHELL:-s WASM_ASYNC_COMPILATION=1"
)
