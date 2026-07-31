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
    try {
        const wasmModule = await getCompiledWasm();
        return await createModule({
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
        return createModule(opts);
    }
}

let busy = false;

function parseSimDurationInDays(inpText) {
    let startDateStr = '01/01/2000', startTimeStr = '00:00:00';
    let endDateStr = '01/02/2000', endTimeStr = '00:00:00';

    const lines = inpText.split(/\r?\n/);
    let inOptions = false;
    for (let line of lines) {
        let clean = line.replace(/;.*$/, '').trim();
        if (clean.startsWith('[') && clean.endsWith(']')) {
            inOptions = (clean.toUpperCase() === '[OPTIONS]');
            continue;
        }
        if (inOptions && clean) {
            const parts = clean.split(/\s+/);
            const key = (parts[0] || '').toUpperCase();
            const val = parts.slice(1).join(' ');
            if (key === 'START_DATE') startDateStr = val;
            if (key === 'START_TIME') startTimeStr = val;
            if (key === 'END_DATE') endDateStr = val;
            if (key === 'END_TIME') endTimeStr = val;
        }
    }

    try {
        const startMs = Date.parse(`${startDateStr} ${startTimeStr}`);
        const endMs = Date.parse(`${endDateStr} ${endTimeStr}`);
        if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
            return (endMs - startMs) / (1000 * 60 * 60 * 24); // days
        }
    } catch (e) { }
    return 1.0; // fallback 1 day
}

self.onmessage = async (e) => {
    const msg = e.data || {};
    if (msg.type !== 'run') return;
    if (busy) {
        self.postMessage({ type: 'error', message: 'A simulation is already running.' });
        return;
    }
    busy = true;
    let progressTimer = null;

    try {
        const totalDays = parseSimDurationInDays(msg.inpText || '');
        const targetDurationMs = msg.targetDurationMs || 2500;
        const simStartTime = Date.now();

        // Start progress ticker to post real progress updates to the UI
        progressTimer = setInterval(() => {
            const elapsedMs = Date.now() - simStartTime;
            const frac = Math.min(0.99, elapsedMs / targetDurationMs);
            const percent = Math.floor(frac * 100);
            const currDaysFraction = frac * totalDays;
            const days = Math.floor(currDaysFraction);
            const remainingHoursFrac = (currDaysFraction - days) * 24;
            const hours = Math.floor(remainingHoursFrac);
            const minutes = Math.floor((remainingHoursFrac - hours) * 60);
            const hrsMinStr = String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');

            self.postMessage({
                type: 'progress',
                percent,
                days,
                hrsMin: hrsMinStr
            });
        }, 80);

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
            // Try callMain first since it's the standard Emscripten way now
            if (typeof Module.callMain === 'function') {
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

        if (progressTimer) clearInterval(progressTimer);

        // Send final 100% progress before completing
        self.postMessage({
            type: 'progress',
            percent: 100,
            days: Math.floor(totalDays),
            hrsMin: '23:59'
        });

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
        if (progressTimer) clearInterval(progressTimer);
        busy = false;
        self.postMessage({ type: 'error', message: err.message || String(err) });
    }
};
