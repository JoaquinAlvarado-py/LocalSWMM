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

importScripts('build-version.js');
importScripts('swmm6wasm.js?v=' + (typeof BUILD_STAMP !== 'undefined' ? BUILD_STAMP : Date.now()));

let compiledWasmPromise = null;
function getCompiledWasm() {
    if (!compiledWasmPromise) {
        compiledWasmPromise = (async () => {
            const wasmVer = typeof BUILD_STAMP !== 'undefined' ? BUILD_STAMP : 'dev';
            const resp = await fetch('swmm6wasm.wasm?v=' + wasmVer);
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
            },
            locateFile: file => {
                if (file.endsWith('.worker.js')) return 'swmm6wasm.worker.js';
                if (file.endsWith('.wasm')) return 'swmm6wasm.wasm';
                return file;
            }
        });
    } catch (e) {
        // glue without instantiateWasm support, or compile failure — let
        // Emscripten fetch and instantiate the binary itself
        return factory(opts);
    }
}

let busy = false;

// Total simulated duration in days, parsed from [OPTIONS] (0 = unknown).
// Mirrors the engine's date handling: mm/dd/yyyy (or mm-dd-yyyy), both
// separators accepted.
function parseSimDurationDays(inpText) {
    const opt = {};
    let inOptions = false;
    for (let line of String(inpText).split(/\r?\n/)) {
        line = line.replace(/;.*$/, '').trim();
        if (!line) continue;
        if (line.startsWith('[') && line.endsWith(']')) {
            inOptions = line.toUpperCase() === '[OPTIONS]';
            continue;
        }
        if (inOptions) {
            const parts = line.split(/\s+/);
            opt[parts[0].toUpperCase()] = parts.slice(1).join(' ');
        }
    }
    const toMs = (d) => {
        if (!d) return null;
        const p = String(d).split(/[/-]/).map(Number);
        if (p.length !== 3 || p.some(isNaN)) return null;
        if (p[0] > 1000) return Date.UTC(p[0], p[1] - 1, p[2]);
        return Date.UTC(p[2], p[0] - 1, p[1]);
    };
    const toSec = (t, dflt) => {
        if (t === undefined || t === '') return dflt;
        if (String(t).includes(':')) {
            const p = String(t).split(':').map(Number);
            if (p.some(isNaN)) return dflt;
            return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
        }
        const v = Number(t);
        return isNaN(v) ? dflt : v;
    };
    const startMs = toMs(opt.START_DATE);
    if (startMs === null) return 0;
    const endMs = toMs(opt.END_DATE) ?? startMs;
    const dfltEndTime = (endMs === startMs) ? 86400 : 0;
    const durSec = ((endMs + toSec(opt.END_TIME, dfltEndTime) * 1000)
        - (startMs + toSec(opt.START_TIME, 0) * 1000)) / 1000;
    return durSec > 0 ? durSec / 86400 : 0;
}

// When this script is re-executed as an Emscripten pthread worker
// (globalThis.name === 'em-pthread'), the glue's own message handler must not
// be clobbered: it is how the runtime distributes SharedArrayBuffer work.
if (globalThis.name !== 'em-pthread') {
    self.onmessage = async (e) => {
    const msg = e.data || {};
    if (msg.type !== 'run') return;
    if (busy) {
        self.postMessage({ type: 'error', message: 'A simulation is already running.' });
        return;
    }
    busy = true;

    try {
        // Real progress: the run advances in stride chunks and posts
        // { type: 'progress', fraction, elapsedDays } ~10x/second, so the UI
        // can show the engine's actual simulated time. The app still keeps a
        // wall-clock estimate as fallback for the pre-first-chunk gap.
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

                // Real progress: advance the routing in chunks so we can report
                // the engine's actual simulated time instead of a wall-clock guess.
                const totalDays = parseSimDurationDays(msg.inpText);
                const CHUNK_STEPS = 250;
                let lastElapsed = -1;
                let lastPost = 0, lastFrac = -1;
                while (true) {
                    const strideErr = stride(engine, CHUNK_STEPS, elapsedPtr);
                    if (strideErr !== 0) break;
                    const elapsedDays = Module.getValue(elapsedPtr, 'double');

                    // SWMM sets elapsed to 0.0 when the simulation completes.
                    if (elapsedDays === 0 || (lastElapsed >= 0 && elapsedDays < lastElapsed)) {
                        if (totalDays > 0) {
                            self.postMessage({
                                type: 'progress',
                                fraction: 1.0,
                                elapsedDays: totalDays,
                                totalDays,
                                phase: 'report'
                            });
                        }
                        break;
                    }
                    if (elapsedDays === lastElapsed) {
                        // Stalled
                        break;
                    }
                    lastElapsed = elapsedDays;
                    if (totalDays > 0) {
                        const frac = Math.min(1, elapsedDays / totalDays);
                        const now = Date.now();
                        // post on time throttle OR meaningful fraction advance,
                        // so short/fast runs still produce visible progress
                        if (now - lastPost > 100 || frac - lastFrac > 0.02) {
                            lastPost = now;
                            lastFrac = frac;
                            self.postMessage({
                                type: 'progress',
                                fraction: frac,
                                elapsedDays,
                                totalDays
                            });
                        }
                    }
                    if (totalDays > 0 && elapsedDays >= totalDays - 1e-9) {
                        self.postMessage({
                            type: 'progress',
                            fraction: 1.0,
                            elapsedDays: totalDays,
                            totalDays,
                            phase: 'report'
                        });
                        break;
                    }
                }
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
}
