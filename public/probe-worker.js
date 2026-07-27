importScripts('openswmm2d.js?v=16');
self.postMessage({ type: 'import-ready', factory: typeof createOpenSwmm2D });
self.onmessage = async event => {
    self.postMessage({ type: 'before-factory', bytes: event.data.byteLength });
    const module = await createOpenSwmm2D({ wasmBinary: event.data });
    self.postMessage({ type: 'module-ready', cwrap: typeof module.cwrap });
};
