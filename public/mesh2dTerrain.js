// mesh2dTerrain.js — DTM samplers and terrain-adaptive point thinning.
(function (window) {
    'use strict';

    var M = 111320;
    function unitFactor(unit) { return unit === 'ft' ? 0.3048 : unit === 'cm' ? 0.01 : 1; }
    function finite(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

    function idw(points, x, y, k) {
        var near = points.map(function (p) {
            var dx = p.x - x, dy = p.y - y;
            return { p: p, d2: dx * dx + dy * dy };
        }).sort(function (a, b) { return a.d2 - b.d2; }).slice(0, k || 4);
        var sum = 0, weight = 0;
        near.forEach(function (n) {
            if (!isFinite(n.p.z)) return;
            if (n.d2 < 1e-12) { sum = n.p.z; weight = 1; return; }
            var w = 1 / n.d2;
            sum += n.p.z * w; weight += w;
        });
        return weight ? sum / weight : null;
    }

    function makeSampler(settings, map) {
        settings = settings || {};
        var factor = unitFactor(settings.verticalUnit) * (Number(settings.zFactor) || 1);
        var sampler = {
            kind: settings.dtmSource || 'NONE',
            ready: Promise.resolve(),
            sampleLngLat: function () { return null; }
        };
        if (settings.dtmSource === 'MAPBOX') {
            sampler.kind = 'MAPBOX';
            sampler.sampleLngLat = function (lngLat) {
                if (!map || typeof map.queryTerrainElevation !== 'function') return null;
                var z = map.queryTerrainElevation(lngLat);
                return finite(z) === null ? null : z * factor;
            };
            sampler.note = 'Mapbox terrain uses the current tile coverage and zoom; uncovered vertices use IDW fallback.';
            return sampler;
        }
        var openTopo = /^(COP30|USGS10m|SRTMGL1|NASADEM|ANADEM|GEDTM30)$/.test(String(settings.dtmSource || ''));
        if (settings.dtmSource !== 'GEOTIFF' && !openTopo) return sampler;
        if (!window.GeoTIFF) return sampler;

        sampler.kind = openTopo ? 'OPENTOPOGRAPHY_' + settings.dtmSource : 'GEOTIFF';
        var rasterBuffer;
        if (settings.file && settings.file.arrayBuffer) {
            rasterBuffer = settings.file.arrayBuffer();
        } else if (openTopo && settings.bbox && window.LandCoverModule && window.LandCoverModule.getOpenTopographyBboxUrl) {
            var url = window.LandCoverModule.getOpenTopographyBboxUrl(settings.bbox[0], settings.bbox[1], settings.bbox[2], settings.bbox[3], settings.dtmSource, settings.apiKey || '');
            rasterBuffer = fetch(url).then(function (response) {
                if (!response.ok) throw new Error('OpenTopography DEM request failed: HTTP ' + response.status);
                return response.arrayBuffer();
            });
        } else {
            return sampler;
        }
        sampler.ready = rasterBuffer.then(function (buffer) {
            return window.GeoTIFF.fromArrayBuffer(buffer);
        }).then(function (tiff) {
            return tiff.getImage();
        }).then(function (image) {
            return image.readRasters({ interleave: true }).then(function (raster) {
                var width = image.getWidth(), height = image.getHeight();
                var fileDir = image.getFileDirectory ? image.getFileDirectory() : {};
                var tie = fileDir.ModelTiepoint || fileDir.ModelTiepointTag || [0, 0, 0, 0, 0, 0];
                var scale = fileDir.ModelPixelScale || fileDir.ModelPixelScaleTag || [1, 1, 1];
                var x0 = Number(tie[3]) || 0, y0 = Number(tie[4]) || 0;
                var sx = Number(scale[0]) || 1, sy = Number(scale[1]) || 1;
                var geoKeys = image.getGeoKeys ? image.getGeoKeys() : {};
                var epsg = settings.epsgOverride || (geoKeys.ProjectedCSTypeGeoKey ? 'EPSG:' + geoKeys.ProjectedCSTypeGeoKey : 'EPSG:4326');
                var sourceProj = epsg;
                sampler.epsg = epsg;
                sampler.detectedCrs = epsg;
                function toLngLat(x, y) {
                    if (sourceProj !== 'EPSG:4326' && window.proj4) {
                        try { return window.proj4(sourceProj, 'EPSG:4326', [x, y]); } catch (e) { return null; }
                    }
                    return [x, y];
                }
                sampler.refreshBounds = function () {
                    var rasterCorners = [
                        toLngLat(x0, y0),
                        toLngLat(x0 + sx * width, y0),
                        toLngLat(x0 + sx * width, y0 - sy * height),
                        toLngLat(x0, y0 - sy * height)
                    ];
                    if (rasterCorners.every(function (p) { return p && isFinite(p[0]) && isFinite(p[1]); })) {
                        rasterCorners.push(rasterCorners[0].slice());
                        sampler.boundsLngLat = rasterCorners;
                    }
                };
                sampler.refreshBounds();
                var toRaster = function (lngLat) {
                    var xy = [lngLat[0], lngLat[1]];
                    if (sourceProj !== 'EPSG:4326' && window.proj4) {
                        try { xy = window.proj4('EPSG:4326', sourceProj, xy); } catch (e) { return null; }
                    }
                    var col = (xy[0] - x0) / sx;
                    var row = (y0 - xy[1]) / sy;
                    return [col, row];
                };
                sampler.sampleLngLat = function (lngLat) {
                    var rc = toRaster(lngLat);
                    if (!rc) return null;
                    var col = rc[0], row = rc[1];
                    if (col < 0 || row < 0 || col > width - 1 || row > height - 1) return null;
                    var c0 = Math.floor(col), r0 = Math.floor(row), c1 = Math.min(width - 1, c0 + 1), r1 = Math.min(height - 1, r0 + 1);
                    var tx = col - c0, ty = row - r0;
                    function value(c, r) { var v = Number(raster[r * width + c]); return isFinite(v) && v !== -9999 ? v : null; }
                    var a = value(c0, r0), b = value(c1, r0), c = value(c0, r1), d = value(c1, r1);
                    var vals = [[a, (1 - tx) * (1 - ty)], [b, tx * (1 - ty)], [c, (1 - tx) * ty], [d, tx * ty]];
                    var sum = 0, w = 0;
                    vals.forEach(function (v) { if (v[0] !== null) { sum += v[0] * v[1]; w += v[1]; } });
                    return w ? sum / w * factor : null;
                };
            });
        });
        return sampler;
    }

    function resolveVertexElevations(vertices, sampler, opts) {
        opts = opts || {};
        var nodes = opts.nodes || [];
        var nodeById = {};
        nodes.forEach(function (n) { nodeById[n.id] = n; });
        vertices.forEach(function (v) {
            if (opts.useRimZ && v.nodeId && nodeById[v.nodeId]) {
                var p = nodeById[v.nodeId].props || nodeById[v.nodeId];
                var inv = Number(p.invertEl), depth = Number(p.maxDepth);
                if (isFinite(inv)) { v.z = inv + (isFinite(depth) ? depth : 0); return; }
            }
            if (!isFinite(v.z) && sampler && sampler.sampleLngLat) v.z = sampler.sampleLngLat([v.lng, v.lat]);
        });
        if (opts.flattenRadius > 0) {
            vertices.forEach(function (v) {
                if (!v.nodeId) return;
                var base = v.z;
                if (!isFinite(base)) return;
                vertices.forEach(function (q) {
                    var dx = q.x - v.x, dy = q.y - v.y;
                    if (dx * dx + dy * dy <= opts.flattenRadius * opts.flattenRadius) q.z = base;
                });
            });
        }
        var resolved = vertices.filter(function (v) { return isFinite(v.z); });
        vertices.forEach(function (v) { if (!isFinite(v.z)) v.z = idw(resolved, v.x, v.y, 4); if (!isFinite(v.z)) v.z = 0; });
        return vertices;
    }

    function thinTerrain(sampler, domain, opts, transform) {
        opts = opts || {};
        if (!sampler || !sampler.sampleLngLat || !domain || !domain.length) return [];
        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        domain.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
        var area = Math.max(1, (maxX - minX) * (maxY - minY));
        var spacing = Math.max(Number(opts.minSpacing) || 40, Math.sqrt(area / 60000));
        var maxPoints = Math.max(1, Number(opts.maxPoints) || 5000), points = [];
        var cols = Math.min(300, Math.ceil((maxX - minX) / spacing) + 1), rows = Math.min(300, Math.ceil((maxY - minY) / spacing) + 1);
        while (cols * rows > 60000) { cols = Math.ceil(cols * 0.9); rows = Math.ceil(rows * 0.9); }
        var grid = new Map(), candidates = [], candidateGrid = new Map();
        function inside(p) { var x = p[0], y = p[1], yes = false; for (var i = 0, j = domain.length - 1; i < domain.length; j = i++) { var a = domain[i], b = domain[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes; } return yes; }
        function edgeDistance(p) { var best = Infinity; for (var i = 0; i < domain.length; i++) { var a = domain[i], b = domain[(i + 1) % domain.length], dx = b[0] - a[0], dy = b[1] - a[1], t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1); t = Math.max(0, Math.min(1, t)); var q = [a[0] + t * dx, a[1] + t * dy]; best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1])); } return best; }
        function normal(x, y, h) { var z0 = sampler.sampleLngLat(transform.toLngLat([x, y])); var zx = sampler.sampleLngLat(transform.toLngLat([x + h, y])), zy = sampler.sampleLngLat(transform.toLngLat([x, y + h])); if (![z0, zx, zy].every(isFinite)) return null; var nx = -(zx - z0) / h, ny = -(zy - z0) / h, len = Math.hypot(nx, ny, 1) || 1; return [nx / len, ny / len, 1 / len]; }
        for (var iy = 0; iy < rows; iy++) for (var ix = 0; ix < cols; ix++) {
            var x = minX + (ix + 0.5) * (maxX - minX) / cols, y = minY + (iy + 0.5) * (maxY - minY) / rows;
            if (!inside([x, y])) continue;
            var ll = transform.toLngLat([x, y]), z = sampler.sampleLngLat(ll);
            if (!isFinite(z)) continue;
            var buffer = Number(opts.boundaryBuffer) || spacing / 4;
            if (edgeDistance([x, y]) <= buffer) continue;
            var candidate = { x: x, y: y, z: z, normal: normal(x, y, Math.max(1, spacing / 2)) }, candidateKey = Math.floor(x / spacing) + ':' + Math.floor(y / spacing);
            candidates.push(candidate); var candidateBucket = candidateGrid.get(candidateKey); if (candidateBucket) candidateBucket.push(candidate); else candidateGrid.set(candidateKey, [candidate]);
        }
        var threshold = Number(opts.normalDot); if (!isFinite(threshold)) threshold = 0.6;
        candidates.forEach(function (c) {
            if (points.length >= maxPoints || !c.normal) return;
            var avg = [0, 0, 0], count = 0;
            var ccx = Math.floor(c.x / spacing), ccy = Math.floor(c.y / spacing);
            for (var gx = ccx - 1; gx <= ccx + 1; gx++) for (var gy = ccy - 1; gy <= ccy + 1; gy++) (candidateGrid.get(gx + ':' + gy) || []).forEach(function (q) { if (q.normal) { avg[0] += q.normal[0]; avg[1] += q.normal[1]; avg[2] += q.normal[2]; count++; } });
            var al = Math.hypot(avg[0], avg[1], avg[2]) || 1, dot = (c.normal[0] * avg[0] + c.normal[1] * avg[1] + c.normal[2] * avg[2]) / al;
            if (dot >= threshold) return;
            var key = Math.floor(c.x / spacing) + ':' + Math.floor(c.y / spacing); if (grid.has(key)) return; grid.set(key, true); points.push({ x: c.x, y: c.y, z: c.z, tag: 'terrain' });
        });
        return points;
    }

    window.Mesh2DTerrain = { createSampler: makeSampler, resolveVertexElevations: resolveVertexElevations, thinTerrain: thinTerrain, idw: idw };
})(window);
