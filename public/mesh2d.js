/**
 * mesh2d.js — 2D Triangular Mesh Generator for OpenSWMM 6
 * Uses poly2tri.js (Constrained Delaunay Triangulation) to generate
 * unstructured triangular meshes from subcatchment polygons.
 * 
 * Follows the OpenSWMM engine architecture where 2D surface routing uses
 * an unstructured triangular mesh overlaid on the 1D drainage network.
 */
(function(window) {
    'use strict';

    /**
     * Approximate area of a triangle in square meters given [lng,lat] vertices.
     * Uses the Haversine-based cross product approximation.
     */
    function triangleAreaM2(a, b, c) {
        // Convert to approximate meters using latitude-dependent scaling
        const midLat = (a[1] + b[1] + c[1]) / 3;
        const latScale = 111320; // meters per degree latitude
        const lngScale = 111320 * Math.cos(midLat * Math.PI / 180);

        const ax = (b[0] - a[0]) * lngScale;
        const ay = (b[1] - a[1]) * latScale;
        const bx = (c[0] - a[0]) * lngScale;
        const by = (c[1] - a[1]) * latScale;

        return Math.abs(ax * by - ay * bx) / 2;
    }

    /**
     * Check if a point is inside a polygon using ray casting.
     */
    function pointInPolygon(pt, ring) {
        const x = pt[0], y = pt[1];
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1];
            const xj = ring[j][0], yj = ring[j][1];
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    /**
     * Find which subcatchment a point belongs to.
     */
    function findParentSubcatchment(pt, subcatchments) {
        for (const sub of subcatchments) {
            if (sub.ring && sub.ring.length >= 3 && pointInPolygon(pt, sub.ring)) {
                return sub;
            }
        }
        return null;
    }

    const Mesh2DGenerator = {

        /**
         * Generate a 2D triangular mesh from all subcatchment polygons.
         * @param {Object} options
         * @param {number} options.maxAreaM2 - Maximum triangle area in m² (default: 200)
         * @param {boolean} options.assignLandCover - Inherit land cover from parent subcatchment (default: true)
         * @returns {{ cells: number, vertices: number, errors: string[] }}
         */
        generateFromSubcatchments(options = {}) {
            const maxAreaM2 = options.maxAreaM2 || 200;
            const assignLandCover = options.assignLandCover !== false;
            const Net = window.Net;
            const errors = [];

            if (!Net || !Net.subcatchments || Net.subcatchments.length === 0) {
                return { cells: 0, vertices: 0, errors: ['No subcatchments found. Draw subcatchments first.'] };
            }

            if (typeof poly2tri === 'undefined') {
                return { cells: 0, vertices: 0, errors: ['poly2tri library not loaded. Check CDN connection.'] };
            }

            // Clear existing mesh
            Net.mesh2D = [];
            Net._geoMesh = null;

            let globalCellId = 0;
            let totalVertices = 0;

            for (const sub of Net.subcatchments) {
                if (!sub.ring || sub.ring.length < 3) {
                    errors.push(`Subcatchment ${sub.id}: not enough vertices (need ≥ 3).`);
                    continue;
                }

                try {
                    const result = this._triangulateSubcatchment(sub, maxAreaM2, globalCellId);
                    globalCellId = result.nextId;
                    totalVertices += result.vertexCount;

                    // Assign land cover properties from parent subcatchment
                    if (assignLandCover && sub.props) {
                        const lcCode = sub.props.landCoverClass || 0;
                        const roughness = window.LandCoverModule
                            ? window.LandCoverModule.getRoughness(lcCode)
                            : { nPerv: 0.10, nImperv: 0.013 };

                        result.cells.forEach(cell => {
                            cell.manningN = roughness.nPerv;
                            cell.landCoverClass = lcCode;
                            cell.parentSubcatch = sub.id;
                            cell.props = {
                                manningN: roughness.nPerv,
                                landCoverClass: lcCode,
                                parentSubcatch: sub.id
                            };
                        });
                    }

                    Net.mesh2D.push(...result.cells);
                } catch (e) {
                    errors.push(`Subcatchment ${sub.id}: triangulation failed — ${e.message}`);
                    console.warn(`Mesh2D: failed to triangulate ${sub.id}:`, e);
                }
            }

            // Invalidate GeoJSON cache
            Net._geoMesh = null;

            return {
                cells: Net.mesh2D.length,
                vertices: totalVertices,
                errors
            };
        },

        /**
         * Triangulate a single subcatchment polygon.
         * @private
         */
        _triangulateSubcatchment(sub, maxAreaM2, startId) {
            let ring = [...sub.ring];

            // Remove closing point if the ring is closed
            if (ring.length > 3 &&
                ring[0][0] === ring[ring.length - 1][0] &&
                ring[0][1] === ring[ring.length - 1][1]) {
                ring = ring.slice(0, -1);
            }

            if (ring.length < 3) {
                throw new Error('Degenerate polygon (< 3 unique vertices)');
            }

            // Clean collinear boundary vertices that cause poly2tri EdgeEvent errors
            ring = this._removeCollinearVertices(ring);

            // Ensure counter-clockwise winding for poly2tri
            if (this._isClockwise(ring)) {
                ring = ring.slice().reverse();
            }

            // Helper to build contour and triangulate with optional Steiner points, jitter, or custom collinear tolerance
            const attemptTriangulation = (useSteiner, useJitter, collinearTol = 1e-4) => {
                let cleanRing = this._removeCollinearVertices(ring, collinearTol);
                if (this._isClockwise(cleanRing)) {
                    cleanRing = cleanRing.slice().reverse();
                }

                const seen = new Set();
                const contour = [];
                for (let i = 0; i < cleanRing.length; i++) {
                    const pt = cleanRing[i];
                    let x = pt[0], y = pt[1];
                    if (useJitter) {
                        // Deterministic ~0.1mm jitter in deg coordinates to break exact collinearity
                        x += ((i % 2 === 0 ? 1 : -1) * (1e-6 * ((i % 5) + 1)));
                        y += ((i % 3 === 0 ? 1 : -1) * (1e-6 * ((i % 7) + 1)));
                    }
                    const key = `${x.toFixed(8)}_${y.toFixed(8)}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    contour.push(new poly2tri.Point(x, y));
                }

                if (contour.length < 3) {
                    throw new Error('Degenerate polygon after dedup (< 3 unique vertices)');
                }

                const swctx = new poly2tri.SweepContext(contour);

                if (useSteiner) {
                    const steinerPoints = this._generateSteinerPoints(cleanRing, maxAreaM2);
                    steinerPoints.forEach(sp => {
                        try {
                            swctx.addPoint(new poly2tri.Point(sp[0], sp[1]));
                        } catch (e) {
                            // Skip duplicate/collinear Steiner points
                        }
                    });
                }

                swctx.triangulate();
                return swctx.getTriangles();
            };

            let triangles;
            try {
                // Attempt 1: Full triangulation with Steiner refinement points
                triangles = attemptTriangulation(true, false, 1e-4);
            } catch (err1) {
                try {
                    // Attempt 2: Fallback without Steiner points (avoids interior collinearity)
                    triangles = attemptTriangulation(false, false, 1e-4);
                } catch (err2) {
                    try {
                        // Attempt 3: Relaxed collinear tolerance + small jitter
                        triangles = attemptTriangulation(false, true, 1e-3);
                    } catch (err3) {
                        // Attempt 4: Robust Ear-clipping / Fan fallback (guarantees non-failing triangulation)
                        triangles = this._earclipTriangulate(ring);
                    }
                }
            }

            // Convert to mesh2D cell format
            const cells = [];
            let vertexCount = 0;
            let cellId = startId;

            for (const tri of triangles) {
                const triRing = [
                    [tri.getPoint(0).x, tri.getPoint(0).y],
                    [tri.getPoint(1).x, tri.getPoint(1).y],
                    [tri.getPoint(2).x, tri.getPoint(2).y]
                ];

                cells.push({
                    id: `M2D_${String(cellId).padStart(4, '0')}`,
                    type: 'MESH2D',
                    ring: triRing,
                    props: {}
                });

                cellId++;
                vertexCount += 3;
            }

            return { cells, nextId: cellId, vertexCount };
        },

        /**
         * Remove consecutive collinear vertices from a polygon ring across multiple passes.
         * Prevents poly2tri "EdgeEvent: Collinear not supported!" errors on GIS shapes.
         * @private
         */
        _removeCollinearVertices(ring, tolerance = 1e-4) {
            if (ring.length < 3) return ring;
            let current = [...ring];
            let changed = true;
            let pass = 0;

            while (changed && current.length >= 3 && pass < 10) {
                changed = false;
                pass++;
                const cleaned = [];
                const n = current.length;

                for (let i = 0; i < n; i++) {
                    const prev = current[(i - 1 + n) % n];
                    const cur = current[i];
                    const next = current[(i + 1) % n];

                    const dx1 = cur[0] - prev[0], dy1 = cur[1] - prev[1];
                    const dx2 = next[0] - cur[0], dy2 = next[1] - cur[1];
                    const len1 = Math.hypot(dx1, dy1);
                    const len2 = Math.hypot(dx2, dy2);

                    if (len1 < 1e-9 || len2 < 1e-9) {
                        changed = true;
                        continue; // Skip zero-distance duplicate points
                    }

                    const cross = Math.abs(dx1 * dy2 - dy1 * dx2);
                    if (cross / (len1 * len2) < tolerance) {
                        changed = true;
                        continue; // Skip collinear middle vertex
                    }

                    cleaned.push(cur);
                }

                if (cleaned.length >= 3) {
                    current = cleaned;
                } else {
                    break;
                }
            }

            return current.length >= 3 ? current : ring;
        },

        /**
         * Simple Ear-clipping triangulation fallback when poly2tri fails on complex/collinear polygons.
         * @private
         */
        _earclipTriangulate(ring) {
            const pts = this._removeCollinearVertices(ring, 1e-3);
            if (pts.length < 3) return [];
            if (this._isClockwise(pts)) pts.reverse();

            const polyTriangles = [];
            const indices = pts.map((_, i) => i);

            let passes = 0;
            const maxPasses = indices.length * 5;

            while (indices.length > 3 && passes < maxPasses) {
                passes++;
                let earFound = false;
                for (let i = 0; i < indices.length; i++) {
                    const iPrev = indices[(i - 1 + indices.length) % indices.length];
                    const iCur = indices[i];
                    const iNext = indices[(i + 1) % indices.length];

                    const pPrev = pts[iPrev];
                    const pCur = pts[iCur];
                    const pNext = pts[iNext];

                    // Check if convex
                    const cross = (pCur[0] - pPrev[0]) * (pNext[1] - pCur[1]) - (pCur[1] - pPrev[1]) * (pNext[0] - pCur[0]);
                    if (cross <= 0) continue;

                    // Check if any other point lies inside triangle
                    let pointInside = false;
                    for (let j = 0; j < indices.length; j++) {
                        const idx = indices[j];
                        if (idx === iPrev || idx === iCur || idx === iNext) continue;
                        if (pointInPolygon(pts[idx], [pPrev, pCur, pNext])) {
                            pointInside = true;
                            break;
                        }
                    }

                    if (!pointInside) {
                        polyTriangles.push({
                            getPoint: k => k === 0 ? { x: pPrev[0], y: pPrev[1] } : k === 1 ? { x: pCur[0], y: pCur[1] } : { x: pNext[0], y: pNext[1] }
                        });
                        indices.splice(i, 1);
                        earFound = true;
                        break;
                    }
                }

                if (!earFound) break; // Triangle fan fallback handles remainder
            }

            // Fan triangulation for remaining polygon vertices
            for (let i = 1; i < indices.length - 1; i++) {
                const p0 = pts[indices[0]];
                const p1 = pts[indices[i]];
                const p2 = pts[indices[i + 1]];
                polyTriangles.push({
                    getPoint: k => k === 0 ? { x: p0[0], y: p0[1] } : k === 1 ? { x: p1[0], y: p1[1] } : { x: p2[0], y: p2[1] }
                });
            }

            return polyTriangles;
        },

        /**
         * Generate interior Steiner points for mesh refinement.
         * Uses a grid approach, only keeping points inside the polygon.
         * @private
         */
        _generateSteinerPoints(ring, maxAreaM2) {
            const points = [];

            // Compute bounding box
            let minLng = Infinity, maxLng = -Infinity;
            let minLat = Infinity, maxLat = -Infinity;
            for (const pt of ring) {
                if (pt[0] < minLng) minLng = pt[0];
                if (pt[0] > maxLng) maxLng = pt[0];
                if (pt[1] < minLat) minLat = pt[1];
                if (pt[1] > maxLat) maxLat = pt[1];
            }

            // Compute grid spacing from maxAreaM2
            // An equilateral triangle with area A has side length s = sqrt(4A/sqrt(3))
            // Grid spacing ≈ side length
            const sideLength = Math.sqrt(4 * maxAreaM2 / Math.sqrt(3));

            // Convert side length from meters to degrees
            const midLat = (minLat + maxLat) / 2;
            const latStep = sideLength / 111320;
            const lngStep = sideLength / (111320 * Math.cos(midLat * Math.PI / 180));

            if (lngStep <= 0 || latStep <= 0 || !isFinite(lngStep) || !isFinite(latStep)) {
                return points;
            }

            // Safety: limit max grid points to prevent browser hang
            const gridCols = Math.ceil((maxLng - minLng) / lngStep);
            const gridRows = Math.ceil((maxLat - minLat) / latStep);
            if (gridCols * gridRows > 50000) {
                // Too many points — increase step size
                const scale = Math.sqrt((gridCols * gridRows) / 50000);
                const adjLngStep = lngStep * scale;
                const adjLatStep = latStep * scale;
                return this._generateGridPoints(ring, minLng, maxLng, minLat, maxLat, adjLngStep, adjLatStep);
            }

            return this._generateGridPoints(ring, minLng, maxLng, minLat, maxLat, lngStep, latStep);
        },

        /**
         * Generate grid points inside a polygon with staggered rows.
         * @private
         */
        _generateGridPoints(ring, minLng, maxLng, minLat, maxLat, lngStep, latStep) {
            const points = [];
            const margin = 0.1; // 10% inset from polygon edges

            let rowIndex = 0;
            for (let lat = minLat + latStep * 0.5; lat < maxLat; lat += latStep) {
                // Stagger every other row for better triangle quality
                const offset = (rowIndex % 2 === 1) ? lngStep * 0.5 : 0;
                for (let lng = minLng + lngStep * 0.5 + offset; lng < maxLng; lng += lngStep) {
                    const pt = [lng, lat];
                    if (pointInPolygon(pt, ring)) {
                        // Check minimum distance from polygon edges to avoid collinear points
                        if (this._minDistToEdge(pt, ring) > lngStep * margin) {
                            points.push(pt);
                        }
                    }
                }
                rowIndex++;
            }

            return points;
        },

        /**
         * Approximate minimum distance from a point to polygon edges (in degrees).
         * @private
         */
        _minDistToEdge(pt, ring) {
            let minDist = Infinity;
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                const dist = this._pointToSegmentDist(pt, ring[i], ring[j]);
                if (dist < minDist) minDist = dist;
            }
            return minDist;
        },

        /**
         * Distance from point to line segment (in coordinate units).
         * @private
         */
        _pointToSegmentDist(p, a, b) {
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const lenSq = dx * dx + dy * dy;
            if (lenSq === 0) return Math.sqrt((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2);

            let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
            t = Math.max(0, Math.min(1, t));

            const projX = a[0] + t * dx;
            const projY = a[1] + t * dy;
            return Math.sqrt((p[0] - projX) ** 2 + (p[1] - projY) ** 2);
        },

        /**
         * Check if a ring is clockwise (using shoelace formula).
         * @private
         */
        _isClockwise(ring) {
            let sum = 0;
            for (let i = 0; i < ring.length; i++) {
                const cur = ring[i];
                const next = ring[(i + 1) % ring.length];
                sum += (next[0] - cur[0]) * (next[1] + cur[1]);
            }
            return sum > 0;
        },

        /**
         * Clear all 2D mesh data.
         */
        clearMesh() {
            if (window.Net) {
                window.Net.mesh2D = [];
                window.Net._geoMesh = null;
            }
        }
    };

    window.Mesh2DGenerator = Mesh2DGenerator;

})(window);
