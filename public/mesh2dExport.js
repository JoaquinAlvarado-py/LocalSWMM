// mesh2dExport.js — engine-format inline and external 2D mesh serialization.
(function (window) {
    'use strict';
    function n(v, fallback) { var x = Number(v); return isFinite(x) ? x : fallback; }
    function bounded(v, fallback, min, max) { return Math.max(min, Math.min(max, n(v, fallback))); }
    function tag(v) { var s = String(v || '').trim().replace(/\s+/g, '_'); return s || '-'; }
    function meshFileName(name) {
        var value = String(name || 'mesh.2dm').replace(/\\/g, '/').split('/').pop().replace(/[^A-Za-z0-9._-]/g, '_');
        return value || 'mesh.2dm';
    }
    function section(text, name, lines) { return String(text || '').trimEnd() + '\n\n[' + name + ']\n' + lines.join('\n') + '\n'; }
    function strip(text) {
        return String(text || '')
            .replace(/(^|\n)\[2D_OPTIONS\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
            .replace(/(^|\n)\[2D_VERTICES\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
            .replace(/(^|\n)\[2D_TRIANGLES\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
            .replace(/(^|\n)\[2D_CELLS\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
            .replace(/(^|\n)\[2D_VERTEX_NODE_MAP\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
            .replace(/(^|\n)\[2D_TRIANGLE_NODE_MAP\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
            .replace(/(^|\n)\[2D_MESH_FILE\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1');
    }
    function optionLines(o) {
        o = o || {};
        var out = [
            'MAX_TIMESTEP ' + n(o.maxTimestep, 2), 'DRY_DEPTH ' + n(o.dryDepth, 0.001),
            'COUPLING_CD ' + n(o.couplingCd, 0.65), 'COUPLING_SYNC ' + Math.max(0, n(o.couplingSync, 1)),
            'THETA ' + bounded(o.theta, 0.5, 1e-9, 1), 'CFL_NUMBER ' + bounded(o.cflNumber, 0.8, 1e-9, 1),
            'H_MOVE ' + n(o.hMove, 0.001), 'LTS_TIERS ' + Math.max(1, Math.min(8, Math.round(n(o.ltsTiers, 1)))),
            'FROUDE_MAX ' + n(o.froudeMax, 1), 'LIMITER_EPSILON ' + n(o.limiterEpsilon, 1e-6),
            'FLUX_DH_EPS ' + n(o.fluxDhEps, 1e-6),
            'CELL_CLOSURE ' + (/^(VFR)$/i.test(String(o.cellClosure || '')) ? 'VFR' : 'FLAT'),
            'FACE_RECONSTRUCTION ' + (/^(VFR_FACE)$/i.test(String(o.faceReconstruction || '')) ? 'VFR_FACE' : 'MEAN'),
            'VFR_MIN_WET_FRAC ' + bounded(o.vfrMinWetFrac, 0.1, 1e-9, 0.5), 'INTEGRATOR EXPLICIT'
        ];
        out.push('COUPLING_AREA ' + (o.couplingArea === 'DEFAULT' ? 'DEFAULT' : 'AUTO'));
        if (/^(NATURAL_NEIGHBOUR|SYSTEM|NONE)$/i.test(String(o.rainfallMode || ''))) out.push('RAINFALL_MODE ' + String(o.rainfallMode).toUpperCase());
        if (/^(YES|NO)$/i.test(String(o.report2d || ''))) out.push('REPORT_2D ' + String(o.report2d).toUpperCase());
        return out;
    }
    function build2dmText(indexed) {
        indexed = indexed || {};
        var lines = [';; UNITS: SI (m)', ';; 2D_ORIGIN ' + n(indexed.origin && indexed.origin.lng, 0) + ' ' + n(indexed.origin && indexed.origin.lat, 0), '', '[2D_OPTIONS]'];
        lines = lines.concat(optionLines(indexed.options));
        lines.push('', '[2D_VERTICES]', ';; X Y Z TAG');
        (indexed.vertices || []).forEach(function (v) { lines.push(n(v.x, 0).toFixed(6) + ' ' + n(v.y, 0).toFixed(6) + ' ' + n(v.z, 0).toFixed(6) + ' ' + tag(v.tag)); });
        lines.push('', '[2D_TRIANGLES]', ';; V1 V2 V3 MANNINGS_N TAG');
        (indexed.triangles || []).forEach(function (t) { lines.push(t.v.join(' ') + ' ' + n(t.n, 0.045).toFixed(6) + ' ' + tag(t.tag)); });
        if ((indexed.vertexNodeMap || []).length) {
            lines.push('', '[2D_VERTEX_NODE_MAP]', ';; IDX NODE CD AREA');
            indexed.vertexNodeMap.forEach(function (m) { var line = (m.vertexIndex !== undefined ? m.vertexIndex : m.vertex) + ' ' + (m.nodeId || m.node) + ' ' + n(m.cd, 0.65).toFixed(6); if (indexed.options && indexed.options.couplingArea && indexed.options.couplingArea !== 'AUTO') line += ' ' + n(m.area, 0); lines.push(line); });
        }
        return lines.join('\n') + '\n';
    }
    function buildInline(baseInp, indexed) {
        indexed = indexed || (window.Net && window.Net.mesh2DIndexed);
        if (!indexed) throw new Error('No indexed 2D mesh is available.');
        var input = String(baseInp || '');
        if (!/^\s*;;\s*UNITS:\s*SI\s*\(m\)/mi.test(input)) input = ';; UNITS: SI (m)\n' + input;
        input = strip(input);
        input = input.replace(/^;;\s*2D_ORIGIN.*(?:\r?\n|$)/gim, '');
        input = section(input, '2D_OPTIONS', optionLines(indexed.options));
        input = section(input, '2D_VERTICES', [';; X Y Z TAG'].concat((indexed.vertices || []).map(function (v) { return n(v.x, 0).toFixed(6) + ' ' + n(v.y, 0).toFixed(6) + ' ' + n(v.z, 0).toFixed(6) + ' ' + tag(v.tag); })));
        input = section(input, '2D_TRIANGLES', [';; V1 V2 V3 MANNINGS_N TAG'].concat((indexed.triangles || []).map(function (t) { return t.v.join(' ') + ' ' + n(t.n, 0.045).toFixed(6) + ' ' + tag(t.tag); })));
        input = ';; 2D_ORIGIN ' + n(indexed.origin && indexed.origin.lng, 0) + ' ' + n(indexed.origin && indexed.origin.lat, 0) + '\n' + input;
        if ((indexed.vertexNodeMap || []).length) input = section(input, '2D_VERTEX_NODE_MAP', ([';; IDX NODE CD AREA']).concat(indexed.vertexNodeMap.map(function (m) { var line = (m.vertexIndex !== undefined ? m.vertexIndex : m.vertex) + ' ' + (m.nodeId || m.node) + ' ' + n(m.cd, 0.65).toFixed(6); if ((indexed.options || {}).couplingArea && (indexed.options || {}).couplingArea !== 'AUTO') line += ' ' + n(m.area, 0); return line; })));
        return { inp: input, origin: indexed.origin, vertexCount: (indexed.vertices || []).length, triangleCount: (indexed.triangles || []).length, triangleIds: (indexed.triangles || []).map(function (_, i) { return 'M2D_' + (i + 1); }) };
    }
    function buildExternal(baseInp, indexed, name) {
        name = meshFileName(name);
        var inline = buildInline(baseInp, indexed);
        var inp = strip(inline.inp);
        inp = section(inp, '2D_OPTIONS', optionLines(indexed.options));
        inp = section(inp, '2D_MESH_FILE', ['FILE ' + name]);
        return { inp: inp, meshFile: { name: name, content: build2dmText(indexed) }, triangleIds: inline.triangleIds, triangleCount: inline.triangleCount, vertexCount: inline.vertexCount };
    }
    function download2dm(indexed, name) {
        var blob = new Blob([build2dmText(indexed)], { type: 'text/plain;charset=utf-8' });
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = meshFileName(name); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 0);
    }
    window.Mesh2DExport = { build2dmText: build2dmText, buildInline: buildInline, buildExternal: buildExternal, download2dm: download2dm, stripMesh2DSections: strip, buildOptionsLines: optionLines, meshFileName: meshFileName };
})(window);
