// results.js — Parse SWMM .rpt output, populate the Results
// panel, and color-code the network on the map.

(function () {
    'use strict';

    // color ramp (low → high)
    const RAMP = ['#2e7dd1', '#26a69a', '#ffca28', '#f57c00', '#d32f2f'];

    function lerpColor(c1, c2, t) {
        const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
        const a = p(c1), b = p(c2);
        const m = a.map((v, i) => Math.round(v + (b[i] - v) * t));
        return `rgb(${m[0]},${m[1]},${m[2]})`;
    }

    function rampColor(t) {
        t = Math.max(0, Math.min(1, t));
        const seg = t * (RAMP.length - 1);
        const i = Math.min(Math.floor(seg), RAMP.length - 2);
        return lerpColor(RAMP[i], RAMP[i + 1], seg - i);
    }
    window.rampColor = rampColor; // used by street_view_overlay.js

        // min/max via loop — Math.min(...arr) overflows the stack on >100k elements
        function arrayMinMax(arr) {
            let min = Infinity, max = -Infinity;
            for (let i = 0; i < arr.length; i++) {
                const v = arr[i];
                if (v < min) min = v;
                if (v > max) max = v;
            }
            return { min, max };
        }

    // ---------- rpt parsing ----------
    // All parsers take the pre-split lines array — the report is split ONCE
    // in displayResults instead of 8+ times.
    function sectionLines(lines, title) {
        const i = lines.findIndex(l => l.includes(title));
        if (i === -1) return null;
        const out = [];
        for (let j = i + 1; j < lines.length; j++) {
            const t = lines[j].trim();
            if (/^\*{4,}$/.test(t)) {
                if (j === i + 1) continue; // closing underline of this section's own title
                break;                     // start of the next section header
            }
            out.push(lines[j]);
        }
        return out;
    }

    function parseNodeDepths(lines0) {
        const lines = sectionLines(lines0, 'Node Depth Summary');
        if (!lines) return {};
        const out = {};
        for (const line of lines) {
            const m = line.match(/^\s{0,4}(\S+)\s+(JUNCTION|OUTFALL|STORAGE|DIVIDER)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/);
            if (m) out[m[1]] = { type: m[2], avgDepth: parseFloat(m[3]), maxDepth: parseFloat(m[4]) };
        }
        return out;
    }

    function parseLinkFlows(lines0) {
        const lines = sectionLines(lines0, 'Link Flow Summary');
        if (!lines) return {};
        const out = {};
        for (const line of lines) {
            const m = line.match(/^\s{0,4}(\S+)\s+(CONDUIT|PUMP|WEIR|ORIFICE|OUTLET|CHANNEL|DUMMY)\s+([\d.eE+-]+)/);
            if (m) out[m[1]] = { type: m[2], maxFlow: parseFloat(m[3]) };
        }
        return out;
    }

    function parseFlooding(lines0) {
        const lines = sectionLines(lines0, 'Node Flooding Summary');
        if (!lines) return [];
        const out = [];
        for (const line of lines) {
            if (line.includes('---')) continue;
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 6 && parts[0] !== 'Node' && !isNaN(parts[1])) {
                if (Net.getNode(parts[0])) {
                    out.push({
                        id: parts[0],
                        hoursFlooded: parts[1],
                        maxRate: parts[2],
                        totalFloodVol: parts[5],
                        maxPondedVol: parts[6] || '0'
                    });
                }
            }
        }
        return out;
    }

    function parseNodeInflows(lines0) {
        const lines = sectionLines(lines0, 'Node Inflow Summary');
        if (!lines) return [];
        const out = [];
        for (const line of lines) {
            if (line.includes('---')) continue;
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 9 && ['JUNCTION','OUTFALL','STORAGE','DIVIDER'].includes(parts[1])) {
                out.push({
                    id: parts[0],
                    type: parts[1],
                    maxLatInflow: parts[2],
                    maxTotalInflow: parts[3],
                    latInflowVol: parts[parts.length - 3],
                    totalInflowVol: parts[parts.length - 2],
                    flowBalError: parts[parts.length - 1]
                });
            }
        }
        return out;
    }

    function parseOutfallLoadings(lines0) {
        const lines = sectionLines(lines0, 'Outfall Loading Summary');
        if (!lines) return [];
        const out = [];
        for (const line of lines) {
            if (line.includes('---')) continue;
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 5 && parts[0] !== 'Outfall' && parts[0] !== 'System' && !isNaN(parts[1])) {
                out.push({
                    id: parts[0],
                    flowFreq: parts[1],
                    avgFlow: parts[2],
                    maxFlow: parts[3],
                    totalVolume: parts[4]
                });
            }
        }
        return out;
    }

    function parseConduitSurcharges(lines0) {
        const lines = sectionLines(lines0, 'Conduit Surcharge Summary');
        if (!lines) return [];
        const out = [];
        for (const line of lines) {
            if (line.includes('---')) continue;
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 6 && parts[0] !== 'Conduit' && !isNaN(parts[1])) {
                out.push({
                    id: parts[0],
                    bothEnds: parts[1],
                    upstream: parts[2],
                    dnstream: parts[3],
                    aboveNormal: parts[4],
                    capacityLimited: parts[5]
                });
            }
        }
        return out;
    }

    function parseSubcatchmentRunoffs(lines0) {
        const lines = sectionLines(lines0, 'Subcatchment Runoff Summary');
        if (!lines) return [];
        const out = [];
        for (const line of lines) {
            if (line.includes('---')) continue;
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 9 && parts[0] !== 'Subcatchment' && !isNaN(parts[1])) {
                out.push({
                    id: parts[0],
                    totalPrecip: parts[1],
                    totalRunon: parts[2],
                    totalEvap: parts[3],
                    totalInfil: parts[4],
                    totalRunoff: parts[5],
                    totalRunoffVol: parts[6],
                    peakRunoff: parts[7],
                    runoffCoeff: parts[8]
                });
            }
        }
        return out;
    }

    function parseFlowClassifications(lines0) {
        const lines = sectionLines(lines0, 'Flow Classification Summary');
        if (!lines) return [];
        const out = [];
        for (const line of lines) {
            if (line.includes('---')) continue;
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 10 && parts[0] !== 'Conduit' && !isNaN(parts[1])) {
                out.push({
                    id: parts[0],
                    adjLength: parts[1],
                    upDry: parts[2],
                    downDry: parts[3],
                    subCrit: parts[4],
                    supCrit: parts[5],
                    upCrit: parts[6],
                    downCrit: parts[7],
                    normLtd: parts[8],
                    avgFroude: parts[9],
                    avgFlow: parts[10] || '0'
                });
            }
        }
        return out;
    }

    function parseContinuityErrors(rpt) {
        const out = [];
        const re = /Continuity Error \(%\)[ .]*(-?[\d.eE+-]+)/g;
        let m;
        while ((m = re.exec(rpt)) !== null) out.push(parseFloat(m[1]));
        return out;
    }

    function parseEngineErrors(lines0) {
        return lines0
            .filter(l => /^\s*(ERROR|WARNING)\b/i.test(l.trim()))
            .map(l => l.trim())
            .slice(0, 8);
    }

    // ---------- time-series parsing ----------
    function parseTimeSeries(rptLines) {
        const out = {
            times: [], // array of "Date Time" strings
            nodes: {}, // id -> array of depth values
            links: {},  // id -> array of flow values
            nodeMax: {},
            linkMax: {}
        };

        const lines = rptLines;
        let currentType = null; // 'node' or 'link' or 'cell'
        let currentId = null;
        let timeIndexMap = {}; 
        let nextTimeIndex = 0;
        
        let state = 0; // 0=seek, 1=wait header, 2=data

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (line.startsWith('<<< Node ')) {
                const match = line.match(/<<< Node (.*?) >>>/);
                if (match) {
                    currentId = match[1].trim();
                    currentType = 'node';
                    out.nodes[currentId] = { inflow: [], flooding: [], depth: [], head: [] };
                    state = 1;
                }
                continue;
            } else if (line.startsWith('<<< Cell ')) {
                const match = line.match(/<<< Cell (.*?) >>>/);
                if (match) {
                    currentId = match[1].trim();
                    currentType = 'cell';
                    out.nodes[currentId] = { depth: [], head: [] };
                    state = 1;
                }
                continue;
            } else if (line.startsWith('<<< Link ')) {
                const match = line.match(/<<< Link (.*?) >>>/);
                if (match) {
                    currentId = match[1].trim();
                    currentType = 'link';
                    out.links[currentId] = { flow: [], velocity: [], depth: [], capacity: [] };
                    state = 1;
                }
                continue;
            }
            
            if (state === 1) {
                // Wait for the second dashed line before data
                if (line.startsWith('---') && lines[i-1] && lines[i-1].includes('Time')) {
                    state = 2;
                }
            } else if (state === 2) {
                if (line.length === 0) {
                    state = 0;
                    continue;
                }
                const parts = line.split(/\s+/);
                
                let dateStr, timeStr, dataStartIdx;
                if (parts[0] && parts[0].includes(':')) {
                    dateStr = '0';
                    timeStr = parts[0];
                    dataStartIdx = 1;
                } else if (parts[1] && parts[1].includes(':')) {
                    dateStr = parts[0];
                    timeStr = parts[1];
                    dataStartIdx = 2;
                } else {
                    continue;
                }

                if (parts.length >= dataStartIdx + 1) {
                    const dt = dateStr + ' ' + timeStr;
                    let tIdx = timeIndexMap[dt];
                    if (tIdx === undefined) {
                        tIdx = nextTimeIndex++;
                        timeIndexMap[dt] = tIdx;
                        out.times.push(dt);
                    }
                    
                    let depthVal = 0;
                    if (currentType === 'node') {
                        out.nodes[currentId].inflow[tIdx] = parseFloat(parts[dataStartIdx]) || 0;
                        out.nodes[currentId].flooding[tIdx] = parseFloat(parts[dataStartIdx + 1]) || 0;
                        depthVal = parseFloat(parts[dataStartIdx + 2]) || 0;
                        out.nodes[currentId].depth[tIdx] = depthVal;
                        out.nodes[currentId].head[tIdx] = parseFloat(parts[dataStartIdx + 3]) || 0;
                        
                        if (!out.nodeMax[currentId] || depthVal > out.nodeMax[currentId]) {
                            out.nodeMax[currentId] = depthVal;
                        }
                    } else if (currentType === 'cell') {
                        depthVal = parseFloat(parts[dataStartIdx]) || 0;
                        out.nodes[currentId].depth[tIdx] = depthVal;
                        out.nodes[currentId].head[tIdx] = parseFloat(parts[dataStartIdx + 1]) || 0;
                        
                        if (!out.nodeMax[currentId] || depthVal > out.nodeMax[currentId]) {
                            out.nodeMax[currentId] = depthVal;
                        }
                    } else if (currentType === 'link') {
                        let flowVal = parseFloat(parts[dataStartIdx]) || 0;
                        out.links[currentId].flow[tIdx] = flowVal;
                        out.links[currentId].velocity[tIdx] = parseFloat(parts[dataStartIdx + 1]) || 0;
                        out.links[currentId].depth[tIdx] = parseFloat(parts[dataStartIdx + 2]) || 0;
                        out.links[currentId].capacity[tIdx] = parseFloat(parts[dataStartIdx + 3]) || 0;
                        
                        if (!out.linkMax[currentId] || Math.abs(flowVal) > out.linkMax[currentId]) {
                            out.linkMax[currentId] = Math.abs(flowVal);
                        }
                    }
                } else if (line.startsWith('<<<') || line.startsWith('---')) {
                    state = 0;
                }
            }
        }
        
        return out;
    }

    // ---------- map styling via feature-state resultColor ----------
    const ResultStyling = {
        active: false,
        nodeColors: {},   // id -> max color
        linkColors: {},   // id -> max color
        timeSeries: null, // parsed time series data
        outData: null,    // binary out data parser
        nodeMinMax: { min: 0, max: 0.1 },
        linkMinMax: { min: 0, max: 0.1 },
        mesh2DMinMax: { min: 0, max: 0.1 },
        currentStep: 0,
        activeNodeVar: 'depth',
        activeLinkVar: 'flow',
        active2DVar: 'depth',   // 'depth' | 'head' | 'velocity'
        // dirty-tracking: last color pushed via setFeatureState, per element
        _appliedNode: new Map(),
        _appliedLink: new Map(),
        _applied2D: new Map(),

        // Mirror resultColor onto the 3D network source when it exists.
        _push3D(id, color) {
            try {
                if (window.map && window.map.getSource('swmm-3d')) {
                    window.map.setFeatureState({ source: 'swmm-3d', id }, { resultColor: color });
                }
            } catch (e) { /* source not ready */ }
        },

        // Replay current result colors onto the 3D source unconditionally —
        // used when the swmm-3d source is (re)created after colors were already pushed.
        push3DAll() {
            Object.entries(this.nodeColors).forEach(([id, color]) => this._push3D(id, color));
            Object.entries(this.linkColors).forEach(([id, color]) => this._push3D(id, color));
        },

        applyToMap() {
            Object.entries(this.nodeColors).forEach(([id, color]) => {
                if (this._appliedNode.get(id) === color) return;
                this._appliedNode.set(id, color);
                try { map.setFeatureState({ source: 'swmm-nodes', id }, { resultColor: color }); } catch (e) { }
                this._push3D(id, color);
                this._applied2D.set(id, color);
                try { map.setFeatureState({ source: 'swmm-2d-mesh', id }, { resultColor: color }); } catch (e) { }
            });
            Object.entries(this.linkColors).forEach(([id, color]) => {
                if (this._appliedLink.get(id) === color) return;
                this._appliedLink.set(id, color);
                try { map.setFeatureState({ source: 'swmm-links', id }, { resultColor: color }); } catch (e) { }
                this._push3D(id, color);
            });
        },

        applyToMapForStep(step) {
            if (!this.active || !this.timeSeries) return;
            const ts = this.timeSeries;
            this.currentStep = step;
            if (step < 0 || step >= ts.times.length) return;

            const nMin = this.nodeMinMax.min, nMax = this.nodeMinMax.max;
            const lMin = this.linkMinMax.min, lMax = this.linkMinMax.max;

            // ---- 2D mesh frame-based animation ----
            const r2d = window.App && window.App.results2D;
            if (r2d && r2d.frames && r2d.triangleIds) {
                const frame = r2d.frames[step];
                if (frame) {
                    const varKey = this.active2DVar; // 'depth' | 'head' | 'velocity'
                    const arr = frame[varKey];
                    if (arr) {
                        const ids = r2d.triangleIds;
                        // Absolute scale, stable across frames: depth/velocity
                        // use the global-across-frames robust max, head keeps
                        // the global range. No per-frame re-normalization.
                        const mMax = this.mesh2DMinMax.max;
                        const mMin = varKey === 'head' ? this.mesh2DMinMax.min : 0;
                        const depthArr = frame.depth;
                        const shouldShow = window.View2D ? window.View2D.shouldShow : null;
                        for (let i = 0; i < ids.length; i++) {
                            const raw = Number(arr[i]);
                            const val = Number.isFinite(raw) ? raw : 0;
                            // Per-variable masking (View2D.shouldShow / CONTEXT.md):
                            // depth hides the film below the mask; head shows only
                            // cells with water present; velocity is source-gated.
                            const show = shouldShow ? shouldShow(varKey, val, depthArr ? Number(depthArr[i]) : NaN) : (Number.isFinite(raw) && val > 0);
                            const t = mMax > mMin ? Math.min(1, (val - mMin) / (mMax - mMin)) : 0;
                            const color = show ? rampColor(t) : 'rgba(0,0,0,0)';
                            if (this._applied2D.get(ids[i]) === color) continue;
                            this._applied2D.set(ids[i], color);
                            try { map.setFeatureState({ source: 'swmm-2d-mesh', id: ids[i] }, { resultColor: color }); } catch (e) { }
                        }
                    } else {
                        // Do not leave a previous frame painted when a backend
                        // omits the selected field.
                        r2d.triangleIds.forEach(id => {
                            const color = 'rgba(0,0,0,0)';
                            if (this._applied2D.get(id) === color) return;
                            this._applied2D.set(id, color);
                            try { map.setFeatureState({ source: 'swmm-2d-mesh', id }, { resultColor: color }); } catch (e) { }
                        });
                    }
                    if (window.Mesh2DLayers) window.Mesh2DLayers.onStep(step, frame);
                }
            }

            const outData = this.outData;
            if (outData && outData.parsed) {
                // Highly optimized path: read only the current step's variables directly from outData
                const nodeVarIdx = this.activeNodeVar === 'depth' ? 0 :
                                   this.activeNodeVar === 'head' ? 1 :
                                   this.activeNodeVar === 'inflow' ? 4 :
                                   this.activeNodeVar === 'flooding' ? 5 : -1;
                const linkVarIdx = this.activeLinkVar === 'flow' ? 0 :
                                   this.activeLinkVar === 'depth' ? 1 :
                                   this.activeLinkVar === 'velocity' ? 2 :
                                   this.activeLinkVar === 'capacity' ? 4 : -1;

                if (nodeVarIdx !== -1) {
                    const nodeVals = outData.getStepData('NODE', step, nodeVarIdx);
                    outData.names.nodes.forEach((id, i) => {
                        const val = nodeVals[i];
                        const t = nMax > nMin ? (val - nMin) / (nMax - nMin) : 0.5;
                        const color = rampColor(t);
                        if (this._appliedNode.get(id) === color) return;
                        this._appliedNode.set(id, color);
                        try { map.setFeatureState({ source: 'swmm-nodes', id }, { resultColor: color }); } catch (e) { }
                        this._push3D(id, color);
                    });
                }

                if (linkVarIdx !== -1) {
                    const linkVals = outData.getStepData('LINK', step, linkVarIdx);
                    outData.names.links.forEach((id, i) => {
                        const val = linkVals[i];
                        const t = lMax > lMin ? (Math.abs(val) - lMin) / (lMax - lMin) : 0.5;
                        const color = rampColor(t);
                        if (this._appliedLink.get(id) === color) return;
                        this._appliedLink.set(id, color);
                        try { map.setFeatureState({ source: 'swmm-links', id }, { resultColor: color }); } catch (e) { }
                        this._push3D(id, color);
                    });
                }
            } else if (!r2d) {
                // Fallback to reading from parsed timeSeries arrays (1D-only runs)
                Object.entries(ts.nodes).forEach(([id, values]) => {
                    const val = values[this.activeNodeVar] ? values[this.activeNodeVar][step] : undefined;
                    if (val !== undefined) {
                        const t = nMax > nMin ? (val - nMin) / (nMax - nMin) : 0.5;
                        const color = rampColor(t);
                        if (this._appliedNode.get(id) === color) return;
                        this._appliedNode.set(id, color);
                        try { map.setFeatureState({ source: 'swmm-nodes', id }, { resultColor: color }); } catch (e) { }
                        this._push3D(id, color);
                    }
                });

                Object.entries(ts.links).forEach(([id, values]) => {
                    const val = values[this.activeLinkVar] ? values[this.activeLinkVar][step] : undefined;
                    if (val !== undefined) {
                        const t = lMax > lMin ? (Math.abs(val) - lMin) / (lMax - lMin) : 0.5;
                        const color = rampColor(t);
                        if (this._appliedLink.get(id) === color) return;
                        this._appliedLink.set(id, color);
                        try { map.setFeatureState({ source: 'swmm-links', id }, { resultColor: color }); } catch (e) { }
                        this._push3D(id, color);
                    }
                });
            }
            
            // Also update the UI time display safely if needed
            const timeDisplay = document.getElementById('time-display');
            if (timeDisplay && ts.times[step]) {
                timeDisplay.textContent = `Time: ${ts.times[step]}`;
            }

            if (window.StreetViewOverlay && window.StreetViewOverlay.scheduleRedraw) {
                window.StreetViewOverlay.scheduleRedraw();
            }
        },

        clear() {
            this.active = false;
            // Clear every element we ever pushed a color to (applyToMapForStep
            // may have touched ids beyond nodeColors/linkColors)
            const nodeIds = new Set([...Object.keys(this.nodeColors), ...this._appliedNode.keys()]);
            const linkIds = new Set([...Object.keys(this.linkColors), ...this._appliedLink.keys()]);
            nodeIds.forEach(id => {
                try { map.setFeatureState({ source: 'swmm-nodes', id }, { resultColor: null }); } catch (e) { }
                this._push3D(id, null);
            });
            linkIds.forEach(id => {
                try { map.setFeatureState({ source: 'swmm-links', id }, { resultColor: null }); } catch (e) { }
                this._push3D(id, null);
            });
            // Clear 2D mesh feature states
            this._applied2D.forEach((_, id) => {
                try { map.setFeatureState({ source: 'swmm-2d-mesh', id }, { resultColor: null }); } catch (e) { }
            });
            this._appliedNode.clear();
            this._appliedLink.clear();
            this._applied2D.clear();
            if (window.Mesh2DLayers && window.Mesh2DLayers.clear) window.Mesh2DLayers.clear();
            this.nodeColors = {};
            this.linkColors = {};
            this.timeSeries = null;
            this.outData = null;
            this.mesh2DMinMax = null;
            this.mesh2DDepthScale = null;
            if (window.AnimationUI) window.AnimationUI.hide();
        }
    };
    window.ResultStyling = ResultStyling;

    // ---------- Results panel rendering ----------
    function esc(s) {
        return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    function fmtVal(v, d = 2) {
        return isFinite(v) ? Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
    }

    // The category <select> is moved inside #results-content while the
    // dashboard is shown; park it back in #results-body before the container
    // is wiped so the element (and its listeners) survive re-renders.
    function parkCategorySelect() {
        const select = document.getElementById('results-category-select');
        const body = document.getElementById('results-body');
        const container = document.getElementById('results-content');
        if (select && body && container && container.contains(select)) {
            body.insertBefore(select, container);
        }
        return select;
    }

    function flyToElement(id) {
        let center = null;
        const n = Net.getNode(id);
        if (n) center = n.lngLat;
        if (!center) {
            const l = Net.getLink(id);
            if (l) {
                const a = Net.getNode(l.from), b = Net.getNode(l.to);
                if (a && b) center = [(a.lngLat[0] + b.lngLat[0]) / 2, (a.lngLat[1] + b.lngLat[1]) / 2];
            }
        }
        if (!center) {
            const s = Net.getSubcatchment(id);
            if (s && s.ring && s.ring.length) {
                center = s.ring.reduce((acc, c) => [acc[0] + c[0] / s.ring.length, acc[1] + c[1] / s.ring.length], [0, 0]);
            }
        }
        if (!center) return;
        map.flyTo({ center, zoom: Math.max(map.getZoom(), 16.5), duration: 900 });
        if (window.Tools && window.Tools.select) window.Tools.select(id);
    }

    // Sparklines render lazily — a canvas is only drawn when scrolled into view
    let sparkObserver = null;
    function resetSparkObserver() {
        if (sparkObserver) sparkObserver.disconnect();
        sparkObserver = new IntersectionObserver((entries) => {
            entries.forEach(en => {
                if (!en.isIntersecting) return;
                sparkObserver.unobserve(en.target);
                drawSparkline(en.target);
            });
        }, { rootMargin: '120px' });
        return sparkObserver;
    }

    function drawSparkline(canvas) {
        const values = canvas._values;
        if (!values || values.length < 2) return;
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth || 64, h = canvas.clientHeight || 20;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        let min = Infinity, max = -Infinity, maxIdx = 0;
        for (let i = 0; i < values.length; i++) {
            const v = values[i] || 0;
            if (v < min) min = v;
            if (v > max) { max = v; maxIdx = i; }
        }
        const span = max - min || 1;
        const px = i => 1 + (i / (values.length - 1)) * (w - 2);
        const py = v => h - 2 - (((v || 0) - min) / span) * (h - 4);
        const color = canvas._color || '#0d7377';
        ctx.beginPath();
        for (let i = 0; i < values.length; i++) {
            const x = px(i), y = py(values[i]);
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.lineTo(px(values.length - 1), h);
        ctx.lineTo(px(0), h);
        ctx.closePath();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(px(maxIdx), py(max), 1.8, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }

    window.showResultsWarning = function (msg) {
        parkCategorySelect();
        const container = document.getElementById('results-content');
        container.innerHTML = `<div class="results-warning">${esc(msg)}</div>`;
        if (window.openResultsPanel) window.openResultsPanel();
    };

    window.displayStatusReport = function (rpt) {
        const reportContent = document.getElementById('report-content');
        const reportHint = document.getElementById('report-hint');
        const reportToolbar = document.getElementById('report-toolbar');
        const sectionSelect = document.getElementById('report-section-select');
        const copyBtn = document.getElementById('btn-copy-report');
        const downloadBtn = document.getElementById('btn-download-report');

        if (!reportContent) return;

        if (!rpt || !String(rpt).trim()) {
            if (reportHint) reportHint.classList.remove('hidden');
            if (reportToolbar) reportToolbar.classList.add('hidden');
            reportContent.classList.add('hidden');
            reportContent.innerHTML = '';
            return;
        }

        if (reportHint) reportHint.classList.add('hidden');
        if (reportToolbar) reportToolbar.classList.remove('hidden');
        reportContent.classList.remove('hidden');

        const lines = String(rpt).split('\n');
        const htmlLines = [];
        const sections = [];

        const isDivider = (str) => /^\s*[*=\-]{4,}\s*$/.test(str);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const prevLine = i > 0 ? lines[i - 1] : '';
            const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
            const isText = line.trim().length > 0 && !isDivider(line);

            // Detect section headers (surrounded by asterisks/dashes or preceded by blank/divider and underlined by dashes/asterisks)
            const isBoxedHeader = isText && isDivider(prevLine) && isDivider(nextLine);
            const isUnderlinedHeader = isText && (prevLine.trim() === '' || isDivider(prevLine)) && isDivider(nextLine) && line.trim().length > 3;

            if (isBoxedHeader || isUnderlinedHeader) {
                const title = line.trim().replace(/^[*=\-\s]+|[*=\-\s]+$/g, '');
                
                // Exclude engine header banners, table column unit headers, and explanatory notes
                const isEngineBanner = /OPENSWMM\s+ENGINE|VERSION/i.test(title);
                const hasMultipleUnits = (title.match(/\b(mm|cm|m|m3|ft|in|ltr|gal|sec|min|hr|days|CMS|CFS|GPM|MGD|Pcnt|Percent|hr:min|Meters|Full|Loss)\b/gi) || []).length >= 2;
                const isNote = /^(Flooding|Note|Units|Warning|Error refers)/i.test(title);

                if (title && title.length > 2 && !isEngineBanner && !hasMultipleUnits && !isNote) {
                    const secId = 'rpt-sec-' + sections.length;
                    sections.push({ id: secId, title: title });
                    htmlLines.push(`<span id="${secId}" class="report-section-header">${esc(line)}</span>`);
                    continue;
                }
            }
            htmlLines.push(esc(line));
        }

        reportContent.innerHTML = htmlLines.join('\n');

        // Populate section navigation dropdown
        if (sectionSelect) {
            sectionSelect.innerHTML = '';
            const defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = sections.length > 0 ? '-- Jump to section --' : '(Entire Report)';
            sectionSelect.appendChild(defaultOpt);

            sections.forEach(sec => {
                const opt = document.createElement('option');
                opt.value = sec.id;
                opt.textContent = sec.title;
                sectionSelect.appendChild(opt);
            });

            sectionSelect.onchange = () => {
                const targetId = sectionSelect.value;
                if (!targetId) return;
                const targetEl = document.getElementById(targetId);
                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            };
        }

        // Copy button handler
        if (copyBtn) {
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(String(rpt)).then(() => {
                    const origText = copyBtn.textContent;
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => { copyBtn.textContent = origText; }, 1500);
                }).catch(err => {
                    console.warn('Failed to copy report:', err);
                });
            };
        }

        // Download button handler
        if (downloadBtn) {
            downloadBtn.onclick = () => {
                const blob = new Blob([String(rpt)], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'SWMM_Status_Report.rpt';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            };
        }

        // Show badge on Report tab if it is not currently active
        const reportTab = document.querySelector('.panel-tab[data-tab="report"]');
        const reportBadge = document.getElementById('report-badge');
        if (reportTab && reportBadge && !reportTab.classList.contains('active')) {
            reportBadge.classList.remove('hidden');
        }
    };

    window.clearResults = function () {
        ResultStyling.clear();
        if (window.set2DResultLayerMode) window.set2DResultLayerMode(false);
        if (sparkObserver) sparkObserver.disconnect();
        const select = parkCategorySelect();
        if (select) select.classList.add('hidden');
        const container = document.getElementById('results-content');
        if (container) container.innerHTML = '';
        const hint = document.getElementById('results-hint');
        if (hint) hint.classList.remove('hidden');
        window.App.lastRunReport = null;
        window.App.outData = null;
        window.App.results2D = null;
        window.App.resultFrame2D = null;
        if (window.displayStatusReport) window.displayStatusReport(null);
    };

    window.displayResults = function (rpt, outData) {
        const container = document.getElementById('results-content');
        const hint = document.getElementById('results-hint');
        const select = parkCategorySelect();

        if (hint) hint.classList.add('hidden');
        container.innerHTML = '';

        // split the report ONCE; every parser works on the same lines array
        const rptLines = rpt.split('\n');
        const errors = parseEngineErrors(rptLines);
        const depths = parseNodeDepths(rptLines);
        const flows = parseLinkFlows(rptLines);
        const contErrors = parseContinuityErrors(rpt);
        
        const summaryData = {
            'Node Depth': depths,
            'Link Flow': flows,
            'Node Inflow': parseNodeInflows(rptLines),
            'Node Flooding': parseFlooding(rptLines),
            'Outfall Loading': parseOutfallLoadings(rptLines),
            'Conduit Surcharge': parseConduitSurcharges(rptLines),
            'Subcatchment Runoff': parseSubcatchmentRunoffs(rptLines),
            'Flow Classification': parseFlowClassifications(rptLines)
        };

        const isUS = Net.units === 'US';
        const depthUnit = isUS ? 'ft' : 'm';
        const flowUnit  = isUS ? 'CFS' : 'LPS';
        const areaUnit  = isUS ? 'ac'  : 'ha';
        const volUnit   = isUS ? 'Mgal': 'ML';

        // ---- color-code the map ----
        ResultStyling.clear();
        const depthVals = Object.values(depths).map(d => d.maxDepth);
        const flowVals = Object.values(flows).map(f => f.maxFlow);

        let dMin = 0, dMax = 0, fMin = 0, fMax = 0;
        if (depthVals.length) {
            ({ min: dMin, max: dMax } = arrayMinMax(depthVals));
            ResultStyling.nodeMinMax = { min: dMin, max: dMax };
            Object.entries(depths).forEach(([id, d]) => {
                const t = dMax > dMin ? (d.maxDepth - dMin) / (dMax - dMin) : 0.5;
                ResultStyling.nodeColors[id] = rampColor(t);
            });
        }

        if (flowVals.length) {
            ({ min: fMin, max: fMax } = arrayMinMax(flowVals));
            ResultStyling.linkMinMax = { min: fMin, max: fMax };
            Object.entries(flows).forEach(([id, f]) => {
                const t = fMax > fMin ? (f.maxFlow - fMin) / (fMax - fMin) : 0.5;
                ResultStyling.linkColors[id] = rampColor(t);
            });
        }

        let ts = null;
        if (outData && outData.parsed && outData.numPeriods > 0) {
            ResultStyling.outData = outData;
            ts = { times: [], nodes: {}, links: {}, nodeMax: {}, linkMax: {} };
            // SWMM epoch (1899-12-30); use UTC so historical timezone
            // offsets don't skew the wall-clock times stored in the file
            const epochUTC = Date.UTC(1899, 11, 30);
            for (let i = 0; i < outData.numPeriods; i++) {
                const t = outData.results.times[i];
                const d = new Date(epochUTC + Math.round(t * 86400000));
                const day = String(d.getUTCDate()).padStart(2, '0');
                const mon = String(d.getUTCMonth() + 1).padStart(2, '0');
                const hrs = String(d.getUTCHours()).padStart(2, '0');
                const mins = String(d.getUTCMinutes()).padStart(2, '0');
                const secs = String(d.getUTCSeconds()).padStart(2, '0');
                ts.times.push(`${mon}/${day}/${d.getUTCFullYear()} ${hrs}:${mins}:${secs}`);
            }
            outData.names.nodes.forEach((id, i) => {
                ts.nodes[id] = {
                    get depth() { delete this.depth; return this.depth = outData.getTimeSeries('NODE', i, 0); },
                    get head() { delete this.head; return this.head = outData.getTimeSeries('NODE', i, 1); },
                    get inflow() { delete this.inflow; return this.inflow = outData.getTimeSeries('NODE', i, 4); },
                    get flooding() { delete this.flooding; return this.flooding = outData.getTimeSeries('NODE', i, 5); }
                };
            });
            outData.names.links.forEach((id, i) => {
                ts.links[id] = {
                    get flow() { delete this.flow; return this.flow = outData.getTimeSeries('LINK', i, 0); },
                    get depth() { delete this.depth; return this.depth = outData.getTimeSeries('LINK', i, 1); },
                    get velocity() { delete this.velocity; return this.velocity = outData.getTimeSeries('LINK', i, 2); },
                    get capacity() { delete this.capacity; return this.capacity = outData.getTimeSeries('LINK', i, 4); }
                };
            });
        } else {
            ts = parseTimeSeries(rptLines);
        }
        
        if (ts && ts.times && ts.times.length > 0) {
            ResultStyling.timeSeries = ts;
            if (window.AnimationUI) {
                window.AnimationUI.setRange(ts.times.length);
                window.AnimationUI.show();
            }
        }

        ResultStyling.active = true;
        ResultStyling.applyToMap();
        
        // ---- category dropdown options ----
        const availableOptions = [];
        if (Object.keys(summaryData['Subcatchment Runoff']).length > 0) availableOptions.push('Subcatchment Runoff');
        if (Object.keys(summaryData['Node Depth']).length > 0) availableOptions.push('Node Depth');
        if (summaryData['Node Inflow'].length > 0) availableOptions.push('Node Inflow');
        if (summaryData['Node Flooding'].length > 0) availableOptions.push('Node Flooding');
        if (summaryData['Outfall Loading'].length > 0) availableOptions.push('Outfall Loading');
        if (Object.keys(summaryData['Link Flow']).length > 0) availableOptions.push('Link Flow');
        if (summaryData['Flow Classification'].length > 0) availableOptions.push('Flow Classification');
        if (summaryData['Conduit Surcharge'].length > 0) availableOptions.push('Conduit Surcharge');

        const hasAny = availableOptions.length > 0;
        if (select) {
            select.innerHTML = '';
            select.classList.toggle('hidden', !hasAny);
            availableOptions.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt;
                o.textContent = opt;
                select.appendChild(o);
            });
            // land on Node Depth (matches the map coloring) when present
            if (availableOptions.includes('Node Depth')) select.value = 'Node Depth';
        }

        // ---- hero card: run status, continuity chips, engine messages ----
        const worstCont = contErrors.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
        const hasErr = errors.some(e => /^ERROR/i.test(e));
        const statusCls = hasErr ? 'bad' : (errors.length || worstCont >= 10) ? 'warn' : 'ok';
        const statusTxt = hasErr ? 'Simulation finished with errors'
            : (errors.length || worstCont >= 10) ? 'Simulation finished with warnings'
            : 'Simulation complete';
        const stepsTxt = (ts && ts.times && ts.times.length) ? ` · ${ts.times.length} steps` : '';
        const CONT_LABELS = ['Runoff', 'Routing', 'Quality'];
        const chips = contErrors.map((v, i) => {
            const a = Math.abs(v);
            const cls = a < 5 ? 'ok' : a < 10 ? 'warn' : 'bad';
            const label = CONT_LABELS[i] || 'Continuity';
            return `<span class="rv-chip ${cls}" title="${label} continuity error">${label} <b>${v.toFixed(2)}%</b></span>`;
        }).join('');
        const msgs = errors.length
            ? `<details class="rv-details"><summary>${errors.length} engine message${errors.length > 1 ? 's' : ''}</summary><div class="rv-details-body">${errors.map(esc).join('<br>')}</div></details>`
            : '';
        let html = `
            <div class="rv-hero">
                <div class="rv-hero-top">
                    <span class="rv-dot ${statusCls}"></span>
                    <div>
                        <div class="rv-hero-title">${statusTxt}</div>
                        <div class="rv-hero-sub">${Object.keys(depths).length} nodes · ${Object.keys(flows).length} links${stepsTxt}</div>
                    </div>
                </div>
                ${chips ? `<div class="rv-chips">${chips}</div>` : ''}
                ${msgs}
            </div>`;

        // ---- KPI cards ----
        let peakDepth = null, peakFlow = null;
        Object.entries(depths).forEach(([id, d]) => { if (!peakDepth || d.maxDepth > peakDepth.v) peakDepth = { id, v: d.maxDepth }; });
        Object.entries(flows).forEach(([id, f]) => { if (!peakFlow || f.maxFlow > peakFlow.v) peakFlow = { id, v: f.maxFlow }; });
        const floodedCount = summaryData['Node Flooding'].length;
        const surchargedCount = summaryData['Conduit Surcharge'].length;

        const kpis = [];
        if (peakDepth) kpis.push(`<div class="rv-kpi" data-target="${esc(peakDepth.id)}" title="Zoom to ${esc(peakDepth.id)}"><div class="rv-kpi-label">Peak depth</div><div class="rv-kpi-value">${fmtVal(peakDepth.v)}<small>${esc(depthUnit)}</small></div><div class="rv-kpi-sub">◎ ${esc(peakDepth.id)}</div></div>`);
        if (peakFlow) kpis.push(`<div class="rv-kpi" data-target="${esc(peakFlow.id)}" title="Zoom to ${esc(peakFlow.id)}"><div class="rv-kpi-label">Peak flow</div><div class="rv-kpi-value">${fmtVal(peakFlow.v)}<small>${esc(flowUnit)}</small></div><div class="rv-kpi-sub">◎ ${esc(peakFlow.id)}</div></div>`);
        kpis.push(`<div class="rv-kpi ${floodedCount ? 'alert' : 'calm'}"${floodedCount ? ' data-cat="Node Flooding"' : ''}><div class="rv-kpi-label">Flooded nodes</div><div class="rv-kpi-value">${floodedCount}</div><div class="rv-kpi-sub">${floodedCount ? 'view summary' : 'none flooded'}</div></div>`);
        kpis.push(`<div class="rv-kpi ${surchargedCount ? 'alert' : 'calm'}"${surchargedCount ? ' data-cat="Conduit Surcharge"' : ''}><div class="rv-kpi-label">Surcharged</div><div class="rv-kpi-value">${surchargedCount}</div><div class="rv-kpi-sub">${surchargedCount ? 'view summary' : 'none surcharged'}</div></div>`);
        html += `<div class="rv-kpis">${kpis.join('')}</div>`;

        // ---- continuous color-ramp legends ----
        const grad = `linear-gradient(90deg, ${RAMP.join(', ')})`;
        const legendHtml = (title, unit, lo, hi) => `
            <div class="rv-legend">
                <div class="rv-legend-title"><span>${esc(title)}</span><span class="rv-legend-unit">${esc(unit)}</span></div>
                <div class="rv-legend-bar" style="background:${grad}"></div>
                <div class="rv-legend-scale"><span>${fmtVal(lo)}</span><span>${fmtVal((lo + hi) / 2)}</span><span>${fmtVal(hi)}</span></div>
            </div>`;
        if (depthVals.length) html += legendHtml('Node max water depth', depthUnit, dMin, dMax);
        if (flowVals.length) html += legendHtml('Link peak flow rate', flowUnit, fMin, fMax);

        container.innerHTML = html;

        // ---- interactive data explorer ----
        if (hasAny && select) {
            const num3 = v => Number(v).toFixed(3);
            const tsNodes = (ts && ts.nodes) || null;
            const tsLinks = (ts && ts.links) || null;
            const CATS = {
                'Node Depth': {
                    rows: Object.entries(depths).map(([id, d]) => ({ id, type: d.type, avg: d.avgDepth, max: d.maxDepth })),
                    cols: [
                        { label: 'Node', key: 'id' },
                        { label: 'Type', key: 'type', dim: true },
                        { label: `Avg (${depthUnit})`, key: 'avg', num: true, fmt: num3 },
                        { label: `Max (${depthUnit})`, key: 'max', num: true, fmt: num3, bar: true }
                    ],
                    spark: tsNodes && (id => tsNodes[id] && tsNodes[id].depth)
                },
                'Link Flow': {
                    rows: Object.entries(flows).map(([id, f]) => ({ id, type: f.type, max: f.maxFlow })),
                    cols: [
                        { label: 'Link', key: 'id' },
                        { label: 'Type', key: 'type', dim: true },
                        { label: `Peak flow (${flowUnit})`, key: 'max', num: true, fmt: num3, bar: true }
                    ],
                    spark: tsLinks && (id => tsLinks[id] && tsLinks[id].flow)
                },
                'Node Inflow': {
                    rows: summaryData['Node Inflow'],
                    cols: [
                        { label: 'Node', key: 'id' },
                        { label: 'Type', key: 'type', dim: true },
                        { label: `Max lat. (${flowUnit})`, key: 'maxLatInflow', num: true },
                        { label: `Max total (${flowUnit})`, key: 'maxTotalInflow', num: true, bar: true },
                        { label: `Lat. vol (${volUnit})`, key: 'latInflowVol', num: true },
                        { label: `Total vol (${volUnit})`, key: 'totalInflowVol', num: true },
                        { label: 'Bal. err (%)', key: 'flowBalError', num: true }
                    ],
                    spark: tsNodes && (id => tsNodes[id] && tsNodes[id].inflow)
                },
                'Node Flooding': {
                    rows: summaryData['Node Flooding'],
                    cols: [
                        { label: 'Node', key: 'id' },
                        { label: 'Hours', key: 'hoursFlooded', num: true },
                        { label: `Max rate (${flowUnit})`, key: 'maxRate', num: true, bar: true },
                        { label: `Flood vol (${volUnit})`, key: 'totalFloodVol', num: true },
                        { label: `Ponded (${volUnit})`, key: 'maxPondedVol', num: true }
                    ],
                    spark: tsNodes && (id => tsNodes[id] && tsNodes[id].flooding)
                },
                'Outfall Loading': {
                    rows: summaryData['Outfall Loading'],
                    cols: [
                        { label: 'Outfall', key: 'id' },
                        { label: 'Freq (%)', key: 'flowFreq', num: true },
                        { label: `Avg (${flowUnit})`, key: 'avgFlow', num: true },
                        { label: `Peak (${flowUnit})`, key: 'maxFlow', num: true, bar: true },
                        { label: `Vol (${volUnit})`, key: 'totalVolume', num: true }
                    ]
                },
                'Conduit Surcharge': {
                    rows: summaryData['Conduit Surcharge'],
                    cols: [
                        { label: 'Conduit', key: 'id' },
                        { label: 'Both ends (hr)', key: 'bothEnds', num: true, bar: true },
                        { label: 'Upstream (hr)', key: 'upstream', num: true },
                        { label: 'Dnstream (hr)', key: 'dnstream', num: true },
                        { label: 'Above normal (hr)', key: 'aboveNormal', num: true },
                        { label: 'Cap. limited (hr)', key: 'capacityLimited', num: true }
                    ]
                },
                'Subcatchment Runoff': {
                    rows: summaryData['Subcatchment Runoff'],
                    cols: [
                        { label: 'Subcatch', key: 'id' },
                        { label: 'Precip (mm)', key: 'totalPrecip', num: true },
                        { label: 'Runon (mm)', key: 'totalRunon', num: true },
                        { label: 'Evap (mm)', key: 'totalEvap', num: true },
                        { label: 'Infil (mm)', key: 'totalInfil', num: true },
                        { label: 'Runoff (mm)', key: 'totalRunoff', num: true, bar: true },
                        { label: `Peak (${flowUnit})`, key: 'peakRunoff', num: true },
                        { label: 'Coeff', key: 'runoffCoeff', num: true }
                    ]
                },
                'Flow Classification': {
                    rows: summaryData['Flow Classification'],
                    cols: [
                        { label: 'Conduit', key: 'id' },
                        { label: 'Up dry', key: 'upDry', num: true },
                        { label: 'Dn dry', key: 'downDry', num: true },
                        { label: 'Sub-crit', key: 'subCrit', num: true, bar: true },
                        { label: 'Sup-crit', key: 'supCrit', num: true },
                        { label: 'Up crit', key: 'upCrit', num: true },
                        { label: 'Dn crit', key: 'downCrit', num: true },
                        { label: 'Norm. ltd', key: 'normLtd', num: true }
                    ]
                }
            };

            const explorer = document.createElement('div');
            explorer.className = 'rv-explorer';
            explorer.innerHTML = `
                <div class="rv-exp-head"></div>
                <div class="rv-table-wrap"></div>
                <div class="rv-exp-foot"><span class="rv-count"></span><button class="rv-showall hidden" type="button"></button></div>`;
            const expHead = explorer.querySelector('.rv-exp-head');
            expHead.appendChild(select);
            select.classList.remove('hidden');
            const search = document.createElement('input');
            search.type = 'text';
            search.className = 'rv-search';
            search.placeholder = 'Filter ID…';
            expHead.appendChild(search);
            container.appendChild(explorer);

            const LIMIT = 50;
            const tstate = { sortKey: null, sortDir: -1, filter: '', showAll: false };
            const wrap = explorer.querySelector('.rv-table-wrap');
            const countEl = explorer.querySelector('.rv-count');
            const btnAll = explorer.querySelector('.rv-showall');

            const renderTable = () => {
                const cfg = CATS[select.value];
                if (!cfg || !cfg.rows.length) {
                    wrap.innerHTML = '<div class="rv-empty">No data in this report section.</div>';
                    countEl.textContent = '';
                    btnAll.classList.add('hidden');
                    return;
                }
                const cols = cfg.cols;
                const hasSpark = !!cfg.spark;
                const barCol = cols.find(c => c.bar);
                const sortKey = tstate.sortKey || (barCol ? barCol.key : cols[cols.length - 1].key);

                let rows = cfg.rows;
                if (tstate.filter) rows = rows.filter(r => String(r.id).toLowerCase().includes(tstate.filter));
                rows = rows.slice().sort((a, b) => {
                    const av = a[sortKey], bv = b[sortKey];
                    const an = parseFloat(av), bn = parseFloat(bv);
                    const d = (!isNaN(an) && !isNaN(bn)) ? an - bn : String(av).localeCompare(String(bv));
                    return d * tstate.sortDir;
                });

                let barMax = 0;
                if (barCol) rows.forEach(r => { const v = Math.abs(parseFloat(r[barCol.key])); if (isFinite(v) && v > barMax) barMax = v; });

                const total = rows.length;
                const shown = tstate.showAll ? rows : rows.slice(0, LIMIT);

                const ths = cols.map(c => {
                    const active = c.key === sortKey;
                    const arrow = active ? (tstate.sortDir < 0 ? ' ▾' : ' ▴') : '';
                    return `<th class="${c.num ? 'num' : ''}${active ? ' sorted' : ''}" data-key="${esc(c.key)}">${esc(c.label)}${arrow}</th>`;
                }).join('') + (hasSpark ? '<th class="rv-spark-th">Trend</th>' : '');

                const trs = shown.map(r => {
                    const tds = cols.map(c => {
                        const raw = r[c.key];
                        const disp = c.fmt ? c.fmt(raw) : String(raw);
                        if (c.bar && barMax > 0) {
                            const t = (Math.abs(parseFloat(raw)) || 0) / barMax;
                            return `<td class="num rv-bar-cell"><span class="rv-bar" style="width:${(t * 100).toFixed(1)}%;background:${rampColor(t)}"></span><span class="rv-bar-val">${esc(disp)}</span></td>`;
                        }
                        return `<td class="${c.num ? 'num' : ''}${c.dim ? ' dim' : ''}">${esc(disp)}</td>`;
                    }).join('');
                    return `<tr data-id="${esc(r.id)}">${tds}${hasSpark ? '<td class="rv-spark-td"><canvas class="rv-spark"></canvas></td>' : ''}</tr>`;
                }).join('');

                wrap.innerHTML = `<table class="rv-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;

                if (hasSpark) {
                    const observer = resetSparkObserver();
                    const bodyRows = wrap.querySelectorAll('tbody tr');
                    shown.forEach((r, i) => {
                        const canvas = bodyRows[i] && bodyRows[i].querySelector('canvas.rv-spark');
                        if (!canvas) return;
                        const values = cfg.spark(r.id);
                        if (!values || values.length < 2) { canvas.remove(); return; }
                        canvas._values = values;
                        canvas._color = (barCol && barMax > 0) ? rampColor((Math.abs(parseFloat(r[barCol.key])) || 0) / barMax) : '#0d7377';
                        observer.observe(canvas);
                    });
                }

                countEl.textContent = `${shown.length} of ${total} rows`;
                if (total > shown.length) {
                    btnAll.textContent = `Show all ${total}`;
                    btnAll.classList.remove('hidden');
                } else {
                    btnAll.classList.add('hidden');
                }
            };

            wrap.addEventListener('click', (e) => {
                const th = e.target.closest('th[data-key]');
                if (th) {
                    const key = th.dataset.key;
                    const cfg = CATS[select.value];
                    const barCol = cfg && cfg.cols.find(c => c.bar);
                    const current = tstate.sortKey || (barCol ? barCol.key : null);
                    if (key === current) {
                        tstate.sortDir *= -1;
                        tstate.sortKey = key;
                    } else {
                        const col = cfg && cfg.cols.find(c => c.key === key);
                        tstate.sortKey = key;
                        tstate.sortDir = col && col.num ? -1 : 1;
                    }
                    renderTable();
                    return;
                }
                const tr = e.target.closest('tr[data-id]');
                if (tr) flyToElement(tr.dataset.id);
            });
            wrap.addEventListener('mouseover', (e) => {
                const tr = e.target.closest('tr[data-id]');
                if (tr && !tr.contains(e.relatedTarget) && window.setElementState) window.setElementState(tr.dataset.id, { hovered: true });
            });
            wrap.addEventListener('mouseout', (e) => {
                const tr = e.target.closest('tr[data-id]');
                if (tr && !tr.contains(e.relatedTarget) && window.setElementState) window.setElementState(tr.dataset.id, { hovered: false });
            });

            let searchTimer = null;
            search.addEventListener('input', () => {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => {
                    tstate.filter = search.value.trim().toLowerCase();
                    tstate.showAll = false;
                    renderTable();
                }, 120);
            });
            btnAll.addEventListener('click', () => { tstate.showAll = true; renderTable(); });
            select.onchange = () => {
                tstate.sortKey = null;
                tstate.sortDir = -1;
                tstate.showAll = false;

                // Update active map styling variables based on category selection
                const cat = select.value;
                if (cat === 'Node Depth') {
                    ResultStyling.activeNodeVar = 'depth';
                } else if (cat === 'Node Inflow') {
                    ResultStyling.activeNodeVar = 'inflow';
                } else if (cat === 'Node Flooding') {
                    ResultStyling.activeNodeVar = 'flooding';
                } else if (cat === 'Link Flow') {
                    ResultStyling.activeLinkVar = 'flow';
                }

                // If time series exists, recalculate the min/max range for the newly selected variable
                if (ResultStyling.timeSeries) {
                    let vals = [];
                    const ts = ResultStyling.timeSeries;
                    if (['Node Depth', 'Node Inflow', 'Node Flooding'].includes(cat)) {
                        const varName = ResultStyling.activeNodeVar;
                        Object.values(ts.nodes).forEach(n => {
                            if (n[varName]) {
                                for (let i = 0; i < n[varName].length; i++) {
                                    vals.push(n[varName][i]);
                                }
                            }
                        });
                        if (vals.length) {
                            ResultStyling.nodeMinMax = arrayMinMax(vals);
                        }
                    } else if (cat === 'Link Flow') {
                        const varName = ResultStyling.activeLinkVar;
                        Object.values(ts.links).forEach(l => {
                            if (l[varName]) {
                                for (let i = 0; i < l[varName].length; i++) {
                                    vals.push(Math.abs(l[varName][i]));
                                }
                            }
                        });
                        if (vals.length) {
                            ResultStyling.linkMinMax = arrayMinMax(vals);
                        }
                    }
                    // Refresh the map rendering for the current step with the new variable
                    ResultStyling.applyToMapForStep(ResultStyling.currentStep);
                }

                renderTable();
            };

            renderTable();
        }

        // KPI interactions: zoom to the element, or jump to a report section
        container.querySelectorAll('.rv-kpi[data-target]').forEach(k => {
            k.addEventListener('click', () => flyToElement(k.dataset.target));
        });
        container.querySelectorAll('.rv-kpi[data-cat]').forEach(k => {
            k.addEventListener('click', () => {
                if (!select || !availableOptions.includes(k.dataset.cat)) return;
                select.value = k.dataset.cat;
                if (select.onchange) select.onchange();
                const exp = container.querySelector('.rv-explorer');
                if (exp) exp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        });

        const note = document.createElement('div');
        note.className = 'rv-note';
        note.textContent = hasAny
            ? 'Click a row to zoom to the element · full report in the Report tab.'
            : 'No summary tables found in the report · full report in the Report tab.';
        container.appendChild(note);

        if (window.displayStatusReport) window.displayStatusReport(rpt);
        if (window.openResultsPanel) window.openResultsPanel();
    };

    // ---------- 2D-specific results display ----------
    window.display2DResults = function (result) {
        const container = document.getElementById('results-content');
        const hint = document.getElementById('results-hint');
        const select = parkCategorySelect();

        if (hint) hint.classList.add('hidden');
        container.innerHTML = '';

        const frames = result.frames || [];
        const ids = result.triangleIds || [];
        const diag = result.diagnostics || {};
        const mb = diag.massBalance || {};
        const report = result.report || '';

        // ---- compute global min/max across all frames for the active 2D variable ----
        // Depth/velocity use a global-across-frames robust max (stable scale
        // across the animation); head keeps the true global range (its
        // gradient is the signal). See View2D.fieldScale / CONTEXT.md.
        function compute2DMinMax(varKey) {
            let min = Infinity, max = -Infinity;
            let finiteCount = 0;
            for (let f = 0; f < frames.length; f++) {
                const arr = frames[f][varKey];
                if (!arr) continue;
                for (let i = 0; i < arr.length; i++) {
                    const v = Number(arr[i]);
                    if (!Number.isFinite(v)) continue;
                    finiteCount++;
                    if (v < min) min = v;
                    if (v > max) max = v;
                }
            }
            if (!Number.isFinite(min)) min = 0;
            if (!Number.isFinite(max)) max = 0;
            return { min: min, max: Math.max(max, min + 0.001), hasFinite: finiteCount > 0 };
        }
        const scaleOf = (varKey) => (window.View2D ? window.View2D.fieldScale(frames, varKey) : compute2DMinMax(varKey));

        const depthScale = scaleOf('depth');
        const headScale = scaleOf('head');
        const velScale = scaleOf('velocity');
        const rangeMap = { depth: depthScale, head: headScale, velocity: velScale };
        const invalidFields = [];
        if (!depthScale.hasFinite) invalidFields.push('depth');
        if (!velScale.hasFinite) invalidFields.push('velocity');

        // ---- set up ResultStyling for 2D ----
        ResultStyling.clear();
        ResultStyling.active2DVar = 'depth';
        ResultStyling.mesh2DMinMax = depthScale;
        ResultStyling.mesh2DDepthScale = depthScale;
        if (window.LayerTree && window.LayerTree.applyResultsPreset) window.LayerTree.applyResultsPreset('depth');

        // Color-code mesh with last-frame depth values initially
        // Some engine builds emit a completion marker with elapsedMs=0 after
        // the real last frame. Never use that marker as the initial map field.
        const renderFrames = frames.filter(frame => frame && Number.isFinite(Number(frame.elapsedMs)) &&
            (Number(frame.elapsedMs) > 0 || frames.length === 1));
        const lastFrame = (renderFrames.length ? renderFrames : frames)[(renderFrames.length ? renderFrames : frames).length - 1];
        if (lastFrame) {
            const dMin = depthScale.min;
            const dMax = depthScale.max;
            ids.forEach((id, i) => {
                const raw = Number(lastFrame.depth && lastFrame.depth[i]);
                const val = Number.isFinite(raw) ? raw : 0;
                const t = dMax > dMin ? Math.min(1, (val - dMin) / (dMax - dMin)) : 0;
                // Absolute depth scale: cells below the mask render nothing
                // (uniform-rain film stays hidden — CONTEXT.md).
                const show = window.View2D ? window.View2D.shouldShow('depth', val, val) : (Number.isFinite(raw) && val >= 0.005);
                const color = show ? rampColor(t) : 'rgba(0,0,0,0)';
                ResultStyling.nodeColors[id] = color;
            });
        }

        // Build synthetic timeSeries so AnimationUI can drive 2D scrubbing
        const ts = { times: [], nodes: {}, links: {}, nodeMax: {}, linkMax: {} };
        for (let f = 0; f < frames.length; f++) {
            const ms = frames[f].elapsedMs || 0;
            const totalSec = Math.round(ms / 1000);
            const hrs = Math.floor(totalSec / 3600);
            const mins = Math.floor((totalSec % 3600) / 60);
            const secs = totalSec % 60;
            ts.times.push(`${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
        }

        ResultStyling.timeSeries = ts;
        ResultStyling.active = true;
        ResultStyling.applyToMap();
        if (window.Mesh2DLayers && lastFrame) window.Mesh2DLayers.onStep(frames.length - 1, lastFrame);

        if (window.AnimationUI && ts.times.length > 1) {
            window.AnimationUI.setRange(ts.times.length);
            window.AnimationUI.show();
        }

        // ---- continuity error ----
        const contErr = Number.isFinite(mb.continuityError) ? mb.continuityError : null;
        const contPct = contErr !== null ? (contErr * 100).toFixed(3) : null;
        const statusCls = (contPct !== null && Math.abs(parseFloat(contPct)) >= 10) ? 'warn' : 'ok';
        const statusTxt = 'OpenSWMM 1D–2D simulation complete';
        const chips = contPct !== null
            ? `<div class="rv-chips"><span class="rv-chip ${Math.abs(parseFloat(contPct)) < 5 ? 'ok' : Math.abs(parseFloat(contPct)) < 10 ? 'warn' : 'bad'}" title="2D surface continuity error">2D Continuity <b>${contPct}%</b></span></div>`
            : '';
        const dataWarning = invalidFields.length
            ? `<div class="results-warning">2D ${invalidFields.join(' and ')} output has no finite values; dry/invalid cells are hidden.</div>`
            : '';

        let html = `
            <div class="rv-hero">
                <div class="rv-hero-top">
                    <span class="rv-dot ${statusCls}"></span>
                    <div>
                        <div class="rv-hero-title">${statusTxt}</div>
                        <div class="rv-hero-sub">${ids.length} mesh cells · ${frames.length} result frames</div>
                    </div>
                </div>
                ${chips}
            </div>${dataWarning}`;

        // ---- KPI cards ----
        const kpis = [];
        // Peak depth across all frames
        let peakDepth = 0, peakVel = 0;
        for (const frame of frames) {
            for (let i = 0; i < ids.length; i++) {
                const depth = Number(frame.depth && frame.depth[i]);
                const velocity = Number(frame.velocity && frame.velocity[i]);
                if (Number.isFinite(depth) && depth > peakDepth) peakDepth = depth;
                if (Number.isFinite(velocity) && velocity > peakVel) peakVel = velocity;
            }
        }
        const isUS = (window.Net && Net.units === 'US');
        const depthUnit = isUS ? 'ft' : 'm';
        const velUnit = isUS ? 'ft/s' : 'm/s';

        kpis.push(`<div class="rv-kpi"><div class="rv-kpi-label">Peak 2D depth</div><div class="rv-kpi-value">${fmtVal(peakDepth, 3)}<small>${esc(depthUnit)}</small></div></div>`);
        kpis.push(`<div class="rv-kpi"><div class="rv-kpi-label">Peak 2D velocity</div><div class="rv-kpi-value">${fmtVal(peakVel, 3)}<small>${esc(velUnit)}</small></div></div>`);
        kpis.push(`<div class="rv-kpi"><div class="rv-kpi-label">Mesh cells</div><div class="rv-kpi-value">${ids.length}</div></div>`);
        kpis.push(`<div class="rv-kpi"><div class="rv-kpi-label">Time frames</div><div class="rv-kpi-value">${frames.length}</div></div>`);
        html += `<div class="rv-kpis">${kpis.join('')}</div>`;

        // ---- color ramp legend (updates with the selected variable) ----
        const grad = `linear-gradient(90deg, ${RAMP.join(', ')})`;
        const legendMeta = {
            depth: { title: '2D Water Depth', unit: depthUnit },
            head: { title: '2D Hydraulic Head', unit: depthUnit },
            velocity: { title: '2D Flow Velocity', unit: velUnit }
        };
        html += `
            <div class="rv-legend" id="results-2d-legend">
                <div class="rv-legend-title"><span id="results-2d-legend-title">${esc(legendMeta.depth.title)}</span><span class="rv-legend-unit" id="results-2d-legend-unit">${esc(depthUnit)}</span></div>
                <div class="rv-legend-bar" style="background:${grad}"></div>
                <div class="rv-legend-scale" id="results-2d-legend-scale"><span>${fmtVal(depthScale.min, 3)}</span><span>${fmtVal((depthScale.min + depthScale.max) / 2, 3)}</span><span>${fmtVal(depthScale.max, 3)}</span></div>
            </div>`;

        // ---- 2D variable selector ----
        html += `
            <div class="rv-explorer" style="margin-top:8px">
                <div class="rv-exp-head">
                    <select id="results-2d-var-select" style="flex:1">
                        <option value="depth" selected>Water Depth</option>
                        <option value="head">Hydraulic Head</option>
                        <option value="velocity">Flow Velocity</option>
                    </select>
                </div>
            </div>`;

        // ---- report text (collapsible) ----
        if (report) {
            html += `
                <details class="rv-details" style="margin-top:8px">
                    <summary>Full simulation report</summary>
                    <div class="rv-details-body"><pre style="white-space:pre-wrap;font-size:11px;max-height:300px;overflow:auto">${esc(report)}</pre></div>
                </details>`;
        }

        // ---- mass balance details ----
        if (mb.initialVolume !== undefined) {
            const mbLines = [
                `Initial storage: ${fmtVal(mb.initialVolume, 4)} m³`,
                `Final storage: ${fmtVal(mb.finalVolume, 4)} m³`,
                `Rainfall in: ${fmtVal(mb.rainfall, 4)} m³`,
                `1D→2D coupling: ${fmtVal(mb.coupling1DTo2D, 4)} m³`,
                `2D→1D coupling: ${fmtVal(mb.coupling2DTo1D, 4)} m³`,
                `Evaporation: ${fmtVal(mb.evaporation, 4)} m³`
            ].join('\n');
            html += `
                <details class="rv-details" style="margin-top:8px">
                    <summary>2D mass balance</summary>
                    <div class="rv-details-body"><pre style="white-space:pre-wrap;font-size:11px">${esc(mbLines)}</pre></div>
                </details>`;
        }

        container.innerHTML = html;

        // ---- wire up 2D variable selector ----
        const varSelect = document.getElementById('results-2d-var-select');
        if (varSelect) {
            const legendTitle = document.getElementById('results-2d-legend-title');
            const legendUnit = document.getElementById('results-2d-legend-unit');
            const legendScale = document.getElementById('results-2d-legend-scale');
            const refreshLegend = (varKey, scale) => {
                const meta = legendMeta[varKey] || legendMeta.depth;
                if (legendTitle) legendTitle.textContent = meta.title;
                if (legendUnit) legendUnit.textContent = meta.unit;
                if (legendScale) {
                    legendScale.innerHTML = `<span>${fmtVal(scale.min, 3)}</span><span>${fmtVal((scale.min + scale.max) / 2, 3)}</span><span>${fmtVal(scale.max, 3)}</span>`;
                }
            };
            varSelect.addEventListener('change', () => {
                const varKey = varSelect.value;
                ResultStyling.active2DVar = varKey;
                ResultStyling.mesh2DMinMax = rangeMap[varKey] || depthScale;
                ResultStyling._applied2D.clear(); // force full repaint
                ResultStyling.applyToMapForStep(ResultStyling.currentStep);
                refreshLegend(varKey, ResultStyling.mesh2DMinMax);
                if (window.LayerTree && window.LayerTree.applyResultsPreset) window.LayerTree.applyResultsPreset(varKey);
            });
        }

        const note = document.createElement('div');
        note.className = 'rv-note';
        note.textContent = 'Drag the timeline slider to animate 2D inundation over time.';
        container.appendChild(note);

        if (window.displayStatusReport) window.displayStatusReport(result && result.report ? result.report : '');
        if (window.openResultsPanel) window.openResultsPanel();
    };
})();
