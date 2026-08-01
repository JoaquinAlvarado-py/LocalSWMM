// triangle-loader.js — No-bundler wrapper for triangle-wasm (Shewchuk Triangle)
//
// triangle.out.js is an Emscripten MODULARIZE factory: when loaded as a
// classic <script> it assigns the factory function to window.Module.
// This wrapper captures that factory, replicates the index.js API
// (TriangulateIO, init, triangulate, makeIO, freeIO), and exposes
// window.TriangleWASM.  A 'triangle-ready' event is dispatched when ready.
(function (window) {
    'use strict';

    var TriangleWASM = {
        _ready: false,
        _readyPromise: null,
        _module: null
    };

    // ---- Heap helpers (ported from triangle-wasm/index.js) ----
    function stringToHeap(Module, str) {
        var length = Module.lengthBytesUTF8(str) + 1;
        var ptr = Module._malloc(length);
        Module.stringToUTF8(str, ptr, length);
        return ptr;
    }

    function getHeapStr(type) {
        if (type === Float64Array) return 'HEAPF64';
        if (type === Int32Array) return 'HEAP32';
        return 'HEAP8';
    }

    function getTypedArray(arr, type) {
        if (arr.constructor === type) return arr;
        return new type(arr);
    }

    function arrayToHeap(Module, arr, type) {
        type = type || Int32Array;
        if (!arr || !arr.length) return null;
        var ta = getTypedArray(arr, type);
        var ptr = Module._malloc(ta.length * ta.BYTES_PER_ELEMENT);
        var pos = ptr / ta.BYTES_PER_ELEMENT;
        Module[getHeapStr(type)].subarray(pos, pos + ta.length).set(ta);
        return ptr;
    }

    function heapToArray(Module, ptr, length, type) {
        type = type || Int32Array;
        if (!ptr) return null;
        var pos = ptr / type.BYTES_PER_ELEMENT;
        return Module[getHeapStr(type)].subarray(pos, pos + length);
    }

    // ---- TriangulateIO — mirrors the C struct triangulateio (23 int fields) ----
    function TriangulateIO(Module, data) {
        data = data || {};
        this._module = Module;
        this.ptr = Module._malloc(23 * Int32Array.BYTES_PER_ELEMENT);
        this.arr = heapToArray(Module, this.ptr, 23);
        this.arr.set(new Int32Array(23));
        for (var prop in data) { if (prop in this) this[prop] = data[prop]; }
    }

    // SETTERS (indices match the C struct layout)
    var _proto = TriangulateIO.prototype;
    Object.defineProperty(_proto, 'pointlist', { set: function (v) { this.arr[0] = arrayToHeap(this._module, v, Float64Array); } });
    Object.defineProperty(_proto, 'pointattributelist', { set: function (v) { this.arr[1] = arrayToHeap(this._module, v, Float64Array); } });
    Object.defineProperty(_proto, 'pointmarkerlist', { set: function (v) { this.arr[2] = arrayToHeap(this._module, v); } });
    Object.defineProperty(_proto, 'numberofpoints', { set: function (v) { this.arr[3] = v; } });
    Object.defineProperty(_proto, 'numberofpointattributes', { set: function (v) { this.arr[4] = v; } });
    Object.defineProperty(_proto, 'trianglelist', { set: function (v) { this.arr[5] = arrayToHeap(this._module, v); } });
    Object.defineProperty(_proto, 'triangleattributelist', { set: function (v) { this.arr[6] = arrayToHeap(this._module, v, Float64Array); } });
    Object.defineProperty(_proto, 'trianglearealist', { set: function (v) { this.arr[7] = arrayToHeap(this._module, v, Float64Array); } });
    Object.defineProperty(_proto, 'neighborlist', { set: function (v) { this.arr[8] = arrayToHeap(this._module, v); } });
    Object.defineProperty(_proto, 'numberoftriangles', { set: function (v) { this.arr[9] = v; } });
    Object.defineProperty(_proto, 'numberofcorners', { set: function (v) { this.arr[10] = v; } });
    Object.defineProperty(_proto, 'numberoftriangleattributes', { set: function (v) { this.arr[11] = v; } });
    Object.defineProperty(_proto, 'segmentlist', { set: function (v) { this.arr[12] = arrayToHeap(this._module, v); } });
    Object.defineProperty(_proto, 'segmentmarkerlist', { set: function (v) { this.arr[13] = arrayToHeap(this._module, v); } });
    Object.defineProperty(_proto, 'numberofsegments', { set: function (v) { this.arr[14] = v; } });
    Object.defineProperty(_proto, 'holelist', { set: function (v) { this.arr[15] = arrayToHeap(this._module, v, Float64Array); } });
    Object.defineProperty(_proto, 'numberofholes', { set: function (v) { this.arr[16] = v; } });
    Object.defineProperty(_proto, 'regionlist', { set: function (v) { this.arr[17] = arrayToHeap(this._module, v, Float64Array); } });
    Object.defineProperty(_proto, 'numberofregions', { set: function (v) { this.arr[18] = v; } });
    Object.defineProperty(_proto, 'edgelist', { set: function (v) { this.arr[19] = arrayToHeap(this._module, v); } });
    Object.defineProperty(_proto, 'edgemarkerlist', { set: function (v) { this.arr[20] = arrayToHeap(this._module, v); } });
    Object.defineProperty(_proto, 'normlist', { set: function (v) { this.arr[21] = arrayToHeap(this._module, v, Float64Array); } });

    // GETTERS
    Object.defineProperty(_proto, 'out_pointlist', { get: function () { return heapToArray(this._module, this.arr[0], this.arr[3] * 2, Float64Array); } });
    Object.defineProperty(_proto, 'out_pointmarkerlist', { get: function () { return heapToArray(this._module, this.arr[2], this.arr[3]); } });
    Object.defineProperty(_proto, 'out_numberofpoints', { get: function () { return this.arr[3]; } });
    Object.defineProperty(_proto, 'out_trianglelist', { get: function () { return heapToArray(this._module, this.arr[5], this.arr[9] * this.arr[10]); } });
    Object.defineProperty(_proto, 'out_triangleattributelist', { get: function () { return heapToArray(this._module, this.arr[6], this.arr[11] * this.arr[9], Float64Array); } });
    Object.defineProperty(_proto, 'out_numberoftriangles', { get: function () { return this.arr[9]; } });
    Object.defineProperty(_proto, 'out_numberofcorners', { get: function () { return this.arr[10]; } });
    Object.defineProperty(_proto, 'out_segmentlist', { get: function () { return heapToArray(this._module, this.arr[12], this.arr[14] * 2); } });
    Object.defineProperty(_proto, 'out_segmentmarkerlist', { get: function () { return heapToArray(this._module, this.arr[13], this.arr[14]); } });
    Object.defineProperty(_proto, 'out_numberofsegments', { get: function () { return this.arr[14]; } });
    Object.defineProperty(_proto, 'out_numberofregions', { get: function () { return this.arr[18]; } });
    Object.defineProperty(_proto, 'out_edgelist', { get: function () { return heapToArray(this._module, this.arr[19], this.arr[22] * 2); } });
    Object.defineProperty(_proto, 'out_numberofedges', { get: function () { return this.arr[22]; } });

    _proto.destroy = function (all) {
        var M = this._module;
        if (this.ptr) M._free(this.ptr);
        if (all) {
            [0, 1, 2, 5, 6, 7, 8, 12, 13, 15, 17, 19, 20, 21].forEach(function (i) {
                if (this.arr[i]) M._free(this.arr[i]);
            }, this);
        }
        this.ptr = 0;
    };

    // ---- Switches string builder (ported from triangle-wasm/index.js) ----
    function getSwitchesStr(obj, vorout) {
        if (typeof obj === 'string') return obj;
        if (typeof obj !== 'object' || !obj) obj = {};
        var str = '';
        if (obj.pslg !== false) str += 'p';        // PSLG input
        str += 'z';                                 // zero-based indexing
        if (vorout !== null && vorout !== undefined) str += 'v';
        if (obj.quiet !== false) str += 'Q';        // quiet
        if (obj.refine === true) str += 'r';
        if (obj.regionAttr === true) str += 'A';    // regional attributes
        if (obj.convexHull === true) str += 'c';
        if (obj.ccdt === true) str += 'D';
        if (obj.jettison === true) str += 'j';
        if (obj.edges === true) str += 'e';
        if (obj.neighbors === true) str += 'n';
        if (obj.quadratic === true) str += 'o2';
        if (obj.bndMarkers === false) str += 'B';
        if (obj.holes === false) str += 'O';
        if (typeof obj.steiner === 'number') str += 'S' + obj.steiner;
        if (typeof obj.quality === 'number') str += 'q' + obj.quality;
        else if (obj.quality === true) str += 'q';
        if (typeof obj.area === 'number') str += 'a' + obj.area;
        else if (obj.area === true) str += 'a';
        if (obj.noBoundarySteiner === true) str += 'Y';
        return str;
    }

    // ---- Public API ----
    TriangleWASM.init = function (wasmPath) {
        if (TriangleWASM._readyPromise) return TriangleWASM._readyPromise;
        TriangleWASM._readyPromise = new Promise(function (resolve, reject) {
            var prevModule = window.Module;
            var baseDir = (wasmPath || 'vendor/triangle/').replace(/[^\/]*$/, '') || 'vendor/triangle/';
            var script = document.createElement('script');
            script.src = baseDir + 'triangle.out.js';
            script.onload = function () {
                var factory = window.Module;
                window.Module = prevModule;
                if (typeof factory !== 'function') {
                    reject(new Error('triangle.out.js did not export a Module factory function'));
                    return;
                }
                factory({ locateFile: function (path) { return baseDir + path; } })
                    .then(function (m) {
                        TriangleWASM._module = m;
                        TriangleWASM._ready = true;
                        window.dispatchEvent(new CustomEvent('triangle-ready'));
                        resolve();
                    }).catch(reject);
            };
            script.onerror = function () { reject(new Error('Failed to load triangle.out.js from ' + script.src)); };
            document.head.appendChild(script);
        });
        return TriangleWASM._readyPromise;
    };

    TriangleWASM.makeIO = function (data) { return new TriangulateIO(TriangleWASM._module, data); };
    TriangleWASM.triangulate = function (switches, input, output, vorout) {
        var M = TriangleWASM._module;
        var sStr = getSwitchesStr(switches, vorout);
        var sPtr = stringToHeap(M, sStr);
        M._triangulate(sPtr, input.ptr, output.ptr, vorout ? vorout.ptr : null);
        M._free(sPtr);
    };
    TriangleWASM.freeIO = function (io, all) { io.destroy(all); };
    TriangleWASM.isReady = function () { return TriangleWASM._ready; };

    window.TriangleWASM = TriangleWASM;
})(window);
