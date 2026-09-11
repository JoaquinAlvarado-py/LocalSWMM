// layerTree.js — Uploaded Layers manager (GIS / CAD overlays).
//
// Lists the master plan overlay plus every imported constraint layer and
// gives each row: visibility switch, color picker, opacity (dim) slider,
// zoom-to and remove. Styles live on layer.style / App.masterPlanStyle and
// persist with the project through Net.serialize().
//
// app.js exposes the backing operations:
//   updateOverlayLayer(name, {visible, opacity, color})
//   removeOverlayLayer(name) / zoomToOverlayLayer(name)
//   updateMasterPlanStyle(patch) / removeMasterPlan() / zoomToMasterPlan()

(function () {
    'use strict';

    function featureCount(geojson) {
        return geojson && Array.isArray(geojson.features) ? geojson.features.length : 0;
    }

    function overlayRows() {
        const App = window.App || {};
        const rows = [];
        if (App.masterPlan) {
            rows.push({
                name: 'Master Plan',
                kind: 'masterplan',
                style: App.masterPlanStyle || {},
                count: featureCount(App.masterPlan),
            });
        }
        (App.importedLayers || []).forEach(l => {
            rows.push({
                name: l.name,
                kind: 'constraint',
                style: l.style || {},
                count: featureCount(l.geojson),
            });
        });
        return rows;
    }

    function esc(s) {
        return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    function buildRow(r) {
        const st = {
            visible: r.style.visible !== false,
            opacity: (r.style.opacity === undefined || r.style.opacity === null) ? 1 : Number(r.style.opacity),
            color: r.style.color || (r.kind === 'masterplan' ? '#757575' : '#6b7280'),
        };

        const row = document.createElement('div');
        row.className = 'ov-layer-row';
        row.innerHTML =
            '<button type="button" class="ms-switch' + (st.visible ? ' toggled' : '') + '" title="Show / hide layer"></button>' +
            '<input type="color" value="' + esc(st.color) + '" title="Layer color">' +
            '<div class="ov-layer-info">' +
                '<div class="ov-layer-name" title="' + esc(r.name) + '">' + esc(r.name) + '</div>' +
                '<div class="ov-layer-meta">' + r.count + ' feature' + (r.count === 1 ? '' : 's') + '</div>' +
            '</div>' +
            '<input type="range" min="0.05" max="1" step="0.05" value="' + st.opacity + '" title="Opacity (dim)">' +
            '<button type="button" class="ov-layer-btn zoom" title="Zoom to layer">⌖</button>' +
            '<button type="button" class="ov-layer-btn danger" title="Remove layer">✕</button>';

        const apply = (patch) => {
            if (r.kind === 'masterplan') {
                if (window.updateMasterPlanStyle) window.updateMasterPlanStyle(patch);
            } else if (window.updateOverlayLayer) {
                window.updateOverlayLayer(r.name, patch);
            }
        };

        row.querySelector('.ms-switch').addEventListener('click', (e) => {
            const on = !e.currentTarget.classList.contains('toggled');
            e.currentTarget.classList.toggle('toggled', on);
            apply({ visible: on });
        });
        row.querySelector('input[type="color"]').addEventListener('input', (e) => {
            apply({ color: e.target.value });
        });
        row.querySelector('input[type="range"]').addEventListener('input', (e) => {
            apply({ opacity: Number(e.target.value) });
        });
        row.querySelector('.zoom').addEventListener('click', () => {
            if (r.kind === 'masterplan') {
                if (window.zoomToMasterPlan) window.zoomToMasterPlan();
            } else if (window.zoomToOverlayLayer) {
                window.zoomToOverlayLayer(r.name);
            }
        });
        row.querySelector('.danger').addEventListener('click', () => {
            if (!confirm('Remove layer "' + r.name + '"?')) return;
            if (r.kind === 'masterplan') {
                if (window.removeMasterPlan) window.removeMasterPlan();
            } else if (window.removeOverlayLayer) {
                window.removeOverlayLayer(r.name);
            }
            refresh();
        });
        return row;
    }

    function refresh() {
        const list = document.getElementById('uploaded-layers-list');
        if (!list) return;
        const empty = document.getElementById('uploaded-layers-empty');
        const rows = overlayRows();
        if (empty) empty.classList.toggle('hidden', rows.length > 0);
        list.innerHTML = '';
        rows.forEach(r => list.appendChild(buildRow(r)));
    }

    function enableResultsDefaults() {}

    window.LayerTree = { refresh: refresh, rows: overlayRows, enableResultsDefaults: enableResultsDefaults };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', refresh);
    } else {
        refresh();
    }
})();
