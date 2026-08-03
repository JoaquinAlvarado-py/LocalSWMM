// mesh2dTriangle.js — Triangle engine wrapper & poly2tri fallback for 2D mesh generation
//
// Converts a Mesh2DPslg into Shewchuk Triangle WASM input structures, runs constrained
// Delaunay triangulation with quality controls (min angle, max area, Steiner points),
// maps region attributes to Manning's n, couples vertices to 1D SWMM nodes, and
// automatically falls back to poly2tri if Triangle is unavailable or fails.
(function (window) {
    'use strict';

    function ensureReady() {
        if (!window.TriangleWASM) {
            return Promise.reject(new Error('TriangleWASM not loaded'));
        }
        if (window.TriangleWASM.isReady()) {
            return Promise.resolve(window.TriangleWASM);
        }
        return window.TriangleWASM.init('vendor/triangle/');
    }

    // Hash table for matching input points to output vertices by coordinate (1mm precision)
    function CoordHash(scale) {
        this.scale = scale || 1000;
        this.map = {};
    }
    CoordHash.prototype._key = function (x, y) {
        return Math.round(x * this.scale) + ':' + Math.round(y * this.scale);
    };
    CoordHash.prototype.set = function (x, y, val) {
        this.map[this._key(x, y)] = val;
    };
    CoordHash.prototype.get = function (x, y) {
        var k = this._key(x, y);
        return Object.prototype.hasOwnProperty.call(this.map, k) ? this.map[k] : null;
    };

    function manningForSub(subId, defaultN) {
        if (!window.Net || !Array.isArray(window.Net.subcatchments) || !subId) return defaultN;
        var sub = window.Net.subcatchments.find(function (s) { return s.id === subId; });
        if (!sub) return defaultN;
        var props = sub.props || sub;
        // Prefer land-cover derived roughness when classified, then pervious n.
        if (props.landCoverClass && window.LandCoverModule && window.LandCoverModule.getRoughness) {
            var rough = window.LandCoverModule.getRoughness(props.landCoverClass);
            if (rough && Number.isFinite(rough.nPerv) && rough.nPerv > 0) return rough.nPerv;
        }
        var nPerv = parseFloat(props.nPerv);
        if (Number.isFinite(nPerv) && nPerv > 0) return nPerv;
        var nImp = parseFloat(props.nImperv);
        if (Number.isFinite(nImp) && nImp > 0) return nImp;
        return defaultN;
    }

    function triangulate(pslg, quality, ctx) {
        quality = quality || {};
        ctx = ctx || {};
        var Tri = window.TriangleWASM;
        if (!Tri || !Tri.isReady()) throw new Error('TriangleWASM is not ready');

        var tf = ctx.transform;
        var defaultN = typeof ctx.defaultManningN === 'number' ? ctx.defaultManningN : 0.02;

        // ---- Build input buffers ----
        var np = pslg.points.length;
        var pointlist = new Float64Array(np * 2);
        var pointmarkers = new Int32Array(np);
        for (var i = 0; i < np; i++) {
            pointlist[i * 2] = pslg.points[i].x;
            pointlist[i * 2 + 1] = pslg.points[i].y;
            pointmarkers[i] = pslg.points[i].marker || 0;
        }

        var ns = pslg.segments.length;
        var seglist = new Int32Array(ns * 2);
        var segmarkers = new Int32Array(ns);
        for (var j = 0; j < ns; j++) {
            seglist[j * 2] = pslg.segments[j].p1;
            seglist[j * 2 + 1] = pslg.segments[j].p2;
            segmarkers[j] = pslg.segments[j].marker || 1;
        }

        var nh = pslg.holes.length;
        var holelist = new Float64Array(nh * 2);
        for (var k = 0; k < nh; k++) {
            holelist[k * 2] = pslg.holes[k].x;
            holelist[k * 2 + 1] = pslg.holes[k].y;
        }

        var nr = pslg.regions.length;
        var regionlist = new Float64Array(nr * 4);
        var areaList = new Float64Array(nr);
        var hasRegionalArea = false;
        for (var r = 0; r < nr; r++) {
            regionlist[r * 4] = pslg.regions[r].x;
            regionlist[r * 4 + 1] = pslg.regions[r].y;
            regionlist[r * 4 + 2] = pslg.regions[r].attr;
            var ma = pslg.regions[r].maxArea || 0;
            regionlist[r * 4 + 3] = ma;
            areaList[r] = ma;
            if (ma > 0) hasRegionalArea = true;
        }

        var inIO = Tri.makeIO({
            pointlist: pointlist,
            pointmarkerlist: pointmarkers,
            numberofpoints: np,
            segmentlist: seglist,
            segmentmarkerlist: segmarkers,
            numberofsegments: ns,
            holelist: holelist,
            numberofholes: nh,
            regionlist: regionlist,
            numberofregions: nr
        });
        var outIO = null;

        try {
            outIO = Tri.makeIO({});
            if (hasRegionalArea && !quality.maxArea) {
                inIO.trianglearealist = areaList;
            }

        // Build switches: pzQ + q{minAngle} + a{maxArea}/A+a + S{maxSteiner} + Y
        var switches = {
            pslg: true,
            quiet: true,
            regionAttr: true,
            noBoundarySteiner: quality.allowBoundarySteiner === false
        };
        var minAngle = quality.minAngle != null ? quality.minAngle : 33;
        if (minAngle > 0) switches.quality = minAngle;
        if (quality.maxArea && quality.maxArea > 0) {
            switches.area = quality.maxArea;
        } else if (hasRegionalArea) {
            switches.area = true;
        }
        if (quality.maxSteiner != null && quality.maxSteiner > 0) {
            switches.steiner = quality.maxSteiner;
        }

        Tri.triangulate(switches, inIO, outIO);

        // ---- Extract output ----
        var outPts = outIO.out_pointlist;
        var outNp = outIO.out_numberofpoints;
        var outTris = outIO.out_trianglelist;
        var outNt = outIO.out_numberoftriangles;
        var outCorners = outIO.out_numberofcorners || 3;
        var outTriAttrs = outIO.out_triangleattributelist;

        // ---- Match input points → output vertices by coordinate hash ----
        var inHash = new CoordHash(1000);
        for (var mi = 0; mi < pslg.points.length; mi++) {
            inHash.set(pslg.points[mi].x, pslg.points[mi].y, mi);
        }

        // ---- Build indexed mesh ----
        var vertices = [];
        var vertexNodeMap = [];
        for (var vi = 0; vi < outNp; vi++) {
            var ox = outPts[vi * 2], oy = outPts[vi * 2 + 1];
            var lngLat = tf.toLngLat([ox, oy]);
            var inIdx = inHash.get(ox, oy);
            var tag = '', z = NaN, nodeId = null;
            if (inIdx != null) {
                var ip = pslg.points[inIdx];
                tag = ip.tag || '';
                z = ip.z;
                nodeId = ip.nodeId;
            }
            vertices.push({ lng: lngLat[0], lat: lngLat[1], x: ox, y: oy, z: z, tag: tag, nodeId: nodeId });
            if (nodeId) {
                vertexNodeMap.push({ vertexIndex: vi, nodeId: nodeId, cd: ctx.defaultCd || 0.65, area: 0 });
            }
        }

        // ---- Build triangles with Manning's n from region attribute ----
        var triangles = [];
        for (var ti = 0; ti < outNt; ti++) {
            var v0 = outTris[ti * outCorners];
            var v1 = outTris[ti * outCorners + 1];
            var v2 = outTris[ti * outCorners + 2];
            var attr = outTriAttrs ? outTriAttrs[ti] : 0;
            var subId = attr ? (pslg.regionAttrToSub[attr] || '') : '';
            var n = subId ? manningForSub(subId, defaultN) : defaultN;
            triangles.push({ v: [v0, v1, v2], n: n, tag: subId || '' });
        }

            return {
            origin: tf.origin,
            vertices: vertices,
            triangles: triangles,
            vertexNodeMap: vertexNodeMap,
            nodeVertexIndex: pslg.nodeVertexIndex || {},
            options: ctx.options || {},
            warnings: (pslg.warnings || []).slice(),
            fallback: false
            };
        } finally {
            // Triangle copies holelist and regionlist pointers into output.
            // Free those shared allocations exactly once through the input.
            try { Tri.freeIO(inIO, true); } finally { if (outIO) Tri.freeIO(outIO, false); }
        }
    }

    function runGeneration(sources, quality, ctx, log) {
        log = log || function () {};
        if (!window.Mesh2DPslg) {
            return Promise.reject(new Error('Mesh2DPslg module is not loaded'));
        }

        var pslg = window.Mesh2DPslg.fromNetwork(sources, {
            transform: ctx.transform,
            simplifyEps: quality.simplifyEps,
            snapRadius: quality.snapRadius,
            maxBoundaryEdge: quality.maxBoundaryEdge,
            minNodeSep: quality.minNodeSep,
            flattenRadius: quality.flattenRadius,
            domainBuffer: quality.domainBuffer,
            includeSubcatchments: ctx.includeSubcatchments,
            useSubRings: ctx.includeSubcatchments,
            includeNodes: ctx.includeNodes,
            includeConduits: ctx.includeConduits,
            useRimZ: ctx.useRimZ,
            sampleZ: ctx.sampleZ
        });

        if (ctx.terrainSampler && quality.thinningEnabled && window.Mesh2DTerrain) {
            var boundary = pslg.points.filter(function (p) { return p.tag === 'boundary'; }).map(function (p) { return [p.x, p.y]; });
            var terrainPoints = window.Mesh2DTerrain.thinTerrain(ctx.terrainSampler, boundary, {
                normalDot: quality.thinningNormalDot,
                passes: quality.thinningPasses,
                maxPoints: quality.thinningMaxPoints,
                minSpacing: quality.thinningMinSpacing
            }, ctx.transform);
            var mergeRadius2 = Math.pow(Number(quality.snapRadius) || 0.01, 2), acceptedTerrain = 0;
            terrainPoints.forEach(function (p) {
                var duplicate = pslg.points.some(function (q) { var dx = q.x - p.x, dy = q.y - p.y; return dx * dx + dy * dy <= mergeRadius2; });
                if (!duplicate) { pslg.points.push(p); acceptedTerrain++; }
            });
            log('Terrain thinning added ' + acceptedTerrain + ' terrain vertices.');
        }

        var effectiveQuality = quality;
        var boundaryPoints = pslg.points.filter(function (p) { return p.marker === 1; });
        if (boundaryPoints.length >= 3 && quality.autoAreaCap !== false) {
            var domainArea = 0;
            boundaryPoints.forEach(function (p, i) {
                var q = boundaryPoints[(i + 1) % boundaryPoints.length];
                domainArea += p.x * q.y - q.x * p.y;
            });
            domainArea = Math.abs(domainArea) / 2;
            var requestedArea = Number(quality.maxArea) || 0;
            var maxTargetTriangles = Number(quality.maxTargetTriangles) || 100000;
            if (requestedArea > 0 && domainArea / requestedArea > maxTargetTriangles) {
                effectiveQuality = Object.assign({}, quality, { maxArea: domainArea / maxTargetTriangles });
                log('⚠ Full-domain mesh density was reduced to approximately ' + maxTargetTriangles.toLocaleString() + ' triangles (' + effectiveQuality.maxArea.toFixed(2) + ' m² max area) to avoid WASM exhaustion.');
            }
        }

        (pslg.warnings || []).forEach(function (w) { log('⚠ ' + w); });
        log('PSLG: ' + pslg.points.length + ' points, ' + pslg.segments.length + ' segments, ' +
            pslg.regions.length + ' regions, ' + pslg.holes.length + ' holes.');

        return ensureReady().then(function () {
            var result = triangulate(pslg, effectiveQuality, ctx);
            log('Triangle: ' + result.vertices.length + ' vertices, ' + result.triangles.length + ' triangles.');
            return result;
        }).catch(function (err) {
            log('⚠ Triangle engine failed (' + (err.message || err) + ') — falling back to poly2tri.');
            console.warn('Triangle fallback:', err);
            if (!window.Mesh2DGenerator || !window.Mesh2DGenerator.generateFromSubcatchments) {
                throw new Error('Neither Triangle nor poly2tri fallback is available: ' + (err.message || err));
            }
            if (!sources.subcatchments || !sources.subcatchments.length) {
                throw new Error('Triangle failed, and the poly2tri fallback can only mesh inside subcatchments. Add subcatchments or fix the Triangle engine (full-domain meshing requires Triangle).');
            }
            var fallback = window.Mesh2DGenerator.generateFromSubcatchments({
                maxAreaM2: effectiveQuality.maxArea || 200,
                assignLandCover: true
            });
            return {
                origin: ctx.transform.origin,
                vertices: [],
                triangles: [],
                vertexNodeMap: [],
                nodeVertexIndex: {},
                options: ctx.options || {},
                warnings: (pslg.warnings || []).concat(fallback.errors || []),
                fallback: true,
                fallbackResult: fallback
            };
        });
    }

    window.Mesh2DTriangle = {
        ensureReady: ensureReady,
        triangulate: triangulate,
        runGeneration: runGeneration
    };
})(window);
