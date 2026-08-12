$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Source = Join-Path $Root 'cmake/wasm'
$EngineSource = Join-Path $Root 'third_party/openswmm-engine'
# Keep the WebAssembly configuration isolated from any stale/native CMake cache.
$Build = Join-Path $Root 'build/openswmm2d-wasm-emscripten'
$LocalEmsdk = Join-Path $Root '.tools/emsdk'
$VcpkgRoot = if ($env:VCPKG_ROOT) { $env:VCPKG_ROOT } else { Join-Path $Root '.tools/vcpkg' }
$VcpkgToolchain = Join-Path $VcpkgRoot 'scripts/buildsystems/vcpkg.cmake'

if (-not (Get-Command emcmake -ErrorAction SilentlyContinue)) {
    $EmscriptenBin = Join-Path $LocalEmsdk 'upstream/emscripten'
    if (-not (Test-Path (Join-Path $EmscriptenBin 'emcmake.exe'))) {
        throw 'Emscripten is not active and no workspace-local SDK was found.'
    }
    $Node = Get-ChildItem (Join-Path $LocalEmsdk 'node') -Filter node.exe -Recurse | Select-Object -First 1
    $Python = Get-ChildItem (Join-Path $LocalEmsdk 'python') -Filter python.exe -Recurse | Select-Object -First 1
    $env:EMSDK = $LocalEmsdk
    $env:EMSDK_NODE = $Node.FullName
    $env:EMSDK_PYTHON = $Python.FullName
    $env:PATH = "$LocalEmsdk;$EmscriptenBin;$($Python.DirectoryName);$($Node.DirectoryName);$env:PATH"
}

# CMake treats trailing Windows separators as escapes in generated scripts.
$env:EMSDK = $env:EMSDK.TrimEnd('\', '/').Replace('\', '/')
if (-not (Test-Path (Join-Path $EngineSource 'CMakeLists.txt'))) {
    throw 'OpenSWMM source is missing. Run: git submodule update --init --recursive'
}
if (-not (Test-Path $VcpkgToolchain)) {
    throw "vcpkg was not found at $VcpkgRoot. Set VCPKG_ROOT to an initialized vcpkg checkout."
}

$env:VCPKG_DEFAULT_TRIPLET = 'wasm32-emscripten'
$env:VCPKG_OVERLAY_TRIPLETS = Join-Path $Root 'vcpkg-triplets'
# Ninja may invoke Emscripten through Windows short paths while the SDK was
# configured through its long path. Avoid concurrent sanity checks clearing the
# shared cache when those equivalent path spellings differ.
$env:EMCC_SKIP_SANITY_CHECK = '1'

New-Item -ItemType Directory -Force -Path $Build | Out-Null

$Ninja = Get-ChildItem (Join-Path $VcpkgRoot 'downloads/tools') -Filter ninja.exe -Recurse | Select-Object -First 1
if (-not $Ninja) {
    throw 'Ninja was not found in the local vcpkg tool cache.'
}
$EmscriptenToolchain = Join-Path $LocalEmsdk 'upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake'

# Threaded build: pthreads + OpenMP solver loops (Emscripten maps OpenMP
# pragmas onto pthreads/SharedArrayBuffer). The node emulator lets
# FindOpenMP run its probe under emcc so SWMM_USE_OPENMP gets defined.
& cmake -S $Source -B $Build -G Ninja `
    "-DCMAKE_BUILD_TYPE=Release" `
    "-DCMAKE_CXX_SCAN_FOR_MODULES=OFF" `
    "-DCMAKE_MAKE_PROGRAM=$($Ninja.FullName)" `
    "-DCMAKE_TOOLCHAIN_FILE=$VcpkgToolchain" `
    "-DVCPKG_CHAINLOAD_TOOLCHAIN_FILE=$EmscriptenToolchain" `
    "-DCMAKE_CROSSCOMPILING_EMULATOR=$($Node.FullName)" `
    "-DVCPKG_TARGET_TRIPLET=wasm32-emscripten" `
    "-DVCPKG_MANIFEST_DIR=$Root" `
    "-DOPENSWMM_BUILD_2D=ON" `
    "-DOPENSWMM_FORCE_SCALAR=ON" `
    "-DOPENSWMM_ENABLE_LTO=ON" `
    "-DOPENSWMM_WITH_GEOPACKAGE=OFF" `
    "-DOPENSWMM_BUILD_GPU_PLUGIN=OFF" `
    "-DOPENSWMM_BUILD_TESTS=OFF" `
    "-DOPENSWMM_INSTALL=OFF" `
    "-DVCPKG_MANIFEST_NO_DEFAULT_FEATURES=ON" `
    "-UCMAKE_DISABLE_FIND_PACKAGE_OpenMP" `
    "-DCMAKE_C_FLAGS=-fopenmp -msimd128" `
    "-DCMAKE_CXX_FLAGS=-fopenmp -msimd128"

& cmake --build $Build --target openswmm2d_wasm --parallel

Copy-Item -Force (Join-Path $Root 'public/openswmm2d.wasm') (Join-Path $Root 'public/swmm6wasm.wasm')
Copy-Item -Force (Join-Path $Root 'public/openswmm2d.js') (Join-Path $Root 'public/swmm6wasm.js')
# Emscripten's current pthread model reuses the host script (no separate
# .worker.js); copy it anyway if a future toolchain emits one.
$WorkerJs = Join-Path $Root 'public/openswmm2d.worker.js'
if (Test-Path $WorkerJs) { Copy-Item -Force $WorkerJs (Join-Path $Root 'public/swmm6wasm.worker.js') }

$EngineCommit = 'unknown'
$EngineDescribe = 'unknown'
try {
    $EngineCommit = (& git -C $EngineSource rev-parse HEAD 2>$null).Trim()
    $EngineDescribe = (& git -C $EngineSource describe --always --dirty --tags 2>$null).Trim()
    if (-not $EngineDescribe) { $EngineDescribe = $EngineCommit }
} catch {
    # The submodule checkout is not always a git repo (plain copy) — the
    # stamp falls back to 'unknown' instead of failing the build.
}
$Stamp = [ordered]@{
    engineCommit   = $EngineCommit
    engineDescribe = $EngineDescribe
    builtAtUtc     = (Get-Date).ToUniversalTime().ToString('o')
}
$Stamp | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $Root 'public/openswmm2d.version.json')
$Stamp | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $Root 'public/swmm6wasm.version.json')

Write-Host 'Built public/openswmm2d.js, public/openswmm2d.wasm, public/swmm6wasm.js, public/swmm6wasm.wasm'
Write-Host "Engine source: $($Stamp.engineDescribe) ($EngineCommit)"

