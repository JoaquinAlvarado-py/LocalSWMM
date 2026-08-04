// gpu2dWorker.js — production 2D worker: 1D WASM engine + WebGPU marcher
// (M2 split), same message contract as openSwmm2dWorker.js:
//   status2d / progress2d / results2d / error / stdout / stderr
//
// The 2D is marched on the GPU via webgpuMarscher.js; the 1D network runs
// in the WASM engine; the coupling exchange flows through the M2 split
// (couplingSplit.js). Falls back with a WEBGPU_* / VERTEX_COUPLING error so
// the app can retry with the WASM worker.

importScripts('../openswmm2d.js?v=' + Date.now());
importScripts('webgpuMarscher.js?v=' + Date.now());
importScripts('couplingSplit.js?v=' + Date.now());
self.postMessage({ type: 'debug', text: 'worker booted' });

let modulePromise = null;

function getModule() {
    if (!modulePromise) {
        const factory = typeof self.createOpenSwmm2D === 'function'
            ? self.createOpenSwmm2D
            : (typeof createOpenSwmm2D === 'function' ? createOpenSwmm2D : null);
        if (!factory) {
            throw new Error('OpenSWMM 2D WebAssembly factory was not exported. Run the 2D WASM build first.');
        }
        const loadBinary = self.pendingWasmBinary
            ? Promise.resolve(self.pendingWasmBinary)
            : fetch('../openswmm2d.wasm?v=' + Date.now()).then(r => {
                if (!r.ok) throw new Error(`Could not load openswmm2d.wasm: HTTP ${r.status}`);
                return r.arrayBuffer();
            });
        modulePromise = loadBinary.then(wasmBinary => {
            const wasmModule = new WebAssembly.Module(wasmBinary);
            return factory({
                wasmBinary,
                instantiateWasm(imports, receiveInstance) {
                    const instance = new WebAssembly.Instance(wasmModule, imports);
                    receiveInstance(instance, wasmModule);
                    return instance.exports;
                },
                locateFile: f => f.endsWith('.wasm') ? '../openswmm2d.wasm' : f,
                print: text => self.postMessage({ type: 'stdout', text: String(text) }),
                printErr: text => self.postMessage({ type: 'stderr', text: String(text) }),
                onAbort: reason => self.postMessage({ type: 'stderr', text: '[OpenSWMM 2D WASM abort] ' + String(reason || 'unknown reason') })
            });
        });
    }
    return modulePromise;
}

function bindApi(Module) {
    return {
        create: Module.cwrap('swmm_engine_create', 'number', []),
        open: Module.cwrap('swmm_engine_open', 'number', ['number', 'string', 'string', 'string', 'number']),
        initialize: Module.cwrap('swmm_engine_initialize', 'number', ['number']),
        start: Module.cwrap('swmm_engine_start', 'number', ['number', 'number']),
        stride: Module.cwrap('swmm_engine_stride', 'number', ['number', 'number', 'number']),
        end: Module.cwrap('swmm_engine_end', 'number', ['number']),
        report: Module.cwrap('swmm_engine_report', 'number', ['number']),
        close: Module.cwrap('swmm_engine_close', 'number', ['number']),
        destroy: Module.cwrap('swmm_engine_destroy', null, ['number']),
        nodeCount: Module.cwrap('swmm_node_count', 'number', ['number']),
        nodeHeads: Module.cwrap('swmm_node_get_heads_bulk', 'number', ['number', 'number', 'number']),
        nodeDepths: Module.cwrap('swmm_node_get_depths_bulk', 'number', ['number', 'number', 'number']),
        nodeVolumes: Module.cwrap('swmm_node_get_volumes_bulk', 'number', ['number', 'number', 'number']),
        setLatInflow: Module.cwrap('swmm_node_set_lateral_inflow', 'number', ['number', 'number', 'number']),
        setPondArea: Module.cwrap('swmm_node_set_pond_area', 'number', ['number', 'number', 'number'])
    };
}

async function requestGpuDevice() {
    if (!self.navigator.gpu) throw new Error('WEBGPU_UNAVAILABLE: navigator.gpu is undefined in this browser');
    const adapter = await self.navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('WEBGPU_UNAVAILABLE: no WebGPU adapter');
    try {
        return await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 16 } });
    } catch (e) {
        throw new Error('WEBGPU_UNAVAILABLE: storage-buffer limit 16 unsupported (' + e.message + ')');
    }
}

async function run2d(payload) {
    const status = stage => self.postMessage({ type: 'status2d', stage });
    status('loading-module');
    const Module = await getModule();
    status('module-ready');

    const inp = payload.inp;
    const mesh = CouplingSplit.parse2DMesh(inp);
    if (!mesh.triangles.length) throw new Error('No [2D_TRIANGLES] in the generated input.');
    const opts = CouplingSplit.parse2DOptions(inp);
    const coupling = CouplingSplit.parseCoupling(inp, mesh);
    if (coupling.vertexPoints.length) {
        throw new Error('VERTEX_COUPLING_UNSUPPORTED: vertex-based 2D coupling is not in the GPU marcher yet — falling back to the WASM worker.');
    }

    const device = await requestGpuDevice();
    status('gpu-ready');
    device.addEventListener('uncapturederror', ev => {
        self.postMessage({ type: 'stderr', text: '[WebGPU] device error: ' + (ev.error && ev.error.message) });
    });

    const api = bindApi(Module);
    const engine = api.create();
    const inputPath = '/model2d.inp', reportPath = '/model2d.rpt', outputPath = '/model2d.out';
    Module.FS.writeFile(inputPath, CouplingSplit.build1DInp(inp));
    status('input-written');
    const openCode = api.open(engine, inputPath, reportPath, outputPath, 0);
    if (openCode !== 0) throw new Error('1D open failed with code ' + openCode);
    status('model-opened');

    const marcher = await WebGPUMarcher.create(device, mesh, Object.assign({}, opts, {
        couplingNp: coupling.points.length,
        couplingPoints: coupling.points.map(p => ({ cell: p.cell }))
    }));
    // Pond-capable coupling nodes: the engine flags them coupled → can pond;
    // replicate with ALLOW_PONDING YES + the 2D footprint as ponded area.
    for (const p of coupling.points) {
        api.setPondArea(engine, p.node, marcher.getTriArea(p.cell));
    }
    api.initialize(engine);
    api.start(engine, 0);
    status('model-started');

    const simEndSec = CouplingSplit.simEndSec(inp);
    const frameIntervalSec = Math.max(1, (Number(payload.frameIntervalMs) || 60000) / 1000);
    const rainAt = CouplingSplit.rainMpsAt(inp);
    const result = await CouplingSplit.runSplit({
        Module, api, engine, marcher, coupling,
        simEndSec, frameIntervalSec, rainAt,
        onStatus: status,
        onProgress: elapsedMs => self.postMessage({ type: 'progress2d', elapsedMs })
    });

    api.close(engine);
    api.destroy(engine);

    const transferable = [];
    result.frames.forEach(f => {
        ['depth', 'head', 'velocity', 'velocityX', 'velocityY'].forEach(k => {
            if (f[k] && f[k].buffer) transferable.push(f[k].buffer);
        });
    });
    self.postMessage({
        type: 'results2d',
        triangleIds: payload.triangleIds,
        frames: result.frames,
        diagnostics: { massBalance: result.massBalance, gpu: true },
        report: result.report
    }, transferable);
}

self.onmessage = async (ev) => {
    const payload = ev.data || {};
    if (payload.type !== 'run2d') return;
    try {
        await run2d(payload);
    } catch (e) {
        self.postMessage({
            type: 'error',
            message: String(e && e.message || e),
            detail: e && e.stack || ''
        });
    }
};
