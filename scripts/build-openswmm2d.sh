#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
SOURCE="$ROOT/cmake/wasm"
BUILD="$ROOT/build/openswmm2d-wasm-emscripten"
LOCAL_EMSDK="$ROOT/.tools/emsdk"
VCPKG_ROOT="${VCPKG_ROOT:-$ROOT/.tools/vcpkg}"
VCPKG_TOOLCHAIN="$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake"

if ! command -v emcmake &> /dev/null; then
    if [ -f "$LOCAL_EMSDK/emsdk_env.sh" ]; then
        source "$LOCAL_EMSDK/emsdk_env.sh"
    fi
fi

if [ ! -f "$ROOT/third_party/openswmm-engine/CMakeLists.txt" ]; then
    echo "Error: OpenSWMM source is missing. Run: git submodule update --init --recursive"
    exit 1
fi

if [ ! -f "$VCPKG_TOOLCHAIN" ]; then
    echo "Error: vcpkg was not found at $VCPKG_ROOT."
    exit 1
fi

export VCPKG_DEFAULT_TRIPLET="wasm32-emscripten"
export VCPKG_OVERLAY_TRIPLETS="$ROOT/vcpkg-triplets"
export EMCC_SKIP_SANITY_CHECK="1"

mkdir -p "$BUILD"

EMSCALE_TOOLCHAIN="$LOCAL_EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake"
EMSDK_NODE="$(find "$LOCAL_EMSDK/node" -name node -type f | head -1)"

# Threaded build: pthreads + OpenMP solver loops. The node emulator lets
# CMake's FindOpenMP compile-and-run its probe with emcc; without it the
# engine falls back to SWMM_USE_OPENMP off and the pragmas compile out.
emcmake cmake -S "$SOURCE" -B "$BUILD" -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_CXX_SCAN_FOR_MODULES=OFF \
    -DCMAKE_TOOLCHAIN_FILE="$VCPKG_TOOLCHAIN" \
    -DVCPKG_CHAINLOAD_TOOLCHAIN_FILE="$EMSCALE_TOOLCHAIN" \
    -DVCPKG_TARGET_TRIPLET=wasm32-emscripten \
    -DVCPKG_MANIFEST_DIR="$ROOT" \
    -DOPENSWMM_BUILD_2D=ON \
    -DOPENSWMM_FORCE_SCALAR=ON \
    -DOPENSWMM_ENABLE_LTO=OFF \
    -DOPENSWMM_WITH_GEOPACKAGE=OFF \
    -DOPENSWMM_BUILD_GPU_PLUGIN=OFF \
    -DVCPKG_MANIFEST_NO_DEFAULT_FEATURES=ON \
    -DOPENSWMM_BUILD_TESTS=OFF \
    -DOPENSWMM_INSTALL=OFF \
    -UCMAKE_DISABLE_FIND_PACKAGE_OpenMP \
    -DCMAKE_CROSSCOMPILING_EMULATOR="$EMSDK_NODE" \
    -DCMAKE_C_FLAGS="-fopenmp" \
    -DCMAKE_CXX_FLAGS="-fopenmp"

cmake --build "$BUILD" --target openswmm2d_wasm --parallel

cp -f "$ROOT/public/openswmm2d.wasm" "$ROOT/public/swmm6wasm.wasm"
cp -f "$ROOT/public/openswmm2d.js" "$ROOT/public/swmm6wasm.js"
# Emscripten's current pthread model reuses the host script (no separate
# .worker.js); copy it anyway if a future toolchain emits one.
if [ -f "$ROOT/public/openswmm2d.worker.js" ]; then
    cp -f "$ROOT/public/openswmm2d.worker.js" "$ROOT/public/swmm6wasm.worker.js"
fi

ENGINE_COMMIT=$(git -C "$ROOT/third_party/openswmm-engine" rev-parse HEAD || echo "unknown")
ENGINE_DESCRIBE=$(git -C "$ROOT/third_party/openswmm-engine" describe --always --dirty --tags 2>/dev/null || echo "$ENGINE_COMMIT")
DATE_NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat <<EOF > "$ROOT/public/openswmm2d.version.json"
{
  "engineCommit": "$ENGINE_COMMIT",
  "engineDescribe": "$ENGINE_DESCRIBE",
  "builtAtUtc": "$DATE_NOW"
}
EOF

cat <<EOF > "$ROOT/public/swmm6wasm.version.json"
{
  "engineCommit": "$ENGINE_COMMIT",
  "engineDescribe": "$ENGINE_DESCRIBE",
  "builtAtUtc": "$DATE_NOW"
}
EOF

echo "Built public/openswmm2d.js/.wasm/.worker.js and public/swmm6wasm.js/.wasm/.worker.js"
echo "Engine source: $ENGINE_DESCRIBE ($ENGINE_COMMIT)"

