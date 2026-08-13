// mesh2dRender.js — CPU GeoJSON builders for indexed 2D results.
(function (window) {
    'use strict';
    function feature(type, coordinates, properties, id) { return { type: 'Feature', id: id, properties: properties || {}, geometry: { type: type, coordinates: coordinates } }; }
    function finite(value, fallback) { var n = Number(value); return Number.isFinite(n) ? n : (fallback || 0); }
    function vertexField(mesh, values, mode, minValue) {
        var out = new Array((mesh && mesh.vertices || []).length).fill(0), weight = new Array(out.length).fill(0);
        if (values && values.length === out.length) return Array.from(values, function (v) { return finite(v); });
        // Depth is masked per cell (View2D.DEPTH_MASK_M). Skipping dry cells
        // keeps their zero contribution from diluting wet-cell depths and stops
        // a wet cell from bleeding into neighbouring dry vertices via shared
        // ones — the field stays cell-faithful instead of expanding into clumps.
        var wet = (mode !== 'elevation' && Number.isFinite(minValue)) ? minValue : -Infinity;
        (mesh.triangles || []).forEach(function (t) {
            var a = mesh.vertices[t.v[0]], b = mesh.vertices[t.v[1]], c = mesh.vertices[t.v[2]];
            if (!a || !b || !c) return;
            var area = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
            var val = mode === 'elevation'
                ? (finite(a.z) + finite(b.z) + finite(c.z)) / 3
                : finite(t.value);
            if (val < wet) return;
            t.v.forEach(function (i) { out[i] += val * area; weight[i] += area; });
        });
        return out.map(function (v, i) { return weight[i] ? finite(v / weight[i]) : (mode === 'elevation' ? finite(mesh.vertices[i].z) : 0); });
    }
    function levelsAuto(values, count) {
        count = count || 8;
        var valid = (values || []).map(Number).filter(Number.isFinite);
        if (!valid.length) return [];
        var min = Math.min.apply(Math, valid), max = Math.max.apply(Math, valid);
        // A constant field has no isolines or contour bands. Returning a
        // synthetic 0..1 range used to paint every dry triangle blue.
        if (max - min <= 1e-12) return [];
        var step = (max - min) / count, levels = [];
        for (var i = 0; i <= count; i++) levels.push(min + i * step);
        return levels;
    }
    function isolines(mesh, values, levels) {
        var fs = [];
        (levels || levelsAuto(values)).forEach(function (level) {
            (mesh.triangles || []).forEach(function (t) {
                var ids = t.v, pts = [];
                for (var i = 0; i < 3; i++) {
                    var j = (i + 1) % 3, va = Number(values[ids[i]]), vb = Number(values[ids[j]]);
                    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
                    if ((va < level && vb >= level) || (vb < level && va >= level)) {
                        var q = (level - va) / ((vb - va) || 1), a = mesh.vertices[ids[i]], b = mesh.vertices[ids[j]];
                        pts.push([a.lng + (b.lng - a.lng) * q, a.lat + (b.lat - a.lat) * q]);
                    }
                }
                if (pts.length === 2) fs.push(feature('LineString', pts, { level: level }));
            });
        });
        return { type: 'FeatureCollection', features: fs };
    }
    function contourBands(mesh, values, levels, minValue) {
        var fs = [], lv = levels || levelsAuto(values);
        if (lv.length < 2) return { type: 'FeatureCollection', features: fs };
        function clip(poly, limit, keepAbove) {
            var out = [];
            if (!poly.length) return out;
            function inside(p) { return keepAbove ? p[2] >= limit : p[2] <= limit; }
            function intersection(a, b) {
                var den = b[2] - a[2], t = Math.abs(den) < 1e-12 ? 0 : (limit - a[2]) / den;
                return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, limit];
            }
            for (var i = 0; i < poly.length; i++) {
                var a = poly[i], b = poly[(i + 1) % poly.length], aIn = inside(a), bIn = inside(b);
                if (aIn && bIn) out.push(b);
                else if (aIn && !bIn) out.push(intersection(a, b));
                else if (!aIn && bIn) out.push(intersection(a, b), b);
            }
            return out;
        }
        (mesh.triangles || []).forEach(function (t) {
            var poly = t.v.map(function (i) { var v = mesh.vertices[i]; return [v.lng, v.lat, Number(values[i])]; });
            if (poly.some(function (p) { return !Number.isFinite(p[2]); })) return;
            // Depth is zero in most cells. Clip the dry part before creating
            // bands so the first contour does not cover the whole domain.
            if (Number.isFinite(minValue)) {
                poly = clip(poly, minValue, true);
                if (poly.length < 3) return;
            }
            for (var b = 0; b < lv.length - 1; b++) {
                var clipped = clip(clip(poly, lv[b], true), lv[b + 1], false);
                if (clipped.length >= 3) {
                    var ring = clipped.map(function (p) { return [p[0], p[1]]; });
                    ring.push(ring[0].slice());
                    fs.push(feature('Polygon', [ring], { bandIndex: b, level: lv[b] }, 'band-' + b + '-' + t.v.join('-')));
                }
            }
        });
        return { type: 'FeatureCollection', features: fs };
    }
    function velocityArrows(mesh, velocities, max, vx, vy) {
        var fs = []; (mesh.triangles || []).forEach(function (t, i) { var a = mesh.vertices[t.v[0]], b = mesh.vertices[t.v[1]], c = mesh.vertices[t.v[2]], mag = Number(velocities && velocities[i]); if (!a || !b || !c || !Number.isFinite(mag) || mag < 0.002) return; var dx = vx && Number(vx[i]), dy = vy && Number(vy[i]); if (!Number.isFinite(dx) || !Number.isFinite(dy)) { dx = c.x - a.x; dy = c.y - a.y; } fs.push(feature('Point', [(a.lng + b.lng + c.lng) / 3, (a.lat + b.lat + c.lat) / 3], { angle: 90 - (Math.atan2(dy, dx) * 180 / Math.PI), mag: mag, size: Math.max(0.4, Math.min(1.8, Math.sqrt(mag / (max || 1)))) }, 'vel-' + i)); }); return { type: 'FeatureCollection', features: fs };
    }
    function meshVertices(mesh, field) { return { type: 'FeatureCollection', features: (mesh.vertices || []).map(function (v, i) { return feature('Point', [v.lng, v.lat], { index: i, value: finite(field ? field[i] : v.z), z: finite(v.z) }, 'mv-' + i); }) }; }
    window.Mesh2DRender = { vertexField: vertexField, levelsAuto: levelsAuto, isolines: isolines, contourBands: contourBands, velocityArrows: velocityArrows, meshVertices: meshVertices };

    var manager = {
        map: null,
        ensure: function (map) {
            this.map = map || this.map || window.map; if (!this.map || !this.map.addSource) return;
            if (!window.Net || !window.Net.mesh2DIndexed) { if (window.Mesh2DGL && window.Mesh2DGL.clear) window.Mesh2DGL.clear(this.map); return; }
            var m = this.map, empty = { type: 'FeatureCollection', features: [] };
            var sources = ['m2d-vertices', 'm2d-depth-isolines', 'm2d-depth-bands', 'm2d-velocity-arrows', 'm2d-elev-isolines', 'm2d-elev-bands'];
            sources.forEach(function (id) { if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data: empty }); });
            function layer(id, type, source, paint, layout) { if (!m.getLayer(id)) m.addLayer({ id: id, type: type, source: source, paint: paint || {}, layout: layout || {} }); }
            layer('m2d-output-vertices', 'circle', 'm2d-vertices', { 'circle-radius': 2.5, 'circle-color': '#263238', 'circle-opacity': 0.8 });
            layer('m2d-depth-isolines', 'line', 'm2d-depth-isolines', { 'line-color': '#1565c0', 'line-width': 1.2, 'line-opacity': 0.75 });
            layer('m2d-depth-bands', 'fill', 'm2d-depth-bands', {
                'fill-color': ['interpolate', ['linear'], ['get', 'bandIndex'],
                    0, '#2e7dd1', 2, '#26a69a', 4, '#ffca28', 6, '#f57c00', 8, '#d32f2f'],
                'fill-opacity': 0.3
            });
            layer('m2d-velocity-arrows', 'symbol', 'm2d-velocity-arrows', {}, { 'icon-image': 'm2d-arrow', 'icon-size': ['coalesce', ['get', 'size'], 1], 'icon-allow-overlap': true, 'icon-rotate': ['get', 'angle'], 'icon-rotation-alignment': 'map' });
            layer('m2d-static-vertices', 'circle', 'm2d-vertices', { 'circle-radius': 2, 'circle-color': '#8d6e63', 'circle-opacity': 0.7 });
            layer('m2d-elevation-isolines', 'line', 'm2d-elev-isolines', { 'line-color': '#795548', 'line-width': 1, 'line-opacity': 0.65 });
            layer('m2d-elevation-bands', 'fill', 'm2d-elev-bands', { 'fill-color': '#8d6e63', 'fill-opacity': 0.16 });
            if (!m.hasImage || !m.hasImage('m2d-arrow')) { var c = document.createElement('canvas'); c.width = c.height = 64; var x = c.getContext('2d'); x.fillStyle = '#263238'; x.fillRect(4, 29, 38, 6); x.beginPath(); x.moveTo(42, 16); x.lineTo(60, 32); x.lineTo(42, 48); x.closePath(); x.fill(); if (!m.hasImage('m2d-arrow')) m.addImage('m2d-arrow', { width: 64, height: 64, data: x.getImageData(0, 0, 64, 64).data }); }
            var mesh = window.Net && window.Net.mesh2DIndexed;
            if (mesh) {
                var elevation = Mesh2DRender.vertexField(mesh, null, 'elevation');
                var lev = Mesh2DRender.levelsAuto(elevation, 8);
                var sv = m.getSource('m2d-vertices'), se = m.getSource('m2d-elev-isolines'), sb = m.getSource('m2d-elev-bands');
                if (sv) sv.setData(Mesh2DRender.meshVertices(mesh, elevation));
                if (se) se.setData(Mesh2DRender.isolines(mesh, elevation, lev));
                if (sb) sb.setData(Mesh2DRender.contourBands(mesh, elevation, lev));
            }
            if (window.Mesh2DGL) window.Mesh2DGL.ensure(m);
        },
        onStep: function (step, frame) {
            var mesh = window.Net && window.Net.mesh2DIndexed, m = this.map || window.map; if (!mesh || !m || !frame) return;
            var triValues = frame.depth || [], field = frame.vertex && frame.vertex.depth && frame.vertex.depth.length === mesh.vertices.length ? Array.from(frame.vertex.depth, function (v) { return finite(v); }) : null;
            // Canonical depth mask (View2D.DEPTH_MASK_M, 5 mm): the uniform-rain
            // film sits below it and must render as dry, not as blue spots.
            var mask = (typeof View2D !== 'undefined' && View2D.DEPTH_MASK_M) ? View2D.DEPTH_MASK_M : 0.005;
            if (!field) { mesh.triangles.forEach(function (t, i) { t.value = triValues[i] || 0; }); field = Mesh2DRender.vertexField(mesh, null, null, mask); }
            var levels = Mesh2DRender.levelsAuto(field, 8);
            function set(id, data) { var s = m.getSource(id); if (s) s.setData(data); }
            var vel = frame.velocity || [], vMax = 0; for (var vi = 0; vi < vel.length; vi++) { if (Number.isFinite(Number(vel[vi])) && vel[vi] > vMax) vMax = vel[vi]; }
            set('m2d-vertices', Mesh2DRender.meshVertices(mesh, field)); set('m2d-depth-isolines', Mesh2DRender.isolines(mesh, field, levels)); set('m2d-depth-bands', Mesh2DRender.contourBands(mesh, field, levels, mask)); set('m2d-velocity-arrows', Mesh2DRender.velocityArrows(mesh, vel, vMax || 1, frame.velocityX, frame.velocityY));
            if (window.Mesh2DGL) window.Mesh2DGL.onStep(field);
        },
        clear: function () {
            var m = this.map || window.map; if (!m) return;
            ['m2d-vertices', 'm2d-depth-isolines', 'm2d-depth-bands', 'm2d-velocity-arrows'].forEach(function (id) { var s = m.getSource(id); if (s) s.setData({ type: 'FeatureCollection', features: [] }); });
        }
    };
    window.Mesh2DLayers = manager;
})(window);
