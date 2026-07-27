// plot.js — Time Series Plot Selection & Multi-Variable Chart Window
// Replicates SWMM 5.2's Time Series Plot Selection & Charting Engine.

(function () {
    'use strict';

    // State
    let activeSeries = []; // [{ id: string, type: string, variable: string, label: string, color: string, unit: string }]
    let timeRange = { startIndex: 0, endIndex: 0, mode: 'elapsed' }; // mode: 'elapsed' | 'datetime'
    let editingSeriesIndex = -1;

    let selectionModal = null;
    let editorModal = null;
    let chartModal = null;
    let canvasEl = null;
    let ctx = null;

    let currentHoverIndex = -1;

    const COLORS = [
        '#0284c7', '#e11d48', '#16a34a', '#d97706',
        '#9333ea', '#0891b2', '#f43f5e', '#65a30d',
        '#c026d3', '#2563eb'
    ];

    const VAR_DEFINITIONS = {
        'NODE': [
            { key: 'depth', label: 'Depth', unitSI: 'm', unitUS: 'ft', varIdx: 0 },
            { key: 'head', label: 'Hydraulic Head', unitSI: 'm', unitUS: 'ft', varIdx: 1 },
            { key: 'inflow', label: 'Total Inflow', unitSI: 'LPS', unitUS: 'CFS', varIdx: 4 },
            { key: 'flooding', label: 'Flooding Loss', unitSI: 'LPS', unitUS: 'CFS', varIdx: 5 },
            { key: 'volume', label: 'Stored Volume', unitSI: 'm³', unitUS: 'ft³', varIdx: 2 }
        ],
        'LINK': [
            { key: 'flow', label: 'Flow Rate', unitSI: 'LPS', unitUS: 'CFS', varIdx: 0 },
            { key: 'velocity', label: 'Flow Velocity', unitSI: 'm/s', unitUS: 'ft/s', varIdx: 2 },
            { key: 'depth', label: 'Flow Depth', unitSI: 'm', unitUS: 'ft', varIdx: 1 },
            { key: 'capacity', label: 'Capacity Ratio', unitSI: 'fraction', unitUS: 'fraction', varIdx: 4 }
        ],
        'SUBCATCHMENT': [
            { key: 'rainfall', label: 'Precipitation', unitSI: 'mm/hr', unitUS: 'in/hr', varIdx: 0 },
            { key: 'runoff', label: 'Runoff Rate', unitSI: 'LPS', unitUS: 'CFS', varIdx: 4 },
            { key: 'losses', label: 'Infiltration', unitSI: 'mm/hr', unitUS: 'in/hr', varIdx: 2 }
        ],
        'SYSTEM': [
            { key: 'precip', label: 'System Rainfall', unitSI: 'mm/hr', unitUS: 'in/hr', varIdx: 0 },
            { key: 'runoff', label: 'System Runoff', unitSI: 'LPS', unitUS: 'CFS', varIdx: 1 },
            { key: 'flooding', label: 'System Flooding', unitSI: 'LPS', unitUS: 'CFS', varIdx: 4 },
            { key: 'outflow', label: 'System Outflow', unitSI: 'LPS', unitUS: 'CFS', varIdx: 5 }
        ]
    };

    function getTimeSeriesData() {
        const rs = window.ResultStyling;
        if (!rs) return null;

        // Preferred: outData binary parser
        if (rs.outData && rs.outData.parsed && rs.outData.numPeriods > 0) {
            const od = rs.outData;
            return {
                numPeriods: od.numPeriods,
                times: rs.timeSeries ? rs.timeSeries.times : Array.from({ length: od.numPeriods }, (_, i) => `Step ${i}`),
                getSeries: (type, id, varKey) => {
                    const varDef = (VAR_DEFINITIONS[type] || []).find(v => v.key === varKey);
                    if (!varDef) return null;
                    let list = [];
                    if (type === 'NODE') list = od.names.nodes;
                    else if (type === 'LINK') list = od.names.links;
                    else if (type === 'SUBCATCHMENT') list = od.names.subcatchments;
                    
                    const idx = list.indexOf(id);
                    if (idx < 0) return null;
                    return od.getTimeSeries(type, idx, varDef.varIdx);
                }
            };
        }

        // Fallback: report parser timeSeries
        if (rs.timeSeries && rs.timeSeries.times && rs.timeSeries.times.length > 0) {
            const ts = rs.timeSeries;
            return {
                numPeriods: ts.times.length,
                times: ts.times,
                getSeries: (type, id, varKey) => {
                    if (type === 'NODE' && ts.nodes[id] && ts.nodes[id][varKey]) return ts.nodes[id][varKey];
                    if (type === 'LINK' && ts.links[id] && ts.links[id][varKey]) return ts.links[id][varKey];
                    return null;
                }
            };
        }

        return null;
    }

    // Modal Initializer
    function initUI() {
        selectionModal = document.getElementById('ts-selection-modal');
        editorModal    = document.getElementById('ts-editor-modal');
        chartModal     = document.getElementById('ts-chart-modal');
        canvasEl       = document.getElementById('ts-chart-canvas');
        if (canvasEl) ctx = canvasEl.getContext('2d');

        if (!selectionModal || !chartModal) return;

        // Button Listeners
        const btnCloseSel = document.getElementById('btn-ts-sel-close');
        const btnCancelSel = document.getElementById('btn-ts-sel-cancel');
        const btnOkSel = document.getElementById('btn-ts-sel-ok');

        const btnAddSeries = document.getElementById('btn-ts-add');
        const btnEditSeries = document.getElementById('btn-ts-edit');
        const btnDeleteSeries = document.getElementById('btn-ts-delete');

        const btnCloseEdit = document.getElementById('btn-ts-edit-close');
        const btnCancelEdit = document.getElementById('btn-ts-edit-cancel');
        const btnOkEdit = document.getElementById('btn-ts-edit-ok');

        const btnCloseChart = document.getElementById('btn-ts-chart-close');

        if (btnCloseSel) btnCloseSel.onclick = hideSelectionModal;
        if (btnCancelSel) btnCancelSel.onclick = hideSelectionModal;
        if (btnOkSel) btnOkSel.onclick = () => { hideSelectionModal(); openChartWindow(); };

        if (btnAddSeries) btnAddSeries.onclick = () => openSeriesEditor(-1);
        if (btnEditSeries) btnEditSeries.onclick = editSelectedSeries;
        if (btnDeleteSeries) btnDeleteSeries.onclick = deleteSelectedSeries;

        if (btnCloseEdit) btnCloseEdit.onclick = hideEditorModal;
        if (btnCancelEdit) btnCancelEdit.onclick = hideEditorModal;
        if (btnOkEdit) btnOkEdit.onclick = saveSeriesEditor;

        if (btnCloseChart) btnCloseChart.onclick = () => chartModal.classList.add('hidden');

        // Draggable modals
        makeDraggable(selectionModal, document.getElementById('ts-sel-header'));
        makeDraggable(editorModal, document.getElementById('ts-edit-header'));
        makeDraggable(chartModal, document.getElementById('ts-chart-header'));

        // Resizable chart modal
        makeResizable(chartModal, document.getElementById('ts-chart-resize'));

        // Canvas hover listener
        if (canvasEl) {
            canvasEl.onmousemove = onCanvasMouseMove;
            canvasEl.onmouseleave = () => { currentHoverIndex = -1; renderChart(); };
        }
    }

    function makeDraggable(el, handle) {
        if (!el || !handle) return;
        let isDragging = false, startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

        handle.style.cursor = 'grab';
        handle.onmousedown = (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
            isDragging = true;
            handle.style.cursor = 'grabbing';
            startX = e.clientX;
            startY = e.clientY;
            const rect = el.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            el.style.left = `${initialLeft}px`;
            el.style.top = `${initialTop}px`;
            el.style.transform = 'none';

            const onMouseMove = (ev) => {
                if (!isDragging) return;
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                el.style.left = `${Math.max(10, initialLeft + dx)}px`;
                el.style.top = `${Math.max(10, initialTop + dy)}px`;
            };

            const onMouseUp = () => {
                isDragging = false;
                handle.style.cursor = 'grab';
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        };
    }

    function makeResizable(el, handle) {
        if (!el || !handle) return;
        handle.onmousedown = (e) => {
            e.preventDefault();
            const startW = el.offsetWidth;
            const startH = el.offsetHeight;
            const startX = e.clientX;
            const startY = e.clientY;

            const onMouseMove = (ev) => {
                const w = Math.max(450, startW + (ev.clientX - startX));
                const h = Math.max(300, startH + (ev.clientY - startY));
                el.style.width = `${w}px`;
                el.style.height = `${h}px`;
                if (canvasEl && !chartModal.classList.contains('hidden')) renderChart();
            };

            const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        };
    }

    // Public API: Open Plot Selection Modal
    function openSelectionModal(presetId = null, presetType = null) {
        if (!selectionModal) initUI();

        const tsData = getTimeSeriesData();
        if (!tsData) {
            if (window.showResultsWarning) window.showResultsWarning('Run a simulation first to generate time-series plot results.');
            return;
        }

        // Populate time range options
        const selStart = document.getElementById('ts-start-time');
        const selEnd   = document.getElementById('ts-end-time');
        if (selStart && selEnd) {
            selStart.innerHTML = '';
            selEnd.innerHTML = '';
            tsData.times.forEach((t, i) => {
                selStart.appendChild(new Option(t, i));
                selEnd.appendChild(new Option(t, i));
            });
            selStart.value = 0;
            selEnd.value = tsData.numPeriods - 1;
        }

        // Add default preset if list empty and map selection provided
        if (activeSeries.length === 0 && presetId) {
            let type = presetType || 'NODE';
            if (!presetType) {
                if (Net.getNode(presetId)) type = 'NODE';
                else if (Net.getLink(presetId)) type = 'LINK';
                else if (Net.getSubcatchment(presetId)) type = 'SUBCATCHMENT';
            }
            const defaultVar = VAR_DEFINITIONS[type] ? VAR_DEFINITIONS[type][0] : null;
            if (defaultVar) {
                const isUS = Net.units === 'US';
                activeSeries.push({
                    id: presetId,
                    type,
                    variable: defaultVar.key,
                    label: `${presetId} (${defaultVar.label})`,
                    color: COLORS[0],
                    unit: isUS ? defaultVar.unitUS : defaultVar.unitSI
                });
            }
        }

        renderSeriesList();
        selectionModal.classList.remove('hidden');
    }

    function hideSelectionModal() {
        if (selectionModal) selectionModal.classList.add('hidden');
    }

    function renderSeriesList() {
        const listEl = document.getElementById('ts-series-list');
        if (!listEl) return;
        listEl.innerHTML = '';

        if (!activeSeries.length) {
            listEl.innerHTML = '<div class="ts-empty">No data series added yet. Click "+ Add" to add a variable to plot.</div>';
            return;
        }

        activeSeries.forEach((s, idx) => {
            const item = document.createElement('div');
            item.className = 'ts-series-item';
            item.dataset.index = idx;
            item.onclick = () => {
                document.querySelectorAll('.ts-series-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
            };

            item.innerHTML = `
                <span class="ts-series-color" style="background:${s.color}"></span>
                <span class="ts-series-type">${s.type}</span>
                <span class="ts-series-name"><b>${s.id}</b> — ${s.label}</span>
                <span class="ts-series-unit">${s.unit}</span>
            `;
            listEl.appendChild(item);
        });
    }

    function editSelectedSeries() {
        const selected = document.querySelector('.ts-series-item.selected');
        if (!selected) return;
        const idx = parseInt(selected.dataset.index, 10);
        openSeriesEditor(idx);
    }

    function deleteSelectedSeries() {
        const selected = document.querySelector('.ts-series-item.selected');
        if (!selected) return;
        const idx = parseInt(selected.dataset.index, 10);
        activeSeries.splice(idx, 1);
        renderSeriesList();
    }

    // Series Editor Sub-dialog
    function openSeriesEditor(index = -1) {
        editingSeriesIndex = index;
        const selType = document.getElementById('ts-edit-type');
        const selId   = document.getElementById('ts-edit-id');
        const selVar  = document.getElementById('ts-edit-var');
        const inputColor = document.getElementById('ts-edit-color');

        if (!selType || !selId || !selVar) return;

        const isEdit = (index >= 0 && index < activeSeries.length);
        const current = isEdit ? activeSeries[index] : {
            type: 'NODE',
            id: (Net.nodes[0] && Net.nodes[0].id) || '',
            variable: 'depth',
            color: COLORS[activeSeries.length % COLORS.length]
        };

        selType.value = current.type;
        populateEditorIds(current.type, current.id);
        populateEditorVars(current.type, current.variable);
        if (inputColor) inputColor.value = current.color;

        selType.onchange = () => {
            const newType = selType.value;
            populateEditorIds(newType);
            populateEditorVars(newType);
        };

        editorModal.classList.remove('hidden');
    }

    function populateEditorIds(type, selectedId = null) {
        const selId = document.getElementById('ts-edit-id');
        if (!selId) return;
        selId.innerHTML = '';

        let items = [];
        if (type === 'NODE') items = Net.nodes.map(n => n.id);
        else if (type === 'LINK') items = Net.links.map(l => l.id);
        else if (type === 'SUBCATCHMENT') items = Net.subcatchments.map(s => s.id);
        else if (type === 'SYSTEM') items = ['SYSTEM'];

        items.forEach(id => {
            const opt = new Option(id, id);
            if (id === selectedId) opt.selected = true;
            selId.appendChild(opt);
        });
    }

    function populateEditorVars(type, selectedVar = null) {
        const selVar = document.getElementById('ts-edit-var');
        if (!selVar) return;
        selVar.innerHTML = '';

        const vars = VAR_DEFINITIONS[type] || [];
        const isUS = Net.units === 'US';

        vars.forEach(v => {
            const unit = isUS ? v.unitUS : v.unitSI;
            const opt = new Option(`${v.label} (${unit})`, v.key);
            if (v.key === selectedVar) opt.selected = true;
            selVar.appendChild(opt);
        });
    }

    function saveSeriesEditor() {
        const selType = document.getElementById('ts-edit-type');
        const selId   = document.getElementById('ts-edit-id');
        const selVar  = document.getElementById('ts-edit-var');
        const inputColor = document.getElementById('ts-edit-color');

        if (!selType || !selId || !selVar) return;

        const type = selType.value;
        const id   = selId.value;
        const varKey = selVar.value;
        const color = inputColor ? inputColor.value : COLORS[activeSeries.length % COLORS.length];

        const varDef = (VAR_DEFINITIONS[type] || []).find(v => v.key === varKey);
        const isUS = Net.units === 'US';
        const unit = varDef ? (isUS ? varDef.unitUS : varDef.unitSI) : '';
        const label = varDef ? varDef.label : varKey;

        const entry = { id, type, variable: varKey, label: `${id} (${label})`, color, unit };

        if (editingSeriesIndex >= 0 && editingSeriesIndex < activeSeries.length) {
            activeSeries[editingSeriesIndex] = entry;
        } else {
            activeSeries.push(entry);
        }

        hideEditorModal();
        renderSeriesList();
    }

    function hideEditorModal() {
        if (editorModal) editorModal.classList.add('hidden');
    }

    // Chart Window & Rendering
    function openChartWindow() {
        if (!activeSeries.length) {
            openSelectionModal();
            return;
        }
        if (!chartModal) initUI();

        // Read time range settings
        const selStart = document.getElementById('ts-start-time');
        const selEnd   = document.getElementById('ts-end-time');
        const radioElapsed = document.getElementById('ts-mode-elapsed');

        timeRange.startIndex = selStart ? parseInt(selStart.value, 10) || 0 : 0;
        timeRange.endIndex   = selEnd ? parseInt(selEnd.value, 10) || 0 : 0;
        timeRange.mode       = (radioElapsed && radioElapsed.checked) ? 'elapsed' : 'datetime';

        chartModal.classList.remove('hidden');
        renderChart();
    }

    function renderChart() {
        if (!ctx || !canvasEl || chartModal.classList.contains('hidden')) return;

        const tsData = getTimeSeriesData();
        if (!tsData || !activeSeries.length) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvasEl.getBoundingClientRect();
        const W = rect.width || 700;
        const H = rect.height || 400;

        canvasEl.width = W * dpr;
        canvasEl.height = H * dpr;
        ctx.scale(dpr, dpr);

        const PAD = { top: 40, right: 30, bottom: 50, left: 60 };
        const plotW = W - PAD.left - PAD.right;
        const plotH = H - PAD.top - PAD.bottom;

        if (plotW <= 0 || plotH <= 0) return;

        // Fetch datasets for active series
        const seriesData = [];
        let globalMinY = Infinity, globalMaxY = -Infinity;

        activeSeries.forEach(s => {
            const rawValues = tsData.getSeries(s.type, s.id, s.variable);
            if (!rawValues) return;

            const sliced = [];
            const start = Math.max(0, timeRange.startIndex);
            const end   = Math.min(tsData.numPeriods - 1, timeRange.endIndex);

            for (let i = start; i <= end; i++) {
                const val = rawValues[i] || 0;
                sliced.push(val);
                if (val < globalMinY) globalMinY = val;
                if (val > globalMaxY) globalMaxY = val;
            }
            seriesData.push({ config: s, values: sliced });
        });

        if (!isFinite(globalMinY) || !seriesData.length) {
            globalMinY = 0; globalMaxY = 1;
        }

        const yPad = Math.max(0.1, (globalMaxY - globalMinY) * 0.1);
        const minY = Math.min(0, globalMinY - yPad * 0.5);
        const maxY = globalMaxY + yPad;
        const rangeY = Math.max(1e-6, maxY - minY);

        // Coordinate functions
        const numPts = (timeRange.endIndex - timeRange.startIndex + 1) || 1;
        const cx = (i) => PAD.left + (i / Math.max(1, numPts - 1)) * plotW;
        const cy = (val) => PAD.top + plotH - ((val - minY) / rangeY) * plotH;

        // Background
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);

        // Grid & Y-Axis Ticks
        const nTicksY = 6;
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;

        for (let i = 0; i <= nTicksY; i++) {
            const val = minY + (i / nTicksY) * rangeY;
            const y = cy(val);
            ctx.beginPath();
            ctx.moveTo(PAD.left, y);
            ctx.lineTo(PAD.left + plotW, y);
            ctx.stroke();

            ctx.textAlign = 'right';
            ctx.fillText(val.toFixed(2), PAD.left - 8, y + 4);
        }

        // X-Axis Ticks
        const nTicksX = Math.min(numPts, Math.floor(plotW / 90));
        for (let i = 0; i <= nTicksX; i++) {
            const stepIdx = Math.round((i / nTicksX) * (numPts - 1));
            const x = cx(stepIdx);
            const actualIdx = timeRange.startIndex + stepIdx;
            const rawTime = tsData.times[actualIdx] || '';

            let label = rawTime;
            if (timeRange.mode === 'elapsed') {
                label = `${(stepIdx * (15)).toFixed(0)}m`; // Approx elapsed
            }

            ctx.beginPath();
            ctx.moveTo(x, PAD.top + plotH);
            ctx.lineTo(x, PAD.top + plotH + 5);
            ctx.stroke();

            ctx.textAlign = 'center';
            ctx.fillText(label, x, PAD.top + plotH + 18);
        }

        // Plot Lines
        seriesData.forEach(s => {
            if (!s.values.length) return;
            ctx.beginPath();
            s.values.forEach((v, idx) => {
                const x = cx(idx);
                const y = cy(v);
                idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            });
            ctx.strokeStyle = s.config.color;
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        // Hover Crosshair & Tooltip
        if (currentHoverIndex >= 0 && currentHoverIndex < numPts) {
            const x = cx(currentHoverIndex);
            const actualIdx = timeRange.startIndex + currentHoverIndex;
            const timeLabel = tsData.times[actualIdx] || '';

            ctx.strokeStyle = '#94a3b8';
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(x, PAD.top);
            ctx.lineTo(x, PAD.top + plotH);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw data points on hover line
            seriesData.forEach(s => {
                const val = s.values[currentHoverIndex];
                if (val === undefined) return;
                const y = cy(val);
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fillStyle = s.config.color;
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            });

            // Hover Box
            let boxY = PAD.top + 10;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
            ctx.fillRect(x > W - 180 ? x - 170 : x + 10, boxY, 160, 20 + seriesData.length * 16);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px Inter, system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(timeLabel, x > W - 180 ? x - 162 : x + 18, boxY + 14);

            ctx.font = '11px Inter, system-ui, sans-serif';
            seriesData.forEach((s, idx) => {
                const val = s.values[currentHoverIndex];
                ctx.fillStyle = s.config.color;
                ctx.fillText(`${s.config.id}: ${(val || 0).toFixed(2)} ${s.config.unit}`, x > W - 180 ? x - 162 : x + 18, boxY + 30 + idx * 16);
            });
        }

        // Border
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1;
        ctx.strokeRect(PAD.left, PAD.top, plotW, plotH);
    }

    function onCanvasMouseMove(e) {
        if (!canvasEl || !timeRange) return;
        const rect = canvasEl.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;

        const PAD = { left: 60, right: 30 };
        const plotW = rect.width - PAD.left - PAD.right;
        const numPts = (timeRange.endIndex - timeRange.startIndex + 1) || 1;

        const relX = mouseX - PAD.left;
        if (relX < 0 || relX > plotW) {
            currentHoverIndex = -1;
        } else {
            currentHoverIndex = Math.round((relX / plotW) * (numPts - 1));
        }
        renderChart();
    }

    function onMapElementSelected(id) {
        if (!id || typeof Net === 'undefined') return;
        const isSelOpen = selectionModal && !selectionModal.classList.contains('hidden');
        const isChartOpen = chartModal && !chartModal.classList.contains('hidden');

        if (!isSelOpen && !isChartOpen) return;

        let type = 'NODE';
        if (Net.getNode(id)) type = 'NODE';
        else if (Net.getLink(id)) type = 'LINK';
        else if (Net.getSubcatchment(id)) type = 'SUBCATCHMENT';
        else return;

        const defaultVar = VAR_DEFINITIONS[type] ? VAR_DEFINITIONS[type][0] : null;
        if (!defaultVar) return;

        // Add if not already added
        const exists = activeSeries.some(s => s.id === id && s.type === type && s.variable === defaultVar.key);
        if (!exists) {
            const isUS = Net.units === 'US';
            activeSeries.push({
                id,
                type,
                variable: defaultVar.key,
                label: `${id} (${defaultVar.label})`,
                color: COLORS[activeSeries.length % COLORS.length],
                unit: isUS ? defaultVar.unitUS : defaultVar.unitSI
            });
        }

        if (isSelOpen) renderSeriesList();
        if (isChartOpen) renderChart();
    }

    // Expose window API
    window.TimeSeriesPlot = {
        openSelectionModal,
        openChartWindow,
        onMapElementSelected
    };

    // Auto-initialize when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }
})();
