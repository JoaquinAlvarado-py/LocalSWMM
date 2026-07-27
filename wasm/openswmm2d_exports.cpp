#include <openswmm/engine/openswmm_2d.h>
#include <openswmm/engine/openswmm_engine.h>

// The browser hosts OpenSWMM through its exported C API; there is no program
// entry point. Keeping this translation unit source-only avoids Emscripten's
// main/run lifecycle interfering with modular worker initialization.
