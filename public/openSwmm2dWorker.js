// openSwmm2dWorker.js — OpenSWMM 2D WebAssembly worker

// Load the generated runtime before accepting a transferred WASM payload.
// Importing it after a large ArrayBuffer message can stall Chromium workers.
importScripts('openswmm2d.js?v=' + Date.now());

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
            : fetch('openswmm2d.wasm?v=' + Date.now()).then(response => {
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
                printErr: createThrottledPrintErr(),
                onAbort: reason => self.postMessage({ type: 'stderr', text: '[OpenSWMM 2D WASM abort] ' + String(reason || 'unknown reason') })
            });
            });
    }
    return modulePromise;
}

function bindApi(Module) {
    const optional = (name, ret, args) => typeof Module['_' + name] === 'function' ? Module.cwrap(name, ret, args) : null;
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
        solverSteps: optional('swmm_2d_get_solver_steps', 'number', ['number', 'number']),
        cvodeSteps: optional('swmm_2d_get_cvode_steps', 'number', ['number', 'number']),
        massBalance: Module.cwrap('swmm_2d_get_mass_balance', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']),
        vertexCount: optional('swmm_2d_vertex_count', 'number', ['number', 'number']),
        vertexXYZ: optional('swmm_2d_vertex_get_xyz_bulk', 'number', ['number', 'number', 'number', 'number']),
        edgeGeometry: optional('swmm_2d_edge_get_geometry_bulk', 'number', ['number', 'number', 'number', 'number']),
        edgeFlux: optional('swmm_2d_get_edge_flux_bulk', 'number', ['number', 'number']),
        vertexDepths: optional('swmm_2d_vertex_get_render_depths_bulk', 'number', ['number', 'number']),
        vertexHeads: optional('swmm_2d_vertex_get_heads_bulk', 'number', ['number', 'number'])
    };
}

function check(code, operation, Module, reportPath, payload) {
    if (code !== 0) {
        let msg = `${operation} failed with OpenSWMM error ${code}.`;
        let rptContent = '';
        if (Module && reportPath) {
            try {
                if (Module.FS.analyzePath(reportPath).exists) {
                    rptContent = Module.FS.readFile(reportPath, { encoding: 'utf8' });
                }
            } catch (e) {
                // ignore
            }
        }
        if (rptContent && rptContent.trim()) {
            const lines = rptContent.split('\n').map(l => l.trim());
            const errLines = lines.filter(l => 
                l.includes('ERROR') || l.includes('error') || l.includes('failed') || 
                l.includes('invalid') || l.includes('2D') || l.includes('1D') || 
                l.includes('unknown') || l.includes('Unknown')
            );
            if (errLines.length > 0) {
                msg += `\n\nEngine Error Details:\n- ` + errLines.join('\n- ');
            } else {
                msg += `\n\nEngine Report:\n` + rptContent.trim().slice(-1500);
            }
            try {
                self.postMessage({ type: 'stderr', text: `[OpenSWMM 2D Report]\n` + rptContent });
            } catch (e) {}
        }
        if (payload && payload.inp) {
            try {
                self.postMessage({ type: 'stderr', text: `[OpenSWMM 2D INP Snippet]\n` + payload.inp.slice(0, 3000) });
            } catch (e) {}
        }
        console.error('OpenSWMM 2D check failed:', msg);
        if (rptContent) console.error('Full RPT Content:\n', rptContent);
        if (payload && payload.inp) console.error('Full INP Content:\n', payload.inp);
        throw new Error(msg);
    }
}

function readDoubleArray(Module, ptr, count) {
    const arr = new Float64Array(count);
    for (let i = 0; i < count; i++) {
        arr[i] = Module.getValue(ptr + (i * 8), 'double');
    }
    return arr;
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
        return {
            elapsedMs,
            depth: readDoubleArray(Module, depthPtr, count),
            head: readDoubleArray(Module, headPtr, count),
            velocity: readDoubleArray(Module, velocityPtr, count)
        };
    } finally {
        Module._free(depthPtr);
        Module._free(headPtr);
        Module._free(velocityPtr);
    }
}

function readVertexFields(Module, api, engine) {
    if (!api.vertexCount || !api.vertexDepths || !api.vertexHeads) return null;
    const countPtr = Module._malloc(4);
    try {
        if (api.vertexCount(engine, countPtr) !== 0) return null;
        const count = Module.getValue(countPtr, 'i32');
        if (count <= 0) return null;
        const d = Module._malloc(count * 8), h = Module._malloc(count * 8);
        try {
            if (api.vertexDepths(engine, d) !== 0 || api.vertexHeads(engine, h) !== 0) return null;
            return { depth: readDoubleArray(Module, d, count), head: readDoubleArray(Module, h, count) };
        } finally { Module._free(d); Module._free(h); }
    } finally { Module._free(countPtr); }
}

function readVelocity(Module, api, engine, depths, triangleVertices, dryDepth, geometryCache) {
    if (!api.edgeGeometry || !api.edgeFlux || !triangleVertices) return null;
    const n = depths.length, bytes = n * 3 * 8;
    geometryCache = geometryCache || {};
    const flux = Module._malloc(bytes);
    try {
        if (api.edgeFlux(engine, flux) !== 0) return null;
        if (!geometryCache.length) {
            const len = Module._malloc(bytes), nx = Module._malloc(bytes), ny = Module._malloc(bytes);
            try {
                if (api.edgeGeometry(engine, len, nx, ny) !== 0) return null;
                geometryCache.length = readDoubleArray(Module, len, n * 3);
                geometryCache.nx = readDoubleArray(Module, nx, n * 3);
                geometryCache.ny = readDoubleArray(Module, ny, n * 3);
            } finally { Module._free(len); Module._free(nx); Module._free(ny); }
        }
        const f = readDoubleArray(Module, flux, n * 3), l = geometryCache.length, x = geometryCache.nx, y = geometryCache.ny;
        const magnitudes = new Float64Array(n), vxOut = new Float64Array(n), vyOut = new Float64Array(n);
        depths.forEach(function (h, i) {
            if (!(h > (dryDepth || 0.001))) return;
            let a = 0, b = 0, c = 0, d = 0, e = 0, q0, q1, q2;
            for (let k = 0; k < 3; k++) { const q = l[i * 3 + k] ? f[i * 3 + k] / l[i * 3 + k] : 0; const nxk = x[i * 3 + k], nyk = y[i * 3 + k]; a += nxk * nxk; b += nxk * nyk; c += nyk * nyk; if (k === 0) q0 = q; else if (k === 1) q1 = q; else q2 = q; }
            // Use all three rows of N^T q. The first two rows define the
            // least-squares system; the third contributes to its RHS.
            let rx = 0, ry = 0; for (let k = 0; k < 3; k++) { rx += x[i * 3 + k] * [q0, q1, q2][k]; ry += y[i * 3 + k] * [q0, q1, q2][k]; }
            const det = a * c - b * b; if (Math.abs(det) < 1e-12) return;
            // Edge flux reconstructs specific discharge (q = h * v). Convert
            // it to physical velocity for the animation and velocity KPI.
            const vx = (c * rx - b * ry) / det / h, vy = (a * ry - b * rx) / det / h;
            vxOut[i] = vx; vyOut[i] = vy; magnitudes[i] = Math.hypot(vx, vy);
        });
        return { mag: magnitudes, vx: vxOut, vy: vyOut };
    } finally { Module._free(flux); }
}

function readDiagnostics(Module, api, engine, count) {
    const values = Array.from({ length: 11 }, () => Module._malloc(Float64Array.BYTES_PER_ELEMENT));
    const stepsPtr = Module._malloc(4);
    const maxVelocityPtr = Module._malloc(Math.max(1, count || 1) * Float64Array.BYTES_PER_ELEMENT);
    try {
        const massCode = api.massBalance(engine, ...values.slice(0, 10));
        const continuityCode = api.continuityError(engine, values[10]);
        const getSteps = api.solverSteps || api.cvodeSteps;
        const stepsCode = getSteps ? getSteps(engine, stepsPtr) : -1;
        const value = pointer => Module.getValue(pointer, 'double');
        const maxVelocityCode = api.maxVelocities(engine, maxVelocityPtr);
        return {
            massBalance: massCode === 0 ? {
                initialVolume: value(values[0]), finalVolume: value(values[1]), rainfall: value(values[2]),
                coupling1DTo2D: value(values[3]), coupling2DTo1D: value(values[4]), outfallIn: value(values[5]),
                outfallOut: value(values[6]), boundaryIn: value(values[7]), boundaryOut: value(values[8]),
                evaporation: value(values[9]), continuityError: continuityCode === 0 ? value(values[10]) : null
            } : null,
            solverStats: stepsCode === 0 ? { internalSteps: Module.getValue(stepsPtr, 'i32') } : null,
            maxVelocities: maxVelocityCode === 0 ? readDoubleArray(Module, maxVelocityPtr, count || 0) : null
        };
    } finally {
        values.forEach(pointer => Module._free(pointer));
        Module._free(stepsPtr);
        Module._free(maxVelocityPtr);
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
    let meshFilePath = null;
    const velocityGeometry = {};

    if (!engine) throw new Error('Could not create an OpenSWMM engine instance.');

    try {
        Module.FS.writeFile(inputPath, payload.inp);
        if (payload.meshFile && payload.meshFile.name && payload.meshFile.content) {
            meshFilePath = '/' + String(payload.meshFile.name).replace(/\\/g, '/').split('/').pop().replace(/[^A-Za-z0-9._-]/g, '_');
            Module.FS.writeFile(meshFilePath, payload.meshFile.content);
        }
        self.postMessage({ type: 'status2d', stage: 'input-written' });
        check(api.open(engine, inputPath, reportPath, outputPath, 0), 'Opening the 1D-2D model', Module, reportPath, payload);
        self.postMessage({ type: 'status2d', stage: 'model-opened' });
        check(api.initialize(engine), 'Initializing the 1D-2D model', Module, reportPath, payload);
        self.postMessage({ type: 'status2d', stage: 'model-initialized' });
        check(api.start(engine, 1), 'Starting the 1D-2D model', Module, reportPath, payload);
        self.postMessage({ type: 'status2d', stage: 'model-started' });
        started = true;

        const countPtr = Module._malloc(4);
        check(api.cellCount(engine, countPtr), 'Reading the 2D triangle count', Module, reportPath, payload);
        const count = Module.getValue(countPtr, 'i32');
        Module._free(countPtr);
        if (count <= 0) throw new Error('OpenSWMM loaded no 2D triangles from the generated input.');
        if (payload.triangleIds && count !== payload.triangleIds.length) {
            throw new Error(`2D engine cell count (${count}) does not match mesh triangle count (${payload.triangleIds.length}).`);
        }

        let elapsedDays = 0;
        let iteration = 0;
        const MAX_ITERATIONS = 10000000;
        do {
            check(api.stride(engine, stepsPerYield, elapsedPtr), 'Advancing the 1D-2D model', Module, reportPath, payload);
            elapsedDays = Module.getValue(elapsedPtr, 'double');
            const elapsedMs = elapsedDays * 86400000;
            if (elapsedMs >= nextFrameMs || elapsedDays <= 0) {
                const frame = readFrame(Module, api, engine, count, elapsedMs);
                if (payload.wantVertexFields) frame.vertex = readVertexFields(Module, api, engine);
                const instantVelocity = readVelocity(Module, api, engine, frame.depth, payload.triangleVertices, payload.dryDepth, velocityGeometry);
                if (instantVelocity) { frame.velocity = instantVelocity.mag; frame.velocityX = instantVelocity.vx; frame.velocityY = instantVelocity.vy; }
                frames.push(frame);
                nextFrameMs = elapsedMs + frameIntervalMs;
                self.postMessage({ type: 'progress2d', elapsedMs });
            }
            iteration++;
            if (iteration > MAX_ITERATIONS) {
                throw new Error('2D simulation exceeded maximum iteration safety limit.');
            }
        } while (elapsedDays > 0);

        // A natural-completion stride can write elapsedDays=0 even though the
        // last sampled frame already contains the end-of-run state. Do not
        // append that completion marker: it breaks the timeline and makes the
        // renderer choose a fake t=0 frame as its final field.
        const finalElapsedMs = elapsedDays > 0
            ? elapsedDays * 86400000
            : (frames.length ? frames[frames.length - 1].elapsedMs : 0);
        const finalFrame = readFrame(Module, api, engine, count, finalElapsedMs);
        if (payload.wantVertexFields) finalFrame.vertex = readVertexFields(Module, api, engine);
        const finalVelocity = readVelocity(Module, api, engine, finalFrame.depth, payload.triangleVertices, payload.dryDepth, velocityGeometry);
        if (finalVelocity) { finalFrame.velocity = finalVelocity.mag; finalFrame.velocityX = finalVelocity.vx; finalFrame.velocityY = finalVelocity.vy; }
        if (!frames.length || finalFrame.elapsedMs > frames[frames.length - 1].elapsedMs) frames.push(finalFrame);
        const diagnostics = readDiagnostics(Module, api, engine, count);
        check(api.end(engine), 'Ending the 1D-2D model', Module, reportPath, payload);
        started = false;
        check(api.report(engine), 'Writing the 1D-2D report', Module, reportPath, payload);

        const report = Module.FS.analyzePath(reportPath).exists ? Module.FS.readFile(reportPath, { encoding: 'utf8' }) : '';
        const transferable = [];
        frames.forEach(frame => {
            ['depth', 'head', 'velocity', 'velocityX', 'velocityY'].forEach(key => { if (frame[key] && frame[key].buffer) transferable.push(frame[key].buffer); });
            if (frame.vertex) ['depth', 'head'].forEach(key => { if (frame.vertex[key] && frame.vertex[key].buffer) transferable.push(frame.vertex[key].buffer); });
        });
        if (diagnostics.maxVelocities && diagnostics.maxVelocities.buffer) transferable.push(diagnostics.maxVelocities.buffer);
        self.postMessage({
            type: 'results2d',
            triangleIds: payload.triangleIds,
            frames,
            diagnostics,
            report
        }, transferable);
    } finally {
        // After a WASM trap the runtime is dead and every call below throws;
        // swallow those so cleanup failures don't mask the original error.
        const safely = fn => { try { fn(); } catch (e) { /* cleanup only */ } };
        if (started) safely(() => api.end(engine));
        safely(() => api.close(engine));
        safely(() => api.destroy(engine));
        safely(() => Module._free(elapsedPtr));
        [inputPath, reportPath, outputPath, meshFilePath].filter(Boolean).forEach(path => {
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
        self.postMessage({
            type: 'error',
            message: error && error.message ? error.message : String(error),
            detail: error && error.stack ? error.stack : ''
        });
    });
};
