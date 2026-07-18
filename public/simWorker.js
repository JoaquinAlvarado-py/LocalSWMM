// simWorker.js — Runs the SWMM WASM engine off the main thread.
// Receives: { type: 'run', inpText }
// Sends:    { type: 'log', text } / { type: 'err', text }
//           { type: 'done', rpt, outBuffer } (outBuffer transferred)
//           { type: 'error', message }

'use strict';

importScripts('swmm6wasm.js');

let modulePromise = null;
function getModule() {
    if (!modulePromise) {
        modulePromise = createModule({
            noInitialRun: true,
            print: (text) => self.postMessage({ type: 'log', text }),
            printErr: (text) => self.postMessage({ type: 'err', text })
        });
    }
    return modulePromise;
}

self.onmessage = async (e) => {
    const msg = e.data || {};
    if (msg.type !== 'run') return;
    try {
        const Module = await getModule();
        Module.FS.writeFile('/in.inp', msg.inpText);

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
            // Emscripten's exit() throws — a report may still exist
            self.postMessage({ type: 'err', text: 'SWMM engine exit: ' + (err.message || err) });
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

        // The WASM module keeps its FS state between runs; a fresh callMain can
        // fail on some builds. Recycle the worker module per run to be safe.
        modulePromise = null;

        if (outBuffer) {
            self.postMessage({ type: 'done', rpt, outBuffer }, [outBuffer]);
        } else {
            self.postMessage({ type: 'done', rpt, outBuffer: null });
        }
    } catch (err) {
        modulePromise = null;
        self.postMessage({ type: 'error', message: err.message || String(err) });
    }
};
