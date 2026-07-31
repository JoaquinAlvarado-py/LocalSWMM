#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
SOURCE="$ROOT/third_party/openswmm-engine"
BUILD="$ROOT/build/openswmm2d-wasm-emscripten"
LOCAL_EMSDK="$ROOT/.tools/emsdk"
VCPKG_ROOT="${VCPKG_ROOT:-$ROOT/.tools/vcpkg}"
VCPKG_TOOLCHAIN="$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake"

if ! command -v emcmake &> /dev/null; then
    if [ -f "$LOCAL_EMSDK/emsdk_env.sh" ]; then
        source "$LOCAL_EMSDK/emsdk_env.sh"
    fi
fi

if [ ! -f "$SOURCE/CMakeLists.txt" ]; then
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
    -DOPENSWMM_WITH_HYPRE=OFF \
    -DOPENSWMM_BUILD_GPU_PLUGIN=OFF \
    -DVCPKG_MANIFEST_NO_DEFAULT_FEATURES=ON \
    -DOPENSWMM_BUILD_TESTS=OFF \
    -DOPENSWMM_BUILD_CLI=OFF \
    -DOPENSWMM_BUILD_SHARED=OFF \
    -DOpenMP_C_FOUND=FALSE \
    -DOpenMP_CXX_FOUND=FALSE \
    -DCMAKE_DISABLE_FIND_PACKAGE_OpenMP=TRUE \
    -DOPENSWMM_WASM_INJECT_FILE="$ROOT/cmake/OpenSwmm2DWasm.cmake"

cmake --build "$BUILD" --target openswmm2d_wasm --parallel

if [ ! -f "$ROOT/public/openswmm2d.wasm" ]; then
    echo "Error: The build finished without producing public/openswmm2d.wasm."
    exit 1
fi

ENGINE_COMMIT=$(git -C "$SOURCE" rev-parse HEAD || echo "unknown")
ENGINE_DESCRIBE=$(git -C "$SOURCE" describe --always --dirty --tags 2>/dev/null || echo "$ENGINE_COMMIT")
DATE_NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat <<EOF > "$ROOT/public/openswmm2d.version.json"
{
  "engineCommit": "$ENGINE_COMMIT",
  "engineDescribe": "$ENGINE_DESCRIBE",
  "builtAtUtc": "$DATE_NOW"
}
EOF

echo "Built public/openswmm2d.js and public/openswmm2d.wasm"
echo "Engine source: $ENGINE_DESCRIBE ($ENGINE_COMMIT)"
