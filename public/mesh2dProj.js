// mesh2dProj.js — Shared local-meter projection transform for 2D mesh generation.
//
// All mesh geometry (PSLG, Triangle I/O, .inp / .2dm output) is expressed in
// local meters relative to an origin centroid.  This module centralises the
// transform extracted from mesh2dInp.js:22-28 so every mesh module uses the
// same convention.
(function (window) {
    'use strict';

    var METERS_PER_DEGREE_LAT = 111320;

    /**
     * Build a transform pair centred on an origin {lng, lat}.
     * @returns {{ toLocal: function, toLngLat: function, origin: {lng,lat} }}
     */
    function makeTransform(origin) {
        origin = origin || { lng: 0, lat: 0 };
        var metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(origin.lat * Math.PI / 180);

        return {
            origin: origin,
            /** [lng, lat] → [x, y] in local meters. */
            toLocal: function (point) {
                return [
                    (point[0] - origin.lng) * metersPerDegreeLng,
                    (point[1] - origin.lat) * METERS_PER_DEGREE_LAT
                ];
            },
            /** [x, y] in local meters → [lng, lat]. */
            toLngLat: function (xy) {
                return [
                    xy[0] / metersPerDegreeLng + origin.lng,
                    xy[1] / METERS_PER_DEGREE_LAT + origin.lat
                ];
            }
        };
    }

    /**
     * Derive a sensible origin from the network model: the centroid of all
     * nodes and subcatchment vertices.  Falls back to the map centre.
     */
    function originFromModel(Net) {
        var lngSum = 0, latSum = 0, count = 0;
        (Net.nodes || []).forEach(function (n) {
            if (n.lngLat) { lngSum += n.lngLat[0]; latSum += n.lngLat[1]; count++; }
        });
        (Net.subcatchments || []).forEach(function (s) {
            (s.ring || []).forEach(function (p) {
                lngSum += p[0]; latSum += p[1]; count++;
            });
        });
        if (count > 0) {
            return { lng: lngSum / count, lat: latSum / count };
        }
        if (window.map && window.map.getCenter) {
            var c = window.map.getCenter();
            return { lng: c.lng, lat: c.lat };
        }
        return { lng: 0, lat: 0 };
    }

    window.Mesh2DProj = {
        makeTransform: makeTransform,
        originFromModel: originFromModel,
        METERS_PER_DEGREE_LAT: METERS_PER_DEGREE_LAT
    };
})(window);