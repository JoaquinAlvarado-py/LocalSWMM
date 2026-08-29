// network3D.js — Static 3D rendering of the SWMM network via Mapbox fill-extrusion.
// Pure geometry builders are exported for Node tests; window.Network3D is the browser API.

(function () {
    'use strict';

    const DEFAULT_COLORS = {
        NODE_COLORS: { JUNCTION: '#1565c0', OUTFALL: '#2e7d32', STORAGE: '#6a1b9a', DIVIDER: '#ef6c00', RAINGAGE: '#00838f' },
        LINK_COLORS: { CONDUIT: '#455a64', PUMP: '#c62828', WEIR: '#ad1457', ORIFICE: '#4527a0', OUTLET: '#00695c' }
    };

    function toMeters(v, units) {
        if (units === 'US') return v * 0.3048;
        return v;
    }

    function octagon(cx, cy, r) {
        const ring = [];
        for (let i = 0; i < 8; i++) {
            const a = (Math.PI / 4) * i + Math.PI / 8;
            ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
        }
        ring.push(ring[0]);
        return ring;
    }

    function dist(a, b) {
        const dLat = (b[1] - a[1]) * Math.PI / 180;
        const dLng = (b[0] - a[0]) * Math.PI / 180;
        const la1 = a[1] * Math.PI / 180, la2 = b[1] * Math.PI / 180;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
        return 6371008.8 * 2 * Math.asin(Math.sqrt(h));
    }

    function lerp(a, b, t) {
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }

    function stripPolygon(a, b, widthM, midLat) {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1e-9;
        const cosLat = Math.cos(midLat * Math.PI / 180) || 1e-9;
        const mPerLon = 111320 * cosLat, mPerLat = 111320;
        const nx = -dy / len, ny = dx / len;
        const hw = widthM / 2;
        const dLon = nx * hw / mPerLon, dLat = ny * hw / mPerLat;
        const p1 = [a[0] + dLon, a[1] + dLat];
        const p2 = [b[0] + dLon, b[1] + dLat];
        const p3 = [b[0] - dLon, b[1] - dLat];
        const p4 = [a[0] - dLon, a[1] - dLat];
        return [p1, p2, p3, p4, p1];
    }

    function linkPathSegments(pts, baseA, baseB, maxSegs) {
        const total = pts.reduce((acc, p, i) => (i ? acc + dist(pts[i - 1], p) : 0), 0) || 1e-9;
        const n = Math.min(maxSegs, Math.max(1, Math.round(total / 25)));
        const segs = [];
        let cum = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1];
            const s = dist(a, b);
            const parts = Math.max(1, Math.round(n * s / total));
            for (let k = 0; k < parts; k++) {
                const t0 = k / parts, t1 = (k + 1) / parts;
                const midFrac = (cum + s * (t0 + t1) / 2) / total;
                segs.push({ a: lerp(a, b, t0), b: lerp(a, b, t1), base: baseA + (baseB - baseA) * midFrac });
            }
            cum += s;
        }
        return segs;
    }

    function nodeFeatures(nodes, units, colors) {
        const out = [];
        for (const n of nodes || []) {
            const p = n.props || {};
            if (n.type === 'RAINGAGE') continue;
            const invertEl = toMeters(Number(p.invertEl) || 0, units);
            const isOutfall = n.type === 'OUTFALL';
            const maxDepth = toMeters(Number(p.maxDepth) || 2, units);
            const height = isOutfall ? 0.5 : maxDepth;
            const width = isOutfall ? 0.6 : Math.max(0.6, Math.min(maxDepth * 0.35, 1.5));
            const cx = Number((n.lngLat || [0, 0])[0]), cy = Number((n.lngLat || [0, 0])[1]);
            out.push({
                type: 'Feature', id: n.id,
                properties: {
                    id: n.id, kind: isOutfall ? 'outfall' : 'node',
                    base: invertEl, height, width, color: colors.NODE_COLORS[n.type] || colors.NODE_COLORS.JUNCTION
                },
                geometry: { type: 'Polygon', coordinates: [octagon(cx, cy, width / 2)] }
            });
        }
        return out;
    }

    function boxFeature(link, kind, base, height, width, a, b, color) {
        const midLat = (a[1] + b[1]) / 2;
        return {
            type: 'Feature', id: link.id,
            properties: { id: link.id, kind, base, height, width, color },
            geometry: { type: 'Polygon', coordinates: [stripPolygon(a, b, width, midLat)] }
        };
    }

    function linkFeatures(links, nodes, units, opts) {
        opts = opts || {};
        const colors = opts.colors || DEFAULT_COLORS;
        const maxSegs = opts.maxSegs || 64;
        const out = [];
        const nodeById = new Map((nodes || []).map(n => [n.id, n]));
        for (const l of links || []) {
            const from = nodeById.get(l.from), to = nodeById.get(l.to);
            if (!from || !to) { console.warn('network3D: skip dangling link ' + l.id); continue; }
            const p = l.props || {};
            const baseA = toMeters(Number(from.props && from.props.invertEl) || 0, units) + toMeters(Number(p.inOffset) || 0, units);
            const baseB = toMeters(Number(to.props && to.props.invertEl) || 0, units) + toMeters(Number(p.outOffset) || 0, units);
            const pts = [(from.lngLat || [0, 0])].concat(l.vertices || [], [(to.lngLat || [0, 0])]);
            const a = pts[0], b = pts[pts.length - 1];
            if (l.type === 'CONDUIT') {
                const geom1 = toMeters(Number(p.geom1) || 0, units);
                if (geom1 <= 0) { console.warn('network3D: skip conduit ' + l.id + ' (geom1<=0)'); continue; }
                const geom2 = toMeters(Number(p.geom2) || 0, units);
                const circ = /CIRCULAR/.test(p.xShape || '');
                const width = circ || !geom2 ? geom1 : geom2;
                for (const seg of linkPathSegments(pts, baseA, baseB, maxSegs)) {
                    out.push({
                        type: 'Feature', id: l.id,
                        properties: { id: l.id, kind: 'conduit', base: seg.base, height: geom1, width, color: colors.LINK_COLORS.CONDUIT },
                        geometry: { type: 'Polygon', coordinates: [stripPolygon(seg.a, seg.b, width, (seg.a[1] + seg.b[1]) / 2)] }
                    });
                }
            } else if (l.type === 'WEIR') {
                const h = toMeters(Number(p.crestHt) || 0, units) + toMeters(Number(p.geom1) || 0, units);
                const w = toMeters(Number(p.geom2) || Number(p.roadWidth) || 0, units) || toMeters(1, units);
                out.push(boxFeature(l, 'weir', baseB, h, w, a, b, colors.LINK_COLORS.WEIR));
            } else if (l.type === 'ORIFICE') {
                const h = toMeters(Number(p.geom1) || 0, units) || toMeters(0.5, units);
                const w = toMeters(Number(p.geom2) || Number(p.geom1) || 0, units) || h;
                out.push(boxFeature(l, 'orifice', Math.min(baseA, baseB), h, w, a, b, colors.LINK_COLORS.ORIFICE));
            } else if (l.type === 'PUMP') {
                out.push(boxFeature(l, 'pump', Math.min(baseA, baseB), toMeters(1, units), toMeters(0.6, units), a, b, colors.LINK_COLORS.PUMP));
            }
        }
        return out;
    }

    function subcatchmentFeatures(subcatchments, units, elevFn, colors) {
        const out = [];
        for (const s of subcatchments || []) {
            const ring = (s.ring || []).map(c => [Number(c[0]), Number(c[1])]);
            if (ring.length < 4) continue;
            const cx = ring.reduce((a, c) => a + c[0], 0) / ring.length;
            const cy = ring.reduce((a, c) => a + c[1], 0) / ring.length;
            let elev = null;
            try { elev = elevFn ? elevFn(cx, cy) : null; } catch (e) { elev = null; }
            if (!Number.isFinite(elev)) elev = 0;
            out.push({
                type: 'Feature', id: s.id,
                properties: { id: s.id, kind: 'subcatchment', base: Math.max(0, elev - 0.5), height: 1, width: 0, color: colors.LINK_COLORS.OUTLET },
                geometry: { type: 'Polygon', coordinates: [ring.concat([ring[0]])] }
            });
        }
        return out;
    }

    function buildGeoJSON(net, opts) {
        opts = opts || {};
        const colors = opts.colors || ((typeof window !== 'undefined' && window.SWMM_COLORS) || DEFAULT_COLORS);
        const units = (net.units || 'SI') === 'US' ? 'US' : 'SI';
        return {
            type: 'FeatureCollection',
            features: [].concat(
                nodeFeatures(net.nodes, units, colors),
                linkFeatures(net.links, net.nodes, units, { colors, maxSegs: opts.maxSegs }),
                subcatchmentFeatures(net.subcatchments, units, opts.elevFn, colors)
            )
        };
    }

    const ACTIVE = { on: false };

    const LAYER_SPECS = [
        { id: 'swmm-3d-subcatchments', filter: ['==', ['get', 'kind'], 'subcatchment'], opacity: 0.35 },
        { id: 'swmm-3d-conduits', filter: ['==', ['get', 'kind'], 'conduit'], opacity: 0.9 },
        { id: 'swmm-3d-links-other', filter: ['match', ['get', 'kind'], 'weir', true, 'orifice', true, 'pump', true, false], opacity: 0.9 },
        { id: 'swmm-3d-nodes', filter: ['==', ['get', 'kind'], 'node'], opacity: 0.9 },
        { id: 'swmm-3d-outfalls', filter: ['==', ['get', 'kind'], 'outfall'], opacity: 0.9 }
    ];

    function resultColorExpr() {
        return ['case',
            ['!=', ['feature-state', 'resultColor'], null], ['feature-state', 'resultColor'],
            ['get', 'color']];
    }

    function findBeforeId(map) {
        const layers = map.getStyle().layers || [];
        for (const l of layers) {
            if (l.id.startsWith('swmm-')) return l.id;
        }
        return undefined;
    }

    function ensureSourceAndLayers() {
        const map = window.map;
        if (!map) return;
        if (!map.getSource('swmm-3d')) {
            map.addSource('swmm-3d', { type: 'geojson', promoteId: 'id', data: { type: 'FeatureCollection', features: [] } });
        }
        const beforeId = findBeforeId(map);
        for (const spec of LAYER_SPECS) {
            if (map.getLayer(spec.id)) continue;
            map.addLayer({
                id: spec.id, type: 'fill-extrusion', source: 'swmm-3d',
                filter: spec.filter,
                paint: {
                    'fill-extrusion-color': resultColorExpr(),
                    'fill-extrusion-height': ['get', 'height'],
                    'fill-extrusion-base': ['get', 'base'],
                    'fill-extrusion-opacity': spec.opacity,
                    'fill-extrusion-vertical-gradient': false
                }
            }, beforeId);
        }
    }

    function makeElevFn(map) {
        return function (lng, lat) {
            try {
                if (map.getTerrain()) {
                    const e = map.queryTerrainElevation([lng, lat]);
                    if (Number.isFinite(e)) return e;
                }
            } catch (e) { /* no terrain */ }
            if (typeof window.sampleDEMElevation === 'function') {
                try {
                    const e = window.sampleDEMElevation([lng, lat]);
                    if (Number.isFinite(e)) return e;
                } catch (e2) { /* elevation unavailable */ }
            }
            return null;
        };
    }

    function refresh() {
        const map = window.map;
        if (!ACTIVE.on || !map || !map.getSource('swmm-3d')) return;
        const net = window.Net;
        if (!net) return;
        const data = buildGeoJSON({
            nodes: net.nodes, links: net.links, subcatchments: net.subcatchments, units: net.units
        }, { elevFn: makeElevFn(map) });
        map.getSource('swmm-3d').setData(data);
    }

    function apply() {
        ACTIVE.on = true;
        ensureSourceAndLayers();
        refresh();
        if (window.ResultStyling && window.ResultStyling.push3DAll) window.ResultStyling.push3DAll();
        const map = window.map;
        if (map && map.getPitch() < 30) map.easeTo({ pitch: 55, duration: 800 });
    }

    function clear() {
        ACTIVE.on = false;
        const map = window.map;
        if (!map) return;
        for (const spec of LAYER_SPECS) if (map.getLayer(spec.id)) map.removeLayer(spec.id);
        if (map.getSource('swmm-3d')) map.removeSource('swmm-3d');
        if ((typeof window.App === 'undefined' || !window.App.is3D) && map.getPitch() > 5) {
            map.easeTo({ pitch: 0, duration: 800 });
        }
    }

    const API = {
        buildGeoJSON,
        apply: apply,
        refresh: refresh,
        clear: clear,
        isActive: function () { return ACTIVE.on; }
    };

    if (typeof window !== 'undefined') {
        window.Network3D = API;
        window.map.on('style.load', function () {
            if (ACTIVE.on) { ensureSourceAndLayers(); refresh(); }
        });

        const toggleBtn = document.getElementById('btn-toggle-3d-network');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function () {
                if (ACTIVE.on) { clear(); toggleBtn.classList.remove('toggled'); }
                else { apply(); toggleBtn.classList.add('toggled'); }
            });
        }

        if (window.Net && window.Net.onChange) {
            window.Net.onChange(function (net, evt) {
                if (ACTIVE.on && !(evt && evt.type === 'move')) refresh();
            });
        }
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { toMeters, octagon, stripPolygon, linkPathSegments, nodeFeatures, linkFeatures, subcatchmentFeatures, buildGeoJSON };
    }
})();