// simWorker.js — Runs the SWMM WASM engine off the main thread.
// Receives: { type: 'run', inpText, files? }   files: { name: string|ArrayBuffer }
// Sends:    { type: 'ready' } once the engine binary is compiled
//           { type: 'log', text } / { type: 'err', text }
//           { type: 'done', rpt, outBuffer } (outBuffer transferred)
//           { type: 'error', message }
//
// The worker persists across runs: the .wasm binary is fetched and compiled
// once, then each run instantiates a fresh engine (fresh memory + FS) from the
// cached compiled module via Emscripten's instantiateWasm hook. A fresh
// instance per run is required — repeated callMain on one instance fails on
// some builds — but re-instantiating a compiled module costs only ~10-50 ms.

'use strict';

importScripts('swmm6wasm.js?v=19');

let compiledWasmPromise = null;
function getCompiledWasm() {
    if (!compiledWasmPromise) {
        compiledWasmPromise = (async () => {
            const resp = await fetch('swmm6wasm.wasm?v=19');
            try {
                return await WebAssembly.compileStreaming(resp.clone());
            } catch (e) {
                // server sent a wrong MIME type — compile from bytes instead
                return WebAssembly.compile(await resp.arrayBuffer());
            }
        })();
        compiledWasmPromise.then(
            () => self.postMessage({ type: 'ready' }),
            () => { compiledWasmPromise = null; }
        );
    }
    return compiledWasmPromise;
}
getCompiledWasm(); // pre-warm: compile while the user is still editing

async function createEngine() {
    const opts = {
        noInitialRun: true,
        print: (text) => self.postMessage({ type: 'log', text }),
        printErr: (text) => self.postMessage({ type: 'err', text })
    };
    const factory = (typeof createModule === 'function') ? createModule : (typeof createOpenSwmm2D === 'function' ? createOpenSwmm2D : null);
    if (!factory) throw new Error('No WASM module factory function found.');
    try {
        const wasmModule = await getCompiledWasm();
        return await factory({
            ...opts,
            instantiateWasm: (imports, onSuccess) => {
                WebAssembly.instantiate(wasmModule, imports)
                    .then(instance => onSuccess(instance, wasmModule))
                    .catch(err => self.postMessage({ type: 'err', text: 'WASM instantiate failed: ' + err.message }));
                return {}; // async instantiation
            }
        });
    } catch (e) {
        // glue without instantiateWasm support, or compile failure — let
        // Emscripten fetch and instantiate the binary itself
        return factory(opts);
    }
}

let busy = false;

self.onmessage = async (e) => {
    const msg = e.data || {};
    if (msg.type !== 'run') return;
    if (busy) {
        self.postMessage({ type: 'error', message: 'A simulation is already running.' });
        return;
    }
    busy = true;

    try {
        // No progress ticker here: the engine runs as a single blocking
        // stride()/callMain and reports nothing incremental, and app.js drives
        // the UI progress bar from its own timer while explicitly ignoring any
        // 'progress' message from this worker. So we post only
        // ready/log/err/done/error.
        const Module = await createEngine();
        Module.FS.writeFile('/in.inp', msg.inpText);

        // auxiliary inputs, e.g. rain files referenced by FILE-based gauges
        if (msg.files) {
            for (const [name, data] of Object.entries(msg.files)) {
                Module.FS.writeFile('/' + name.replace(/^\/+/, ''),
                    data instanceof ArrayBuffer ? new Uint8Array(data) : data);
            }
        }

        try {
            let ran = false;
            let hasEngineCreate = false;
            try { hasEngineCreate = typeof Module._swmm_engine_create === 'function' || typeof Module.cwrap === 'function'; } catch (err) { }
            if (hasEngineCreate && typeof Module.cwrap === 'function') {
                const create = Module.cwrap('swmm_engine_create', 'number', []);
                const open = Module.cwrap('swmm_engine_open', 'number', ['number', 'string', 'string', 'string', 'number']);
                const initialize = Module.cwrap('swmm_engine_initialize', 'number', ['number']);
                const start = Module.cwrap('swmm_engine_start', 'number', ['number', 'number']);
                const stride = Module.cwrap('swmm_engine_stride', 'number', ['number', 'number', 'number']);
                const end = Module.cwrap('swmm_engine_end', 'number', ['number']);
                const report = Module.cwrap('swmm_engine_report', 'number', ['number']);
                const close = Module.cwrap('swmm_engine_close', 'number', ['number']);
                const destroy = Module.cwrap('swmm_engine_destroy', null, ['number']);

                const engine = create();
                const openRes = open(engine, '/in.inp', '/rpt.rpt', '/out.out', 0);
                if (openRes !== 0) throw new Error('SWMM engine open failed with status code ' + openRes);
                initialize(engine);
                start(engine, 1);
                const elapsedPtr = Module._malloc(8);
                stride(engine, 10000000, elapsedPtr);
                if (typeof Module._free === 'function') Module._free(elapsedPtr);
                end(engine);
                report(engine);
                close(engine);
                destroy(engine);
                ran = true;
            } else if (typeof Module.callMain === 'function') {
                Module.callMain(['/in.inp', '/rpt.rpt', '/out.out']);
                ran = true;
            } else {
                // Safely check for ccall to avoid getter aborts in newer Emscripten
                let hasCCall = false;
                try { hasCCall = typeof Module.ccall === 'function'; } catch (err) { }
                if (hasCCall && typeof Module._swmm_run === 'function') {
                    Module.ccall('swmm_run', 'number', ['string', 'string', 'string'], ['/in.inp', '/rpt.rpt', '/out.out']);
                    ran = true;
                } else if (typeof Module.run === 'function') {
                    Module.run(['/in.inp', '/rpt.rpt', '/out.out']);
                    ran = true;
                }
            }
            if (!ran) throw new Error('No entry point found in SWMM WebAssembly module.');
        } catch (err) {
            // Emscripten's exit() throws ExitStatus — a report may still exist.
            // Anything else is a genuine trap: the engine's exception handling
            // (EXH) is MSVC-only and compiles to nothing under Emscripten, so a
            // partial .rpt/.out must not be read back as this run's result.
            if (err && err.name === 'ExitStatus') {
                if (err.status !== undefined && err.status !== 0) {
                    throw new Error('SWMM engine exited with error code ' + err.status);
                }
                self.postMessage({ type: 'err', text: 'SWMM engine exit: ' + (err.message || err) });
            } else {
                throw new Error('SWMM engine crashed: ' + ((err && err.message) || err));
            }
        }

        let rpt = '';
        try {
            rpt = Module.FS.readFile('/rpt.rpt', { encoding: 'utf8' });
        } catch (err) {
            throw new Error('Simulation produced no report file.');
        }

        let outBuffer = null;
        try {
            const outBytes = Module.FS.readFile('/out.out'); // Uint8Array on WASM heap
            outBuffer = outBytes.buffer.slice(outBytes.byteOffset, outBytes.byteOffset + outBytes.byteLength);
        } catch (err) {
            self.postMessage({ type: 'err', text: 'Simulation produced no binary .out file.' });
        }

        busy = false;
        if (outBuffer) {
            self.postMessage({ type: 'done', rpt, outBuffer }, [outBuffer]);
        } else {
            self.postMessage({ type: 'done', rpt, outBuffer: null });
        }
    } catch (err) {
        busy = false;
        self.postMessage({ type: 'error', message: err.message || String(err) });
    }
};
