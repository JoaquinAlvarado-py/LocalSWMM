// mesh2dInp.js — Serialize the browser triangle mesh for OpenSWMM 2D

(function () {
    'use strict';

    const METERS_PER_DEGREE_LAT = 111320;

    function finite(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
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

    function buildInput(baseInp, cells, mapInstance, options = {}) {
        if (!Array.isArray(cells) || cells.length === 0) {
            throw new Error('Generate a 2D mesh before starting a 2D simulation.');
        }
        if (options.units === 'US' || /FLOW_UNITS\s+(CFS|GPM|MGD|IMGD|AFD)/i.test(String(baseInp || ''))) {
            throw new Error('2D simulation currently only supports SI units (meters). Please switch project units to SI.');
        }

        const mesh = buildMesh(cells, mapInstance);
        if (!mesh.triangles.length) throw new Error('The 2D mesh contains no valid triangles.');

        let inp = String(baseInp || '')
            .replace(/^(?!;; UNITS: SI \(m\)$)/m, ';; UNITS: SI (m)\n')
            .replace(/\n\[2D_OPTIONS\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '')
            .replace(/\n\[2D_VERTICES\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '')
            .replace(/\n\[2D_TRIANGLES\][\s\S]*?(?=\n\[[^\]]+\]|$)/gi, '');

        inp = appendSection(inp, '2D_OPTIONS', [
            `MAX_TIMESTEP         ${finite(options.maxTimestep, 2.0)}`,
            `DRY_DEPTH            ${finite(options.dryDepth, 0.001)}`,
            `COUPLING_SYNC        ${finite(options.couplingInterval, 1.0)}`,
            `THETA                0.5`,
            `CFL_NUMBER           0.8`,
            `H_MOVE               0.001`,
            `FROUDE_MAX           1.0`,
            `LTS_TIERS            0`
        ]);

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
