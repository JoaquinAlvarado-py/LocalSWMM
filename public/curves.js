/**
 * curves.js — Curve Editor for SWMM 6
 * Supports: Storage, Pump, Rating, Weir, Orifice, Shape, Diversion curves.
 */
(function () {
    'use strict';

    const CURVE_TYPES = ['STORAGE','PUMP','RATING','WEIR','ORIFICE','SHAPE','DIVERSION'];
    const CURVE_TYPE_LABELS = {
        STORAGE:   'Storage (depth vs area)',
        PUMP:      'Pump (depth vs flow)',
        RATING:    'Rating (head vs flow)',
        WEIR:      'Weir (head vs flow)',
        ORIFICE:   'Orifice (head vs flow)',
        SHAPE:     'Shape (depth vs width)',
        DIVERSION: 'Diversion (inflow vs diverted flow)'
    };

    let curves = [];
    let nextId = 1;

    function getNextId() {
        while (curves.some(c => c.id === 'CURVE' + nextId)) nextId++;
        return 'CURVE' + nextId;
    }

    function addCurve(type, description) {
        const curve = { id: getNextId(), type: type || 'STORAGE', description: description || '', data: [{x:0,y:0}] };
        curves.push(curve);
        if (window.Net) { window.Net.curves = curves; window.Net._modified = true; }
        return curve;
    }

    function removeCurve(id) {
        curves = curves.filter(c => c.id !== id);
        if (window.Net) { window.Net.curves = curves; window.Net._modified = true; }
    }

    function updateCurve(id, updates) {
        const c = curves.find(c => c.id === id);
        if (!c) return;
        Object.assign(c, updates);
        if (window.Net) { window.Net.curves = curves; window.Net._modified = true; }
    }

    function getCurve(id) { return curves.find(c => c.id === id); }
    function getAllCurves() { return curves; }
    function loadCurves(data) { curves = data || []; if (window.Net) window.Net.curves = curves; }

    let modalEl = null, curveListEl = null, curveEditorEl = null;

    function initUI() {
        if (document.getElementById('curve-editor-modal')) return;
        modalEl = document.createElement('div');
        modalEl.id = 'curve-editor-modal';
        modalEl.className = 'ts-modal hidden';
        modalEl.innerHTML = [
            '<div class="ts-modal-header">',
            '  <span>Curve Editor</span>',
            '  <button id="btn-curve-close" class="ts-close-btn">&times;</button>',
            '</div>',
            '<div class="ts-modal-body" style="display:flex;gap:12px;min-height:320px;">',
            '  <div style="flex:0 0 200px;border-right:1px solid var(--border);padding-right:10px;">',
            '    <div style="font-size:11px;font-weight:600;color:var(--text-mid);margin-bottom:6px;">Curves</div>',
            '    <select id="curve-list" multiple style="width:100%;min-height:200px;font-size:12px;border:1px solid var(--border);border-radius:4px;"></select>',
            '    <div style="margin-top:6px;display:flex;gap:4px;">',
            '      <button id="btn-curve-add" class="tb-btn" style="flex:1;">+ Add</button>',
            '      <button id="btn-curve-del" class="tb-btn tb-btn-danger" style="flex:1;">− Delete</button>',
            '    </div>',
            '  </div>',
            '  <div style="flex:1;">',
            '    <div id="curve-editor-panel">',
            '      <p style="color:var(--text-faint);font-size:12px;">Select or add a curve to edit.</p>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join('\n');
        document.body.appendChild(modalEl);
        curveListEl = document.getElementById('curve-list');
        curveEditorEl = document.getElementById('curve-editor-panel');
        document.getElementById('btn-curve-close').onclick = function () { modalEl.classList.add('hidden'); };
        document.getElementById('btn-curve-add').onclick = function () {
            const curve = addCurve('STORAGE', '');
            renderCurveList();
            selectCurve(curve.id);
        };
        document.getElementById('btn-curve-del').onclick = function () {
            const sel = curveListEl.value;
            if (sel) removeCurve(sel);
            renderCurveList();
            curveEditorEl.innerHTML = '<p style="color:var(--text-faint);font-size:12px;">Select or add a curve to edit.</p>';
        };
        curveListEl.onchange = function () { if (curveListEl.value) renderCurveEditor(curveListEl.value); };
    }

    function renderCurveList() {
        curveListEl.innerHTML = curves.map(function(c) {
            return '<option value="' + c.id + '">' + c.id + ' (' + c.type + ')</option>';
        }).join('');
    }

    function selectCurve(id) {
        for (var i = 0; i < curveListEl.options.length; i++) {
            if (curveListEl.options[i].value === id) { curveListEl.options[i].selected = true; break; }
        }
        renderCurveEditor(id);
    }

    function esc(s) {
        if (typeof s !== 'string') return String(s || '');
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function renderCurveEditor(id) {
        var curve = getCurve(id);
        if (!curve) { curveEditorEl.innerHTML = '<p style="color:var(--text-faint);font-size:12px;">Curve not found.</p>'; return; }
        var typeOpts = CURVE_TYPES.map(function(t) {
            return '<option value="' + t + '" ' + (curve.type === t ? 'selected' : '') + '>' + esc(CURVE_TYPE_LABELS[t]) + '</option>';
        }).join('');
        var html = '<div class="prop-section-title">Curve: ' + esc(curve.id) + '</div>';
        html += '<div class="prop-row"><label>Type</label><select id="curve-editor-type">' + typeOpts + '</select></div>';
        html += '<div class="prop-row"><label>Description</label><input type="text" id="curve-editor-desc" value="' + esc(curve.description) + '"></div>';
        html += '<div style="margin-top:10px;font-size:11px;font-weight:600;color:var(--text-mid);">Data Points</div>';
        html += '<div class="ts-table-container" style="max-height:200px;margin-top:4px;"><table class="ts-data-table" id="curve-data-table">';
        html += '<thead><tr><th style="width:40px;">#</th><th>X</th><th>Y</th><th style="width:40px;"></th></tr></thead><tbody id="curve-data-body">';
        curve.data.forEach(function(pt, i) {
            html += '<tr><td style="text-align:center;color:var(--text-faint);">' + (i+1) + '</td>';
            html += '<td><input type="number" class="curve-x" step="any" value="' + pt.x + '" data-idx="' + i + '"></td>';
            html += '<td><input type="number" class="curve-y" step="any" value="' + pt.y + '" data-idx="' + i + '"></td>';
            html += '<td><button class="ts-btn-icon-del curve-del-row" data-idx="' + i + '">✕</button></td></tr>';
        });
        html += '</tbody></table></div>';
        html += '<div style="margin-top:6px;"><button id="curve-add-row" class="tb-btn">+ Add Row</button></div>';
        curveEditorEl.innerHTML = html;
        document.getElementById('curve-editor-type').onchange = function(e) { updateCurve(curve.id, {type:e.target.value}); renderCurveList(); };
        document.getElementById('curve-editor-desc').onchange = function(e) { updateCurve(curve.id, {description:e.target.value}); };
        var dataTable = document.getElementById('curve-data-body');
        dataTable.addEventListener('change', function(e) {
            var input = e.target, idx = parseInt(input.dataset.idx);
            if (isNaN(idx)) return;
            var newData = curve.data.map(function(pt) { return {x:pt.x, y:pt.y}; });
            if (input.classList.contains('curve-x')) newData[idx].x = parseFloat(input.value) || 0;
            else if (input.classList.contains('curve-y')) newData[idx].y = parseFloat(input.value) || 0;
            newData.sort(function(a,b) { return a.x - b.x; });
            updateCurve(curve.id, {data: newData});
            renderCurveEditor(curve.id);
            renderCurveList();
        });
        dataTable.addEventListener('click', function(e) {
            if (e.target.classList.contains('curve-del-row')) {
                var idx = parseInt(e.target.dataset.idx);
                var newData = curve.data.filter(function(_,i) { return i !== idx; });
                updateCurve(curve.id, {data: newData.length ? newData : [{x:0,y:0}]});
                renderCurveEditor(curve.id);
                renderCurveList();
            }
        });
        document.getElementById('curve-add-row').onclick = function() {
            var lastX = curve.data.length > 0 ? curve.data[curve.data.length-1].x : 0;
            var newData = curve.data.concat([{x: lastX+1, y: 0}]);
            updateCurve(curve.id, {data: newData});
            renderCurveEditor(curve.id);
            renderCurveList();
        };
    }

    function openEditor() { if (!modalEl) initUI(); renderCurveList(); modalEl.classList.remove('hidden'); }

    window.CurveEditor = {
        openEditor: openEditor, addCurve: addCurve, removeCurve: removeCurve,
        updateCurve: updateCurve, getCurve: getCurve, getAllCurves: getAllCurves,
        loadCurves: loadCurves, CURVE_TYPES: CURVE_TYPES, CURVE_TYPE_LABELS: CURVE_TYPE_LABELS
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }
})();
