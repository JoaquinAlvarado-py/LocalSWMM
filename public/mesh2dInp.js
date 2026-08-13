// mesh2dInp.js — Serialize the browser triangle mesh for OpenSWMM 2D

(function () {
    'use strict';

    const METERS_PER_DEGREE_LAT = 111320;

    function finite(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function bounded(value, fallback, min, max) {
        return Math.max(min, Math.min(max, finite(value, fallback)));
    }

    function getOrigin(cells) {
        const points = cells.flatMap(cell => (cell.ring || []).slice(0, 3));
        if (!points.length) return { lng: 0, lat: 0 };
        return {
            lng: points.reduce((sum, point) => sum + point[0], 0) / points.length,
            lat: points.reduce((sum, point) => sum + point[1], 0) / points.length
        };
    }

    function toLocalMeters(point, origin) {
        const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(origin.lat * Math.PI / 180);
        return [
            (point[0] - origin.lng) * metersPerDegreeLng,
            (point[1] - origin.lat) * METERS_PER_DEGREE_LAT
        ];
    }

    function buildMesh(cells, mapInstance) {
        const origin = getOrigin(cells);
        const vertices = [];
        const triangles = [];
        const vertexByKey = new Map();

        const vertexIndex = point => {
            const key = `${Number(point[0]).toFixed(9)},${Number(point[1]).toFixed(9)}`;
            if (vertexByKey.has(key)) return vertexByKey.get(key);

            const [x, y] = toLocalMeters(point, origin);
            let z = finite(point[2], NaN);
            if (!Number.isFinite(z) && mapInstance && typeof mapInstance.queryTerrainElevation === 'function') {
                z = finite(mapInstance.queryTerrainElevation(point), NaN);
            }
            if (!Number.isFinite(z)) z = 0;

            const index = vertices.length;
            vertexByKey.set(key, index);
            vertices.push({ x, y, z, lng: point[0], lat: point[1] });
            return index;
        };

        cells.forEach((cell, index) => {
            if (!cell.ring || cell.ring.length < 3) return;
            const indices = cell.ring.slice(0, 3).map(vertexIndex);
            if (new Set(indices).size !== 3) return;
            triangles.push({
                id: cell.id || `M2D_${index + 1}`,
                vertices: indices,
                manningN: Math.max(0.001, finite(cell.props && cell.props.manningN, finite(cell.manningN, 0.045))),
                tag: (cell.props && cell.props.parentSubcatch) || cell.parentSubcatch || ''
            });
        });

        return { origin, vertices, triangles };
    }

    function appendSection(inpText, title, lines) {
        const text = String(inpText || '').trimEnd();
        return `${text}\n\n[${title}]\n${lines.join('\n')}\n`;
    }

    function stripMesh2DSections(inp) {
        return inp
            .replace(/(^|\n)\[2D_OPTIONS\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
            .replace(/(^|\n)\[2D_VERTICES\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
            .replace(/(^|\n)\[2D_TRIANGLES\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
            .replace(/(^|\n)\[2D_CELLS\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
            .replace(/(^|\n)\[2D_VERTEX_NODE_MAP\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
            .replace(/(^|\n)\[2D_TRIANGLE_NODE_MAP\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1')
            .replace(/(^|\n)\[2D_MESH_FILE\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '$1');
    }

    function buildOptionsLines(opts) {
        opts = opts || {};
        const lines = [
            `MAX_TIMESTEP         ${finite(opts.maxTimestep, 10.0)}`,
            `DRY_DEPTH            ${finite(opts.dryDepth, 0.001)}`,
            `COUPLING_SYNC        ${Math.max(0, finite(opts.couplingSync !== undefined ? opts.couplingSync : opts.couplingInterval, 0.0))}`,
            `THETA                ${bounded(opts.theta, 0.8, 1e-9, 1)}`,
            `CFL_NUMBER           ${bounded(opts.cflNumber, 0.7, 1e-9, 1)}`,
            `H_MOVE               ${finite(opts.hMove, 0.003)}`,
            `FROUDE_MAX           ${finite(opts.froudeMax, 1.5)}`,
            `LTS_TIERS            ${Math.max(1, Math.min(8, Math.round(finite(opts.ltsTiers, 4))))}`
        ];
        lines.push(
            `LIMITER_EPSILON      ${finite(opts.limiterEpsilon, 1e-6)}`,
            `FLUX_DH_EPS          ${finite(opts.fluxDhEps, 0.004)}`,
            `CELL_CLOSURE         ${/^(VFR)$/i.test(String(opts.cellClosure || '')) ? 'VFR' : 'FLAT'}`,
            `FACE_RECONSTRUCTION  ${/^(VFR_FACE)$/i.test(String(opts.faceReconstruction || '')) ? 'VFR_FACE' : 'MEAN'}`,
            `VFR_MIN_WET_FRAC     ${bounded(opts.vfrMinWetFrac, 0.01, 1e-9, 0.5)}`,
            'INTEGRATOR           EXPLICIT'
        );
        lines.push(`COUPLING_CD          ${finite(opts.couplingCd, 0.65)}`);
        lines.push(`COUPLING_AREA        ${opts.couplingArea === 'DEFAULT' ? 'DEFAULT' : 'AUTO'}`);
        if (/^(NATURAL_NEIGHBOUR|SYSTEM|NONE)$/i.test(String(opts.rainfallMode || ''))) {
            lines.push(`RAINFALL_MODE        ${String(opts.rainfallMode).toUpperCase()}`);
        }
        if (/^(YES|NO)$/i.test(String(opts.report2d || ''))) {
            lines.push(`REPORT_2D            ${String(opts.report2d).toUpperCase()}`);
        }
        return lines;
    }

    function sanitizeTag(tag) {
        const t = String(tag || '').trim().replace(/\s+/g, '_');
        return t || '-';
    }

    function buildFromIndexed(baseInp, indexed) {
        const opts = indexed.options || {};
        let inp = String(baseInp || '');
        if (!/^\s*;;\s*UNITS:\s*SI\s*\(m\)/mi.test(inp)) {
            inp = ';; UNITS: SI (m)\n' + inp;
        }
        inp = stripMesh2DSections(inp);
        inp = inp.replace(/^;;\s*2D_ORIGIN.*(?:\r?\n|$)/gim, '');
        inp = appendSection(inp, '2D_OPTIONS', buildOptionsLines(opts));

        inp = appendSection(inp, '2D_VERTICES', [
            ';;X               Y               Z               TAG',
            ...indexed.vertices.map(v =>
                `${finite(v.x, 0).toFixed(4).padEnd(15)} ${finite(v.y, 0).toFixed(4).padEnd(15)} ${finite(v.z, 0).toFixed(4).padEnd(15)} ${sanitizeTag(v.tag)}`)
        ]);

        inp = appendSection(inp, '2D_TRIANGLES', [
            ';;V1      V2       V3       MANNINGS_N   TAG',
            ...indexed.triangles.map(t =>
                `${String(t.v[0]).padEnd(8)} ${String(t.v[1]).padEnd(8)} ${String(t.v[2]).padEnd(8)} ${Math.max(0.001, finite(t.n, 0.045)).toFixed(5).padEnd(12)} ${sanitizeTag(t.tag)}`)
        ]);

        if (Array.isArray(indexed.vertexNodeMap) && indexed.vertexNodeMap.length) {
            inp = appendSection(inp, '2D_VERTEX_NODE_MAP', [
                ';;VERTEX          NODE               CD',
                ...indexed.vertexNodeMap.map(m =>
                    `${String(m.vertexIndex !== undefined ? m.vertexIndex : m.vertex).padEnd(17)} ${String(m.nodeId || m.node).padEnd(18)} ${finite(m.cd, 0.65).toFixed(3)}`)
            ]);
        }

        // The parser turns the mesh's local X/Y meters back into lng/lat via
        // this comment; without it every vertex lands on Null Island (lat 0).
        inp = `;; 2D_ORIGIN ${finite(indexed.origin && indexed.origin.lng, 0)} ${finite(indexed.origin && indexed.origin.lat, 0)}\n${inp}`;

        return {
            inp,
            origin: indexed.origin,
            triangleIds: indexed.triangles.map((t, i) => 'M2D_' + (i + 1)),
            vertexCount: indexed.vertices.length,
            triangleCount: indexed.triangles.length
        };
    }

    function buildInput(baseInp, cells, mapInstance, options = {}) {
        if (options.units === 'US' || /FLOW_UNITS\s+(CFS|GPM|MGD|IMGD|AFD)/i.test(String(baseInp || ''))) {
            throw new Error('2D simulation currently only supports SI units (meters). Please switch project units to SI.');
        }

        // Prefer the indexed mesh (Triangle engine output) — carries stored
        // elevations, vertex tags, node coupling and dialog solver options.
        const indexed = window.Net && window.Net.mesh2DIndexed;
        if (indexed && Array.isArray(indexed.vertices) && indexed.vertices.length &&
            Array.isArray(indexed.triangles) && indexed.triangles.length) {
            // Overlay the CURRENT dialog solver settings so a mesh generated
            // with older defaults (e.g. LTS_TIERS 1) still runs with the
            // settings the user sees, without having to regenerate the mesh.
            const current = window.Mesh2DDialog && window.Mesh2DDialog.getSettings ? window.Mesh2DDialog.getSettings() : null;
            if (current) {
                const fresh = Object.assign({}, indexed.options || {});
                ['maxTimestep', 'dryDepth', 'couplingSync', 'theta', 'cflNumber', 'hMove', 'froudeMax', 'ltsTiers',
                 'couplingCd', 'couplingArea', 'rainfallMode', 'report2d', 'limiterEpsilon', 'fluxDhEps',
                 'cellClosure', 'faceReconstruction', 'vfrMinWetFrac', 'outputMode'].forEach(k => {
                    if (current[k] !== undefined) fresh[k] = current[k];
                });
                indexed.options = fresh;
            }
            if (indexed.options && indexed.options.outputMode === 'external' && window.Mesh2DExport && window.Mesh2DExport.buildExternal) {
                return window.Mesh2DExport.buildExternal(baseInp, indexed, indexed.options.meshFileName || 'mesh.2dm');
            }
            if (window.Mesh2DExport && window.Mesh2DExport.buildInline) {
                return window.Mesh2DExport.buildInline(baseInp, indexed);
            }
            return buildFromIndexed(baseInp, indexed);
        }

        if (!Array.isArray(cells) || cells.length === 0) {
            throw new Error('Generate a 2D mesh before starting a 2D simulation.');
        }

        const mesh = buildMesh(cells, mapInstance);
        if (!mesh.triangles.length) throw new Error('The 2D mesh contains no valid triangles.');

        let inp = String(baseInp || '');
        if (!/^\s*;;\s*UNITS:\s*SI\s*\(m\)/mi.test(inp)) {
            inp = ';; UNITS: SI (m)\n' + inp;
        }
        inp = stripMesh2DSections(inp);

        inp = appendSection(inp, '2D_OPTIONS', buildOptionsLines(options));

        inp = appendSection(inp, '2D_VERTICES', [
            ';;X               Y               Z               TAG',
            ...mesh.vertices.map(vertex =>
                `${vertex.x.toFixed(4).padEnd(15)} ${vertex.y.toFixed(4).padEnd(15)} ${vertex.z.toFixed(4).padEnd(15)} -`)
        ]);

        inp = appendSection(inp, '2D_TRIANGLES', [
            ';;V1      V2       V3       MANNINGS_N   TAG',
            ...mesh.triangles.map(triangle =>
                `${String(triangle.vertices[0]).padEnd(8)} ${String(triangle.vertices[1]).padEnd(8)} ${String(triangle.vertices[2]).padEnd(8)} ${triangle.manningN.toFixed(5).padEnd(12)} ${triangle.tag || '-'}`)
        ]);

        return {
            inp,
            origin: mesh.origin,
            triangleIds: mesh.triangles.map(triangle => triangle.id),
            vertexCount: mesh.vertices.length,
            triangleCount: mesh.triangles.length
        };
    }

    window.Mesh2DInp = { buildInput };
})();
