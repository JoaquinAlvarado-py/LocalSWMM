// ui.js — Toolbar, panels, properties forms, status bar,
// map style pills, OSM search, save/load, street view wiring.

(function () {
    'use strict';

    const map = window.map;
    const App = window.App;

    // Tool buttons
    document.querySelectorAll('#tool-buttons .tool-btn').forEach(btn => {
        btn.addEventListener('click', () => Tools.setTool(btn.dataset.tool));
    });

    // Undo / redo
    document.getElementById('btn-undo').addEventListener('click', () => { Net.undo(); Tools.clearSelection(); });
    document.getElementById('btn-redo').addEventListener('click', () => { Net.redo(); Tools.clearSelection(); });

    // Save / Load / Export / Clear
    document.getElementById('btn-save').addEventListener('click', () => Net.downloadProject());

    // Load / Import dropdown
    const loadDropdown = document.querySelector('#load-menu').parentElement;
    document.getElementById('btn-load').addEventListener('click', (e) => {
        e.stopPropagation();
        loadDropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => loadDropdown.classList.remove('open'));

    // Data menu dropdown
    const dataMenuToggle = document.getElementById('btn-data-menu');
    const dataMenu = document.getElementById('data-menu');
    if (dataMenuToggle) {
        dataMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            dataMenu.parentElement.classList.toggle('open');
        });
        document.addEventListener('click', () => dataMenu.parentElement.classList.remove('open'));
    }

    // Data menu items
    document.getElementById('btn-mesh2d-menu')?.addEventListener('click', () => {
        if (window.Mesh2DDialog) window.Mesh2DDialog.open();
    });
    document.getElementById('btn-curves')?.addEventListener('click', () => {
        if (window.CurveEditor) window.CurveEditor.openEditor();
    });
    document.getElementById('btn-lid')?.addEventListener('click', () => {
        if (window.LIDControls) window.LIDControls.openEditor();
    });
    document.getElementById('btn-quality')?.addEventListener('click', () => {
        if (window.QualityEditor) window.QualityEditor.openEditor();
    });
    document.getElementById('btn-aquifer')?.addEventListener('click', () => {
        if (window.AquiferEditor) window.AquiferEditor.openEditor();
    });
    document.getElementById('btn-snowpack')?.addEventListener('click', () => {
        if (window.SnowpackEditor) window.SnowpackEditor.openEditor();
    });

    const projectInput = document.getElementById('project-file-input');
    document.getElementById('btn-load-file').addEventListener('click', () => projectInput.click());
    projectInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        projectInput.value = '';
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            if (data.type === 'FeatureCollection') {
                // plain GeoJSON → import as network / master plan
                if (!window.Importers.looksLikeLngLat(data)) {
                    window.openProjectionModalForGeoJSON(data, file.name);
                } else {
                    window.Importers.openImportAsModal(data, file.name);
                }
                return;
            }
            Net.loadState(data, true);
            window.clearResults();
            Tools.clearSelection();
            setTimeout(() => window.fitToNetwork(), 100);
        } catch (err) {
            alert('Could not load project file: ' + err.message);
        }
    });

    document.getElementById('btn-load-local').addEventListener('click', async () => {
        if (await Net.restoreAutosave()) {
            window.clearResults();
            Tools.clearSelection();
            setTimeout(() => window.fitToNetwork(), 100);
        } else {
            alert('No saved project found in browser storage.');
        }
    });

    const inpInput = document.getElementById('inp-file-input');
    document.getElementById('btn-load-inp').addEventListener('click', () => inpInput.click());
    inpInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        inpInput.value = '';
        if (!file) return;
        try {
            window.showLoadingOverlay('Loading ' + file.name, 'Reading file…');
            const text = await file.text();
            window.updateLoadingOverlay(20, 'Parsing…');
            // parse off the main thread so the UI stays responsive on large files
            const model = await window.parseInpAsync(text);
            window.hideLoadingOverlay();
            if (!model.nodes.length) {
                alert('No nodes with coordinates found in the .inp file.');
                return;
            }
            window.openProjectionModal(model);
        } catch (err) {
            window.hideLoadingOverlay();
            alert('Failed to parse .inp file: ' + err.message);
        }
    });

    async function loadGitHubSample(filename) {
        try {
            window.showLoadingOverlay('Loading ' + filename, 'Fetching file…');
            const res = await fetch(`./sample_models/${filename}`);
            if (!res.ok) throw new Error('Failed to fetch ' + filename + ' (Status: ' + res.status + ')');
            const text = await res.text();
            window.updateLoadingOverlay(20, 'Parsing…');
            const model = await window.parseInpAsync(text);
            if (!model.nodes.length) {
                window.hideLoadingOverlay();
                alert('No nodes with coordinates found in the .inp file.');
                return;
            }
            window.updateLoadingOverlay(60, 'Applying EPSG:25832 projection…');
            if (window.applyProjectionAndLoad) {
                await window.applyProjectionAndLoad(model, 'utm', 'EPSG:25832');
            } else {
                window.openProjectionModal(model);
            }
            window.hideLoadingOverlay();
        } catch (err) {
            window.hideLoadingOverlay();
            alert('Failed to load sample: ' + err.message);
        }
    }

    document.getElementById('btn-sample-web').addEventListener('click', () => loadGitHubSample('BellingeSWMM_v021_web.inp'));
    document.getElementById('btn-sample-self').addEventListener('click', () => loadGitHubSample('BellingeSWMM_v021_selfcontained.inp'));
    document.getElementById('btn-sample-noper').addEventListener('click', () => loadGitHubSample('BellingeSWMM_v021_nopervious.inp'));

    // Options Modal
    const optionsModal = document.getElementById('options-modal');
    document.getElementById('btn-options').addEventListener('click', () => {
        const opt = Net.options || {};
        document.getElementById('opt-node-continuity').value = opt.nodeContinuity || '';
        document.getElementById('opt-anderson-accel').value = opt.andersonAccel || '';
        document.getElementById('opt-rdii-k0').value = opt.rdiiDecay ? opt.rdiiDecay.k0 : '';
        document.getElementById('opt-rdii-kt').value = opt.rdiiDecay ? opt.rdiiDecay.kT : '';
        document.getElementById('opt-rdii-tref').value = opt.rdiiDecay ? opt.rdiiDecay.tRef : '';
        const fr = document.getElementById('opt-flow-routing');
        if (fr) fr.value = Net.options.flowRouting || '';
        const fv = Net.options.fv || {};
        const revMap = { 'FV_CELL_LENGTH': 'cell-length', 'FV_MIN_CELLS': 'min-cells', 'FV_CFL': 'cfl', 'FV_RIEMANN': 'riemann', 'FV_ORDER': 'order', 'FV_LIMITER': 'limiter', 'FV_SCALAR_SCHEME': 'scalar-scheme', 'FV_TIME_INTEGRATION': 'time-integration', 'FV_SLOT_CELERITY': 'slot-celerity', 'FV_NODE_COUPLING': 'node-coupling', 'FV_NODE_DT': 'node-dt', 'FV_NODE_PICARD': 'node-picard', 'FV_STRUCTURE_COUPLING': 'structure-coupling', 'FV_BACKEND': 'backend', 'FV_COMPACTION': 'compaction', 'FV_DISPERSION': 'dispersion' };
        Object.entries(revMap).forEach(([key, suffix]) => {
            const el = document.getElementById('opt-fv-' + suffix);
            if (el && fv[key] !== undefined) el.value = String(fv[key]);
        });
        const perfNote = document.getElementById('fv-perf-note');
        if (perfNote) perfNote.style.display = (fr && fr.value === 'FV') ? 'block' : 'none';
        if (fr) fr.addEventListener('change', () => { if (perfNote) perfNote.style.display = fr.value === 'FV' ? 'block' : 'none'; });
        optionsModal.classList.remove('hidden');
    });

    // Time Series Plot Selection Modal
    const btnTsPlot = document.getElementById('btn-ts-plot');
    if (btnTsPlot) {
        btnTsPlot.addEventListener('click', () => {
            if (window.TimeSeriesPlot) {
                const selectedId = App.selectedId;
                window.TimeSeriesPlot.openSelectionModal(selectedId);
            }
        });
    }
    document.getElementById('btn-cancel-options').addEventListener('click', () => {
        optionsModal.classList.add('hidden');
    });
    document.getElementById('btn-save-options').addEventListener('click', () => {
        if (!Net.options) Net.options = {};
        
        const nodeCont = document.getElementById('opt-node-continuity').value;
        const anderson = document.getElementById('opt-anderson-accel').value;
        const k0 = document.getElementById('opt-rdii-k0').value;
        const kT = document.getElementById('opt-rdii-kt').value;
        const tRef = document.getElementById('opt-rdii-tref').value;
        
        if (nodeCont) Net.options.nodeContinuity = nodeCont;
        else delete Net.options.nodeContinuity;
        
        if (anderson) Net.options.andersonAccel = anderson;
        else delete Net.options.andersonAccel;
        
        if (k0 !== '' && kT !== '' && tRef !== '') {
            Net.options.rdiiDecay = { k0, kT, tRef };
        } else {
            delete Net.options.rdiiDecay;
        }
        
        const flowRouting = document.getElementById('opt-flow-routing').value;
        const fv = {};
        const fvMap = {
            'cell-length': 'FV_CELL_LENGTH', 'min-cells': 'FV_MIN_CELLS', 'cfl': 'FV_CFL',
            'riemann': 'FV_RIEMANN', 'order': 'FV_ORDER', 'limiter': 'FV_LIMITER',
            'scalar-scheme': 'FV_SCALAR_SCHEME', 'time-integration': 'FV_TIME_INTEGRATION',
            'slot-celerity': 'FV_SLOT_CELERITY', 'node-coupling': 'FV_NODE_COUPLING',
            'node-dt': 'FV_NODE_DT', 'node-picard': 'FV_NODE_PICARD',
            'structure-coupling': 'FV_STRUCTURE_COUPLING', 'backend': 'FV_BACKEND',
            'compaction': 'FV_COMPACTION', 'dispersion': 'FV_DISPERSION'
        };
        Object.entries(fvMap).forEach(([suffix, key]) => {
            const el = document.getElementById('opt-fv-' + suffix);
            if (el) {
                const v = el.value.trim();
                if (v !== '') fv[key] = v;
            }
        });
        if (flowRouting) Net.options.flowRouting = flowRouting;
        else delete Net.options.flowRouting;
        if (Object.keys(fv).length) Net.options.fv = fv;
        else delete Net.options.fv;
        
        optionsModal.classList.add('hidden');
    });

    document.getElementById('btn-export-inp').addEventListener('click', () => {
        if (Net.nodeCount === 0) { alert('Nothing to export — the network is empty.'); return; }
        window.inpExporter.downloadInp(Net);
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
        if (Net.nodeCount === 0 && Net.linkCount === 0 && !Net.subcatchments.length) return;
        if (!confirm('Clear the whole network? This can be undone with Ctrl+Z.')) return;
        Tools.clearSelection(false);
        window.clearResults();
        Net.reset(false);
        Net.commit();
        Net.emit();
        Tools.notifySelection();
    });

    document.getElementById('btn-run').addEventListener('click', () => window.runSimulation());

    // Units
    const unitsSelect = document.getElementById('units-select');
    unitsSelect.addEventListener('change', () => {
        Net.setUnits(unitsSelect.value);
        renderPropsPanel();
    });

    // Tabbed right panel (collapse / reopen / tab switching)
    const panelRight = document.getElementById('panel-right');
    const reopenRight = document.getElementById('reopen-right');
    const panelResizer = document.getElementById('panel-resizer');

    let isResizingRightPanel = false;

    if (panelResizer) {
        const savedPanelW = parseInt(localStorage.getItem('panel-w'), 10);
        if (savedPanelW) {
            const w = Math.max(200, Math.min(window.innerWidth - 60, savedPanelW));
            document.documentElement.style.setProperty('--panel-w', w + 'px');
        }

        panelResizer.addEventListener('mousedown', (e) => {
            isResizingRightPanel = true;
            panelResizer.classList.add('dragging');
            document.body.style.cursor = 'ew-resize';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizingRightPanel) return;
            const newWidth = Math.max(200, Math.min(window.innerWidth - 60, window.innerWidth - e.clientX));
            document.documentElement.style.setProperty('--panel-w', newWidth + 'px');
            if (map) map.resize();
        });

        document.addEventListener('mouseup', () => {
            if (isResizingRightPanel) {
                isResizingRightPanel = false;
                panelResizer.classList.remove('dragging');
                document.body.style.cursor = '';
                localStorage.setItem('panel-w', parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-w'), 10));
                if (map) map.resize();
            }
        });
    }

    // Tab switching
    document.querySelectorAll('.panel-tab[data-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.panel-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const target = document.getElementById('tab-' + tab.dataset.tab);
            if (target) target.classList.add('active');
            const badge = tab.querySelector('.tab-badge');
            if (badge) badge.classList.add('hidden');
        });
    });

    function setRightPanel(visible) {
        panelRight.classList.toggle('collapsed', !visible);
        reopenRight.classList.toggle('hidden', visible);
        document.getElementById('app-grid').classList.toggle('panel-collapsed', !visible);
        setTimeout(() => map.resize(), 50);
    }

    document.getElementById('btn-collapse-right').addEventListener('click', () => setRightPanel(false));
    reopenRight.addEventListener('click', () => setRightPanel(true));

    // Left palette toggle
    const palette = document.getElementById('tool-palette');
    const reopenLeft = document.getElementById('btn-reopen-palette');
    const btnCollapseLeft = document.getElementById('btn-collapse-palette');

    function setLeftPalette(visible) {
        if (visible) {
            palette.classList.remove('collapsed');
            reopenLeft.classList.add('hidden');
        } else {
            palette.classList.add('collapsed');
            reopenLeft.classList.remove('hidden');
        }
        setTimeout(() => map.resize(), 50);
    }
    btnCollapseLeft.addEventListener('click', () => setLeftPalette(false));
    reopenLeft.addEventListener('click', () => setLeftPalette(true));

    window.openResultsPanel = () => {
        setRightPanel(true);
        // Switch to results tab
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel-tab-content').forEach(c => c.classList.remove('active'));
        const resultsTab = document.querySelector('.panel-tab[data-tab="results"]');
        const resultsContent = document.getElementById('tab-results');
        if (resultsTab) resultsTab.classList.add('active');
        if (resultsContent) resultsContent.classList.add('active');
        // Show badge
        const badge = document.getElementById('results-badge');
        if (badge) badge.classList.remove('hidden');
    };

    window.openReportPanel = () => {
        setRightPanel(true);
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel-tab-content').forEach(c => c.classList.remove('active'));
        const reportTab = document.querySelector('.panel-tab[data-tab="report"]');
        const reportContent = document.getElementById('tab-report');
        if (reportTab) reportTab.classList.add('active');
        if (reportContent) reportContent.classList.add('active');
        const badge = document.getElementById('report-badge');
        if (badge) badge.classList.remove('hidden');
    };

    // Map settings card toggle
    const btnToggleSettings = document.getElementById('btn-toggle-map-settings');
    const mapSettingsCard = document.getElementById('map-settings-card');
    btnToggleSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        const hidden = mapSettingsCard.classList.toggle('hidden');
        btnToggleSettings.classList.toggle('active', !hidden);
    });
    // Close settings card when clicking outside on the map (but not inside the card itself)
    document.addEventListener('click', (e) => {
        if (!mapSettingsCard.contains(e.target) && e.target !== btnToggleSettings && !btnToggleSettings.contains(e.target)) {
            mapSettingsCard.classList.add('hidden');
            btnToggleSettings.classList.remove('active');
        }
    });

    // Map style pills / labels / 3D
    document.querySelectorAll('#map-style-pills .tb-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('#map-style-pills .tb-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            window.setMapStyle(pill.dataset.style);
        });
    });

    const btnNodes = document.getElementById('btn-toggle-nodes');
    btnNodes.addEventListener('click', () => {
        App.nodesVisible = !App.nodesVisible;
        btnNodes.classList.toggle('toggled', App.nodesVisible);
        if (window.applyNodesVisibility) window.applyNodesVisibility();
    });

    const btnLinks = document.getElementById('btn-toggle-links');
    btnLinks.addEventListener('click', () => {
        App.linksVisible = !App.linksVisible;
        btnLinks.classList.toggle('toggled', App.linksVisible);
        if (window.applyLinksVisibility) window.applyLinksVisibility();
    });

    const btnSubcatchments = document.getElementById('btn-toggle-subcatchments');
    btnSubcatchments.addEventListener('click', () => {
        App.subcatchmentsVisible = !App.subcatchmentsVisible;
        btnSubcatchments.classList.toggle('toggled', App.subcatchmentsVisible);
        if (window.applySubcatchmentsVisibility) window.applySubcatchmentsVisibility();
    });

    const btnMesh2D = document.getElementById('btn-toggle-mesh2d');
    if (btnMesh2D) {
        btnMesh2D.addEventListener('click', () => {
            App.mesh2DVisible = !App.mesh2DVisible;
            btnMesh2D.classList.toggle('toggled', App.mesh2DVisible);
            if (window.applyMesh2DVisibility) window.applyMesh2DVisibility();
        });
    }

    const btnLabels = document.getElementById('btn-toggle-labels');
    btnLabels.addEventListener('click', () => {
        App.labelsVisible = !App.labelsVisible;
        btnLabels.classList.toggle('toggled', App.labelsVisible);
        window.applyLabelsVisibility();
    });

    const btn3D = document.getElementById('btn-toggle-3d');
    btn3D.addEventListener('click', () => {
        App.is3D = !App.is3D;
        btn3D.classList.toggle('toggled', App.is3D);
        window.apply3D();
    });

    const btnWarnings = document.getElementById('btn-toggle-warnings');
    btnWarnings.addEventListener('click', () => {
        App.warningsVisible = !App.warningsVisible;
        btnWarnings.classList.toggle('toggled', App.warningsVisible);
        document.body.classList.toggle('hide-warnings', !App.warningsVisible);
    });

    const btnLandCover = document.getElementById('btn-toggle-landcover');
    if (btnLandCover) {
        btnLandCover.addEventListener('click', () => {
            App.landCoverVisible = !App.landCoverVisible;
            btnLandCover.classList.toggle('toggled', App.landCoverVisible);
            if (window.toggleLandCoverLayer) window.toggleLandCoverLayer(App.landCoverVisible);
            if (App.landCoverVisible && Net.mesh2D.length > 0 && window.LandCoverModule && App.map) {
                const classification = window.LandCoverModule.classifyMeshCells(App.map, Net.mesh2D);
                if (window.refreshNetworkData) window.refreshNetworkData();
                renderPropsPanel();
                if (window.showResultsWarning) {
                    window.showResultsWarning(`Land cover classified for ${classification.classified} mesh cells.`);
                }
            }
        });
    }

    const btnSampleAllDem = document.getElementById('btn-sample-all-dem');
    if (btnSampleAllDem) {
        btnSampleAllDem.addEventListener('click', () => {
            if (window.sampleAllNodesDEM) window.sampleAllNodesDEM();
        });
    }

    const openMeshDialog = () => {
        if (window.Mesh2DDialog) {
            window.Mesh2DDialog.open();
        } else {
            alert('Mesh dialog module not loaded.');
        }
    };
    const btnGenMesh = document.getElementById('btn-generate-mesh2d');
    if (btnGenMesh) btnGenMesh.addEventListener('click', openMeshDialog);
    const btnMeshToolbar = document.getElementById('btn-mesh2d-toolbar');
    if (btnMeshToolbar) btnMeshToolbar.addEventListener('click', openMeshDialog);

    const btnClearMesh = document.getElementById('btn-clear-mesh2d');
    if (btnClearMesh) {
        btnClearMesh.addEventListener('click', () => {
            if (window.Mesh2DGenerator) window.Mesh2DGenerator.clearMesh();
            if (window.Net) window.Net.clearIndexedMesh();
            if (window.refreshNetworkData) window.refreshNetworkData();
            if (window.showResultsWarning) window.showResultsWarning('2D Mesh cleared.');
        });
    }

    // OSM place search (Nominatim)
    const searchInput = document.getElementById('osm-search-input');
    const searchResults = document.getElementById('osm-search-results');

    async function doSearch() {
        const q = searchInput.value.trim();
        if (!q) return;
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(q)}`,
                { headers: { 'Accept-Language': 'en' } });
            const results = await res.json();
            searchResults.innerHTML = '';
            if (!results.length) {
                searchResults.innerHTML = '<button class="osm-result" disabled>No results found</button>';
            } else {
                results.forEach(r => {
                    const btn = document.createElement('button');
                    btn.className = 'osm-result';
                    btn.textContent = r.display_name;
                    btn.addEventListener('click', () => {
                        searchResults.classList.add('hidden');
                        searchInput.value = r.display_name.split(',')[0];
                        if (r.boundingbox) {
                            const [s, n, w, e] = r.boundingbox.map(Number);
                            map.fitBounds([[w, s], [e, n]], { duration: 1500, maxZoom: 17 });
                        } else {
                            map.flyTo({ center: [Number(r.lon), Number(r.lat)], zoom: 15 });
                        }
                    });
                    searchResults.appendChild(btn);
                });
            }
            searchResults.classList.remove('hidden');
        } catch (err) {
            console.warn('Nominatim search failed', err);
        }
    }

    document.getElementById('osm-search-btn').addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
        if (e.key === 'Escape') searchResults.classList.add('hidden');
    });
    document.addEventListener('click', (e) => {
        if (!document.getElementById('osm-search').contains(e.target)) searchResults.classList.add('hidden');
    });

    // Street View pegman
    const btnPegman = document.getElementById('btn-pegman');
    const svWrapper = document.getElementById('street-view-wrapper');
    let svActive = false;

    btnPegman.addEventListener('click', () => {
        svActive = !svActive;
        btnPegman.classList.toggle('active', svActive);
        svWrapper.classList.toggle('hidden', !svActive);
        if (svActive) {
            if (window.StreetViewOverlay) window.StreetViewOverlay.init();
        } else {
            if (window.StreetViewOverlay) window.StreetViewOverlay.destroy();
        }
        setTimeout(() => map.resize(), 50);
    });

    document.getElementById('btn-close-sv').addEventListener('click', () => {
        svActive = false;
        btnPegman.classList.remove('active');
        svWrapper.classList.add('hidden');
        if (window.StreetViewOverlay) window.StreetViewOverlay.destroy();
        setTimeout(() => map.resize(), 50);
    });

    // Street view resizing
    const svResizeHandle = document.getElementById('sv-resize-handle');
    let isResizingSV = false;
    
    if (svResizeHandle) {
        svResizeHandle.addEventListener('mousedown', (e) => {
            isResizingSV = true;
            document.body.style.cursor = 'ns-resize';
            const svContainer = document.getElementById('street-view-container');
            if (svContainer) svContainer.style.pointerEvents = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizingSV) return;
            // Calculate height as percentage of window height
            let newHeightPct = (e.clientY / window.innerHeight) * 100;
            // Clamp between 20% and 80%
            newHeightPct = Math.max(20, Math.min(80, newHeightPct));
            document.documentElement.style.setProperty('--sv-height', newHeightPct + '%');
            if (map) map.resize();
            if (window.StreetViewOverlay) window.StreetViewOverlay.resize();
        });

        document.addEventListener('mouseup', () => {
            if (isResizingSV) {
                isResizingSV = false;
                document.body.style.cursor = '';
                const svContainer = document.getElementById('street-view-container');
                if (svContainer) svContainer.style.pointerEvents = 'auto';
                if (map) map.resize();
                if (window.StreetViewOverlay) window.StreetViewOverlay.resize();
            }
        });
    }

    // Properties panel
    const propsBody = document.getElementById('props-body');

    const U = (si, us) => Net.units === 'US' ? us : si;

    const FIELD_DEFS = {
        JUNCTION: () => [
            { key: 'description', label: 'Description', type: 'text' },
            { key: 'tag', label: 'Tag', type: 'text' },
            { key: 'invertEl', label: 'Invert elevation', unit: U('m', 'ft'), type: 'number' },
            { key: 'maxDepth', label: 'Max depth', unit: U('m', 'ft'), type: 'number' },
            { key: 'initDepth', label: 'Init depth', unit: U('m', 'ft'), type: 'number' },
            { key: 'surDepth', label: 'Surcharge depth', unit: U('m', 'ft'), type: 'number' },
            { key: 'aponded', label: 'Ponded area', unit: U('m²', 'ft²'), type: 'number' }
        ],
        OUTFALL: () => [
            { key: 'description', label: 'Description', type: 'text' },
            { key: 'tag', label: 'Tag', type: 'text' },
            { key: 'invertEl', label: 'Invert elevation', unit: U('m', 'ft'), type: 'number' },
            { key: 'outfallType', label: 'Type', type: 'select', options: ['FREE', 'NORMAL', 'FIXED'] },
            { key: 'stageData', label: 'Fixed stage', unit: U('m', 'ft'), type: 'text' },
            { key: 'gated', label: 'Flap gate', type: 'select', options: ['NO', 'YES'] }
        ],
        STORAGE: () => [
            { key: 'description', label: 'Description', type: 'text' },
            { key: 'tag', label: 'Tag', type: 'text' },
            { key: 'invertEl', label: 'Invert elevation', unit: U('m', 'ft'), type: 'number' },
            { key: 'maxDepth', label: 'Max depth', unit: U('m', 'ft'), type: 'number' },
            { key: 'initDepth', label: 'Init depth', unit: U('m', 'ft'), type: 'number' },
            { key: 'surDepth', label: 'Surcharge depth', unit: U('m', 'ft'), type: 'number' },
            { key: 'fevap', label: 'Evap. Factor', type: 'number', step: 0.1 },
            { key: 'seepageRate', label: 'Seepage loss rate', unit: U('mm/h', 'in/h'), type: 'number' },
            { key: 'shape', label: 'Shape curve', type: 'select', options: ['FUNCTIONAL', 'TABULAR'] },
            { key: 'curveName', label: 'Storage curve (tabular)', type: 'text' },
            { key: 'coeff', label: 'Coefficient', type: 'number' },
            { key: 'exponent', label: 'Exponent', type: 'number' },
            { key: 'constant', label: 'Constant', type: 'number' }
        ],
        DIVIDER: () => [
            { key: 'description', label: 'Description', type: 'text' },
            { key: 'tag', label: 'Tag', type: 'text' },
            { key: 'invertEl', label: 'Invert elevation', unit: U('m', 'ft'), type: 'number' },
            { key: 'divertedLink', label: 'Diverted link', type: 'text' },
            { key: 'dividerType', label: 'Type', type: 'select', options: ['CUTOFF', 'OVERFLOW', 'TABULAR', 'WEIR'] },
            { key: 'param', label: 'Parameter', type: 'number' },
            { key: 'maxDepth', label: 'Max depth', unit: U('m', 'ft'), type: 'number' }
        ],
        RAINGAGE: () => [
            { key: 'description', label: 'Description', type: 'text' },
            { key: 'tag', label: 'Tag', type: 'text' },
            { key: 'format', label: 'Rain format', type: 'select', options: ['INTENSITY', 'VOLUME', 'CUMULATIVE'] },
            { key: 'interval', label: 'Interval', unit: 'h:mm', type: 'text' },
            { key: 'scf', label: 'Snow catch factor', type: 'number' },
            { key: 'sourceType', label: 'Data Source', type: 'select', options: ['TIMESERIES', 'FILE'] },
            { key: 'sourceName', label: 'Series Name (TIMESERIES)', type: 'text' },
            { key: 'fileName', label: 'File Name (FILE)', type: 'text' },
            { key: 'stationID', label: 'Station ID', type: 'text' },
            { key: 'rainUnits', label: 'Rain Units', type: 'select', options: ['IN', 'MM'] }
        ],
        CONDUIT: () => [
            { key: 'description', label: 'Description', type: 'text' },
            { key: 'tag', label: 'Tag', type: 'text' },
            { key: 'length', label: 'Length', unit: U('m', 'ft'), type: 'number' },
            { key: 'autoLength', label: 'Auto length', type: 'select', options: ['true', 'false'], bool: true },
            { key: 'roughness', label: 'Roughness (n)', type: 'number', step: 0.001 },
            { key: 'inOffset', label: 'Inlet offset', unit: U('m', 'ft'), type: 'number' },
            { key: 'outOffset', label: 'Outlet offset', unit: U('m', 'ft'), type: 'number' },
            { key: 'initFlow', label: 'Initial Flow', unit: U('LPS', 'CFS'), type: 'number' },
            { key: 'maxFlow', label: 'Maximum Flow', unit: U('LPS', 'CFS'), type: 'number' },
            { key: 'entryLoss', label: 'Entry Loss Coeff.', type: 'number', step: 0.01 },
            { key: 'exitLoss', label: 'Exit Loss Coeff.', type: 'number', step: 0.01 },
            { key: 'avgLoss', label: 'Avg. Loss Coeff.', type: 'number', step: 0.01 },
            { key: 'seepageRate', label: 'Seepage Loss Rate', unit: U('mm/h', 'in/h'), type: 'number' },
            { key: 'gated', label: 'Flap Gate', type: 'select', options: ['NO', 'YES'] },
            { key: 'culvertCode', label: 'Culvert Code', type: 'text' },
            { key: 'xShape', label: 'X-section', type: 'select', options: ['CIRCULAR', 'FORCE_MAIN', 'FILLED_CIRCULAR', 'RECT_CLOSED', 'RECT_OPEN', 'TRAPEZOIDAL', 'TRIANGULAR', 'EGG', 'HORSESHOE', 'PARABOLIC'] },
            { key: 'geom1', label: 'Geom1 (depth/diam)', unit: U('m', 'ft'), type: 'number', step: 0.05 },
            { key: 'geom2', label: 'Geom2 (width)', unit: U('m', 'ft'), type: 'number', step: 0.05 },
            { key: 'geom3', label: 'Geom3', type: 'number', step: 0.05 },
            { key: 'geom4', label: 'Geom4', type: 'number', step: 0.05 },
            { key: 'barrels', label: 'Barrels', type: 'number', step: 1 }
        ],
        PUMP: () => [
            { key: 'description', label: 'Description', type: 'text' },
            { key: 'tag', label: 'Tag', type: 'text' },
            { key: 'pumpCurve', label: 'Pump curve', type: 'text' },
            { key: 'status', label: 'Initial status', type: 'select', options: ['ON', 'OFF'] },
            { key: 'startup', label: 'Startup depth', unit: U('m', 'ft'), type: 'number' },
            { key: 'shutoff', label: 'Shutoff depth', unit: U('m', 'ft'), type: 'number' }
        ],
        WEIR: () => [
            { key: 'description', label: 'Description', type: 'text' },
            { key: 'tag', label: 'Tag', type: 'text' },
            { key: 'weirType', label: 'Type', type: 'select', options: ['TRANSVERSE', 'SIDEFLOW', 'V-NOTCH', 'TRAPEZOIDAL', 'ROADWAY'] },
            { key: 'crestHt', label: 'Crest height / Height', unit: U('m', 'ft'), type: 'number' },
            { key: 'offset', label: 'Inlet Offset', unit: U('m', 'ft'), type: 'number' },
            { key: 'qCoeff', label: 'Discharge coeff.', type: 'number', step: 0.01 },
            { key: 'gated', label: 'Flap gate', type: 'select', options: ['NO', 'YES'] },
            { key: 'endCon', label: 'End Contractions', type: 'number' },
            { key: 'endCoeff', label: 'End Coeff.', type: 'number', step: 0.01 },
            { key: 'surcharge', label: 'Can Surcharge', type: 'select', options: ['NO', 'YES'] },
            { key: 'coeffCurve', label: 'Coeff. Curve', type: 'text' },
            { key: 'roadWidth', label: 'Road Width (Roadway Weir)', unit: U('m', 'ft'), type: 'number' },
            { key: 'roadSurface', label: 'Road Surface', type: 'select', options: ['PAVED', 'UNPAVED'] },
            { key: 'geom1', label: 'Height (Geom1)', unit: U('m', 'ft'), type: 'number', step: 0.05 },
            { key: 'geom2', label: 'Width (Length/Geom2)', unit: U('m', 'ft'), type: 'number', step: 0.05 },
            { key: 'geom3', label: 'Side Slope (Geom3)', type: 'number', step: 0.05 }
        ],
        ORIFICE: () => [
            { key: 'description', label: 'Description', type: 'text' },
            { key: 'tag', label: 'Tag', type: 'text' },
            { key: 'orificeType', label: 'Type', type: 'select', options: ['SIDE', 'BOTTOM'] },
            { key: 'offset', label: 'Inlet offset', unit: U('m', 'ft'), type: 'number' },
            { key: 'qCoeff', label: 'Discharge coeff.', type: 'number', step: 0.01 },
            { key: 'gated', label: 'Flap gate', type: 'select', options: ['NO', 'YES'] },
            { key: 'xShape', label: 'Shape', type: 'select', options: ['CIRCULAR', 'RECT_CLOSED'] },
            { key: 'geom1', label: 'Height/diameter', unit: U('m', 'ft'), type: 'number', step: 0.05 },
            { key: 'geom2', label: 'Width', unit: U('m', 'ft'), type: 'number', step: 0.05 }
        ],
        OUTLET: () => [
            { key: 'description', label: 'Description', type: 'text' },
            { key: 'tag', label: 'Tag', type: 'text' },
            { key: 'outletType', label: 'Rating type', type: 'select', options: ['FUNCTIONAL/DEPTH', 'FUNCTIONAL/HEAD', 'TABULAR/DEPTH', 'TABULAR/HEAD'] },
            { key: 'offset', label: 'Inlet offset', unit: U('m', 'ft'), type: 'number' },
            { key: 'qCoeff', label: 'Flow coeff. (functional)', type: 'number', step: 0.01 },
            { key: 'qExpon', label: 'Flow exponent (functional)', type: 'number', step: 0.01 },
            { key: 'curveName', label: 'Rating curve (tabular)', type: 'text' },
            { key: 'gated', label: 'Flap gate', type: 'select', options: ['NO', 'YES'] }
        ],
        SUBCATCHMENT: () => [
            { key: 'description', label: 'Description', type: 'text' },
            { key: 'tag', label: 'Tag', type: 'text' },
            { key: 'raingage', label: 'Rain gage', type: 'text' },
            { key: 'outlet', label: 'Outlet node', type: 'text' },
            { key: 'area', label: 'Area', unit: U('ha', 'ac'), type: 'number', step: 0.01 },
            { key: 'width', label: 'Width', unit: U('m', 'ft'), type: 'number' },
            { key: 'slope', label: '% Slope', unit: '%', type: 'number', step: 0.1 },
            { key: 'imperv', label: '% Imperv', unit: '%', type: 'number' },
            { key: 'landCoverClass', label: 'VITO Land Cover (10m)', type: 'select', options: [
                '0 - Custom / None',
                '10 - Tree cover',
                '20 - Shrubland',
                '30 - Grassland',
                '40 - Cropland',
                '50 - Herbaceous wetland',
                '60 - Mangroves',
                '70 - Moss and lichen',
                '80 - Bare/sparse vegetation',
                '90 - Built-up (pavement)',
                '90 - Built-up (obstacle)',
                '95 - Permanent water',
                '100 - Snow and ice'
            ] },
            { key: 'nImperv', label: 'N-Imperv', type: 'number', step: 0.001 },
            { key: 'nPerv', label: 'N-Perv', type: 'number', step: 0.001 },
            { key: 'dstoreImperv', label: 'Dstore-Imperv', unit: U('mm', 'in'), type: 'number', step: 0.01 },
            { key: 'dstorePerv', label: 'Dstore-Perv', unit: U('mm', 'in'), type: 'number', step: 0.01 },
            { key: 'pctZero', label: '%Zero-Imperv', unit: '%', type: 'number' },
            { key: 'subareaRouting', label: 'Subarea Routing', type: 'select', options: ['OUTLET', 'IMPERVIOUS', 'PERVIOUS'] },
            { key: 'pctRouted', label: 'Percent Routed', unit: '%', type: 'number' },
            { key: 'infilMaxRate', label: 'Infil. Max Rate', unit: U('mm/h', 'in/h'), type: 'number', step: 0.1 },
            { key: 'infilMinRate', label: 'Infil. Min Rate', unit: U('mm/h', 'in/h'), type: 'number', step: 0.1 },
            { key: 'infilDecay', label: 'Infil. Decay Const (1/h)', type: 'number', step: 0.1 },
            { key: 'infilDryTime', label: 'Infil. Dry Time (days)', type: 'number', step: 0.1 },
            { key: 'infilMaxInfil', label: 'Infil. Max Vol', unit: U('mm', 'in'), type: 'number', step: 0.1 },
            { key: 'curbLen', label: 'Curb length', type: 'number' }
        ],
        MESH2D: () => [
            { key: 'parentSubcatch', label: 'Parent Subcatchment', type: 'text' },
            { key: 'landCoverClass', label: 'Land Cover Class', type: 'number' },
            { key: 'manningN', label: 'Manning N Roughness', type: 'number', step: 0.001 },
            { key: 'depth', label: '2D Water Depth', unit: U('m', 'ft'), type: 'number', readonly: true },
            { key: 'head', label: '2D Hydraulic Head', unit: U('m', 'ft'), type: 'number', readonly: true },
            { key: 'velocity', label: '2D Velocity', unit: U('m/s', 'ft/s'), type: 'number', readonly: true }
        ]
    };

    const TYPE_LABELS = {
        JUNCTION: 'Junction', OUTFALL: 'Outfall', STORAGE: 'Storage Unit', DIVIDER: 'Flow Divider',
        RAINGAGE: 'Rain Gage', CONDUIT: 'Conduit', PUMP: 'Pump', WEIR: 'Weir', ORIFICE: 'Orifice',
        OUTLET: 'Outlet',
        SUBCATCHMENT: 'Subcatchment',
        MESH2D: '2D Surface Mesh Cell'
    };

    function esc(s) {
        return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    window.renderPropsPanel = function renderPropsPanel() {
        updateProfileButton();
        const sel = [...App.selection];

        if (!sel.length) {
            propsBody.innerHTML = '<p class="panel-empty">Select an element on the map to see its properties.</p>';
            return;
        }

        // Auto-switch to Properties tab when something is selected
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel-tab-content').forEach(c => c.classList.remove('active'));
        const propsTab = document.querySelector('.panel-tab[data-tab="props"]');
        const propsContent = document.getElementById('tab-props');
        if (propsTab) propsTab.classList.add('active');
        if (propsContent) propsContent.classList.add('active');

        if (sel.length > 1) {
            propsBody.innerHTML = `
                <p class="panel-empty">${sel.length} elements selected.</p>
                <div class="prop-actions">
                    <button class="tb-btn prop-btn-danger" id="prop-delete-multi">Delete selected</button>
                </div>`;
            document.getElementById('prop-delete-multi').addEventListener('click', () => Tools.deleteSelection());
            return;
        }

        const id = sel[0];
        const el = Net.findAny(id);
        if (!el) {
            propsBody.innerHTML = '<p class="panel-empty">Select an element on the map to see its properties.</p>';
            return;
        }

        const type = el.type || 'SUBCATCHMENT';
        const defs = (FIELD_DEFS[type] || (() => []))();

        let html = `<div class="prop-section-title">${esc(TYPE_LABELS[type] || type)}</div>`;
        html += `<div class="prop-row"><label>Name</label><input type="text" id="prop-id" value="${esc(el.id)}"></div>`;

        if (el.from !== undefined) {
            html += `<div class="prop-row"><label>From node</label><input type="text" value="${esc(el.from)}" readonly></div>`;
            html += `<div class="prop-row"><label>To node</label><input type="text" value="${esc(el.to)}" readonly></div>`;
        }
        if (el.lngLat) {
            html += `<div class="prop-row"><label>Position <span class="unit-hint">(lat, lng)</span></label>
                <input type="text" value="${el.lngLat[1].toFixed(6)}, ${el.lngLat[0].toFixed(6)}" readonly></div>`;
        }

        const defaultProps = (type === 'SUBCATCHMENT' ? window.defaultSubcatchProps?.() : ((window.NET_NODE_TYPES || []).includes(type) ? window.defaultNodeProps?.(type) : window.defaultLinkProps?.(type))) || {};

        defs.forEach(f => {
            let val = el.props[f.key];
            if (val === undefined || val === null) {
                val = defaultProps[f.key] !== undefined ? defaultProps[f.key] : '';
            }
            const unitHint = f.unit ? ` <span class="unit-hint">(${esc(f.unit)})</span>` : '';
            if (f.type === 'select') {
                const opts = f.options.map(o =>
                    `<option value="${esc(o)}" ${String(val) === o ? 'selected' : ''}>${esc(o)}</option>`).join('');
                html += `<div class="prop-row"><label>${esc(f.label)}${unitHint}</label>
                    <select data-key="${f.key}" data-bool="${f.bool ? '1' : ''}">${opts}</select></div>`;
            } else {
                const step = f.step ? ` step="${f.step}"` : (f.type === 'number' ? ' step="any"' : '');
                const readonly = f.readonly ? ' readonly' : '';
                html += `<div class="prop-row"><label>${esc(f.label)}${unitHint}</label>
                    <input type="${f.type}"${step} data-key="${f.key}" value="${esc(val)}"${readonly}></div>`;
            }
        });

        if (el.lngLat) {
            html += `<div class="prop-actions" style="margin-top:6px;margin-bottom:10px;">
                <button class="tb-btn" id="prop-sample-dem" style="width:100%;font-size:11px;" title="Set this node's invert elevation from the selected DEM source (approximate)">Set Elevation from DEM</button>
            </div>`;
        }

        if (type === 'SUBCATCHMENT') {
            html += `<div class="prop-actions" style="margin-top:6px;margin-bottom:10px;">
                <button class="tb-btn" id="prop-detect-landcover" style="width:100%;font-size:11px;" title="Sample land cover grid cells across this subcatchment polygon and compute weighted parameters">Sample Land Cover & Compute % Imperv</button>
            </div>`;
        }

        if (type === 'RAINGAGE') {
            html += `<div class="prop-actions" style="margin-top:6px;margin-bottom:10px;">
                <button class="tb-btn tb-btn-run" id="prop-edit-raindata" style="width:100%;font-size:11px;">🌧️ Edit Rain Data / Time Series</button>
            </div>`;
        }

        html += `<div class="prop-actions">
            <button class="tb-btn prop-btn-danger" id="prop-delete">Delete</button>
        </div>`;

        propsBody.innerHTML = html;

        // wire inputs
        propsBody.querySelectorAll('[data-key]').forEach(input => {
            input.addEventListener('change', () => {
                const key = input.dataset.key;
                let value = input.value;
                if (input.dataset.bool === '1') value = value === 'true';
                else if (input.type === 'number') value = parseFloat(value) || 0;
                Net.updateProps(el.id, { [key]: value });
                if (key === 'landCoverClass' && el.type === 'SUBCATCHMENT' && window.LandCoverModule) {
                    const code = parseInt(value, 10);
                    const isObstacle = value.includes('obstacle');
                    if (code > 0) {
                        window.LandCoverModule.applyToSubcatchment(el, code, { builtUpMode: isObstacle ? 'OBSTACLE' : 'PAVEMENT' });
                        Net.updateProps(el.id, { nPerv: el.props.nPerv, nImperv: el.props.nImperv, landCoverClass: value });
                        renderPropsPanel();
                    }
                }
                // manual length edit disables auto length
                if (key === 'length' && el.type === 'CONDUIT') {
                    Net.updateProps(el.id, { autoLength: false });
                    renderPropsPanel();
                }
                if (key === 'autoLength' && value === true && el.type === 'CONDUIT') {
                    Net.updateProps(el.id, {}); // triggers recompute
                    renderPropsPanel();
                }
            });
        });

        const btnDetectLandcover = document.getElementById('prop-detect-landcover');
        if (btnDetectLandcover && el.type === 'SUBCATCHMENT') {
            btnDetectLandcover.addEventListener('click', () => {
                if (window.LandCoverModule && window.LandCoverModule.sampleSubcatchmentLandCover) {
                    const res = window.LandCoverModule.sampleSubcatchmentLandCover(el, window.map);
                    if (res) {
                        Net.updateProps(el.id, {
                            imperv: res.impervPct,
                            nPerv: res.nPervWeighted,
                            nImperv: res.nImpervWeighted
                        });
                        renderPropsPanel();
                        const summaryStr = res.breakdown.map(b => `${b.pct}% ${b.name}`).join(', ');
                        if (window.showResultsWarning) {
                            window.showResultsWarning(`Detected Land Cover for ${el.id}: ${res.impervPct}% Imperv (${summaryStr}).`);
                        }
                    } else {
                        alert('Land cover sampling requires a valid subcatchment polygon.');
                    }
                }
            });
        }

        const btnSampleDem = document.getElementById('prop-sample-dem');
        if (btnSampleDem && el.lngLat) {
            btnSampleDem.addEventListener('click', async () => {
                const fn = window.sampleDEMElevationAsync || window.sampleDEMElevation;
                const elev = fn ? await fn(el.lngLat) : null;
                if (elev !== null && elev !== undefined) {
                    Net.updateProps(el.id, { invertEl: elev });
                    renderPropsPanel();
                    window.showResultsWarning(`Updated ${el.id} elevation to ${elev} m.`);
                } else {
                    alert('DEM elevation unavailable for this coordinate. Ensure 3D View is enabled or check API key.');
                }
            });
        }

        const btnEditRain = document.getElementById('prop-edit-raindata');
        if (btnEditRain) {
            btnEditRain.addEventListener('click', () => {
                const tsName = el.props.sourceName || 'TS1';
                openRainDataEditor(tsName);
            });
        }

        const propId = document.getElementById('prop-id');
        if (type === 'MESH2D') {
            propId.readOnly = true;
            document.getElementById('prop-delete').style.display = 'none';
        } else {
            propId.addEventListener('change', (e) => {
                const newId = Net.renameElement(el.id, e.target.value);
                App.selection.delete(id);
                App.selection.add(newId);
                window.setElementState(newId, { selected: true });
                renderPropsPanel();
            });
            document.getElementById('prop-delete').addEventListener('click', () => Tools.deleteSelection());
        }
    };

    function openRainDataEditor(seriesName) {
        if (!seriesName) seriesName = 'TS1';
        const modal = document.getElementById('ts-data-editor-modal');
        if (!modal) return;
        document.getElementById('ts-data-title').innerText = `Edit Time Series Rain Data: ${seriesName}`;

        if (!Net.timeseries) Net.timeseries = {};
        if (!Net.timeseries[seriesName] || !Net.timeseries[seriesName].length) {
            Net.timeseries[seriesName] = [
                { date: '', time: '0:00', value: 0 },
                { date: '', time: '1:00', value: 10 },
                { date: '', time: '2:00', value: 20 },
                { date: '', time: '3:00', value: 5 }
            ];
        }

        let rows = JSON.parse(JSON.stringify(Net.timeseries[seriesName]));

        function renderTable() {
            const tbody = document.getElementById('ts-data-tbody');
            if (!tbody) return;
            tbody.innerHTML = '';
            rows.forEach((r, idx) => {
                const tr = document.createElement('tr');
                // date/time are raw strings from the imported .inp — escape
                // them so a crafted token can't break out of the value="" attr
                tr.innerHTML = `
                    <td><input type="text" class="ts-row-date" data-idx="${idx}" value="${esc(r.date || '')}" placeholder="MM/DD/YYYY"></td>
                    <td><input type="text" class="ts-row-time" data-idx="${idx}" value="${esc(r.time || '0:00')}" placeholder="HH:MM"></td>
                    <td><input type="number" step="any" class="ts-row-val" data-idx="${idx}" value="${r.value ?? 0}"></td>
                    <td><button class="ts-btn-icon-del" data-idx="${idx}">&times;</button></td>
                `;
                tbody.appendChild(tr);
            });

            tbody.querySelectorAll('.ts-row-date').forEach(inp => {
                inp.onchange = (e) => { rows[+e.target.dataset.idx].date = e.target.value.trim(); };
            });
            tbody.querySelectorAll('.ts-row-time').forEach(inp => {
                inp.onchange = (e) => { rows[+e.target.dataset.idx].time = e.target.value.trim(); };
            });
            tbody.querySelectorAll('.ts-row-val').forEach(inp => {
                inp.onchange = (e) => { rows[+e.target.dataset.idx].value = parseFloat(e.target.value) || 0; };
            });
            tbody.querySelectorAll('.ts-btn-icon-del').forEach(btn => {
                btn.onclick = (e) => {
                    const idx = +e.target.dataset.idx;
                    rows.splice(idx, 1);
                    renderTable();
                };
            });
        }

        renderTable();

        document.getElementById('btn-ts-data-add').onclick = () => {
            const lastTime = rows.length > 0 ? rows[rows.length - 1].time : '0:00';
            rows.push({ date: '', time: lastTime, value: 0 });
            renderTable();
        };

        document.getElementById('btn-ts-data-clear').onclick = () => {
            rows = [];
            renderTable();
        };

        document.getElementById('btn-ts-data-scale').onclick = () => {
            const factor = parseFloat(document.getElementById('ts-scale-factor').value) || 1.0;
            rows.forEach(r => { r.value = +(r.value * factor).toFixed(4); });
            renderTable();
        };

        document.getElementById('btn-ts-data-save').onclick = () => {
            Net.timeseries[seriesName] = rows;
            Net.commit();
            modal.classList.add('hidden');
            if (window.showResultsWarning) window.showResultsWarning(`Updated rain data for time series '${seriesName}'`);
        };

        document.getElementById('btn-ts-data-cancel').onclick = () => {
            modal.classList.add('hidden');
        };

        document.getElementById('btn-ts-data-close').onclick = () => {
            modal.classList.add('hidden');
        };

        modal.classList.remove('hidden');
    }

    // Profile plot button: show when 2+ hydraulic nodes selected and results loaded
    const HYDRAULIC_TYPES = new Set(['JUNCTION', 'OUTFALL', 'STORAGE', 'DIVIDER']);
    const btnProfile = document.getElementById('btn-profile');

    function updateProfileButton() {
        if (!btnProfile) return;
        const resultsActive = window.ResultStyling && window.ResultStyling.active;
        if (!resultsActive) { btnProfile.classList.add('hidden'); return; }

        const hydroNodes = [...App.selection]
            .map(id => Net.getNode(id))
            .filter(n => n && HYDRAULIC_TYPES.has(n.type));

        if (hydroNodes.length >= 2) {
            btnProfile.classList.remove('hidden');
        } else {
            btnProfile.classList.add('hidden');
        }
    }

    if (btnProfile) {
        btnProfile.addEventListener('click', () => {
            // Collect ordered hydraulic node IDs from current selection
            const hydroIds = [...App.selection]
                .map(id => Net.getNode(id))
                .filter(n => n && HYDRAULIC_TYPES.has(n.type))
                .map(n => n.id);

            if (window.ProfilePlot) window.ProfilePlot.openForNodes(hydroIds);
        });
    }

    // Status bar + counters + undo/redo button states
    window.updateUICounts = function () {
        document.getElementById('sb-nodes').textContent = Net.nodeCount;
        document.getElementById('sb-links').textContent = Net.linkCount;
        document.getElementById('sb-subcatchments').textContent = Net.subcatchments.length;
        document.getElementById('sb-gages').textContent = Net.nodes.filter(n => n.type === 'RAINGAGE').length;
        document.getElementById('btn-undo').disabled = !Net.canUndo;
        document.getElementById('btn-redo').disabled = !Net.canRedo;

        // drop selection entries that no longer exist (e.g. after undo)
        let changed = false;
        [...App.selection].forEach(id => {
            if (!Net.findAny(id)) { App.selection.delete(id); changed = true; }
        });
        if (changed) renderPropsPanel();
    };

    // Animation UI
    const timeSliderPanel = document.getElementById('time-slider-panel');
    const timeSlider = document.getElementById('time-slider');
    const timeDisplay = document.getElementById('time-display');
    const btnPlayPause = document.getElementById('btn-play-pause');
    const btnSpeed = document.getElementById('btn-speed');

    let animationRaf = null;
    let isPlaying = false;
    let speedIdx = 0;
    const speeds = [1, 2, 4, 8, 16];

    window.AnimationUI = {
        show() {
            timeSliderPanel.classList.remove('hidden');
        },
        hide() {
            timeSliderPanel.classList.add('hidden');
            this.pause();
        },
        setRange(maxSteps) {
            timeSlider.min = 0;
            timeSlider.max = Math.max(0, maxSteps - 1);
            timeSlider.value = 0;
            this.updateDisplay();
        },
        updateDisplay() {
            const step = parseInt(timeSlider.value);
            // We'll update time display based on results data later
            timeDisplay.textContent = `Step: ${step}`;
            if (window.ResultStyling && typeof window.ResultStyling.applyToMapForStep === 'function') {
                window.ResultStyling.applyToMapForStep(step);
            }
            if (window.Tools && typeof window.Tools.updateHoverPopup === 'function') {
                window.Tools.updateHoverPopup(step);
            }
            // Sync profile plot to current time step
            if (window.ProfilePlot && typeof window.ProfilePlot.update === 'function') {
                window.ProfilePlot.update(step);
            }
            // Sync Street View overlay animation
            if (window.StreetViewOverlay && typeof window.StreetViewOverlay.scheduleRedraw === 'function') {
                window.StreetViewOverlay.scheduleRedraw();
            }
        },
        play() {
            if (isPlaying) return;
            isPlaying = true;
            btnPlayPause.textContent = '⏸ Pause';

            // rAF-driven loop: steps advance on the animation clock instead of
            // setInterval, so updates stay in sync with actual rendered frames
            // (no wasted setFeatureState calls between frames at high speeds).
            let lastTime = performance.now();
            const tick = (now) => {
                if (!isPlaying) return;
                const stepDuration = 500 / speeds[speedIdx];
                if (now - lastTime >= stepDuration) {
                    // Advance by however many steps elapsed, render once
                    const advance = Math.max(1, Math.floor((now - lastTime) / stepDuration));
                    lastTime = now;
                    let step = parseInt(timeSlider.value);
                    const max = parseInt(timeSlider.max);
                    step += advance;
                    if (step > max) step = 0;
                    timeSlider.value = step;
                    this.updateDisplay();
                }
                animationRaf = requestAnimationFrame(tick);
            };
            animationRaf = requestAnimationFrame(tick);
        },
        pause() {
            if (!isPlaying) return;
            isPlaying = false;
            btnPlayPause.textContent = '▶ Play';
            if (animationRaf) { cancelAnimationFrame(animationRaf); animationRaf = null; }
        }
    };

    btnPlayPause.addEventListener('click', () => {
        if (isPlaying) window.AnimationUI.pause();
        else window.AnimationUI.play();
    });

    btnSpeed.addEventListener('click', () => {
        speedIdx = (speedIdx + 1) % speeds.length;
        btnSpeed.textContent = speeds[speedIdx] + 'x';
        if (isPlaying) {
            window.AnimationUI.pause();
            window.AnimationUI.play();
        }
    });

    timeSlider.addEventListener('input', () => {
        if (isPlaying) window.AnimationUI.pause();
        window.AnimationUI.updateDisplay();
    });


    // Startup: restore autosaved project
    map.on('load', async () => {
        if (await Net.restoreAutosave()) {
            unitsSelect.value = Net.units;
            setTimeout(() => window.fitToNetwork(), 300);
        }
        window.updateUICounts();
    });

    // initialize defaults
    Tools.setTool('select');
    window.updateUICounts();
})();
