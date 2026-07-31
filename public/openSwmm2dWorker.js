// openSwmm2dWorker.js — OpenSWMM 2D WebAssembly worker

// Load the generated runtime before accepting a transferred WASM payload.
// Importing it after a large ArrayBuffer message can stall Chromium workers.
importScripts('openswmm2d.js?v=17');

let modulePromise = null;

function getModule() {
    if (!modulePromise) {
        const factory = typeof self.createOpenSwmm2D === 'function'
            ? self.createOpenSwmm2D
            : (typeof createOpenSwmm2D === 'function' ? createOpenSwmm2D : null);
        if (!factory) {
            throw new Error('OpenSWMM 2D WebAssembly factory was not exported. Run the 2D WASM build first.');
        }
        self.postMessage({ type: 'status2d', stage: self.pendingWasmBinary ? 'using-transferred-wasm' : 'fetching-wasm' });
        const loadBinary = self.pendingWasmBinary
            ? Promise.resolve(self.pendingWasmBinary)
            : fetch('openswmm2d.wasm').then(response => {
                if (!response.ok) throw new Error(`Could not load openswmm2d.wasm: HTTP ${response.status}`);
                return response.arrayBuffer();
            });
        modulePromise = loadBinary.then(wasmBinary => {
            self.postMessage({ type: 'status2d', stage: `wasm-loaded-${wasmBinary.byteLength}` });
            const wasmModule = new WebAssembly.Module(wasmBinary);
            self.postMessage({ type: 'status2d', stage: 'wasm-compiled' });
            const createThrottledPrintErr = () => {
                const counts = new Map();
                const MAX_DISTINCT_PRINTS = 3;
                const MAX_TOTAL_WARNINGS = 50;
                let totalSent = 0;

                return text => {
                    const str = String(text);
                    const key = str
                        .replace(/t\s*=\s*[\d.e+-]+/gi, 't = <val>')
                        .replace(/h\s*=\s*[\d.e+-]+/gi, 'h = <val>')
                        .replace(/Rank\s+\d+/gi, 'Rank <id>');

                    const entry = counts.get(key) || { printed: 0, suppressed: 0 };
                    entry.printed++;

                    if (entry.printed <= MAX_DISTINCT_PRINTS && totalSent < MAX_TOTAL_WARNINGS) {
                        totalSent++;
                        counts.set(key, entry);
                        self.postMessage({ type: 'stderr', text: str });
                    } else {
                        entry.suppressed++;
                        counts.set(key, entry);
                        if (entry.suppressed % 100 === 0 && totalSent < MAX_TOTAL_WARNINGS + 10) {
                            totalSent++;
                            self.postMessage({
                                type: 'stderr',
                                text: `[OpenSWMM 2D] Suppressed ${entry.suppressed} repeated log messages matching: "${key.slice(0, 100)}..."`
                            });
                        }
                    }
                };
            };

            return factory({
                wasmBinary,
                instantiateWasm(imports, receiveInstance) {
                    const instance = new WebAssembly.Instance(wasmModule, imports);
                    receiveInstance(instance, wasmModule);
                    return instance.exports;
                },
                locateFile: file => file.endsWith('.wasm') ? 'openswmm2d.wasm' : file,
                print: text => self.postMessage({ type: 'stdout', text: String(text) }),
                printErr: createThrottledPrintErr()
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
        step: Module.cwrap('swmm_engine_step', 'number', ['number', 'number']),
        stride: Module.cwrap('swmm_engine_stride', 'number', ['number', 'number', 'number']),
        end: Module.cwrap('swmm_engine_end', 'number', ['number']),
        report: Module.cwrap('swmm_engine_report', 'number', ['number']),
        close: Module.cwrap('swmm_engine_close', 'number', ['number']),
        destroy: Module.cwrap('swmm_engine_destroy', null, ['number']),
        cellCount: Module.cwrap('swmm_2d_triangle_count', 'number', ['number', 'number']),
        depths: Module.cwrap('swmm_2d_get_depths_bulk', 'number', ['number', 'number']),
        heads: Module.cwrap('swmm_2d_get_heads_bulk', 'number', ['number', 'number']),
        maxVelocities: Module.cwrap('swmm_2d_get_stat_max_velocities', 'number', ['number', 'number']),
        continuityError: Module.cwrap('swmm_2d_get_continuity_error', 'number', ['number', 'number']),
        solverSteps: Module.cwrap('swmm_2d_get_solver_steps', 'number', ['number', 'number']),
        cvodeSteps: Module.cwrap('swmm_2d_get_cvode_steps', 'number', ['number', 'number']),
        massBalance: Module.cwrap('swmm_2d_get_mass_balance', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'])
    };
}

function check(code, operation) {
    if (code !== 0) throw new Error(`${operation} failed with OpenSWMM error ${code}.`);
}

function readFrame(Module, api, engine, count, elapsedMs) {
    const bytes = count * Float64Array.BYTES_PER_ELEMENT;
    const depthPtr = Module._malloc(bytes);
    const headPtr = Module._malloc(bytes);
    const velocityPtr = Module._malloc(bytes);

    try {
        check(api.depths(engine, depthPtr), 'Reading 2D depths');
        check(api.heads(engine, headPtr), 'Reading 2D heads');
        check(api.maxVelocities(engine, velocityPtr), 'Reading 2D velocities');
        const readValues = pointer => Array.from(
            { length: count },
            (_, index) => Module.getValue(pointer + index * Float64Array.BYTES_PER_ELEMENT, 'double')
        );
        return {
            elapsedMs,
            depth: readValues(depthPtr),
            head: readValues(headPtr),
            velocity: readValues(velocityPtr)
        };
    } finally {
        Module._free(depthPtr);
        Module._free(headPtr);
        Module._free(velocityPtr);
    }
}

function readDiagnostics(Module, api, engine) {
    const values = Array.from({ length: 11 }, () => Module._malloc(Float64Array.BYTES_PER_ELEMENT));
    const stepsPtr = Module._malloc(4);
    try {
        const massCode = api.massBalance(engine, ...values.slice(0, 10));
        const continuityCode = api.continuityError(engine, values[10]);
        const getSteps = api.solverSteps || api.cvodeSteps;
        const stepsCode = getSteps ? getSteps(engine, stepsPtr) : -1;
        const value = pointer => Module.getValue(pointer, 'double');
        return {
            massBalance: massCode === 0 ? {
                initialVolume: value(values[0]), finalVolume: value(values[1]), rainfall: value(values[2]),
                coupling1DTo2D: value(values[3]), coupling2DTo1D: value(values[4]), outfallIn: value(values[5]),
                outfallOut: value(values[6]), boundaryIn: value(values[7]), boundaryOut: value(values[8]),
                evaporation: value(values[9]), continuityError: continuityCode === 0 ? value(values[10]) : null
            } : null,
            solverStats: stepsCode === 0 ? { internalSteps: Module.getValue(stepsPtr, 'i32') } : null
        };
    } finally {
        values.forEach(pointer => Module._free(pointer));
        Module._free(stepsPtr);
    }
}

async function run(payload) {
    self.postMessage({ type: 'status2d', stage: 'loading-module' });
    const Module = await getModule();
    self.postMessage({ type: 'status2d', stage: 'module-ready' });
    const api = bindApi(Module);
    const engine = api.create();
    const inputPath = '/model2d.inp';
    const reportPath = '/model2d.rpt';
    const outputPath = '/model2d.out';
    const elapsedPtr = Module._malloc(Float64Array.BYTES_PER_ELEMENT);
    const frames = [];
    const frameIntervalMs = Math.max(1000, Number(payload.frameIntervalMs) || 60000);
    const stepsPerYield = Math.max(1, Number(payload.stepsPerYield) || 256);
    let nextFrameMs = 0;
    let started = false;

    if (!engine) throw new Error('Could not create an OpenSWMM engine instance.');

    try {
        Module.FS.writeFile(inputPath, payload.inp);
        self.postMessage({ type: 'status2d', stage: 'input-written' });
        check(api.open(engine, inputPath, reportPath, outputPath, 0), 'Opening the 1D-2D model');
        self.postMessage({ type: 'status2d', stage: 'model-opened' });
        check(api.initialize(engine), 'Initializing the 1D-2D model');
        self.postMessage({ type: 'status2d', stage: 'model-initialized' });
        check(api.start(engine, 1), 'Starting the 1D-2D model');
        self.postMessage({ type: 'status2d', stage: 'model-started' });
        started = true;

        const countPtr = Module._malloc(4);
        check(api.cellCount(engine, countPtr), 'Reading the 2D triangle count');
        const count = Module.getValue(countPtr, 'i32');
        Module._free(countPtr);
        if (count <= 0) throw new Error('OpenSWMM loaded no 2D triangles from the generated input.');

        let elapsedDays = 0;
        do {
            check(api.stride(engine, stepsPerYield, elapsedPtr), 'Advancing the 1D-2D model');
            elapsedDays = Module.getValue(elapsedPtr, 'double');
            const elapsedMs = elapsedDays * 86400000;
            if (elapsedMs >= nextFrameMs || elapsedDays <= 0) {
                frames.push(readFrame(Module, api, engine, count, elapsedMs));
                nextFrameMs = elapsedMs + frameIntervalMs;
                self.postMessage({ type: 'progress2d', elapsedMs });
            }
        } while (elapsedDays > 0);

        const finalFrame = readFrame(Module, api, engine, count, elapsedDays * 86400000);
        if (!frames.length || frames[frames.length - 1].elapsedMs !== finalFrame.elapsedMs) frames.push(finalFrame);
        const diagnostics = readDiagnostics(Module, api, engine);
        check(api.end(engine), 'Ending the 1D-2D model');
        started = false;
        check(api.report(engine), 'Writing the 1D-2D report');

        const report = Module.FS.analyzePath(reportPath).exists ? Module.FS.readFile(reportPath, { encoding: 'utf8' }) : '';
        self.postMessage({
            type: 'results2d',
            triangleIds: payload.triangleIds,
            frames,
            diagnostics,
            report
        });
    } finally {
        // After a WASM trap the runtime is dead and every call below throws;
        // swallow those so cleanup failures don't mask the original error.
        const safely = fn => { try { fn(); } catch (e) { /* cleanup only */ } };
        if (started) safely(() => api.end(engine));
        safely(() => api.close(engine));
        safely(() => api.destroy(engine));
        safely(() => Module._free(elapsedPtr));
        [inputPath, reportPath, outputPath].forEach(path => {
            safely(() => { if (Module.FS.analyzePath(path).exists) Module.FS.unlink(path); });
        });
    }
}

self.onmessage = event => {
    if (!event.data || event.data.type !== 'run2d') return;
    self.pendingWasmBinary = event.data.wasmBinary || null;
    run(event.data).catch(error => {
        // The failed instance may be an aborted runtime with stale MEMFS state
        // (EXH recovery is MSVC-only); never reuse it for a later run.
        modulePromise = null;
        self.postMessage({ type: 'error', message: error && error.message ? error.message : String(error) });
    });
};
