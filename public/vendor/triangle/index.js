// Browser distribution note: triangle-wasm's CJS implementation is exposed by
// triangle-loader.js. This file preserves the vendored package entry point for
// tooling that inspects the distribution without introducing a bundler.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = require('triangle-wasm');
}
