// worker-shim.mjs — polyfill browser Worker for the Emscripten pthread glue
// under Node (worker_threads). The glue creates pthread workers with
// new Worker(<this file>, {name:'em-pthread'}) and talks the browser protocol:
// worker: postMessage({cmd:3}) when ready, self.onmessage = handler.
// Node worker_threads has no global onmessage/postMessage, so bridge them.
'use strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = join(dirname(dirname(fileURLToPath(import.meta.url))), '..', 'public');
const GLUE = join(PUBLIC, 'swmm6wasm.js');

export function installWorkerShim() {
    if (typeof globalThis.Worker !== 'undefined') return false;
    globalThis.Worker = class extends NodeWorker {
        constructor(file, opts = {}) {
            if (opts && opts.name === 'em-pthread') {
                super(`globalThis.self=globalThis;
                    globalThis.WorkerGlobalScope=globalThis.WorkerGlobalScope||class{};
                    globalThis.location={href:${JSON.stringify(new URL('swmm6wasm.js', 'file:///' + PUBLIC.replace(/\\/g, '/') + '/').href)}};
                    globalThis.name='em-pthread';
                    const { parentPort } = require('worker_threads');
                    globalThis.postMessage = (data, transfer) => parentPort.postMessage(data, transfer);
                    parentPort.on('message', m => { globalThis.onmessage && globalThis.onmessage({ data: m }); });
                    try { require(${JSON.stringify(GLUE)}); }
                    catch (e) { postMessage({ __shimErr: String((e && e.stack) || e) }); }`,
                    { eval: true });
            } else {
                super(file, opts);
            }
            const handlers = {};
            if (process.env.SHIM_DEBUG) console.error('[shim] worker spawned');
            Object.defineProperty(this, 'onmessage', {
                get: () => handlers.message,
                set: fn => {
                    handlers.message = fn;
                    // wrap raw worker_threads messages into browser-style events
                    this.removeAllListeners('message');
                    this.on('message', m => fn({ data: m }));
                    this.on('message', m => { if (m && m.__shimErr) console.error('[shim worker error]', m.__shimErr); });
                },
            });
            Object.defineProperty(this, 'onerror', {
                get: () => handlers.error,
                set: fn => { handlers.error = fn; this.on('error', fn); },
            });
            this.on('error', e => console.error('[shim worker exception]', (e && e.stack) || e));
        }
        postMessage(data, transferList) { super.postMessage(data, transferList); }
    };
    return true;
}
