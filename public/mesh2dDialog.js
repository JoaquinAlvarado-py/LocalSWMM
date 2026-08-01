// mesh2dDialog.js — Tabbed "Generate 2D Mesh" dialog controller.
//
// Tabs: Sources / Quality / Hydraulics.
// Settings persisted to localStorage.  The modal HTML lives in index.html
// (#mesh2d-modal).  This module wires up controls, reads/writes settings,
// and orchestrates PSLG → Triangle → Net.setIndexedMesh.
(function (window) {
    'use strict';

    var SETTINGS_KEY = 'mesh2d-dialog-settings';
    var modal = null;
    var logEl = null;

    function $(id) { return document.getElementById(id); }

    function defaultSettings() {
        return {
            // Sources
            dtmSource: 'NONE',
            verticalUnit: 'm',
            zFactor: 1.0,
            epsgOverride: '',
            boundaryLayer: '',
            constraintLayers: [],
            includeNodes: true,
            useRimZ: true,
            flattenRadius: 5.0,
            minNodeSeparation: 2.0,
            includeConduits: true,
            includeSubcatchments: true,
            emitNodeMap: true,
            // Quality
            maxArea: 0,
            minAngle: 33,
            maxSteiner: 0,
            allowBoundarySteiner: true,
            simplifyEps: 0.1,
            snapRadius: 0.01,
            maxBoundaryEdgeLen: 0,
            thinningEnabled: false,
            thinningNormalDot: 0.6,
            thinningPasses: 3,
            thinningMaxPoints: 5000,
            thinningMinSpacing: 40,
            // Hydraulics
            defaultN: 0.045,
            couplingCd: 0.65,
            couplingArea: 'AUTO',
            maxTimestep: 2.0,
            dryDepth: 0.001,
            couplingSync: 1.0,
            theta: 0.5,
            cflNumber: 0.8,
            hMove: 0.001,
            froudeMax: 1.0,
            ltsTiers: 1,
            rainfallMode: 'NATURAL_NEIGHBOUR',
            report2d: 'NO',
            // Output
            outputMode: 'inline'
        };
    }

    function loadSettings() {
        try {
            var s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
            return Object.assign(defaultSettings(), s || {});
        } catch (e) {
            return defaultSettings();
        }
    }

    function saveSettings(s) {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
    }

    function log(msg) {
        if (logEl) {
            logEl.innerHTML += msg + '<br>';
            logEl.scrollTop = logEl.scrollHeight;
        }
        console.log('[Mesh2D Dialog] ' + msg.replace(/<[^>]*>/g, ''));
    }

    function clearLog() { if (logEl) logEl.innerHTML = ''; }

    function countGeoms(geojson) {
        var c = { points: 0, lines: 0, polygons: 0 };
        ((geojson && geojson.features) || []).forEach(function (f) {
            var t = f.geometry && f.geometry.type;
            if (t === 'Point' || t === 'MultiPoint') c.points++;
            else if (t === 'LineString' || t === 'MultiLineString') c.lines++;
            else if (t === 'Polygon' || t === 'MultiPolygon') c.polygons++;
        });
        return c;
    }

    // ---- tab switching ----
    function initTabs() {
        var tabs = modal.querySelectorAll('[data-mtab]');
        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                var target = tab.dataset.mtab;
                modal.querySelectorAll('[data-mtab]').forEach(function (t) { t.classList.remove('active'); });
                modal.querySelectorAll('.mtab-content').forEach(function (c) { c.classList.remove('active'); });
                tab.classList.add('active');
                var content = modal.querySelector('#mtab-' + target);
                if (content) content.classList.add('active');
            });
        });
    }

    // ---- populate constraint layer lists ----
    function populateLayers() {
        var layers = (window.App && window.App.importedLayers) || [];
        var boundarySel = $('m2d-boundary-layer');
        var constraintDiv = $('m2d-constraint-layers');
        if (boundarySel) {
            boundarySel.innerHTML = '<option value="">Convex hull (auto)</option>';
        }
        if (constraintDiv) {
            constraintDiv.innerHTML = '';
        }
        layers.forEach(function (layer) {
            var counts = countGeoms(layer.geojson);
            var label = layer.name + ' (' + counts.points + 'pt, ' + counts.lines + 'ln, ' + counts.polygons + 'pg)';
            if (boundarySel && counts.polygons > 0) {
                var opt = document.createElement('option');
                opt.value = layer.name;
                opt.textContent = label;
                boundarySel.appendChild(opt);
            }
            if (constraintDiv) {
                var lbl = document.createElement('label');
                lbl.className = 'm2d-check';
                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = layer.name;
                cb.dataset.layerName = layer.name;
                lbl.appendChild(cb);
                lbl.appendChild(document.createTextNode(' ' + label));
                constraintDiv.appendChild(lbl);
            }
        });
    }

    // ---- read settings from controls ----
    function readSettings() {
        var s = defaultSettings();
        var v = function (id, fallback) { var el = $(id); return el ? el.value : fallback; };
        var n = function (id, fallback) { var el = $(id); var val = el ? parseFloat(el.value) : fallback; return isNaN(val) ? fallback : val; };
        var b = function (id, fallback) { var el = $(id); return el ? el.checked : fallback; };

        s.dtmSource = v('m2d-dtm-source', 'NONE');
        s.verticalUnit = v('m2d-vertical-unit', 'm');
        s.zFactor = n('m2d-z-factor', 1.0);
        s.epsgOverride = v('m2d-epsg-override', '');
        s.boundaryLayer = v('m2d-boundary-layer', '');
        s.includeNodes = b('m2d-include-nodes', true);
        s.useRimZ = b('m2d-use-rimz', true);
        s.flattenRadius = n('m2d-flatten-radius', 5.0);
        s.minNodeSeparation = n('m2d-min-node-sep', 2.0);
        s.includeConduits = b('m2d-include-conduits', true);
        s.includeSubcatchments = b('m2d-include-subs', true);
        s.emitNodeMap = b('m2d-emit-node-map', true);

        s.maxArea = n('m2d-max-area', 0);
        s.minAngle = n('m2d-min-angle', 33);
        s.maxSteiner = n('m2d-max-steiner', 0);
        s.allowBoundarySteiner = b('m2d-allow-boundary-steiner', true);
        s.simplifyEps = n('m2d-simplify-eps', 0.1);
        s.snapRadius = n('m2d-snap-radius', 0.01);
        s.maxBoundaryEdgeLen = n('m2d-max-edge-len', 0);
        s.thinningEnabled = b('m2d-thinning-enabled', false);
        s.thinningNormalDot = n('m2d-thinning-normal-dot', 0.6);
        s.thinningPasses = n('m2d-thinning-passes', 3);
        s.thinningMaxPoints = n('m2d-thinning-max-points', 5000);
        s.thinningMinSpacing = n('m2d-thinning-min-spacing', 40);

        s.defaultN = n('m2d-default-n', 0.045);
        s.couplingCd = n('m2d-coupling-cd', 0.65);
        s.couplingArea = v('m2d-coupling-area', 'AUTO');
        s.maxTimestep = n('m2d-max-timestep', 2.0);
        s.dryDepth = n('m2d-dry-depth', 0.001);
        s.couplingSync = n('m2d-coupling-sync', 1.0);
        s.theta = n('m2d-theta', 0.5);
        s.cflNumber = n('m2d-cfl-number', 0.8);
        s.hMove = n('m2d-hmove', 0.001);
        s.froudeMax = n('m2d-froude-max', 1.0);
        s.ltsTiers = n('m2d-lts-tiers', 1);
        s.rainfallMode = v('m2d-rainfall-mode', 'NATURAL_NEIGHBOUR');
        s.report2d = v('m2d-report-2d', 'NO');

        var outRadio = modal.querySelector('input[name="m2d-output-mode"]:checked');
        s.outputMode = outRadio ? outRadio.value : 'inline';

        // constraint layers
        s.constraintLayers = [];
        var cbs = modal.querySelectorAll('#m2d-constraint-layers input:checked');
        cbs.forEach(function (cb) { s.constraintLayers.push(cb.value); });

        return s;
    }

    // ---- write settings to controls ----
    function writeSettings(s) {
        var set = function (id, val) { var el = $(id); if (el && val !== undefined) el.value = val; };
        var setChk = function (id, val) { var el = $(id); if (el && val !== undefined) el.checked = !!val; };

        set('m2d-dtm-source', s.dtmSource);
        set('m2d-vertical-unit', s.verticalUnit);
        set('m2d-z-factor', s.zFactor);
        set('m2d-epsg-override', s.epsgOverride);
        set('m2d-boundary-layer', s.boundaryLayer);
        setChk('m2d-include-nodes', s.includeNodes);
        setChk('m2d-use-rimz', s.useRimZ);
        set('m2d-flatten-radius', s.flattenRadius);
        set('m2d-min-node-sep', s.minNodeSeparation);
        setChk('m2d-include-conduits', s.includeConduits);
        setChk('m2d-include-subs', s.includeSubcatchments);
        setChk('m2d-emit-node-map', s.emitNodeMap);

        set('m2d-max-area', s.maxArea);
        set('m2d-min-angle', s.minAngle);
        set('m2d-max-steiner', s.maxSteiner);
        setChk('m2d-allow-boundary-steiner', s.allowBoundarySteiner);
        set('m2d-simplify-eps', s.simplifyEps);
        set('m2d-snap-radius', s.snapRadius);
        set('m2d-max-edge-len', s.maxBoundaryEdgeLen);
        setChk('m2d-thinning-enabled', s.thinningEnabled);
        set('m2d-thinning-normal-dot', s.thinningNormalDot);
        set('m2d-thinning-passes', s.thinningPasses);
        set('m2d-thinning-max-points', s.thinningMaxPoints);
        set('m2d-thinning-min-spacing', s.thinningMinSpacing);

        set('m2d-default-n', s.defaultN);
        set('m2d-coupling-cd', s.couplingCd);
        set('m2d-coupling-area', s.couplingArea);
        set('m2d-max-timestep', s.maxTimestep);
        set('m2d-dry-depth', s.dryDepth);
        set('m2d-coupling-sync', s.couplingSync);
        set('m2d-theta', s.theta);
        set('m2d-cfl-number', s.cflNumber);
        set('m2d-hmove', s.hMove);
        set('m2d-froude-max', s.froudeMax);
        set('m2d-lts-tiers', s.ltsTiers);
        set('m2d-rainfall-mode', s.rainfallMode);
        set('m2d-report-2d', s.report2d);

        var outRadio = modal.querySelector('input[name="m2d-output-mode"][value="' + s.outputMode + '"]');
        if (outRadio) outRadio.checked = true;

        (s.constraintLayers || []).forEach(function (name) {
            var cb = modal.querySelector('#m2d-constraint-layers input[value="' + name + '"]');
            if (cb) cb.checked = true;
        });
    }

    function resolveElevations(result, s, transform) {
        if (!result.vertices || !result.vertices.length) return;
        if (window.Mesh2DTerrain && s.dtmSource !== 'NONE') {
            var sampler = window.Mesh2DTerrain.createSampler({
                dtmSource: s.dtmSource, verticalUnit: s.verticalUnit,
                zFactor: s.zFactor, epsgOverride: s.epsgOverride
            }, window.map);
            if (sampler) {
                window.Mesh2DTerrain.resolveVertexElevations(result.vertices, sampler, {
                    useRimZ: s.useRimZ, flattenRadius: s.flattenRadius
                });
                log('✓ Terrain elevations resolved via ' + sampler.kind + '.');
                return;
            }
        }
        // Interim Mapbox sampling until Mesh2DTerrain (Phase 2) is available.
        if (s.dtmSource === 'MAPBOX' && window.map && typeof window.map.queryTerrainElevation === 'function') {
            var unitFactor = s.verticalUnit === 'ft' ? 0.3048 : (s.verticalUnit === 'cm' ? 0.01 : 1.0);
            var sampled = 0;
            result.vertices.forEach(function (v) {
                if (!Number.isFinite(v.z)) {
                    var q = window.map.queryTerrainElevation([v.lng, v.lat]);
                    if (Number.isFinite(q)) { v.z = q * unitFactor * (s.zFactor || 1); sampled++; }
                }
            });
            log('Mapbox terrain sampled for ' + sampled + ' vertices.');
        }
        var zeroed = 0;
        result.vertices.forEach(function (v) { if (!Number.isFinite(v.z)) { v.z = 0; zeroed++; } });
        if (zeroed > 0) log('⚠ ' + zeroed + ' vertices had no elevation source — set to 0.');
    }

    function generate() {
        var s = readSettings();
        saveSettings(s);
        clearLog();
        log('Starting 2D mesh generation…');
        var Net = window.Net;
        if (!Net) { log('❌ Net object not found.'); return; }
        if (!Net.subcatchments || Net.subcatchments.length === 0) {
            log('❌ No subcatchments found. Draw or import subcatchments first.'); return;
        }
        var origin = window.Mesh2DProj.originFromModel(Net);
        var transform = window.Mesh2DProj.makeTransform(origin);
        log('Origin: ' + origin.lng.toFixed(6) + ', ' + origin.lat.toFixed(6));

        var boundaryPolygon = null;
        if (s.boundaryLayer) {
            var layers = (window.App && window.App.importedLayers) || [];
            for (var i = 0; i < layers.length; i++) {
                if (layers[i].name === s.boundaryLayer) {
                    var feats = (layers[i].geojson && layers[i].geojson.features) || [];
                    for (var j = 0; j < feats.length; j++) {
                        if (feats[j].geometry && /Polygon/.test(feats[j].geometry.type)) {
                            boundaryPolygon = feats[j].geometry.type === 'MultiPolygon'
                                ? { coordinates: feats[j].geometry.coordinates[0] } : feats[j];
                            break;
                        }
                    }
                    break;
                }
            }
        }
        var constraintLayers = [];
        (s.constraintLayers || []).forEach(function (name) {
            var found = ((window.App && window.App.importedLayers) || []).find(function (l) { return l.name === name; });
            if (found) constraintLayers.push(found);
        });

        var sources = {
            subcatchments: Net.subcatchments || [],
            nodes: Net.nodes || [],
            links: Net.links || [],
            boundaryPolygon: boundaryPolygon,
            constraintLayers: constraintLayers
        };

        var quality = {
            maxArea: s.maxArea,
            minAngle: s.minAngle,
            maxSteiner: s.maxSteiner,
            allowBoundarySteiner: s.allowBoundarySteiner,
            simplifyEps: s.simplifyEps,
            snapRadius: s.snapRadius,
            maxBoundaryEdge: s.maxBoundaryEdgeLen,
            minNodeSep: s.minNodeSeparation,
            flattenRadius: s.flattenRadius
        };

        var ctx = {
            transform: transform,
            includeNodes: s.includeNodes,
            includeConduits: s.includeConduits,
            includeSubcatchments: s.includeSubcatchments,
            useRimZ: s.useRimZ,
            defaultManningN: s.defaultN,
            defaultCd: s.couplingCd,
            options: {
                rainfallMode: s.rainfallMode,
                report2d: s.report2d,
                maxTimestep: s.maxTimestep,
                dryDepth: s.dryDepth,
                couplingSync: s.couplingSync,
                theta: s.theta,
                cflNumber: s.cflNumber,
                hMove: s.hMove,
                froudeMax: s.froudeMax,
                ltsTiers: s.ltsTiers,
                couplingCd: s.couplingCd,
                couplingArea: s.couplingArea,
                defaultN: s.defaultN,
                outputMode: s.outputMode
            }
        };

        var btnGen = $('m2d-btn-generate');
        if (btnGen) { btnGen.disabled = true; btnGen.textContent = '⏳ Generating…'; }
        requestAnimationFrame(function () {
            window.Mesh2DTriangle.runGeneration(sources, quality, ctx, log).then(function (result) {
                if (result.fallback) {
                    log('⚠ Fell back to poly2tri: ' + (result.fallbackResult.cells || 0) + ' cells.');
                    if (window.refreshNetworkData) window.refreshNetworkData();
                } else {
                    resolveElevations(result, s, transform);
                    if (!s.emitNodeMap) {
                        result.vertexNodeMap = [];
                    } else if (window.Mesh2DCoupling) {
                        result.vertexNodeMap = window.Mesh2DCoupling.buildVertexNodeMap(result, Net.nodes, {
                            defaultCd: s.couplingCd, areaMode: s.couplingArea });
                    }
                    Net.setIndexedMesh(result);
                    if (window.refreshNetworkData) window.refreshNetworkData();
                    var dl = $('m2d-btn-download-2dm');
                    if (dl) dl.disabled = false;
                    log('✓ Mesh generated: ' + result.vertices.length + ' vertices, ' +
                        result.triangles.length + ' triangles.');
                }
                (result.warnings || []).forEach(function (w) { log('⚠ ' + w); });
            }).catch(function (err) {
                log('❌ Generation failed: ' + (err.message || err));
                console.error('Mesh2D generation error:', err);
            }).then(function () {
                if (btnGen) { btnGen.disabled = false; btnGen.textContent = 'Generate'; }
            });
        });
    }

    var tabsInitialized = false;

    function open() {
        modal = $('mesh2d-modal');
        if (!modal) {
            console.error('[Mesh2D Dialog] Modal #mesh2d-modal not found in document');
            return;
        }
        logEl = $('m2d-log');
        if (!tabsInitialized) { initTabs(); tabsInitialized = true; }
        populateLayers();
        writeSettings(loadSettings());
        modal.classList.remove('hidden');

        var btnGen = $('m2d-btn-generate');
        var btnClose = $('m2d-btn-close');
        var btnCloseX = $('m2d-close-x');
        var btnDownload = $('m2d-btn-download-2dm');
        if (btnGen) btnGen.onclick = generate;
        if (btnClose) btnClose.onclick = close;
        if (btnCloseX) btnCloseX.onclick = close;
        if (btnDownload) {
            btnDownload.disabled = !(window.Net && window.Net.mesh2DIndexed);
            btnDownload.onclick = function () {
                if (window.Mesh2DExport && window.Net && window.Net.mesh2DIndexed) {
                    window.Mesh2DExport.download2dm(window.Net.mesh2DIndexed);
                } else {
                    log('⚠ Generate a mesh first (or the export module is not loaded).');
                }
            };
        }
    }

    function close() {
        if (modal) modal.classList.add('hidden');
    }

    function getSettings() { return loadSettings(); }

    window.Mesh2DDialog = { open: open, close: close, getSettings: getSettings, generate: generate };
})(window);
