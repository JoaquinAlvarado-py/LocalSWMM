// parseWorker.js — Parses SWMM .inp text off the main thread.
// Receives: { text } — raw .inp file contents.
// Sends:    { type: 'progress', pct, stage }
//           { type: 'done', model }
//           { type: 'error', message }

'use strict';

importScripts('inpParser.js');

self.onmessage = (e) => {
    const { text } = e.data || {};
    if (typeof text !== 'string') {
        self.postMessage({ type: 'error', message: 'parseWorker: no text received' });
        return;
    }
    try {
        self.postMessage({ type: 'progress', pct: 10, stage: 'Parsing sections…' });
        const model = self.inpParser.parse(text);
        self.postMessage({ type: 'progress', pct: 90, stage: 'Building model…' });
        self.postMessage({ type: 'done', model });
    } catch (err) {
        self.postMessage({ type: 'error', message: err.message || String(err) });
    }
};
