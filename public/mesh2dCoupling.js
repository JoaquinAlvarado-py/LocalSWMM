// mesh2dCoupling.js — stable node-to-mesh coupling rows.
(function (window) {
    'use strict';

    function buildVertexNodeMap(indexed, nodes, opts) {
        opts = opts || {};
        var byId = {};
        (nodes || []).forEach(function (n) { byId[n.id] = n; });
        var rows = [];
        var seen = {};
        (indexed.vertexNodeMap || []).forEach(function (m) {
            var vi = m.vertexIndex !== undefined ? m.vertexIndex : m.vertex;
            var nodeId = m.nodeId || m.node;
            if (vi === undefined || !nodeId || seen[vi + ':' + nodeId]) return;
            seen[vi + ':' + nodeId] = true;
            rows.push({ vertexIndex: vi, nodeId: nodeId, cd: Number(m.cd) || Number(opts.defaultCd) || 0.65, area: Number(m.area) || 0 });
        });
        Object.keys(indexed.nodeVertexIndex || {}).forEach(function (nodeId) {
            var vi = indexed.nodeVertexIndex[nodeId];
            if (vi === undefined || seen[vi + ':' + nodeId]) return;
            seen[vi + ':' + nodeId] = true;
            rows.push({ vertexIndex: vi, nodeId: nodeId, cd: Number(opts.defaultCd) || 0.65, area: 0 });
        });
        (indexed.vertices || []).forEach(function (v, vi) {
            if (!v.nodeId || seen[vi + ':' + v.nodeId]) return;
            seen[vi + ':' + v.nodeId] = true;
            rows.push({ vertexIndex: vi, nodeId: v.nodeId, cd: Number(opts.defaultCd) || 0.65, area: 0 });
        });
        return rows.filter(function (r) { return byId[r.nodeId] || true; });
    }

    window.Mesh2DCoupling = { buildVertexNodeMap: buildVertexNodeMap };
})(window);
