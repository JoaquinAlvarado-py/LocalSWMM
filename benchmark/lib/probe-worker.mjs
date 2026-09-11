// probe-worker.mjs — check browser-style global onmessage INSIDE worker_threads
import { Worker } from 'node:worker_threads';

const w = new Worker(`
    onmessage = e => postMessage({ via: 'global onmessage', data: e.data });
`, { eval: true });
w.on('message', (m) => { console.log('main got:', JSON.stringify(m)); process.exit(0); });
w.on('error', (e) => { console.error('worker error:', e.message); process.exit(1); });
w.postMessage('hello');
setTimeout(() => { console.log('TIMEOUT — worker never received message'); process.exit(1); }, 5000);
