// layerTree.js — desktop-style visibility and opacity controls for mesh layers.
(function (window) {
    'use strict';
    var KEY = 'swmm-2d-layer-tree';
    var rows = [
        ['velocity-arrows', 'Velocity arrows', 'm2d-velocity-arrows'], ['vertices', 'Mesh vertices', 'm2d-output-vertices'], ['depth-isolines', 'Depth isolines', 'm2d-depth-isolines'], ['edges', 'Mesh edges', 'swmm-2d-mesh-line'], ['depth-bands', 'Depth contour bands', 'm2d-depth-bands'], ['smooth-depth', 'Smooth (Gouraud) depth fill', 'm2d-smooth-depth-fill'], ['cell-fill', 'Cell depth fill', 'swmm-2d-mesh-fill'], ['terrain', 'Mesh terrain', 'm2d-mesh-terrain'], ['mesh-elev-vertices', 'Static mesh vertices', 'm2d-static-vertices'], ['mesh-elev-isolines', 'Elevation isolines', 'm2d-elevation-isolines'], ['mesh-elev-bands', 'Elevation contour bands', 'm2d-elevation-bands']
    ];
    function state() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
    function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
    function refresh() {
        var card = document.getElementById('layer-tree-card'), body = document.getElementById('layer-tree-body'), m = window.map; if (!card || !body) return;
        if (window.Mesh2DLayers) window.Mesh2DLayers.ensure(m);
        card.classList.remove('hidden'); var s = state(); body.innerHTML = '';
        var group = '';
        rows.forEach(function (r) {
            var nextGroup = r[0].indexOf('mesh-elev-') === 0 ? 'Meshes' : 'SWMM 2D Outputs';
            if (nextGroup !== group) {
                group = nextGroup;
                var heading = document.createElement('div'); heading.className = 'layer-tree-group'; heading.textContent = group; body.appendChild(heading);
            }
            var v = s[r[0]] || { visible: r[0] === 'cell-fill' || r[0] === 'edges', opacity: 100 }; var line = document.createElement('div'); line.className = 'layer-tree-row'; line.innerHTML = '<label><input type="checkbox" ' + (v.visible ? 'checked' : '') + '> ' + r[1] + '</label><input type="range" min="0" max="100" value="' + v.opacity + '" aria-label="' + r[1] + ' opacity">'; var cb = line.querySelector('input[type=checkbox]'), range = line.querySelector('input[type=range]'); function apply() { s[r[0]] = { visible: cb.checked, opacity: Number(range.value) }; save(s); if (m && m.getLayer(r[2])) { var hiddenIn3D = window.App && window.App.is3D && (r[0] === 'terrain' || r[0] === 'smooth-depth'); try { m.setLayoutProperty(r[2], 'visibility', cb.checked && !hiddenIn3D ? 'visible' : 'none'); } catch (e) {} if (window.Mesh2DGL && (r[2] === 'm2d-smooth-depth-fill' || r[2] === 'm2d-mesh-terrain')) window.Mesh2DGL.setOpacity(r[2], Number(range.value) / 100); var prop = r[2].indexOf('fill') >= 0 || r[2].indexOf('bands') >= 0 ? 'fill-opacity' : r[2].indexOf('line') >= 0 || r[2].indexOf('isolines') >= 0 ? 'line-opacity' : r[2].indexOf('arrows') >= 0 ? 'icon-opacity' : 'circle-opacity'; try { m.setPaintProperty(r[2], prop, Number(range.value) / 100); } catch (e) {} } } cb.addEventListener('change', apply); range.addEventListener('input', apply); body.appendChild(line); apply();
        });
    }
    window.LayerTree = { refresh: refresh, rows: rows };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh); else setTimeout(refresh, 0);
})(window);
