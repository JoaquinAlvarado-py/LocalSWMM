import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    toMeters, octagon, stripPolygon, linkPathSegments,
    nodeFeatures, linkFeatures, buildGeoJSON
} = require('../public/network3D.js');

const COLORS = {
    NODE_COLORS: { JUNCTION: '#1565c0', OUTFALL: '#2e7d32', STORAGE: '#6a1b9a', DIVIDER: '#ef6c00', RAINGAGE: '#00838f' },
    LINK_COLORS: { CONDUIT: '#455a64', PUMP: '#c62828', WEIR: '#ad1457', ORIFICE: '#4527a0', OUTLET: '#00695c' }
};

const net = {
    units: 'SI',
    nodes: [
        { id: 'J1', type: 'JUNCTION', lngLat: [-71.250, -29.900], props: { invertEl: 10, maxDepth: 2 } },
        { id: 'J2', type: 'JUNCTION', lngLat: [-71.249, -29.900], props: { invertEl: 9, maxDepth: 2 } },
        { id: 'O1', type: 'OUTFALL', lngLat: [-71.248, -29.900], props: { invertEl: 8 } }
    ],
    links: [
        { id: 'C1', type: 'CONDUIT', from: 'J1', to: 'J2', vertices: [], props: { xShape: 'CIRCULAR', geom1: 0.6, geom2: 0, inOffset: 0, outOffset: 0 } },
        { id: 'W1', type: 'WEIR', from: 'J2', to: 'O1', vertices: [], props: { crestHt: 0.3, geom1: 0.5, geom2: 1.2 } },
        { id: 'OR1', type: 'ORIFICE', from: 'J1', to: 'O1', vertices: [], props: { xShape: 'CIRCULAR', geom1: 0.4, geom2: 0 } },
        { id: 'P1', type: 'PUMP', from: 'J1', to: 'J2', vertices: [], props: {} }
    ],
    subcatchments: [
        { id: 'S1', ring: [[-71.251, -29.901], [-71.250, -29.901], [-71.250, -29.900], [-71.251, -29.900]] }
    ]
};

test('toMeters converts US feet and leaves SI alone', () => {
    assert.equal(toMeters(1, 'US'), 0.3048);
    assert.equal(toMeters(1, 'SI'), 1);
    assert.equal(toMeters(0, 'US'), 0);
});

test('octagon is a closed 8-gon of the right radius', () => {
    const ring = octagon(0, 0, 1);
    assert.equal(ring.length, 9);
    assert.deepEqual(ring[0], ring[8]);
    for (const [x, y] of ring.slice(0, 8)) {
        const distMeters = Math.hypot(x * 111320, y * 111320);
        assert.ok(Math.abs(distMeters - 1) < 1e-4);
    }
});

test('stripPolygon makes a closed quad of the requested meter width', () => {
    const ring = stripPolygon([0, 0], [0, 0.01], 2, 0);
    assert.equal(ring.length, 5);
    assert.deepEqual(ring[0], ring[4]);
    const lons = ring.map(p => p[0]);
    const maxLon = Math.max(...lons), minLon = Math.min(...lons);
    assert.ok(Math.abs((maxLon - minLon) * 111320) - 2 < 1e-3);
});

test('linkPathSegments grades base between endpoints and respects maxSegs', () => {
    const segs = linkPathSegments([[-71.250, -29.900], [-71.249, -29.900]], 10, 9, 64);
    assert.ok(segs.length >= 2 && segs.length <= 64);
    for (const s of segs) assert.ok(s.base >= 9 && s.base <= 10);
    assert.ok(segs[0].base > 9.5);                 // starts near upstream invert
    assert.ok(segs[segs.length - 1].base < 9.5);   // ends near downstream invert
    assert.ok(segs[0].base > segs[segs.length - 1].base); // strictly downhill
});

test('nodeFeatures produces node and outfall columns', () => {
    const feats = nodeFeatures(net.nodes, 'SI', COLORS);
    assert.equal(feats.length, 3);
    const j = feats.find(f => f.id === 'J1');
    assert.equal(j.properties.kind, 'node');
    assert.equal(j.properties.base, 0);
    assert.equal(j.properties.height, 2);
    assert.equal(j.properties.color, COLORS.NODE_COLORS.JUNCTION);
    assert.equal(j.geometry.coordinates[0].length, 9);
    const o = feats.find(f => f.id === 'O1');
    assert.equal(o.properties.kind, 'outfall');
    assert.equal(o.properties.height, 0.5);
});

test('nodeFeatures skips rain gages', () => {
    const feats = nodeFeatures([{ id: 'RG1', type: 'RAINGAGE', lngLat: [0, 0], props: {} }], 'SI', COLORS);
    assert.equal(feats.length, 0);
});

test('linkFeatures renders conduit strips, weirs, orifices, pumps', () => {
    const feats = linkFeatures(net.links, net.nodes, 'SI', { colors: COLORS, maxSegs: 64 });
    assert.ok(feats.filter(f => f.properties.kind === 'conduit').length >= 1);
    const w = feats.find(f => f.id === 'W1');
    assert.equal(w.properties.kind, 'weir');
    assert.equal(w.properties.base, 0);
    assert.equal(w.properties.height, 0.8);
    assert.equal(w.properties.width, 1.2);
    const or = feats.find(f => f.id === 'OR1');
    assert.equal(or.properties.kind, 'orifice');
    assert.equal(or.properties.base, 0);
    assert.equal(or.properties.height, 0.4);
    const p = feats.find(f => f.id === 'P1');
    assert.equal(p.properties.kind, 'pump');
    assert.equal(p.properties.base, 0);
    assert.equal(p.properties.height, 1);
});

test('linkFeatures skips dangling and zero-geometry conduits', () => {
    const dangling = linkFeatures([{ id: 'X1', type: 'CONDUIT', from: 'ZZZ', to: 'J1', vertices: [], props: { geom1: 1 } }], net.nodes, 'SI', { colors: COLORS });
    assert.equal(dangling.length, 0);
    const zero = linkFeatures([{ id: 'X2', type: 'CONDUIT', from: 'J1', to: 'J2', vertices: [], props: { xShape: 'CIRCULAR', geom1: 0 } }], net.nodes, 'SI', { colors: COLORS });
    assert.equal(zero.length, 0);
});

test('buildGeoJSON composes all element kinds', () => {
    const gj = buildGeoJSON(net, { colors: COLORS });
    assert.equal(gj.type, 'FeatureCollection');
    const kinds = gj.features.map(f => f.properties.kind);
    assert.ok(kinds.includes('node'));
    assert.ok(kinds.includes('outfall'));
    assert.ok(kinds.includes('conduit'));
    assert.ok(kinds.includes('weir'));
    assert.ok(kinds.includes('orifice'));
    assert.ok(kinds.includes('pump'));
    assert.ok(!kinds.includes('subcatchment'));
    for (const f of gj.features) {
        assert.ok(Number.isFinite(f.properties.base));
        assert.ok(Number.isFinite(f.properties.height));
        assert.ok(typeof f.properties.color === 'string');
        assert.equal(f.properties.id, f.id);
    }
});

test('US units convert heights and bases to meters', () => {
    const gj = buildGeoJSON({ units: 'US', nodes: net.nodes, links: net.links, subcatchments: net.subcatchments }, { colors: COLORS });
    const j = gj.features.find(f => f.id === 'J1');
    assert.equal(j.properties.base, 0);
    assert.ok(Math.abs(j.properties.height - 2 * 0.3048) < 1e-9);
});