// app.js — Map initialization, network rendering, 3D extras,
// INP import flow, WASM simulation run.

(function () {
    'use strict';

    const DEFAULT_CENTER = [-71.254, -29.908]; // La Serena, Chile
    const DEFAULT_ZOOM = 15.2;

    if (typeof CONFIG !== 'undefined') {
        mapboxgl.accessToken = CONFIG.MAPBOX_ACCESS_TOKEN;
    } else {
        console.error('config.js missing! Mapbox features may fail.');
    }

    const MAP_STYLES = {
        streets: 'mapbox://styles/mapbox/streets-v12',
        satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
        blank: {
            version: 8,
            glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
            sources: {},
            layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f8f9fa' } }]
        }
    };

    const map = new mapboxgl.Map({
        container: 'map',
        style: MAP_STYLES.streets,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        pitch: 0,
        bearing: 0,
        antialias: true,
        boxZoom: false
    });

    window.map = map; // for street_view_overlay.js and other modules

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120 }), 'bottom-left');

    // ---------- App-wide state ----------
    window.App = {
        map: map,
        currentStyle: 'streets',
        labelsVisible: true,
        nodesVisible: true,
        linksVisible: true,
        subcatchmentsVisible: true,
        mesh2DVisible: true,
        is3D: false,
        warningsVisible: true,
        selection: new Set(),      // selected element ids
        masterPlan: null,          // geojson reference overlay
        importedLayers: window.Net.importedLayers || [],
        lastRunReport: null
    };

    // ---------- SWMM element colors (EPA SWMM-like conventions) ----------
    const NODE_COLORS = {
        JUNCTION: '#1565c0',
        OUTFALL: '#2e7d32',
        STORAGE: '#6a1b9a',
        DIVIDER: '#ef6c00',
        RAINGAGE: '#00838f'
    };
    const LINK_COLORS = {
        CONDUIT: '#455a64',
        PUMP: '#c62828',
        WEIR: '#ad1457',
        ORIFICE: '#4527a0',
        OUTLET: '#00695c'
    };
    window.SWMM_COLORS = { NODE_COLORS, LINK_COLORS };

    const nodeColorExpr = ['match', ['get', 'type'],
        'OUTFALL', NODE_COLORS.OUTFALL,
        'STORAGE', NODE_COLORS.STORAGE,
        'DIVIDER', NODE_COLORS.DIVIDER,
        'RAINGAGE', NODE_COLORS.RAINGAGE,
        NODE_COLORS.JUNCTION];

    const linkColorExpr = ['match', ['get', 'type'],
        'PUMP', LINK_COLORS.PUMP,
        'WEIR', LINK_COLORS.WEIR,
        'ORIFICE', LINK_COLORS.ORIFICE,
        'OUTLET', LINK_COLORS.OUTLET,
        LINK_COLORS.CONDUIT];

    const selectedCase = (sel, hov, base) => ['case',
        ['boolean', ['feature-state', 'selected'], false], sel,
        ['boolean', ['feature-state', 'hovered'], false], hov,
        base];

    // simulation results override element colors when present
    const resultOr = (base) => ['case',
        ['!=', ['feature-state', 'resultColor'], null], ['feature-state', 'resultColor'],
        base];

    // ---------- Network layers ----------
    function ensureNetworkLayers() {
        // Draft (in-progress drawing) source
        if (!map.getSource('draft')) {
            map.addSource('draft', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        }

        if (!map.getSource('swmm-2d-mesh')) {
            map.addSource('swmm-2d-mesh', { type: 'geojson', promoteId: 'id', data: Net.mesh2DGeoJSON() });
            map.addLayer({
                id: 'swmm-2d-mesh-fill',
                type: 'fill',
                source: 'swmm-2d-mesh',
                paint: {
                    'fill-color': resultOr('#90caf9'),
                    'fill-opacity': selectedCase(0.7, 0.6, 0.4)
                }
            });
            map.addLayer({
                id: 'swmm-2d-mesh-line',
                type: 'line',
                source: 'swmm-2d-mesh',
                paint: {
                    'line-color': '#1565c0',
                    'line-width': 1,
                    'line-opacity': 0.5
                }
            });
        }

        if (window.LayerTree && window.LayerTree.refresh) window.LayerTree.refresh();

        if (!map.getSource('swmm-subcatchments')) {
            map.addSource('swmm-subcatchments', { type: 'geojson', promoteId: 'id', data: Net.subcatchmentsGeoJSON() });
            map.addLayer({
                id: 'swmm-subcatchments-fill',
                type: 'fill',
                source: 'swmm-subcatchments',
                paint: {
                    'fill-color': '#66bb6a',
                    'fill-opacity': selectedCase(0.55, 0.45, 0.3)
                }
            });
            map.addLayer({
                id: 'swmm-subcatchments-line',
                type: 'line',
                source: 'swmm-subcatchments',
                paint: {
                    'line-color': '#2e7d32',
                    'line-width': selectedCase(3, 2.5, 1.5),
                    'line-dasharray': [4, 2]
                }
            });
        }

        if (!map.getSource('swmm-links')) {
            map.addSource('swmm-links', { type: 'geojson', promoteId: 'id', data: Net.linksGeoJSON() });
            // wide invisible hit area for easier clicking
            map.addLayer({
                id: 'swmm-links-hit',
                type: 'line',
                source: 'swmm-links',
                paint: { 'line-color': '#000', 'line-opacity': 0.001, 'line-width': 14 }
            });
            map.addLayer({
                id: 'swmm-links-layer',
                type: 'line',
                source: 'swmm-links',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': selectedCase('#ffab00', '#42a5f5', resultOr(linkColorExpr)),
                    'line-width': selectedCase(5, 4.5, 3)
                }
            });
            // flow-direction arrows
            map.addLayer({
                id: 'swmm-links-arrows',
                type: 'symbol',
                source: 'swmm-links',
                layout: {
                    'symbol-placement': 'line',
                    'symbol-spacing': 80,
                    'text-field': '>',
                    'text-size': 12,
                    'text-keep-upright': false,
                    'text-allow-overlap': true,
                    'text-rotation-alignment': 'map'
                },
                paint: { 'text-color': selectedCase('#ffab00', '#42a5f5', resultOr(linkColorExpr)) }
            });
        }

        if (!map.getSource('swmm-nodes')) {
            map.addSource('swmm-nodes', { type: 'geojson', promoteId: 'id', data: Net.nodesGeoJSON() });
            map.addLayer({
                id: 'swmm-nodes-layer',
                type: 'circle',
                source: 'swmm-nodes',
                paint: {
                    'circle-radius': selectedCase(9, 8, 6),
                    'circle-color': resultOr(nodeColorExpr),
                    'circle-stroke-width': selectedCase(3, 2.5, 1.5),
                    'circle-stroke-color': selectedCase('#ffab00', '#90caf9', '#ffffff')
                }
            });
            map.addLayer({
                id: 'swmm-nodes-labels',
                type: 'symbol',
                source: 'swmm-nodes',
                minzoom: 14,
                layout: {
                    'text-field': ['get', 'id'],
                    'text-size': 10,
                    'text-offset': [0, 1.3],
                    'text-anchor': 'top',
                    'text-optional': true
                },
                paint: {
                    'text-color': '#1f2933',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 1.5
                }
            });
        }

        // Draft layers on top
        if (!map.getLayer('draft-line')) {
            map.addLayer({
                id: 'draft-line',
                type: 'line',
                source: 'draft',
                filter: ['==', ['geometry-type'], 'LineString'],
                paint: { 'line-color': '#1565c0', 'line-width': 2.5, 'line-dasharray': [2, 2] }
            });
            map.addLayer({
                id: 'draft-fill',
                type: 'fill',
                source: 'draft',
                filter: ['==', ['geometry-type'], 'Polygon'],
                paint: { 'fill-color': '#1565c0', 'fill-opacity': 0.15 }
            });
            map.addLayer({
                id: 'draft-points',
                type: 'circle',
                source: 'draft',
                filter: ['==', ['geometry-type'], 'Point'],
                paint: {
                    'circle-radius': 4, 'circle-color': '#1565c0',
                    'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff'
                }
            });
        }

        // Master plan overlay
        if (window.App.masterPlan && !map.getSource('master-plan')) {
            addMasterPlanLayers(window.App.masterPlan);
        }
        (window.App.importedLayers || []).forEach(addConstraintLayer);

        applyResultStylingIfAny();
    }

    function refreshNetworkData() {
        const nodesSrc = map.getSource('swmm-nodes');
        if (!nodesSrc) return;
        nodesSrc.setData(Net.nodesGeoJSON());
        map.getSource('swmm-links').setData(Net.linksGeoJSON());
        map.getSource('swmm-subcatchments').setData(Net.subcatchmentsGeoJSON());
        const meshSrc = map.getSource('swmm-2d-mesh');
        if (meshSrc) meshSrc.setData(Net.mesh2DGeoJSON());
        const constraintNames = new Set((window.App.importedLayers || []).map(l => 'constraint-' + l.name));
        const staleConstraints = new Set();
        ((map.getStyle() && map.getStyle().layers) || []).filter(l => l.id.indexOf('constraint-') === 0 && !constraintNames.has(l.id.replace(/-(line|fill|point)$/, ''))).forEach(l => { staleConstraints.add(l.id.replace(/-(line|fill|point)$/, '')); if (map.getLayer(l.id)) map.removeLayer(l.id); });
        staleConstraints.forEach(id => { if (map.getSource(id)) map.removeSource(id); });
        (window.App.importedLayers || []).forEach(addConstraintLayer);
        if (window.LayerTree && window.LayerTree.refresh) window.LayerTree.refresh();
        // restore selection feature-state
        window.App.selection.forEach(id => setElementState(id, { selected: true }));
    }
    window.refreshNetworkData = refreshNetworkData;

    // Incremental refresh for node moves: Net patches its cached GeoJSON in
    // place, so we only re-send the nodes + links sources (subcatchments and
    // mesh are untouched by a move). Throttled to one setData per rAF so
    // dragging costs at most ~60 updates/s regardless of mousemove rate.
    let moveRefreshQueued = false;
    function refreshNetworkDataForMove() {
        if (moveRefreshQueued) return;
        moveRefreshQueued = true;
        requestAnimationFrame(() => {
            moveRefreshQueued = false;
            const nodesSrc = map.getSource('swmm-nodes');
            if (!nodesSrc) return;
            nodesSrc.setData(Net.nodesGeoJSON());
            map.getSource('swmm-links').setData(Net.linksGeoJSON());
        });
    }

    function sourceForId(id) {
        if (Net.getNode(id)) return 'swmm-nodes';
        if (Net.getLink(id)) return 'swmm-links';
        if (Net.getSubcatchment(id)) return 'swmm-subcatchments';
        if (Net._meshCell(id)) return 'swmm-2d-mesh';
        return null;
    }

    function setElementState(id, state) {
        const src = sourceForId(id);
        if (!src || !map.getSource(src)) return;
        try { map.setFeatureState({ source: src, id: id }, state); } catch (e) { /* source not ready */ }
    }
    window.setElementState = setElementState;

    // ---------- Master plan overlay ----------
    function addMasterPlanLayers(geojson) {
        map.addSource('master-plan', { type: 'geojson', data: geojson });
        map.addLayer({
            id: 'master-plan-fill', type: 'fill', source: 'master-plan',
            filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
            paint: { 'fill-color': '#9e9e9e', 'fill-opacity': 0.15 }
        }, 'swmm-subcatchments-fill');
        map.addLayer({
            id: 'master-plan-line', type: 'line', source: 'master-plan',
            filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'MultiLineString'],
                     ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
            paint: { 'line-color': '#757575', 'line-width': 1.2, 'line-opacity': 0.7 }
        }, 'swmm-subcatchments-fill');
        map.addLayer({
            id: 'master-plan-points', type: 'circle', source: 'master-plan',
            filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
            paint: { 'circle-radius': 3, 'circle-color': '#757575', 'circle-opacity': 0.7 }
        }, 'swmm-subcatchments-fill');
    }

    function addConstraintLayer(layer) {
        if (!layer || !layer.name || !layer.geojson || map.getSource('constraint-' + layer.name)) return;
        var id = 'constraint-' + layer.name;
        map.addSource(id, { type: 'geojson', data: layer.geojson });
        map.addLayer({ id: id + '-line', type: 'line', source: id, paint: { 'line-color': '#6b7280', 'line-width': 1.5, 'line-opacity': 0.65 } }, 'swmm-subcatchments-fill');
        map.addLayer({ id: id + '-fill', type: 'fill', source: id, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#9ca3af', 'fill-opacity': 0.08 } }, 'swmm-subcatchments-fill');
        map.addLayer({ id: id + '-point', type: 'circle', source: id, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': '#6b7280', 'circle-radius': 3, 'circle-opacity': 0.75 } }, 'swmm-subcatchments-fill');
    }
    window.addConstraintLayer = addConstraintLayer;

    window.setMasterPlan = function (geojson) {
        window.App.masterPlan = geojson;
        ['master-plan-fill', 'master-plan-line', 'master-plan-points'].forEach(l => {
            if (map.getLayer(l)) map.removeLayer(l);
        });
        if (map.getSource('master-plan')) map.removeSource('master-plan');
        if (geojson) addMasterPlanLayers(geojson);
    };

    // ---------- 3D extras (terrain + buildings) ----------
    function apply3D() {
        if (window.App.is3D) {
            if (window.App.currentStyle !== 'blank') {
                if (!map.getSource('terrain-dem')) {
                    map.addSource('terrain-dem', {
                        type: 'raster-dem',
                        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
                        tileSize: 512, maxzoom: 14
                    });
                }
                map.setTerrain({ source: 'terrain-dem', exaggeration: 1.3 });
                add3DBuildings();
            }
            if (map.getPitch() < 30) map.easeTo({ pitch: 55, duration: 800 });
        } else {
            map.setTerrain(null);
            if (map.getLayer('3d-buildings-base')) map.setLayoutProperty('3d-buildings-base', 'visibility', 'none');
            map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
        }
        if (window.LayerTree && window.LayerTree.refresh) window.LayerTree.refresh();
    }
    window.apply3D = apply3D;

    function toggleLandCoverLayer(visible) {
        if (!map) return;
        const layerId = 'mapbox-landcover-layer';

        if (visible) {
            if (!map.getLayer(layerId)) {
                let beforeId = null;
                const layers = map.getStyle().layers || [];
                for (const l of layers) {
                    if (l.id.startsWith('swmm-') || l.id.startsWith('node-') || l.id.startsWith('link-') || l.id.startsWith('subcatchment-')) {
                        beforeId = l.id;
                        break;
                    }
                }
                map.addLayer({
                    id: layerId,
                    type: 'fill',
                    source: 'composite',
                    'source-layer': 'landuse',
                    paint: {
                        'fill-color': [
                            'match', ['get', 'class'],
                            'wood', '#006400',
                            'agriculture', '#f0d66d',
                            'grass', '#8fbc5a',
                            'scrub', '#b1a46f',
                            'park', '#72b05a',
                            'school', '#d9c7a7',
                            'hospital', '#e8b4b8',
                            'industrial', '#b7a9a1',
                            '#a8bf8c'
                        ],
                        'fill-opacity': 0.72,
                        'fill-outline-color': 'rgba(70, 90, 55, 0.35)'
                    }
                }, beforeId);
            } else {
                map.setLayoutProperty(layerId, 'visibility', 'visible');
            }
        } else if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', 'none');
        }
    }
    window.toggleLandCoverLayer = toggleLandCoverLayer;

    // ---------- DEM Terrain Sampling Functions ----------
    window.sampleDEMElevationAsync = async function (lngLat) {
        if (window.App && window.App.mesh2DTerrainSampler && window.App.mesh2DTerrainSampler.sampleLngLat) {
            const sampled = window.App.mesh2DTerrainSampler.sampleLngLat(lngLat);
            if (Number.isFinite(sampled)) return sampled;
        }
        if (!map) return null;
        const demSelect = document.getElementById('dem-source-select');
        const apiKeyInput = document.getElementById('opentopo-api-key');
        const demSource = demSelect ? demSelect.value : 'MAPBOX';
        const apiKey = (apiKeyInput && apiKeyInput.value.trim()) || (window.CONFIG && window.CONFIG.OPENTOPOGRAPHY_API_KEY) || '';

        // Try OpenTopography API if selected
        if (demSource !== 'MAPBOX' && window.LandCoverModule) {
            try {
                const url = window.LandCoverModule.getOpenTopographyPointUrl(lngLat[1], lngLat[0], demSource, apiKey);
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.resource && data.resource.length > 0 && data.resource[0].elevation !== undefined) {
                        const val = parseFloat(data.resource[0].elevation);
                        if (!isNaN(val)) return Math.round(val * 100) / 100;
                    }
                } else if (res.status === 401 || res.status === 400) {
                    console.warn(`OpenTopography API returned HTTP ${res.status}. Check API Key.`);
                }
            } catch (err) {
                console.warn('OpenTopography DEM fetch failed, falling back to Mapbox DEM', err);
            }
        }

        // Fallback or default to Mapbox DEM
        try {
            if (!map.getSource('terrain-dem')) {
                map.addSource('terrain-dem', {
                    type: 'raster-dem',
                    url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
                    tileSize: 512, maxzoom: 14
                });
            }
            let terrainWasSet = !!map.getTerrain();
            if (!terrainWasSet) {
                map.setTerrain({ source: 'terrain-dem', exaggeration: 1.0 });
            }

            let elev = null;
            if (typeof map.queryTerrainElevation === 'function') {
                elev = map.queryTerrainElevation(lngLat);
            }

            if (!terrainWasSet && !window.App.is3D) {
                map.setTerrain(null);
            }

            if (elev !== null && elev !== undefined) {
                return Math.round(elev * 100) / 100;
            }
        } catch (e) { }
        return null;
    };

    window.sampleDEMElevation = function (lngLat) {
        if (!map) return null;
        try {
            if (!map.getSource('terrain-dem')) {
                map.addSource('terrain-dem', {
                    type: 'raster-dem',
                    url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
                    tileSize: 512, maxzoom: 14
                });
            }
            let terrainWasSet = !!map.getTerrain();
            if (!terrainWasSet) {
                map.setTerrain({ source: 'terrain-dem', exaggeration: 1.0 });
            }
            const elev = typeof map.queryTerrainElevation === 'function' ? map.queryTerrainElevation(lngLat) : null;
            if (!terrainWasSet && !window.App.is3D) {
                map.setTerrain(null);
            }
            if (elev !== null && elev !== undefined) {
                return Math.round(elev * 100) / 100;
            }
        } catch (e) { }
        return null;
    };

    window.sampleAllNodesDEM = async function () {
        if (Net.nodes.length === 0) {
            window.showResultsWarning('No nodes in the network to sample.');
            return;
        }
        let count = 0;
        window.showResultsWarning('Sampling DEM elevations for all nodes...');
        for (const node of Net.nodes) {
            const elev = await window.sampleDEMElevationAsync(node.lngLat);
            if (elev !== null) {
                node.props.invertEl = elev;
                count++;
            }
        }
        if (count > 0) {
            window.refreshNetworkData();
            if (window.renderProperties) window.renderProperties();
            window.showResultsWarning(`Successfully sampled DEM elevation for ${count} nodes.`);
        } else {
            window.showResultsWarning('DEM elevation unavailable. Check your OpenTopography API Key or click 3D View.');
        }
    };

    function add3DBuildings() {
        if (map.getLayer('3d-buildings-base')) {
            map.setLayoutProperty('3d-buildings-base', 'visibility', 'visible');
            return;
        }
        if (!map.getSource('composite')) return;
        const layers = map.getStyle().layers;
        let labelLayerId = null;
        for (const l of layers) {
            if (l.type === 'symbol' && l.layout && l.layout['text-field']) { labelLayerId = l.id; break; }
        }
        map.addLayer({
            id: '3d-buildings-base',
            source: 'composite',
            'source-layer': 'building',
            filter: ['==', 'extrude', 'true'],
            type: 'fill-extrusion',
            minzoom: 14,
            paint: {
                'fill-extrusion-color': '#e2e8f0',
                'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 15],
                'fill-extrusion-opacity': 0.75
            }
        }, labelLayerId);
    }

    // ---------- Labels toggle ----------
    function applyLabelsVisibility() {
        const vis = window.App.labelsVisible ? 'visible' : 'none';
        map.getStyle().layers.forEach(l => {
            if (l.type === 'symbol' && l.id !== 'swmm-nodes-labels' && l.id !== 'swmm-links-arrows') {
                try { map.setLayoutProperty(l.id, 'visibility', vis); } catch (e) { }
            }
        });
        applyNodesVisibility();
        applyLinksVisibility();
    }
    window.applyLabelsVisibility = applyLabelsVisibility;

    // ---------- Network visibility toggles ----------
    function applyLayerVisibility(layerId, isVisible) {
        if (!map.getLayer(layerId)) return;
        try { map.setLayoutProperty(layerId, 'visibility', isVisible ? 'visible' : 'none'); } catch (e) { }
    }

    function applyNodesVisibility() {
        applyLayerVisibility('swmm-nodes-layer', window.App.nodesVisible);
        applyLayerVisibility('swmm-nodes-labels', window.App.nodesVisible && window.App.labelsVisible);
    }
    window.applyNodesVisibility = applyNodesVisibility;

    function applyLinksVisibility() {
        applyLayerVisibility('swmm-links-layer', window.App.linksVisible);
        applyLayerVisibility('swmm-links-arrows', window.App.linksVisible && window.App.labelsVisible);
        applyLayerVisibility('swmm-links-hit', window.App.linksVisible);
    }
    window.applyLinksVisibility = applyLinksVisibility;

    function applySubcatchmentsVisibility() {
        applyLayerVisibility('swmm-subcatchments-fill', window.App.subcatchmentsVisible);
        applyLayerVisibility('swmm-subcatchments-line', window.App.subcatchmentsVisible);
    }
    window.applySubcatchmentsVisibility = applySubcatchmentsVisibility;

    function applyMesh2DVisibility() {
        applyLayerVisibility('swmm-2d-mesh-fill', window.App.mesh2DVisible);
        applyLayerVisibility('swmm-2d-mesh-line', window.App.mesh2DVisible);
    }
    window.applyMesh2DVisibility = applyMesh2DVisibility;

    // ---------- Style switching ----------
    window.setMapStyle = function (styleKey) {
        window.App.currentStyle = styleKey;
        map.setStyle(MAP_STYLES[styleKey]);
        // network layers re-added on style.load
    };

    map.on('style.load', () => {
        ensureNetworkLayers();
        applyLabelsVisibility();
        applyNodesVisibility();
        applyLinksVisibility();
        applySubcatchmentsVisibility();
        apply3D();
    });

    // ---------- React to model changes ----------
    Net.onChange((net, evt) => {
        // node drags fire 'move' at mouse rate — do a cheap incremental update
        if (evt && evt.type === 'move') {
            refreshNetworkDataForMove();
        } else {
            refreshNetworkData();
        }
        if (window.updateUICounts) window.updateUICounts();
    });

    // ---------- Coordinates readout in status bar ----------
    map.on('mousemove', (e) => {
        const el = document.getElementById('sb-coords');
        if (el) el.textContent = `${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}`;
    });

    // ---------- Fit view to network ----------
    window.fitToNetwork = function () {
        const coords = Net.bounds();
        if (!coords || !coords.length) return;
        const validCoords = coords.filter(c => c && c.length >= 2 && !isNaN(c[0]) && !isNaN(c[1]));
        if (!validCoords.length) return;
        const bounds = validCoords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(validCoords[0], validCoords[0]));
        map.fitBounds(bounds, { padding: 80, duration: 1200, maxZoom: 17 });
    };

    // INP import flow (projection modal → parser → model)
    const projectionModal = document.getElementById('projection-modal');
    const utmOptions = document.getElementById('utm-options');
    const localOptions = document.getElementById('local-options');
    const epsgCodeInput = document.getElementById('epsg-code-input');

    let pendingImportModel = null; // parsed model awaiting projection choice

    document.querySelectorAll('input[name="coord-type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            utmOptions.classList.toggle('hidden', e.target.value !== 'utm');
            localOptions.classList.toggle('hidden', e.target.value !== 'local');
        });
    });

    document.getElementById('btn-cancel-proj').addEventListener('click', () => {
        projectionModal.classList.add('hidden');
        pendingImportModel = null;
    });

    document.getElementById('btn-confirm-proj').addEventListener('click', async () => {
        projectionModal.classList.add('hidden');
        if (!pendingImportModel) return;
        const coordType = document.querySelector('input[name="coord-type"]:checked').value;
        const epsgCode = epsgCodeInput.value.trim() || 'EPSG:32719';
        await applyProjectionAndLoad(pendingImportModel, coordType, epsgCode);
        pendingImportModel = null;
    });

    window.openProjectionModal = function (model) {
        pendingImportModel = model;
        projectionModal.classList.remove('hidden');
    };

    async function fetchProjDef(epsgCode) {
        if (epsgCode === 'EPSG:25832') {
            return '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs';
        }
        const code = (epsgCode || '').split(':')[1] || epsgCode;
        if (!code || !/^\d{4,6}$/.test(code)) return null;
        try {
            const res = await fetch(`https://epsg.io/${code}.proj4`);
            if (res.ok) {
                const text = await res.text();
                if (text && text.trim().startsWith('+proj=')) {
                    return text.trim();
                }
            }
        } catch (err) {
            console.warn('Failed to fetch proj4 definition', err);
        }
        return null;
    }
    window.fetchProjDef = fetchProjDef;

    function transformModelCoords(model, fn) {
        model.nodes.forEach(n => { n.lngLat = fn(n.lngLat); });
        model.links.forEach(l => { l.vertices = (l.vertices || []).map(fn); });
        model.subcatchments.forEach(s => { s.ring = s.ring.map(fn); });
        (model.mesh2D || []).forEach(m => { m.ring = (m.ring || []).map(fn); });
    }

    function normalizeLocalCoords(model) {
        // Scale/center arbitrary local coordinates near the current map view
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const scan = (c) => {
            if (c[0] < minX) minX = c[0];
            if (c[0] > maxX) maxX = c[0];
            if (c[1] < minY) minY = c[1];
            if (c[1] > maxY) maxY = c[1];
        };
        model.nodes.forEach(n => scan(n.lngLat));
        model.subcatchments.forEach(s => s.ring.forEach(scan));
        (model.mesh2D || []).forEach(m => (m.ring || []).forEach(scan));
        if (!isFinite(minX)) return;

        const center = map.getCenter();
        const rangeX = maxX - minX || 1;
        const rangeY = maxY - minY || 1;
        const scale = 0.02 / Math.max(rangeX, rangeY);
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        transformModelCoords(model, c => [
            center.lng + (c[0] - cx) * scale,
            center.lat + (c[1] - cy) * scale
        ]);
    }

    async function applyProjectionAndLoad(model, coordType, epsgCode) {
        // proj4 comes from a CDN. When it fails to load (CSP, offline, blocker)
        // projected coordinates used to fall through untransformed, dropping the
        // network thousands of km away with nothing shown to the user.
        if (coordType === 'utm' && !window.proj4) {
            alert('Cannot reproject: the proj4 library did not load.\n\n' +
                'Check that https://cdnjs.cloudflare.com is reachable and reload the page, ' +
                'or re-import using the "Local coordinates" option, which needs no external library.\n\n' +
                'Import cancelled to avoid placing the network at the wrong location.');
            return;
        }
        if (coordType === 'utm' && window.proj4) {
            const projDef = await fetchProjDef(epsgCode);
            if (projDef) proj4.defs(epsgCode, projDef);
            try {
                transformModelCoords(model, c => proj4(epsgCode, 'EPSG:4326', [c[0], c[1]]));
            } catch (e) {
                alert('Reprojection failed: ' + e.message + '\nLoading raw coordinates.');
            }
        } else if (coordType === 'local') {
            normalizeLocalCoords(model);
        }

        window.loadModelIntoNetwork(model);
    }
    window.applyProjectionAndLoad = applyProjectionAndLoad;

    // Load a parsed model (from INP / importers) into the live Network
    window.loadModelIntoNetwork = function (model, merge = false) {
        if (!merge) {
            const state = {
                title: model.title || 'Imported SWMM Project',
                units: model.units || 'SI',
                options: Object.assign({}, Net.options, model.options || {}),
                counters: {},
                nodes: model.nodes || [],
                links: model.links || [],
                subcatchments: model.subcatchments || [],
                // loadState() resets mesh2D from the state it is given, so
                // omitting this both dropped an imported [2D_CELLS] mesh and
                // wiped whatever mesh was already loaded
                mesh2D: model.mesh2D || [],
                timeseries: model.timeseries || {},
                rawSections: model.rawSections || {},
                mesh2DIndexed: model.mesh2DIndexed || null,
                importedLayers: model.importedLayers || []
            };
            Net.loadState(state, true);
            window.App.importedLayers = Net.importedLayers || [];
        } else {
            // merge: add with fresh unique ids when colliding
            // (register in the index maps as we go so findAny sees them)
            (model.nodes || []).forEach(n => {
                if (Net.findAny(n.id)) n.id = Net.nextId(n.type);
                Net.nodes.push(n);
                Net._nodeMap.set(n.id, n);
            });
            (model.links || []).forEach(l => {
                if (Net.findAny(l.id)) l.id = Net.nextId(l.type);
                Net.links.push(l);
                Net._linkMap.set(l.id, l);
            });
            (model.subcatchments || []).forEach(s => {
                if (Net.findAny(s.id)) s.id = Net.nextId('SUBCATCHMENT');
                Net.subcatchments.push(s);
                Net._subMap.set(s.id, s);
            });
            (model.importedLayers || []).forEach(layer => {
                if (!Net.importedLayers.some(l => l.name === layer.name)) Net.importedLayers.push(layer);
            });
            window.App.importedLayers = Net.importedLayers;
            (model.mesh2D || []).forEach(m => {
                if (Net.findAny(m.id)) m.id = Net.nextId('MESH2D');
                Net.mesh2D.push(m);
            });
            if (model.timeseries) {
                Net.timeseries = Object.assign({}, Net.timeseries, model.timeseries);
            }
            Net.commit();
            Net.emit('bulk');
        }
        window.clearSelection && window.clearSelection();
        setTimeout(() => window.fitToNetwork(), 100);
        setTimeout(() => window.maybeAutoLoadBellingeTif && window.maybeAutoLoadBellingeTif(), 150);
    };

    // If the loaded model sits inside the Bellinge2.tif raster extent, fetch the
    // bundled GeoTIFF and pre-select it as the 2D mesh DTM so the DEM can be
    // used immediately without hunting for the file on disk.
    window.maybeAutoLoadBellingeTif = async function () {
        try {
            if (!Net || !Net.nodes || !Net.nodes.length) return;
            if (window.App && window.App.mesh2DBellingeTif) return; // already loaded
            let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
            Net.nodes.forEach(n => {
                if (!n.lngLat) return;
                minLng = Math.min(minLng, n.lngLat[0]); maxLng = Math.max(maxLng, n.lngLat[0]);
                minLat = Math.min(minLat, n.lngLat[1]); maxLat = Math.max(maxLat, n.lngLat[1]);
            });
            // Bellinge2.tif extent (EPSG:4326), with a small tolerance margin.
            const inBellinge = minLng >= 10.20 && maxLng <= 10.43 && minLat >= 55.29 && maxLat <= 55.41;
            if (!inBellinge) return;
            const res = await fetch('./sample_models/Bellinge2.tif');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const buffer = await res.arrayBuffer();
            const tif = { name: 'Bellinge2.tif', arrayBuffer: () => Promise.resolve(buffer) };
            window.App.mesh2DBellingeTif = tif;
            window.App.mesh2DGeoTiffFile = tif;
            window.App.mesh2DGeoTiffName = 'Bellinge2.tif';
            console.info('[2D Mesh] Bellinge model detected — bundled Bellinge2.tif DEM is ready for 2D mesh generation.');
            if (window.showResultsWarning) {
                window.showResultsWarning('Bellinge model detected — the bundled Bellinge2.tif DEM is now pre-selected for 2D mesh generation. Open "Generate 2D Mesh" and press Generate.');
            }
        } catch (err) {
            console.warn('Could not auto-load bundled Bellinge2.tif:', err);
        }
    };

    // WASM simulation run
    let swmmModulePromise = null;
    function getSwmmModule() {
        if (!swmmModulePromise) {
            const factory = (typeof createModule === 'function') ? createModule : (typeof createOpenSwmm2D === 'function' ? createOpenSwmm2D : null);
            if (!factory) {
                return Promise.reject(new Error('SWMM WASM engine not found (swmm6wasm.js missing).'));
            }
            // Pass noInitialRun: true so it doesn't crash trying to call main() on load
            swmmModulePromise = factory({
                noInitialRun: true,
                print: (text) => console.log('SWMM:', text),
                printErr: (text) => console.warn('SWMM Err:', text)
            });
        }
        return swmmModulePromise;
    }

    // ---------- top middle progress bar helper (deprecated: replaced by Run Status modal) ----------
    window.showTopProgress = function () {};
    window.startSimulatedTopProgress = function () {};
    window.hideTopProgress = function () {};

    // ---------- loading overlay (parsing / simulation progress) ----------
    let loadingOverlayEl = null;
    window.showLoadingOverlay = function (title, stage) {
        if (!loadingOverlayEl) {
            loadingOverlayEl = document.createElement('div');
            loadingOverlayEl.id = 'loading-overlay';
            Object.assign(loadingOverlayEl.style, {
                position: 'fixed', inset: '0', zIndex: '9999',
                background: 'rgba(15, 23, 42, 0.55)', display: 'flex',
                alignItems: 'center', justifyContent: 'center'
            });
            loadingOverlayEl.innerHTML = `
                <div style="background:#fff;border-radius:10px;padding:22px 30px;min-width:280px;
                            box-shadow:0 10px 40px rgba(0,0,0,.3);text-align:center;font-family:inherit">
                    <div id="loading-overlay-title" style="font-weight:600;margin-bottom:10px"></div>
                    <div style="height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;margin-bottom:8px">
                        <div id="loading-overlay-bar" style="height:100%;width:10%;background:#1565c0;
                             border-radius:3px;transition:width .3s"></div>
                    </div>
                    <div id="loading-overlay-stage" style="font-size:12px;color:#64748b"></div>
                </div>`;
            document.body.appendChild(loadingOverlayEl);
        }
        loadingOverlayEl.style.display = 'flex';
        document.getElementById('loading-overlay-title').textContent = title || 'Working…';
        document.getElementById('loading-overlay-stage').textContent = stage || '';
        document.getElementById('loading-overlay-bar').style.width = '10%';
        window.showTopProgress(title || 'Working…', 10);
    };
    window.updateLoadingOverlay = function (pct, stage) {
        if (!loadingOverlayEl) return;
        if (pct != null) document.getElementById('loading-overlay-bar').style.width = Math.max(2, Math.min(100, pct)) + '%';
        if (stage) document.getElementById('loading-overlay-stage').textContent = stage;
        window.showTopProgress(stage || 'Working…', pct);
    };
    window.hideLoadingOverlay = function () {
        if (loadingOverlayEl) loadingOverlayEl.style.display = 'none';
        window.hideTopProgress(true);
    };

    // ---------- .inp parsing in a Web Worker ----------
    // Falls back to synchronous inpParser.parse() when workers are unavailable
    // (e.g. when the app is opened from file://).
    window.parseInpAsync = function (text) {
        return new Promise((resolve, reject) => {
            let worker = null;
            try {
                worker = new Worker('parseWorker.js?v=' + Date.now());
            } catch (e) {
                try { resolve(window.inpParser.parse(text)); }
                catch (err) { reject(err); }
                return;
            }
            worker.onmessage = (ev) => {
                const msg = ev.data || {};
                if (msg.type === 'progress') {
                    window.updateLoadingOverlay(msg.pct, msg.stage);
                } else if (msg.type === 'done') {
                    worker.terminate();
                    resolve(msg.model);
                } else if (msg.type === 'error') {
                    worker.terminate();
                    reject(new Error(msg.message));
                }
            };
            worker.onerror = () => {
                // worker failed to boot (CSP, file://, …) — parse on main thread
                worker.terminate();
                try { resolve(window.inpParser.parse(text)); }
                catch (err) { reject(err); }
            };
            worker.postMessage({ text });
        });
    };

    // ---------- simulation in a Web Worker ----------
    // One persistent worker: it fetches + compiles the engine binary once
    // (started at page load, below) and each run only re-instantiates it.
    // ---------- simulation in a Web Worker ----------
    // One persistent worker: it fetches + compiles the engine binary once
    // (started at page load, below) and each run only re-instantiates it.
    let simWorker = null;
    let sim2DWorker = null;
    function getSimWorker() {
        if (!simWorker) {
            simWorker = new Worker('simWorker.js?v=' + Date.now());
            simWorker.onerror = () => {
                try { simWorker.terminate(); } catch (e) { }
                simWorker = null;
            };
        }
        return simWorker;
    }

    // --- Run Status Modal Elements & Handlers ---
    const runStatusModal = document.getElementById('run-status-modal');
    const runStatusMinimized = document.getElementById('run-status-minimized');
    const simPercentLabel = document.getElementById('sim-percent-label');
    const minPercentLabel = document.getElementById('min-percent-label');
    const simPercentBar = document.getElementById('sim-percent-bar');
    const simDaysVal = document.getElementById('sim-days-val');
    const simHrsMinVal = document.getElementById('sim-hrsmin-val');

    function updateRunStatusUI(percent, days, hrsMin) {
        const pctStr = (percent || 0) + '%';
        if (simPercentLabel) simPercentLabel.textContent = pctStr;
        if (minPercentLabel) minPercentLabel.textContent = pctStr;
        if (simPercentBar) simPercentBar.style.width = pctStr;
        if (simDaysVal) simDaysVal.value = days !== undefined ? days : 0;
        if (simHrsMinVal) simHrsMinVal.value = hrsMin || '00:00';
    }

    function hideRunStatusModals() {
        if (runStatusModal) runStatusModal.classList.add('hidden');
        if (runStatusMinimized) runStatusMinimized.classList.add('hidden');
    }

    let simProgressTimer = null;

    function parseSimDurationInDays(inpText) {
        let startDateStr = '01/01/2000', startTimeStr = '00:00:00';
        let endDateStr = '01/02/2000', endTimeStr = '00:00:00';

        const lines = (inpText || '').split(/\r?\n/);
        let inOptions = false;
        for (let line of lines) {
            let clean = line.replace(/;.*$/, '').trim();
            if (clean.startsWith('[') && clean.endsWith(']')) {
                inOptions = (clean.toUpperCase() === '[OPTIONS]');
                continue;
            }
            if (inOptions && clean) {
                const parts = clean.split(/\s+/);
                const key = (parts[0] || '').toUpperCase();
                const val = parts.slice(1).join(' ');
                if (key === 'START_DATE') startDateStr = val;
                if (key === 'START_TIME') startTimeStr = val;
                if (key === 'END_DATE') endDateStr = val;
                if (key === 'END_TIME') endTimeStr = val;
            }
        }

        try {
            const startMs = Date.parse(`${startDateStr} ${startTimeStr}`);
            const endMs = Date.parse(`${endDateStr} ${endTimeStr}`);
            if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
                return (endMs - startMs) / (1000 * 60 * 60 * 24);
            }
        } catch (e) { }
        return 1.0;
    }

    function stopSimulationWorker() {
        if (simProgressTimer) {
            clearInterval(simProgressTimer);
            simProgressTimer = null;
        }
        if (simWorker) {
            try { simWorker.terminate(); } catch (e) { }
            simWorker = null;
        }
        if (sim2DWorker) {
            try { sim2DWorker.terminate(); } catch (e) { }
            sim2DWorker = null;
        }
        hideRunStatusModals();
        window.hideTopProgress(false);
        const btnRun = document.getElementById('btn-run');
        if (btnRun) {
            btnRun.disabled = false;
            btnRun.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M8 5v14l11-7z"/></svg> Run';
        }
        window.showResultsWarning('Simulation stopped by user.');
    }

    // Modal Action Bindings
    const btnStopSim = document.getElementById('btn-stop-sim');
    const btnStopMinSim = document.getElementById('btn-stop-min-sim');
    const btnMinimizeSim = document.getElementById('btn-minimize-sim');
    const btnRestoreSim = document.getElementById('btn-restore-sim');

    if (btnStopSim) btnStopSim.onclick = stopSimulationWorker;
    if (btnStopMinSim) btnStopMinSim.onclick = stopSimulationWorker;

    if (btnMinimizeSim) {
        btnMinimizeSim.onclick = () => {
            if (runStatusModal) runStatusModal.classList.add('hidden');
            if (runStatusMinimized) runStatusMinimized.classList.remove('hidden');
        };
    }
    if (btnRestoreSim) {
        btnRestoreSim.onclick = () => {
            if (runStatusMinimized) runStatusMinimized.classList.add('hidden');
            if (runStatusModal) runStatusModal.classList.remove('hidden');
        };
    }

    function estimateSimDurationMs(inpText, networkSize) {
        let startDateStr = '01/01/2000', startTimeStr = '00:00:00';
        let endDateStr = '01/02/2000', endTimeStr = '00:00:00';
        let routingStepSec = 30;

        const lines = (inpText || '').split(/\r?\n/);
        let inOptions = false;
        for (let line of lines) {
            let clean = line.replace(/;.*$/, '').trim();
            if (clean.startsWith('[') && clean.endsWith(']')) {
                inOptions = (clean.toUpperCase() === '[OPTIONS]');
                continue;
            }
            if (inOptions && clean) {
                const parts = clean.split(/\s+/);
                const key = (parts[0] || '').toUpperCase();
                const val = parts.slice(1).join(' ');
                if (key === 'START_DATE') startDateStr = val;
                if (key === 'START_TIME') startTimeStr = val;
                if (key === 'END_DATE') endDateStr = val;
                if (key === 'END_TIME') endTimeStr = val;
                if (key === 'ROUTING_STEP') {
                    const hms = val.split(':').map(Number);
                    if (hms.length === 3) {
                        routingStepSec = (hms[0] * 3600) + (hms[1] * 60) + hms[2];
                    } else {
                        const parsed = parseFloat(val);
                        if (!isNaN(parsed) && parsed > 0) routingStepSec = parsed;
                    }
                }
            }
        }

        try {
            const startMs = Date.parse(`${startDateStr} ${startTimeStr}`);
            const endMs = Date.parse(`${endDateStr} ${endTimeStr}`);
            if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
                const durationSec = (endMs - startMs) / 1000;
                const steps = durationSec / Math.max(1, routingStepSec);
                const workUnits = steps * Math.max(10, networkSize);
                const estimatedMs = Math.round((workUnits / 2200000) * 1000);
                return Math.max(1200, estimatedMs);
            }
        } catch (e) { }

        return 3500;
    }

    function run2DSimulationInWorker(inpText, triangleIds, meshFile) {
        // WebGPU 2D first (the production path), WASM worker as the fallback.
        const wantGpu = window.Net && Net.useGpu2d !== false && typeof navigator !== 'undefined' && !!navigator.gpu;
        const attempt = (workerUrl) => {
            fetch('openswmm2d.version.json')
                .then(r => r.ok ? r.json() : null)
                .then(v => { if (v) console.info('OpenSWMM 2D engine build:', v.engineDescribe || v.engineCommit, '| built', v.builtAtUtc); })
                .catch(() => { });
            return new Promise((resolve, reject) => {
                if (sim2DWorker) {
                    try { sim2DWorker.terminate(); } catch (e) { }
                }
                sim2DWorker = new Worker(workerUrl + '?v=' + Date.now());
                let stderrCount = 0;
                sim2DWorker.onmessage = event => {
                    const message = event.data || {};
                    if (message.type === 'stdout') console.log('OpenSWMM 2D:', message.text);
                    else if (message.type === 'stderr') {
                        stderrCount++;
                        if (stderrCount <= 50) {
                            console.warn('OpenSWMM 2D:', message.text);
                        } else if (stderrCount === 51) {
                            console.warn('OpenSWMM 2D: Throttling excessive console warnings (>50 messages received).');
                        }
                    }
                    else if (message.type === 'progress2d') console.debug('OpenSWMM 2D elapsed milliseconds:', message.elapsedMs);
                    else if (message.type === 'results2d') {
                        if (sim2DWorker) { sim2DWorker.terminate(); sim2DWorker = null; }
                        resolve(message);
                    } else if (message.type === 'error') {
                        if (sim2DWorker) { sim2DWorker.terminate(); sim2DWorker = null; }
                        const detail = message.detail ? `\n${message.detail}` : '';
                        const err = new Error((message.message || 'OpenSWMM 2D worker failed.') + detail);
                        err.workerMessage = message.message || '';
                        reject(err);
                    }
                };
                sim2DWorker.onerror = event => {
                    if (sim2DWorker) { sim2DWorker.terminate(); sim2DWorker = null; }
                    const missingBuild = /openswmm2d/i.test(event.message || '');
                    reject(new Error(missingBuild
                        ? 'OpenSWMM 2D WebAssembly is not built. Run npm run build:2d-wasm, then reload the application.'
                        : (event.message || 'OpenSWMM 2D worker failed to start.')));
                };
                sim2DWorker.postMessage({
                    type: 'run2d', inp: inpText, triangleIds,
                    meshFile: meshFile || null,
                    triangleVertices: Net.mesh2DIndexed ? Net.mesh2DIndexed.triangles.map(t => t.v) : null,
                    dryDepth: Net.mesh2DIndexed && Net.mesh2DIndexed.options ? Net.mesh2DIndexed.options.dryDepth : 0.001,
                    wantVertexFields: true, frameIntervalMs: 60000
                });
            });
        };
        const tryGpu = async () => {
            try {
                return await attempt('webgpu/gpu2dWorker.js');
            } catch (e) {
                if (!/WEBGPU_|VERTEX_COUPLING/.test(e.workerMessage || e.message || '')) throw e;
                console.warn('WebGPU 2D unavailable, falling back to the WASM worker:', e.message);
                return await attempt('openSwmm2dWorker.js');
            }
        };
        return wantGpu ? tryGpu() : attempt('openSwmm2dWorker.js');
    }

    function apply2DResults(result) {
        const finalFrame = result.frames && result.frames[result.frames.length - 1];
        if (!finalFrame) throw new Error('The 2D engine returned no surface result frames.');
        const ids = result.triangleIds || [];
        if (ids.length !== finalFrame.depth.length) {
            throw new Error(`2D result array length (${finalFrame.depth.length}) does not match triangle IDs count (${ids.length}).`);
        }
        ids.forEach((id, index) => {
            const cell = Net._meshCell(id);
            if (!cell) return;
            cell.props ||= {};
            const d = finalFrame.depth[index];
            const h = finalFrame.head[index];
            const v = finalFrame.velocity[index];
            cell.props.depth = Number.isFinite(d) ? d : 0;
            cell.props.head = Number.isFinite(h) ? h : 0;
            cell.props.velocity = Number.isFinite(v) ? v : 0;
        });
        window.App.results2D = result;
        window.App.resultFrame2D = result.frames.length - 1;
        if (window.refreshNetworkData) window.refreshNetworkData();
    }

    function runSimulationInWorker(inpText, targetDurationMs) {
        return new Promise((resolve, reject) => {
            let worker = null;
            try {
                worker = getSimWorker();
            } catch (e) {
                reject(e); // caller falls back to main-thread run
                return;
            }

            // Show Run Status Modal
            updateRunStatusUI(0, 0, '00:00');
            if (runStatusModal) runStatusModal.classList.remove('hidden');

            const totalDays = parseSimDurationInDays(inpText);
            const simStartTime = Date.now();

            if (simProgressTimer) clearInterval(simProgressTimer);

            simProgressTimer = setInterval(() => {
                const elapsed = Date.now() - simStartTime;
                let frac = 0;
                if (elapsed <= targetDurationMs) {
                    frac = (elapsed / targetDurationMs) * 0.95;
                } else {
                    const extra = elapsed - targetDurationMs;
                    frac = 0.95 + 0.04 * (1 - Math.exp(-extra / 8000));
                }

                let percent = Math.min(99, Math.floor(frac * 100));
                let currDaysFrac = Math.min(1.0, frac) * totalDays;
                let days = Math.floor(currDaysFrac);
                let remHoursFrac = (currDaysFrac - days) * 24;
                let hours = Math.floor(remHoursFrac);
                let minutes = Math.floor((remHoursFrac - hours) * 60);
                let hrsMinStr = String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');

                updateRunStatusUI(percent, days, hrsMinStr);
            }, 60);

            worker.onmessage = (ev) => {
                const msg = ev.data || {};
                if (msg.type === 'progress') {
                    // Ignore background worker progress if timer is running smooth
                } else if (msg.type === 'log') {
                    console.log('SWMM:', msg.text);
                } else if (msg.type === 'err') {
                    console.warn('SWMM Err:', msg.text);
                } else if (msg.type === 'done') {
                    if (simProgressTimer) { clearInterval(simProgressTimer); simProgressTimer = null; }
                    updateRunStatusUI(100, Math.floor(totalDays), '23:59');
                    setTimeout(() => hideRunStatusModals(), 250);
                    resolve({ rpt: msg.rpt, outBuffer: msg.outBuffer });
                } else if (msg.type === 'error') {
                    if (simProgressTimer) { clearInterval(simProgressTimer); simProgressTimer = null; }
                    hideRunStatusModals();
                    reject(new Error(msg.message));
                }
            };
            worker.onerror = (e) => {
                if (simProgressTimer) { clearInterval(simProgressTimer); simProgressTimer = null; }
                hideRunStatusModals();
                try { worker.terminate(); } catch (err) { }
                if (simWorker === worker) simWorker = null;
                reject(new Error(e.message || 'Simulation worker failed to start.'));
            };
            worker.postMessage({ type: 'run', inpText, targetDurationMs });
        });
    }

    // pre-warm: compile the engine while the user is still editing
    try { getSimWorker(); } catch (e) { }

    // Main-thread fallback (previous behavior) for environments without workers
    async function runSimulationOnMainThread(inpText) {
        updateRunStatusUI(0, 0, '00:00');
        if (runStatusModal) runStatusModal.classList.remove('hidden');

        const Module = await getSwmmModule();
        // let the UI paint before the synchronous run blocks the thread
        await new Promise(r => setTimeout(r, 50));

        Module.FS.writeFile('/in.inp', inpText);
        try {
            let ran = false;
            const hasEngineCreate = typeof Module._swmm_engine_create === 'function';
            if (hasEngineCreate && typeof Module.cwrap === 'function') {
                const create = Module.cwrap('swmm_engine_create', 'number', []);
                const open = Module.cwrap('swmm_engine_open', 'number', ['number', 'string', 'string', 'string', 'number']);
                const initialize = Module.cwrap('swmm_engine_initialize', 'number', ['number']);
                const start = Module.cwrap('swmm_engine_start', 'number', ['number', 'number']);
                const stride = Module.cwrap('swmm_engine_stride', 'number', ['number', 'number', 'number']);
                const end = Module.cwrap('swmm_engine_end', 'number', ['number']);
                const report = Module.cwrap('swmm_engine_report', 'number', ['number']);
                const close = Module.cwrap('swmm_engine_close', 'number', ['number']);
                const destroy = Module.cwrap('swmm_engine_destroy', null, ['number']);

                const engine = create();
                const openRes = open(engine, '/in.inp', '/rpt.rpt', '/out.out', 0);
                if (openRes !== 0) throw new Error('SWMM engine open failed with status code ' + openRes);
                initialize(engine);
                start(engine, 1);
                const elapsedPtr = Module._malloc ? Module._malloc(8) : 0;
                stride(engine, 10000000, elapsedPtr);
                if (elapsedPtr && typeof Module._free === 'function') Module._free(elapsedPtr);
                end(engine);
                report(engine);
                close(engine);
                destroy(engine);
                ran = true;
            } else if (typeof Module.callMain === 'function') {
                console.log('Running via callMain');
                Module.callMain(['/in.inp', '/rpt.rpt', '/out.out']);
                ran = true;
            } else {
                // Safely check for ccall to avoid getter aborts in newer Emscripten
                let hasCCall = false;
                try { hasCCall = typeof Module.ccall === 'function'; } catch (e) { }

                if (hasCCall && typeof Module._swmm_run === 'function') {
                    console.log('Running via ccall(swmm_run)');
                    Module.ccall('swmm_run', 'number', ['string', 'string', 'string'], ['/in.inp', '/rpt.rpt', '/out.out']);
                    ran = true;
                } else if (typeof Module.run === 'function') {
                    console.log('Running via run (fallback)');
                    Module.run(['/in.inp', '/rpt.rpt', '/out.out']);
                    ran = true;
                }
            }

            if (!ran) {
                throw new Error('No entry point found in SWMM WebAssembly module.');
            }

        } catch (e) {
            // Emscripten's exit() throws — a report may still exist
            console.warn('SWMM engine exit:', e);
        }

        let rpt = '';
        try {
            rpt = Module.FS.readFile('/rpt.rpt', { encoding: 'utf8' });
        } catch (err) {
            hideRunStatusModals();
            throw new Error('Simulation produced no report file.');
        }

        let outBuffer = null;
        try {
            const outBytes = Module.FS.readFile('/out.out');
            outBuffer = outBytes.buffer.slice(outBytes.byteOffset, outBytes.byteOffset + outBytes.byteLength);
        } catch (err) {
            console.warn('Simulation produced no binary .out file.');
        }

        hideRunStatusModals();
        return { rpt, outBuffer };
    }

    window.runSimulation = async function () {
        const btnRun = document.getElementById('btn-run');
        if (Net.nodeCount === 0) {
            window.showResultsWarning('Build a network with at least one node before running.');
            return;
        }
        if (!Net.nodes.some(n => n.type === 'OUTFALL')) {
            window.showResultsWarning('The network needs at least one outfall node.');
            return;
        }
        const has2DMesh = Net.mesh2D.length > 0;
        if (has2DMesh && (Net.units === 'US' || (Net.options && Net.options.FLOW_UNITS && ['CFS', 'GPM', 'MGD', 'IMGD', 'AFD'].includes(Net.options.FLOW_UNITS.toUpperCase())))) {
            window.showResultsWarning('2D simulation currently requires SI units (meters). Please change project units to SI in project settings before running 2D.');
            return;
        }
        const baseInpText = window.inpExporter.generateInp(Net);
        let meshInput2D = null;
        if (has2DMesh) {
            if (!window.Mesh2DInp) {
                window.showResultsWarning('The OpenSWMM 2D mesh serializer is not loaded. Reload the application and try again.');
                return;
            }
            try {
                meshInput2D = window.Mesh2DInp.buildInput(baseInpText, Net.mesh2D, map);
            } catch (error) {
                window.showResultsWarning('Cannot prepare the 2D model: ' + error.message);
                return;
            }
        }

        const inpText = meshInput2D ? meshInput2D.inp : baseInpText;
        btnRun.disabled = true;
        btnRun.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg> Running…';
        
        // Estimate run time based on simulation time steps and network size
        const networkSize = Net.nodeCount + Net.linkCount + Net.subcatchments.length;
        let targetDuration = window.App.lastSimDuration;
        if (!targetDuration) {
            targetDuration = estimateSimDurationMs(inpText, networkSize);
        }

        const simStartTime = Date.now();

        try {
            let result;
            if (has2DMesh) {
                if (runStatusModal) runStatusModal.classList.remove('hidden');
                updateRunStatusUI(5, 0, '00:00');
                result = await run2DSimulationInWorker(inpText, meshInput2D.triangleIds, meshInput2D.meshFile);
                updateRunStatusUI(100, 0, '00:00');
                apply2DResults(result);
                window.App.outData = null;
                window.App.lastRunReport = result.report || '';
                // Display full 2D results panel with animation timeline
                if (window.display2DResults) {
                    window.display2DResults(result);
                } else {
                    const continuity = result.diagnostics && result.diagnostics.massBalance
                        ? result.diagnostics.massBalance.continuityError
                        : null;
                    const suffix = Number.isFinite(continuity) ? ` Continuity error: ${(continuity * 100).toFixed(3)}%.` : '';
                    window.showResultsWarning(`OpenSWMM 1D-2D simulation complete: ${meshInput2D.triangleCount} cells, ${result.frames.length} result frames.${suffix}`);
                }
            } else {
                try {
                    // Preferred: run in a worker so the UI stays interactive
                    result = await runSimulationInWorker(inpText, targetDuration);
                } catch (workerErr) {
                    console.warn('Simulation worker unavailable, running on main thread:', workerErr);
                    result = await runSimulationOnMainThread(inpText);
                }

                const { rpt, outBuffer } = result;

                if (outBuffer && window.SWMMOutParser) {
                    const outParser = new window.SWMMOutParser(outBuffer);
                    outParser.parse();
                    window.App.outData = outParser;
                } else {
                    window.App.outData = null;
                }

                window.App.lastRunReport = rpt;
                console.log(rpt);
                window.displayResults(rpt, window.App.outData);
            }

            // Save actual duration for subsequent runs
            window.App.lastSimDuration = Date.now() - simStartTime;
        } catch (err) {
            console.error('Simulation failed:', err);
            window.showResultsWarning('Simulation failed: ' + err.message);
        } finally {
            hideRunStatusModals();
            btnRun.disabled = false;
            btnRun.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M8 5v14l11-7z"/></svg> Run';
        }
    };

    // ---------- results styling hook (results.js sets window.ResultStyling) ----------
    function applyResultStylingIfAny() {
        if (window.ResultStyling && window.ResultStyling.active) {
            window.ResultStyling.applyToMap();
        }
    }
})();
