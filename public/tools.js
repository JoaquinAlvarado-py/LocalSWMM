// tools.js — Tool state machine
// select / node placement / link drawing (with node snapping) /
// subcatchment polygons / delete

(function () {
    'use strict';

    const map = window.map;
    const App = window.App;

    const NODE_TOOL_TYPES = {
        junction: 'JUNCTION',
        outfall: 'OUTFALL',
        storage: 'STORAGE',
        divider: 'DIVIDER',
        raingage: 'RAINGAGE'
    };
    const LINK_TOOL_TYPES = {
        conduit: 'CONDUIT',
        pump: 'PUMP',
        orifice: 'ORIFICE',
        weir: 'WEIR',
        outlet: 'OUTLET'
    };
    
    // Popup for displaying simulation results on hover (lazily initialized)
    let _resultPopup = null;
    function getResultPopup() {
        if (!_resultPopup && typeof mapboxgl !== 'undefined' && mapboxgl.Popup) {
            try {
                _resultPopup = new mapboxgl.Popup({
                    closeButton: false,
                    closeOnClick: false,
                    className: 'results-popup'
                });
            } catch (e) { }
        }
        return _resultPopup;
    }

    const INTERACTIVE_LAYERS = [
        'swmm-nodes-layer', 'swmm-links-hit', 'swmm-links-layer',
        'swmm-3d-nodes', 'swmm-3d-outfalls', 'swmm-3d-conduits', 'swmm-3d-links-other',
        'swmm-subcatchments-fill', 'swmm-2d-mesh-fill'
    ];

    const Tools = {
        active: 'select',

        // link drawing state
        linkFrom: null,        // node id
        linkVertices: [],      // intermediate coords
        // polygon drawing state
        polyVertices: [],
        // node dragging state
        dragging: null,        // node id being dragged
        _dragMoved: false,
        
        // popup state
        lastHoveredFeat: null,
        lastHoveredLngLat: null,
        
        updateHoverPopup(step) {
            const popup = getResultPopup();
            if (!popup || !popup.isOpen() || !this.lastHoveredFeat || !this.lastHoveredLngLat) return;
            const feat = this.lastHoveredFeat;
            const elId = feat.properties.id;
            if (!elId) return;

            const isUS   = (typeof Net !== 'undefined') && Net.units === 'US';
            const depthU = isUS ? 'ft'  : 'm';
            const headU  = isUS ? 'ft'  : 'm';
            const flowU  = isUS ? 'CFS' : 'LPS';
            const velU   = isUS ? 'fps' : 'm/s';

            const node = (typeof Net !== 'undefined') ? Net.getNode(elId) : null;
            const link = (typeof Net !== 'undefined') ? Net.getLink(elId) : null;
            const ts = window.ResultStyling && window.ResultStyling.timeSeries;

            let html = '';
            let hasData = false;

            if (ts && (feat.source === 'swmm-nodes' || feat.source === 'swmm-3d' || node) && ts.nodes && ts.nodes[elId]) {
                const data = ts.nodes[elId];
                if (data.depth && data.depth[step] !== undefined) {
                    const depth    = data.depth[step];
                    const head     = (data.head    && data.head[step]    !== undefined) ? data.head[step]    : null;
                    const inflow   = (data.inflow  && data.inflow[step]  !== undefined) ? data.inflow[step]  : null;
                    const flooding = (data.flooding && data.flooding[step] !== undefined) ? data.flooding[step] : null;
                    const isFlooding = flooding !== null && flooding > 0.001;

                    html += `<div class="rp-header">`;
                    html += `<span class="rp-id">${elId}</span>`;
                    html += `<span class="rp-type">${(node && node.type) || feat.properties.kind || 'NODE'}</span>`;
                    if (isFlooding) html += `<span class="rp-badge rp-badge-flood">FLOODING</span>`;
                    html += `</div>`;

                    html += `<table class="rp-table">`;
                    html += `<tr><td class="rp-label">Water Depth</td><td class="rp-value">${depth.toFixed(3)}</td><td class="rp-unit">${depthU}</td></tr>`;
                    if (head !== null)
                        html += `<tr><td class="rp-label">Hyd. Head</td><td class="rp-value">${head.toFixed(3)}</td><td class="rp-unit">${headU}</td></tr>`;
                    if (inflow !== null)
                        html += `<tr><td class="rp-label">Inflow</td><td class="rp-value">${inflow.toFixed(3)}</td><td class="rp-unit">${flowU}</td></tr>`;
                    if (flooding !== null)
                        html += `<tr class="${isFlooding ? 'rp-row-warn' : ''}"><td class="rp-label">Flooding</td><td class="rp-value">${flooding.toFixed(3)}</td><td class="rp-unit">${flowU}</td></tr>`;
                    html += `</table>`;
                    hasData = true;
                }
            } else if (ts && (feat.source === 'swmm-links' || feat.source === 'swmm-3d' || link) && ts.links && ts.links[elId]) {
                const data = ts.links[elId];
                if (data.flow && data.flow[step] !== undefined) {
                    const flow     = data.flow[step];
                    const vel      = (data.velocity && data.velocity[step] !== undefined) ? data.velocity[step] : null;
                    const depth    = (data.depth    && data.depth[step]    !== undefined) ? data.depth[step]    : null;
                    const capacity = (data.capacity && data.capacity[step] !== undefined) ? data.capacity[step] : null;
                    const isSurcharged = capacity !== null && capacity >= 1.0;
                    const isNearFull   = capacity !== null && capacity >= 0.85;

                    html += `<div class="rp-header">`;
                    html += `<span class="rp-id">${elId}</span>`;
                    html += `<span class="rp-type">${(link && link.type) || feat.properties.kind || 'LINK'}</span>`;
                    if (isSurcharged) html += `<span class="rp-badge rp-badge-surcharge">SURCHARGED</span>`;
                    html += `</div>`;

                    html += `<table class="rp-table">`;
                    html += `<tr><td class="rp-label">Flow Rate</td><td class="rp-value">${flow.toFixed(3)}</td><td class="rp-unit">${flowU}</td></tr>`;
                    if (vel !== null)
                        html += `<tr><td class="rp-label">Velocity</td><td class="rp-value">${vel.toFixed(3)}</td><td class="rp-unit">${velU}</td></tr>`;
                    if (depth !== null)
                        html += `<tr><td class="rp-label">Water Depth</td><td class="rp-value">${depth.toFixed(3)}</td><td class="rp-unit">${depthU}</td></tr>`;
                    if (capacity !== null) {
                        const capPct = (capacity * 100).toFixed(1);
                        html += `<tr class="${isNearFull ? 'rp-row-warn' : ''}"><td class="rp-label">Capacity</td><td class="rp-value">${capPct}</td><td class="rp-unit">%</td></tr>`;
                    }
                    html += `</table>`;
                    hasData = true;
                }
            } else if (ts && feat.source === 'swmm-2d-mesh' && ts.nodes && ts.nodes[elId]) {
                // 2-D mesh cell results
                const data = ts.nodes[elId];
                if (data.depth && data.depth[step] !== undefined) {
                    html += `<div class="rp-header"><span class="rp-id">${elId}</span><span class="rp-type">2D CELL</span></div>`;
                    html += `<table class="rp-table">`;
                    html += `<tr><td class="rp-label">Water Depth</td><td class="rp-value">${data.depth[step].toFixed(3)}</td><td class="rp-unit">${depthU}</td></tr>`;
                    if (data.head && data.head[step] !== undefined)
                        html += `<tr><td class="rp-label">Hyd. Head</td><td class="rp-value">${data.head[step].toFixed(3)}</td><td class="rp-unit">${headU}</td></tr>`;
                    html += `</table>`;
                    hasData = true;
                }
            } else if (node) {
                const inv = Number(node.props && node.props.invertEl || 0).toFixed(2);
                const maxD = Number(node.props && node.props.maxDepth || 0).toFixed(2);
                html += `<div class="rp-header"><span class="rp-id">${elId}</span><span class="rp-type">${node.type}</span></div>`;
                html += `<table class="rp-table">`;
                html += `<tr><td class="rp-label">Invert El.</td><td class="rp-value">${inv}</td><td class="rp-unit">${depthU}</td></tr>`;
                html += `<tr><td class="rp-label">Max Depth</td><td class="rp-value">${maxD}</td><td class="rp-unit">${depthU}</td></tr>`;
                html += `</table>`;
                hasData = true;
            } else if (link) {
                html += `<div class="rp-header"><span class="rp-id">${elId}</span><span class="rp-type">${link.type}</span></div>`;
                html += `<table class="rp-table">`;
                html += `<tr><td class="rp-label">From Node</td><td class="rp-value">${link.from}</td><td class="rp-unit"></td></tr>`;
                html += `<tr><td class="rp-label">To Node</td><td class="rp-value">${link.to}</td><td class="rp-unit"></td></tr>`;
                html += `</table>`;
                hasData = true;
            }

            if (popup) {
                if (hasData) {
                    popup.setHTML(html);
                } else {
                    popup.remove();
                }
            }
        },

        setTool(name) {
            this.cancelDrawing(false);
            this.active = name;
            document.querySelectorAll('#tool-buttons .tool-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tool === name);
            });
            const sbTool = document.getElementById('sb-tool');
            if (sbTool) sbTool.textContent = name;

            const mapEl = document.getElementById('map');
            mapEl.classList.remove('cursor-crosshair', 'cursor-pointer');
            if (name in NODE_TOOL_TYPES || name in LINK_TOOL_TYPES || name === 'subcatchment') {
                mapEl.classList.add('cursor-crosshair');
            } else if (name === 'delete') {
                mapEl.classList.add('cursor-pointer');
            }

            if (name === 'subcatchment') map.doubleClickZoom.disable();
            else map.doubleClickZoom.enable();
        },

        cancelDrawing(redraw = true) {
            this.linkFrom = null;
            this.linkVertices = [];
            this.polyVertices = [];
            if (redraw) this.updateDraft(null);
        },

        // ---------- selection ----------
        select(id, additive = false) {
            if (!additive) this.clearSelection(false);
            if (App.selection.has(id) && additive) {
                App.selection.delete(id);
                window.setElementState(id, { selected: false });
            } else {
                App.selection.add(id);
                window.setElementState(id, { selected: true });
            }
            this.notifySelection();
        },

        selectAll() {
            this.clearSelection(false);
            Net.nodes.forEach(n => { App.selection.add(n.id); window.setElementState(n.id, { selected: true }); });
            Net.links.forEach(l => { App.selection.add(l.id); window.setElementState(l.id, { selected: true }); });
            Net.subcatchments.forEach(s => { App.selection.add(s.id); window.setElementState(s.id, { selected: true }); });
            this.notifySelection();
        },

        clearSelection(notify = true) {
            App.selection.forEach(id => window.setElementState(id, { selected: false }));
            App.selection.clear();
            if (notify) this.notifySelection();
        },

        notifySelection() {
            if (window.renderPropsPanel) window.renderPropsPanel();
            if (window.TimeSeriesPlot && App.selectedId) {
                window.TimeSeriesPlot.onMapElementSelected(App.selectedId);
            }
        },

        deleteSelection() {
            if (!App.selection.size) return;
            const ids = [...App.selection];
            this.clearSelection(false);
            Net.deleteElements(ids);
            this.notifySelection();
        },

        // ---------- hit-testing helpers ----------
        featureAt(point) {
            const feats = map.queryRenderedFeatures(
                [[point.x - 6, point.y - 6], [point.x + 6, point.y + 6]],
                { layers: INTERACTIVE_LAYERS.filter(l => map.getLayer(l)) }
            );
            if (!feats.length) return null;
            // prefer nodes > links > subcatchments > 2d mesh cells
            const rank = f => {
                const id = f.layer.id;
                if (id === 'swmm-nodes-layer' || id === 'swmm-3d-nodes' || id === 'swmm-3d-outfalls') return 0;
                if (id.startsWith('swmm-links') || id.startsWith('swmm-3d-')) return 1;
                if (id === 'swmm-subcatchments-fill') return 2;
                return 3;
            };
            feats.sort((a, b) => rank(a) - rank(b));
            return feats[0];
        },

        snapNodeAt(point, hydraulicOnly = true) {
            const nodeLayers = ['swmm-nodes-layer', 'swmm-3d-nodes', 'swmm-3d-outfalls'].filter(l => map.getLayer(l));
            if (!nodeLayers.length) return null;
            const feats = map.queryRenderedFeatures(
                [[point.x - 12, point.y - 12], [point.x + 12, point.y + 12]],
                { layers: nodeLayers }
            );
            for (const f of feats) {
                const node = Net.getNode(f.properties.id);
                if (node && (!hydraulicOnly || node.type !== 'RAINGAGE')) return node;
            }
            return null;
        },

        // ---------- draft (ghost) rendering ----------
        updateDraft(cursorLngLat) {
            const src = map.getSource('draft');
            if (!src) return;
            const features = [];

            if (this.linkFrom) {
                const from = Net.getNode(this.linkFrom);
                if (from) {
                    const coords = [from.lngLat, ...this.linkVertices];
                    if (cursorLngLat) coords.push(cursorLngLat);
                    if (coords.length >= 2) {
                        features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
                    }
                    coords.forEach(c => features.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } }));
                }
            }

            if (this.polyVertices.length) {
                const ring = [...this.polyVertices];
                if (cursorLngLat) ring.push(cursorLngLat);
                if (ring.length >= 3) {
                    features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } });
                } else if (ring.length === 2) {
                    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring } });
                }
                this.polyVertices.forEach(c => features.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } }));
            }

            src.setData({ type: 'FeatureCollection', features });
        },

        finishSubcatchment() {
            // dblclick fires two 'click's — drop a duplicated last vertex
            const v = this.polyVertices;
            while (v.length >= 2) {
                const a = v[v.length - 2], b = v[v.length - 1];
                if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) v.pop();
                else break;
            }
            if (v.length >= 3) {
                const sub = Net.addSubcatchment(v);
                this.cancelDrawing();
                this.select(sub.id);
            } else {
                this.cancelDrawing();
            }
        }
    };

    window.Tools = Tools;

    // Map event handlers

    map.on('click', (e) => {
        const tool = Tools.active;

        // --- node placement tools ---
        if (tool in NODE_TOOL_TYPES) {
            const coords = [e.lngLat.lng, e.lngLat.lat];
            const node = Net.addNode(NODE_TOOL_TYPES[tool], coords);
            if (window.sampleDEMElevation) {
                const sampledElev = window.sampleDEMElevation(coords);
                if (sampledElev !== null && sampledElev !== undefined) {
                    node.props.invertEl = sampledElev;
                }
            }
            Tools.select(node.id);
            return;
        }

        // --- link drawing tools ---
        if (tool in LINK_TOOL_TYPES) {
            const snapped = Tools.snapNodeAt(e.point);
            if (!Tools.linkFrom) {
                if (snapped) {
                    Tools.linkFrom = snapped.id;
                    Tools.updateDraft([e.lngLat.lng, e.lngLat.lat]);
                }
                // first click must start on a node — ignore otherwise
            } else {
                if (snapped && snapped.id !== Tools.linkFrom) {
                    const link = Net.addLink(LINK_TOOL_TYPES[tool], Tools.linkFrom, snapped.id, Tools.linkVertices);
                    Tools.cancelDrawing();
                    Tools.select(link.id);
                } else if (!snapped) {
                    // intermediate vertex
                    Tools.linkVertices.push([e.lngLat.lng, e.lngLat.lat]);
                    Tools.updateDraft([e.lngLat.lng, e.lngLat.lat]);
                }
            }
            return;
        }

        // --- subcatchment polygon tool ---
        if (tool === 'subcatchment') {
            Tools.polyVertices.push([e.lngLat.lng, e.lngLat.lat]);
            Tools.updateDraft([e.lngLat.lng, e.lngLat.lat]);
            return;
        }

        // --- delete tool ---
        if (tool === 'delete') {
            const feat = Tools.featureAt(e.point);
            if (feat) {
                Tools.clearSelection(false);
                Net.deleteElements([feat.properties.id]);
                Tools.notifySelection();
            }
            return;
        }

        // --- select tool ---
        if (tool === 'select') {
            if (Tools._dragMoved) { Tools._dragMoved = false; return; }
            const feat = Tools.featureAt(e.point);
            if (feat) {
                Tools.select(feat.properties.id, e.originalEvent.shiftKey || e.originalEvent.ctrlKey);
                // Graph path if multiple nodes are selected via ctrl/shift select
                if ((e.originalEvent.shiftKey || e.originalEvent.ctrlKey) && App.selection.size >= 2 && window.ProfilePlot) {
                    const selectedNodes = [...App.selection].filter(id => Net.getNode(id));
                    if (selectedNodes.length >= 2) {
                        window.ProfilePlot.openForNodes(selectedNodes);
                    }
                }
            } else if (!e.originalEvent.shiftKey) {
                Tools.clearSelection();
            }
        }
    });

    // ---------- Right-Click Context Menu ----------
    const contextMenuEl = document.getElementById('map-context-menu');
    let contextTargetId = null;

    function hideContextMenu() {
        if (contextMenuEl) contextMenuEl.classList.add('hidden');
        contextTargetId = null;
    }

    if (map) {
        map.on('contextmenu', (e) => {
            const feat = Tools.featureAt(e.point);
            if (!feat) { hideContextMenu(); return; }
            e.originalEvent.preventDefault();

            contextTargetId = feat.properties.id;
            Tools.select(contextTargetId, false);

            if (contextMenuEl) {
                contextMenuEl.style.left = e.point.x + 'px';
                contextMenuEl.style.top = e.point.y + 'px';
                contextMenuEl.classList.remove('hidden');
            }
        });

        map.on('click', () => hideContextMenu());
    }

    if (contextMenuEl) {
        document.getElementById('cm-section-view')?.addEventListener('click', () => {
            if (contextTargetId && window.ProfilePlot) window.ProfilePlot.openForElement(contextTargetId);
            hideContextMenu();
        });
        document.getElementById('cm-profile-from')?.addEventListener('click', () => {
            if (contextTargetId && window.ProfilePlot) window.ProfilePlot.openForNodes([contextTargetId]);
            hideContextMenu();
        });
        document.getElementById('cm-timeseries')?.addEventListener('click', () => {
            if (contextTargetId && window.TimeSeriesPlot) window.TimeSeriesPlot.onMapElementSelected(contextTargetId);
            hideContextMenu();
        });
        document.getElementById('cm-properties')?.addEventListener('click', () => {
            if (contextTargetId) {
                Tools.select(contextTargetId, false);
                if (window.renderPropsPanel) window.renderPropsPanel();
            }
            hideContextMenu();
        });
        document.getElementById('cm-delete')?.addEventListener('click', () => {
            if (contextTargetId) {
                Net.deleteElements([contextTargetId]);
                Tools.clearSelection(false);
                Tools.notifySelection();
            }
            hideContextMenu();
        });
    }

    map.on('dblclick', (e) => {
        if (Tools.active === 'subcatchment') {
            e.preventDefault();
            // last click already added a vertex via 'click'; avoid dup of final dblclick point
            Tools.finishSubcatchment();
        }
    });

    // ---------- ghost line/polygon follows cursor + hover states ----------
    let hovered = null;
    map.on('mousemove', (e) => {
        if (Tools.linkFrom || Tools.polyVertices.length) {
            let cursor = [e.lngLat.lng, e.lngLat.lat];
            if (Tools.linkFrom) {
                const snapped = Tools.snapNodeAt(e.point);
                if (snapped) cursor = snapped.lngLat;
            }
            Tools.updateDraft(cursor);
        }

        // hover highlight (select/delete/link tools)
        if (['select', 'delete'].includes(Tools.active) || Tools.active in LINK_TOOL_TYPES) {
            let feat = null;
            if (Tools.active in LINK_TOOL_TYPES) {
                const snapped = Tools.snapNodeAt(e.point); // single lookup (was called twice)
                if (snapped) feat = { properties: { id: snapped.id }, source: 'swmm-nodes' };
            } else {
                feat = Tools.featureAt(e.point);
            }
            const newId = feat ? feat.properties.id : null;
            if (hovered && hovered !== newId) window.setElementState(hovered, { hovered: false });
            if (newId && newId !== hovered) window.setElementState(newId, { hovered: true });
            hovered = newId;
            if (Tools.active === 'select') {
                map.getCanvas().style.cursor = newId ? 'pointer' : '';
            }
            
            // Show status / result popup on hover (if enabled in Map Settings)
            const hoverAllowed = (typeof App === 'undefined') || (App.hoverStatsVisible !== false);
            if (hoverAllowed && feat && (window.ResultStyling || Net.getNode(newId) || Net.getLink(newId))) {
                const slider = document.getElementById('time-slider');
                const step = slider ? parseInt(slider.value) : 0;
                
                Tools.lastHoveredFeat = feat;
                Tools.lastHoveredLngLat = e.lngLat;
                const popup = getResultPopup();
                if (popup) popup.setLngLat(e.lngLat).addTo(map);
                Tools.updateHoverPopup(step);
            } else {
                Tools.lastHoveredFeat = null;
                Tools.lastHoveredLngLat = null;
                const popup = getResultPopup();
                if (popup) popup.remove();
            }
        } else if (hovered) {
            window.setElementState(hovered, { hovered: false });
            hovered = null;
            Tools.lastHoveredFeat = null;
            Tools.lastHoveredLngLat = null;
            const popup = getResultPopup();
            if (popup) popup.remove();
        }
    });

    // ---------- node dragging (select tool) ----------
    map.on('mousedown', (e) => {
        if (Tools.active !== 'select' || e.originalEvent.button !== 0) return;
        if (window.App && window.App.isLocked) return; // Project locked: prevent node movement
        const snapped = Tools.snapNodeAt(e.point, false);
        if (!snapped) return;
        Tools.dragging = snapped.id;
        Tools._dragMoved = false;
        const dragStartLngLat = [snapped.lngLat[0], snapped.lngLat[1]];
        map.dragPan.disable();
        map.getCanvas().style.cursor = 'grabbing';

        // rAF-throttled: mousemove only records the latest position; the
        // model is updated at most once per animation frame.
        let pendingLngLat = null;
        let rafId = null;
        const flushMove = () => {
            rafId = null;
            if (pendingLngLat && Tools.dragging) {
                Net.moveNode(Tools.dragging, pendingLngLat, false);
                pendingLngLat = null;
            }
        };
        const onMove = (ev) => {
            Tools._dragMoved = true;
            pendingLngLat = [ev.lngLat.lng, ev.lngLat.lat];
            if (!rafId) rafId = requestAnimationFrame(flushMove);
        };
        const onUp = () => {
            map.off('mousemove', onMove);
            map.off('mouseup', onUp);
            map.dragPan.enable();
            map.getCanvas().style.cursor = '';
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            if (pendingLngLat && Tools.dragging) {
                Net.moveNode(Tools.dragging, pendingLngLat, false);
                pendingLngLat = null;
            }
            if (Tools._dragMoved) {
                Net.commitMove(Tools.dragging, dragStartLngLat); // single undo step for the whole drag
                if (window.renderPropsPanel) window.renderPropsPanel();
            }
            Tools.dragging = null;
        };
        map.on('mousemove', onMove);
        map.on('mouseup', onUp);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        const target = e.target;
        const typing = target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA');

        if (e.key === 'Escape') {
            if (Tools.linkFrom || Tools.polyVertices.length) {
                Tools.cancelDrawing();
            } else {
                Tools.clearSelection();
                Tools.setTool('select');
            }
            if (typing) target.blur();
            return;
        }

        if (typing) return;

        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
            e.preventDefault(); Net.undo(); Tools.clearSelection(); return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
            e.preventDefault(); Net.redo(); Tools.clearSelection(); return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            e.preventDefault(); Tools.selectAll(); return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault(); Tools.deleteSelection(); return;
        }
        if (e.key === 'Enter' && Tools.active === 'subcatchment' && Tools.polyVertices.length >= 3) {
            Tools.finishSubcatchment(); return;
        }
    });
})();
