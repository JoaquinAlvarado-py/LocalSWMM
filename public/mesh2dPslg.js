// mesh2dPslg.js — Builds Shewchuk Triangle PSLG input from SWMM network & constraints
//
// Converts GeoJSON/network features into local metric coordinates via Mesh2DProj,
// applies Douglas-Peucker simplification and edge densification, removes duplicate
// and crossing segments, maps subcatchment regions, and handles rim elevations.
(function (window) {
    'use strict';

    // ---------- geometry helpers ----------
    function pointInPolygon(pt, ring) {
        var x = pt[0], y = pt[1], inside = false;
        for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
    }

    function dist2(a, b) {
        var dx = b[0] - a[0], dy = b[1] - a[1];
        return dx * dx + dy * dy;
    }

    function distPtSeg(p, a, b) {
        var dx = b[0] - a[0], dy = b[1] - a[1];
        var lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.sqrt(dist2(p, a));
        var t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.sqrt(dist2(p, [a[0] + t * dx, a[1] + t * dy]));
    }

    function interiorPoint(ring, forbidden) {
        if (!ring || ring.length < 3) return null;
        var cx = 0, cy = 0;
        ring.forEach(function (p) { cx += p[0]; cy += p[1]; });
        var candidates = [[cx / ring.length, cy / ring.length]];
        for (var i = 0; i < ring.length; i++) {
            var a = ring[i], b = ring[(i + 1) % ring.length];
            candidates.push([(a[0] + b[0]) * 0.495 + cx / ring.length * 0.01, (a[1] + b[1]) * 0.495 + cy / ring.length * 0.01]);
            candidates.push([a[0] * 0.99 + cx / ring.length * 0.01, a[1] * 0.99 + cy / ring.length * 0.01]);
        }
        for (var c = 0; c < candidates.length; c++) {
            var p = candidates[c];
            if (!pointInPolygon(p, ring)) continue;
            if ((forbidden || []).some(function (hole) { return pointInPolygon(p, hole); })) continue;
            return p;
        }
        return null;
    }

    // Douglas-Peucker — endpoints pinned, ≥3 unique vertices guard.
    function dpSimplify(points, eps) {
        if (points.length < 3) return points.slice();
        var eps2 = eps * eps;
        var keep = new Array(points.length).fill(false);
        keep[0] = true;
        keep[points.length - 1] = true;

        function _dp(i, j) {
            if (j <= i + 1) return;
            var maxD2 = 0, maxIdx = -1;
            var a = points[i], b = points[j];
            for (var k = i + 1; k < j; k++) {
                var d = distPtSeg(points[k], a, b);
                var d2 = d * d;
                if (d2 > maxD2) { maxD2 = d2; maxIdx = k; }
            }
            if (maxD2 > eps2 && maxIdx !== -1) {
                keep[maxIdx] = true;
                _dp(i, maxIdx);
                _dp(maxIdx, j);
            }
        }
        _dp(0, points.length - 1);
        var res = [];
        for (var i = 0; i < points.length; i++) {
            if (keep[i]) res.push(points[i]);
        }
        return res.length >= 3 ? res : points.slice();
    }

    // Edge densification — split segments longer than maxLen
    function densify(points, maxLen) {
        if (!maxLen || maxLen <= 0 || points.length < 2) return points.slice();
        var res = [points[0]];
        for (var i = 1; i < points.length; i++) {
            var a = res[res.length - 1], b = points[i];
            var dx = b[0] - a[0], dy = b[1] - a[1];
            var len = Math.sqrt(dx * dx + dy * dy);
            if (len > maxLen) {
                var steps = Math.ceil(len / maxLen);
                for (var s = 1; s < steps; s++) {
                    var t = s / steps;
                    res.push([a[0] + t * dx, a[1] + t * dy]);
                }
            }
            res.push(b);
        }
        return res;
    }

    // Proper segment intersection test (strict interior crossing)
    function segsCross(p1, p2, q1, q2) {
        function orient(a, b, c) {
            return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        }
        var o1 = orient(p1, p2, q1);
        var o2 = orient(p1, p2, q2);
        var o3 = orient(q1, q2, p1);
        var o4 = orient(q1, q2, p2);
        return ((o1 > 1e-9 && o2 < -1e-9) || (o1 < -1e-9 && o2 > 1e-9)) &&
               ((o3 > 1e-9 && o4 < -1e-9) || (o3 < -1e-9 && o4 > 1e-9));
    }

    function convexHull(points) {
        var pts = points.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
        if (pts.length <= 3) return pts;
        function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
        var lower = [], upper = [];
        pts.forEach(function (p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); });
        for (var i = pts.length - 1; i >= 0; i--) { var p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
        upper.pop(); lower.pop(); return lower.concat(upper);
    }

    // ---------- Mesh2DPslg API ----------
    var Mesh2DPslg = {
        fromNetwork: function (sources, opts) {
            opts = opts || {};
            var tf = opts.transform;
            if (!tf) throw new Error('Mesh2DPslg.fromNetwork requires opts.transform');

            var eps = typeof opts.simplifyEps === 'number' ? opts.simplifyEps : 0.5;
            var snapRadius = typeof opts.snapRadius === 'number' && opts.snapRadius > 0 ? opts.snapRadius : 0.01;
            var maxEdge = typeof opts.maxBoundaryEdge === 'number' ? opts.maxBoundaryEdge : 0;
            var minSep = typeof opts.minNodeSep === 'number' ? opts.minNodeSep : 1.0;
            var flattenRadius = typeof opts.flattenRadius === 'number' ? opts.flattenRadius : 0;

            var points = [];      // [{x, y, tag, z, nodeId}]
            var segments = [];    // [{p1, p2, marker}]
            var holes = [];       // [{x, y}]
            var regions = [];     // [{x, y, attr, maxArea}]
            var warnings = [];
            var holeRings = [];

            var nodeVertexIndex = {};   // nodeId -> point index
            var regionAttrToSub = {};   // region attribute int -> subcatchment ID
            var markerToConduit = {};   // marker int (≥100) -> conduit link object
            var nextRegionAttr = 1;
            var nextConduitMarker = 100;

            // Spatial hash grid for O(1) snap-merge lookups (cell size = snapRadius).
            var snapRadius2 = snapRadius * snapRadius;
            var cellSize = Math.max(snapRadius, 1e-6);
            var grid = new Map();
            function _cellKey(cx, cy) { return cx + ':' + cy; }
            function _addPt(x, y, tag, z, nodeId) {
                var cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize);
                for (var gx = cx - 1; gx <= cx + 1; gx++) {
                    for (var gy = cy - 1; gy <= cy + 1; gy++) {
                        var bucket = grid.get(_cellKey(gx, gy));
                        if (!bucket) continue;
                        for (var b = 0; b < bucket.length; b++) {
                            var i = bucket[b];
                            var dx = points[i].x - x, dy = points[i].y - y;
                            if (dx * dx + dy * dy <= snapRadius2) {
                                if (tag && (!points[i].tag || points[i].tag === 'boundary')) points[i].tag = tag;
                                if (nodeId && !points[i].nodeId) {
                                    points[i].nodeId = nodeId;
                                    if (z !== undefined) points[i].z = z;
                                }
                                return i;
                            }
                        }
                    }
                }
                var idx = points.length;
                points.push({ x: x, y: y, tag: tag || '', marker: tag === 'boundary' ? 1 : 0, z: z, nodeId: nodeId || null });
                var key = _cellKey(cx, cy);
                var cell = grid.get(key);
                if (cell) cell.push(idx); else grid.set(key, [idx]);
                return idx;
            }

            // ---- 1. Boundary Polygon → constraint segments (marker = 1) ----
            var bndRing = [];
            if (sources.boundaryPolygon && sources.boundaryPolygon.geometry) {
                sources.boundaryPolygon = sources.boundaryPolygon.geometry;
            }
            if (sources.boundaryPolygon && sources.boundaryPolygon.coordinates) {
                var coords = sources.boundaryPolygon.coordinates[0] || [];
                bndRing = coords.map(function (p) { return tf.toLocal(p); });
                if (bndRing.length >= 4 &&
                    bndRing[0][0] === bndRing[bndRing.length - 1][0] &&
                    bndRing[0][1] === bndRing[bndRing.length - 1][1]) {
                    bndRing.pop();
                }
                bndRing = dpSimplify(bndRing, eps);
                bndRing = densify(bndRing, maxEdge);
                // Interior rings are holes in an explicit desktop-style domain.
                (sources.boundaryPolygon.coordinates.slice(1) || []).forEach(function (hole) {
                    var h = hole.map(function (p) { return tf.toLocal(p); });
                    if (h.length >= 4 && h[0][0] === h[h.length - 1][0] && h[0][1] === h[h.length - 1][1]) h.pop();
                        h = dpSimplify(h, eps);
                    if (h.length >= 3) {
                        var holeSeed = interiorPoint(h, []);
                        if (!holeSeed) holeSeed = [h[0][0], h[0][1]];
                        holes.push({ x: holeSeed[0], y: holeSeed[1] });
                        holeRings.push(h);
                        var hi = h.map(function (p) { return _addPt(p[0], p[1], ''); });
                        for (var hh = 0; hh < hi.length; hh++) segments.push({ p1: hi[hh], p2: hi[(hh + 1) % hi.length], marker: 1 });
                    }
                });
            } else {
                // Automatically generate a continuous 2D bounding domain enclosing all network elements (+ buffer)
                var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                var foundAny = false;
                (sources.subcatchments || []).forEach(function (sub) {
                    (sub.ring || []).forEach(function (p) {
                        var loc = tf.toLocal(p);
                        if (loc[0] < minX) minX = loc[0];
                        if (loc[0] > maxX) maxX = loc[0];
                        if (loc[1] < minY) minY = loc[1];
                        if (loc[1] > maxY) maxY = loc[1];
                        foundAny = true;
                    });
                });
                (sources.nodes || []).forEach(function (node) {
                    if (node.lngLat) {
                        var loc = tf.toLocal(node.lngLat);
                        if (loc[0] < minX) minX = loc[0];
                        if (loc[0] > maxX) maxX = loc[0];
                        if (loc[1] < minY) minY = loc[1];
                        if (loc[1] > maxY) maxY = loc[1];
                        foundAny = true;
                    }
                });
                if (foundAny) {
                    var buf = typeof opts.domainBuffer === 'number' ? opts.domainBuffer : 50;
                    var domainPoints = [];
                    (sources.subcatchments || []).forEach(function (sub) { (sub.ring || []).forEach(function (p) { domainPoints.push(tf.toLocal(p)); }); });
                    (sources.nodes || []).forEach(function (node) { if (node.lngLat) domainPoints.push(tf.toLocal(node.lngLat)); });
                    bndRing = convexHull(domainPoints);
                    var dcx = 0, dcy = 0; bndRing.forEach(function (p) { dcx += p[0]; dcy += p[1]; }); dcx /= bndRing.length || 1; dcy /= bndRing.length || 1;
                    bndRing = bndRing.map(function (p) { var dx = p[0] - dcx, dy = p[1] - dcy, len = Math.hypot(dx, dy) || 1; return [p[0] + buf * dx / len, p[1] + buf * dy / len]; });
                    var autoEdge = maxEdge > 0 ? maxEdge : 0;
                    if (autoEdge > 0) bndRing = densify(bndRing, autoEdge);
                }
            }

            if (bndRing.length >= 3) {
                var bndIdx = bndRing.map(function (p) { return _addPt(p[0], p[1], 'boundary'); });
                for (var i = 0; i < bndIdx.length; i++) {
                    segments.push({
                        p1: bndIdx[i],
                        p2: bndIdx[(i + 1) % bndIdx.length],
                        marker: 1
                    });
                }
                // Add a default background domain region (so Triangle meshes the full area, outside & inside subcatchments)
                var outerSeed = interiorPoint(bndRing, holeRings);
                var bx = outerSeed ? outerSeed[0] : bndRing[0][0], by = outerSeed ? outerSeed[1] : bndRing[0][1];
                regions.push({
                    x: bx,
                    y: by,
                    attr: 0,
                    maxArea: 0
                });
            }

            // ---- 2. Subcatchments → triangle regions & optional constraint rings ----
            var includeSubs = opts.includeSubcatchments !== false;
            if (includeSubs) {
                (sources.subcatchments || []).forEach(function (sub) {
                    if (!sub.ring || sub.ring.length < 3) return;
                    var ring = sub.ring.map(function (p) { return tf.toLocal(p); });
                    if (opts.useSubRings) {
                        var ringSimp = dpSimplify(ring, eps);
                        ringSimp = densify(ringSimp, maxEdge);
                        var rIdx = ringSimp.map(function (p) { return _addPt(p[0], p[1], ''); });
                        for (var i = 0; i < rIdx.length; i++) {
                            segments.push({ p1: rIdx[i], p2: rIdx[(i + 1) % rIdx.length], marker: 2 });
                        }
                    }
                    var seed = interiorPoint(ring, []), cx = seed ? seed[0] : ring[0][0], cy = seed ? seed[1] : ring[0][1];
                    var attr = nextRegionAttr++;
                    regionAttrToSub[attr] = sub.id;
                    regions.push({ x: cx, y: cy, attr: attr, maxArea: 0 });
                });
            }

            // ---- 3. Nodes → Steiner vertices (tag = node id, min separation) ----
            var includeNodes = opts.includeNodes !== false;
            if (includeNodes) {
                var nodeVertexPts = [];
                (sources.nodes || []).forEach(function (node) {
                    if (!node.lngLat || node.type === 'RAINGAGE') return;
                    var local = tf.toLocal(node.lngLat);
                    var tooClose = false;
                    for (var i = 0; i < nodeVertexPts.length; i++) {
                        if (dist2(local, [nodeVertexPts[i].x, nodeVertexPts[i].y]) < minSep * minSep) {
                            nodeVertexIndex[node.id] = nodeVertexPts[i].idx;
                            var existingP = points[nodeVertexPts[i].idx];
                            if (opts.useRimZ && node.props) {
                                var maxD = parseFloat(node.props.maxDepth) || 0;
                                var invert = parseFloat(node.props.invertEl) || 0;
                                if (!isNaN(invert)) existingP.z = invert + maxD;
                            }
                            tooClose = true;
                            break;
                        }
                    }
                    if (!tooClose) {
                        var zVal = undefined;
                        if (opts.useRimZ && node.props) {
                            var maxD2 = parseFloat(node.props.maxDepth) || 0;
                            var invert2 = parseFloat(node.props.invertEl) || 0;
                            if (!isNaN(invert2)) zVal = invert2 + maxD2;
                        }
                        var idx = _addPt(local[0], local[1], String(node.id), zVal, node.id);
                        nodeVertexIndex[node.id] = idx;
                        nodeVertexPts.push({ x: local[0], y: local[1], idx: idx });
                    }
                });
            }

            // ---- 4. Conduits → constraint segments (marker = 100 + k) ----
            var includeConduits = opts.includeConduits !== false;
            if (includeConduits) {
                (sources.links || []).forEach(function (link) {
                    if (link.type !== 'CONDUIT') return;
                    var fromNode = (sources.nodes || []).find(function (n) { return n.id === link.from; });
                    var toNode = (sources.nodes || []).find(function (n) { return n.id === link.to; });
                    if (!fromNode || !toNode) return;
                    var path = [tf.toLocal(fromNode.lngLat)];
                    (link.vertices || []).forEach(function (v) { path.push(tf.toLocal(v)); });
                    path.push(tf.toLocal(toNode.lngLat));
                    path = dpSimplify(path, eps);
                    path = densify(path, maxEdge);
                    var marker = nextConduitMarker++;
                    markerToConduit[marker] = link;
                    var pIdx = path.map(function (p) { return _addPt(p[0], p[1], ''); });
                    for (var i = 1; i < pIdx.length; i++) {
                        segments.push({ p1: pIdx[i - 1], p2: pIdx[i], marker: marker });
                    }
                });
            }

            // ---- 5. Imported constraint layers (points + lines) ----
            (sources.constraintLayers || []).forEach(function (layer) {
                var feats = (layer.geojson && layer.geojson.features) || [];
                feats.forEach(function (f) {
                    if (!f.geometry) return;
                    var t = f.geometry.type;
                    if (t === 'Point') {
                        var c = f.geometry.coordinates;
                        var local = tf.toLocal(c);
                        _addPt(local[0], local[1], '');
                    } else if (t === 'LineString' || t === 'MultiLineString') {
                        var lines = t === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
                        lines.forEach(function (line) {
                            var local = line.map(function (p) { return tf.toLocal(p); });
                            local = dpSimplify(local, eps);
                            local = densify(local, maxEdge);
                            var pIdx = local.map(function (p) { return _addPt(p[0], p[1], ''); });
                            for (var i = 1; i < pIdx.length; i++) {
                                segments.push({ p1: pIdx[i - 1], p2: pIdx[i], marker: 3 });
                            }
                        });
                    } else if (t === 'Polygon' || t === 'MultiPolygon') {
                        var polys = t === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
                        polys.forEach(function (rings) {
                            var ring = rings[0];
                            if (ring.length >= 4 && ring[0][0] === ring[ring.length - 1][0]) ring = ring.slice(0, -1);
                            var local = ring.map(function (p) { return tf.toLocal(p); });
                            local = dpSimplify(local, eps);
                            local = densify(local, maxEdge);
                            var rIdx = local.map(function (p) { return _addPt(p[0], p[1], ''); });
                            for (var i = 0; i < rIdx.length; i++) {
                                segments.push({ p1: rIdx[i], p2: rIdx[(i + 1) % rIdx.length], marker: 3 });
                            }
                        });
                    }
                });
            });

            // ---- 6. Dedupe segments (min:max set key) ----
            var seen = new Set();
            var dedupSegs = [];
            segments.forEach(function (s) {
                var a = Math.min(s.p1, s.p2), b = Math.max(s.p1, s.p2);
                if (a === b) return; // skip degenerate zero-length segments
                var key = a + ':' + b;
                if (seen.has(key)) return;
                seen.add(key);
                dedupSegs.push(s);
            });
            segments = dedupSegs;

            // ---- 7. Remove crossing constraint segments (bbox-grid accelerated) ----
            var segGrid = new Map();
            var segCell = 25; // meters per bucket
            function _segCells(p1, p2) {
                var x0 = Math.floor(Math.min(p1[0], p2[0]) / segCell);
                var x1 = Math.floor(Math.max(p1[0], p2[0]) / segCell);
                var y0 = Math.floor(Math.min(p1[1], p2[1]) / segCell);
                var y1 = Math.floor(Math.max(p1[1], p2[1]) / segCell);
                var cells = [];
                for (var gx = x0; gx <= x1; gx++) {
                    for (var gy = y0; gy <= y1; gy++) cells.push(gx + ':' + gy);
                }
                return cells;
            }
            var cleanSegs = [];
            for (var i = 0; i < segments.length; i++) {
                var s1 = segments[i];
                var p1 = [points[s1.p1].x, points[s1.p1].y];
                var p2 = [points[s1.p2].x, points[s1.p2].y];
                var cells1 = _segCells(p1, p2);
                var cross = false;
                var tested = new Set();
                for (var c = 0; c < cells1.length && !cross; c++) {
                    var bucket = segGrid.get(cells1[c]);
                    if (!bucket) continue;
                    for (var b = 0; b < bucket.length; b++) {
                        var sj = bucket[b];
                        if (tested.has(sj)) continue;
                        tested.add(sj);
                        var s2 = cleanSegs[sj];
                        if (s1.p1 === s2.p1 || s1.p1 === s2.p2 || s1.p2 === s2.p1 || s1.p2 === s2.p2) continue;
                        var q1 = [points[s2.p1].x, points[s2.p1].y];
                        var q2 = [points[s2.p2].x, points[s2.p2].y];
                        if (segsCross(p1, p2, q1, q2)) {
                            cross = true;
                            warnings.push('Crossing constraint segment removed between (' + s1.p1 + ',' + s1.p2 + ') and (' + s2.p1 + ',' + s2.p2 + ')');
                            break;
                        }
                    }
                }
                if (!cross) {
                    var newIdx = cleanSegs.length;
                    cleanSegs.push(s1);
                    cells1.forEach(function (key) {
                        var bucket = segGrid.get(key);
                        if (bucket) bucket.push(newIdx); else segGrid.set(key, [newIdx]);
                    });
                }
            }
            segments = cleanSegs;

            // ---- 8. Flatten radius around junctions (rim elevation override) ----
            if (flattenRadius > 0 && opts.useRimZ) {
                var r2 = flattenRadius * flattenRadius;
                var flatCell = Math.max(flattenRadius, 1e-6);
                var flatGrid = new Map();
                for (var fj = 0; fj < points.length; fj++) {
                    if (points[fj].nodeId) continue;
                    var fk = Math.floor(points[fj].x / flatCell) + ':' + Math.floor(points[fj].y / flatCell);
                    var fb = flatGrid.get(fk);
                    if (fb) fb.push(fj); else flatGrid.set(fk, [fj]);
                }
                for (var fi = 0; fi < points.length; fi++) {
                    if (!points[fi].nodeId || points[fi].z === undefined) continue;
                    var nz = points[fi].z;
                    var ncx = Math.floor(points[fi].x / flatCell), ncy = Math.floor(points[fi].y / flatCell);
                    for (var gx2 = ncx - 1; gx2 <= ncx + 1; gx2++) {
                        for (var gy2 = ncy - 1; gy2 <= ncy + 1; gy2++) {
                            var nb = flatGrid.get(gx2 + ':' + gy2);
                            if (!nb) continue;
                            for (var nbi = 0; nbi < nb.length; nbi++) {
                                var pj = points[nb[nbi]];
                                var ddx = pj.x - points[fi].x, ddy = pj.y - points[fi].y;
                                if (ddx * ddx + ddy * ddy <= r2) pj.z = nz;
                            }
                        }
                    }
                }
            }

            // ---- 9. Terrain Z sampling for non-rim vertices ----
            if (typeof opts.sampleZ === 'function') {
                for (var i = 0; i < points.length; i++) {
                    if (points[i].z === undefined) {
                        points[i].z = opts.sampleZ(points[i].x, points[i].y);
                    }
                }
            }

            return {
                points: points,
                segments: segments,
                holes: holes,
                regions: regions,
                nodeVertexIndex: nodeVertexIndex,
                regionAttrToSub: regionAttrToSub,
                markerToConduit: markerToConduit,
                warnings: warnings
            };
        }
    };

    Mesh2DPslg.build = Mesh2DPslg.fromNetwork;
    window.Mesh2DPslg = Mesh2DPslg;
})(window);
