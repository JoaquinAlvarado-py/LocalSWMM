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
            dtmSource: 'CURRENT',
            verticalUnit: 'm',
            zFactor: 1.0,
            epsgOverride: '',
            boundaryLayer: '',
            domainBuffer: 10,
            constraintLayers: [],
            includeNodes: true,
            useRimZ: true,
            flattenRadius: 5.0,
            minNodeSeparation: 2.0,
            includeConduits: true,
            includeSubcatchments: true,
            emitNodeMap: true,
            // Quality
            maxArea: 200,
            minAngle: 33,
            maxSteiner: 0,
            allowBoundarySteiner: true,
            simplifyEps: 0.1,
            snapRadius: 0.01,
            maxBoundaryEdgeLen: 0,
            thinningEnabled: true,
            thinningNormalDot: 0.6,
            thinningPasses: 3,
            thinningMaxPoints: 10000,
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
             limiterEpsilon: 1e-6,
             fluxDhEps: 1e-6,
             cellClosure: 'FLAT',
             faceReconstruction: 'MEAN',
             vfrMinWetFrac: 0.1,
             rainfallMode: 'NATURAL_NEIGHBOUR',
            report2d: 'NO',
            // Output
            outputMode: 'inline'
        };
    }

    function loadSettings() {
        try {
            var s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
            var merged = Object.assign(defaultSettings(), s || {});
            var settingsVersion = Number(s && s._meshDtmVersion) || 0;
            if (s && settingsVersion < 2 && s.dtmSource === 'NONE') merged.dtmSource = 'CURRENT';
            if (s && settingsVersion < 3 && s.thinningEnabled === false) merged.thinningEnabled = true;
            if (s && settingsVersion < 3 && s.thinningMaxPoints === undefined) merged.thinningMaxPoints = 10000;
            merged._meshDtmVersion = 3;
            return merged;
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
            boundarySel.innerHTML = '<option value="">Auto domain: GeoTIFF extent, otherwise model hull</option>';
        }
        if (constraintDiv) {
            constraintDiv.innerHTML = '';
        }
        layers.forEach(function (layer) {
            var counts = countGeoms(layer.geojson);
            var dominant = layer.geometryClass || (counts.polygons >= counts.lines && counts.polygons >= counts.points ? 'polygon' : counts.lines >= counts.points ? 'line' : 'point');
            var label = layer.name + ' [' + dominant + '] (' + counts.points + 'pt, ' + counts.lines + 'ln, ' + counts.polygons + 'pg)';
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

        s.dtmSource = v('m2d-dtm-source', 'CURRENT');
        var tif = $('m2d-geotiff-file');
        s.geotiffFile = (tif && tif.files && tif.files.length)
            ? tif.files[0]
            : (window.App && window.App.mesh2DGeoTiffFile) || null;
        s.verticalUnit = v('m2d-vertical-unit', 'm');
        s.zFactor = n('m2d-z-factor', 1.0);
        s.epsgOverride = v('m2d-epsg-override', '');
        s.boundaryLayer = v('m2d-boundary-layer', '');
        s.domainBuffer = n('m2d-domain-buffer', 50);
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
        s.limiterEpsilon = n('m2d-limiter-epsilon', 1e-6);
        s.fluxDhEps = n('m2d-flux-dh-eps', 1e-6);
        s.cellClosure = v('m2d-cell-closure', 'FLAT');
        s.faceReconstruction = v('m2d-face-reconstruction', 'MEAN');
        s.vfrMinWetFrac = n('m2d-vfr-min-wet-frac', 0.1);
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
        set('m2d-domain-buffer', s.domainBuffer);
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
        set('m2d-limiter-epsilon', s.limiterEpsilon);
        set('m2d-flux-dh-eps', s.fluxDhEps);
        set('m2d-cell-closure', s.cellClosure);
        set('m2d-face-reconstruction', s.faceReconstruction);
        set('m2d-vfr-min-wet-frac', s.vfrMinWetFrac);
        set('m2d-rainfall-mode', s.rainfallMode);
        set('m2d-report-2d', s.report2d);

        var outRadio = modal.querySelector('input[name="m2d-output-mode"][value="' + s.outputMode + '"]');
        if (outRadio) outRadio.checked = true;

        (s.constraintLayers || []).forEach(function (name) {
            var cb = modal.querySelector('#m2d-constraint-layers input[value="' + name + '"]');
            if (cb) cb.checked = true;
        });
    }

    async function resolveElevations(result, s, transform, sampler) {
        if (!result.vertices || !result.vertices.length) return;
        if (window.Mesh2DTerrain) {
            if (sampler) await sampler.ready;
            window.Mesh2DTerrain.resolveVertexElevations(result.vertices, sampler, {
                useRimZ: s.useRimZ, flattenRadius: s.flattenRadius,
                nodes: window.Net && window.Net.nodes
            });
            if (sampler) log('✓ Terrain elevations resolved via ' + sampler.kind + (sampler.detectedCrs ? ' (' + sampler.detectedCrs + ')' : '') + '.');
            return;
        }
        // Interim Mapbox sampling until Mesh2DTerrain (Phase 2) is available.
        if ((s.effectiveDtmSource || s.dtmSource) === 'MAPBOX' && window.map && typeof window.map.queryTerrainElevation === 'function') {
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

    function terrainBbox(Net, boundary) {
        var minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
        function scan(point) {
            if (!point || typeof point[0] !== 'number' || typeof point[1] !== 'number') return;
            minLng = Math.min(minLng, point[0]); maxLng = Math.max(maxLng, point[0]);
            minLat = Math.min(minLat, point[1]); maxLat = Math.max(maxLat, point[1]);
        }
        function walk(coords) { if (!coords) return; if (typeof coords[0] === 'number') scan(coords); else coords.forEach(walk); }
        if (boundary) walk(boundary.geometry ? boundary.geometry.coordinates : boundary.coordinates);
        (Net.nodes || []).forEach(function (n) { scan(n.lngLat); });
        (Net.links || []).forEach(function (l) { (l.vertices || []).forEach(scan); });
        (Net.subcatchments || []).forEach(function (s) { (s.ring || []).forEach(scan); });
        if (!isFinite(minLng)) return null;
        var padLng = Math.max((maxLng - minLng) * 0.02, 0.0001), padLat = Math.max((maxLat - minLat) * 0.02, 0.0001);
        return [minLat - padLat, minLng - padLng, maxLat + padLat, maxLng + padLng];
    }

    async function generate() {
        var s = readSettings();
        var persisted = Object.assign({}, s); delete persisted.geotiffFile; saveSettings(persisted);
        clearLog();
        log('Starting 2D mesh generation…');
        var Net = window.Net;
        if (!Net) { log('❌ Net object not found.'); return; }
        var terrainSource = s.dtmSource === 'CURRENT'
            ? (($('dem-source-select') && $('dem-source-select').value) || 'MAPBOX')
            : s.dtmSource;
        s.effectiveDtmSource = terrainSource;
        if (!Net.subcatchments || Net.subcatchments.length === 0) {
            log('ℹ No subcatchments — meshing the full domain (boundary polygon or auto bounding domain) with the default Manning\'s n.');
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
        var hasDtmDomain = terrainSource === 'GEOTIFF' && !!s.geotiffFile;
        if (!Net.nodes.length && !Net.links.length && !Net.subcatchments.length && !boundaryPolygon && !hasDtmDomain) {
            log('❌ No model geometry to mesh. Provide nodes, links, subcatchments, a boundary layer, or a GeoTIFF domain.'); return;
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
            flattenRadius: s.flattenRadius,
            domainBuffer: s.domainBuffer,
            thinningEnabled: s.thinningEnabled,
            thinningNormalDot: s.thinningNormalDot,
            thinningPasses: s.thinningPasses,
            thinningMaxPoints: s.thinningMaxPoints,
            thinningMinSpacing: s.thinningMinSpacing
        };

        var terrainSampler = null;
        if (window.Mesh2DTerrain && terrainSource !== 'NONE') {
            if (s.epsgOverride && window.proj4 && window.fetchProjDef) {
                var projDef = await window.fetchProjDef(s.epsgOverride);
                if (projDef) window.proj4.defs(s.epsgOverride, projDef);
            }
            terrainSampler = window.Mesh2DTerrain.createSampler({
                dtmSource: terrainSource,
                verticalUnit: s.verticalUnit,
                zFactor: s.zFactor,
                epsgOverride: s.epsgOverride,
                file: s.geotiffFile,
                bbox: terrainBbox(Net, boundaryPolygon),
                apiKey: $('opentopo-api-key') ? $('opentopo-api-key').value.trim() : ''
            }, window.map);
            try { await terrainSampler.ready; } catch (e) {
                log('⚠ Terrain source failed: ' + e.message);
                terrainSampler = null;
            }
        }
        if (terrainSampler && terrainSampler.detectedCrs && terrainSampler.detectedCrs !== 'EPSG:4326' && window.proj4 && window.fetchProjDef) {
            var detectedDef = await window.fetchProjDef(terrainSampler.detectedCrs);
            if (detectedDef) {
                window.proj4.defs(terrainSampler.detectedCrs, detectedDef);
                if (terrainSampler.refreshBounds) terrainSampler.refreshBounds();
            }
        }
        if (window.App) window.App.mesh2DTerrainSampler = terrainSampler;
        if (!boundaryPolygon && terrainSampler && terrainSampler.boundsLngLat) {
            boundaryPolygon = { type: 'Polygon', coordinates: [terrainSampler.boundsLngLat] };
            sources.boundaryPolygon = boundaryPolygon;
            log('Domain: full GeoTIFF extent (' + terrainSampler.detectedCrs + ').');
        } else if (!boundaryPolygon) {
            if (terrainSource === 'GEOTIFF' && !s.geotiffFile) {
                log('⚠ GeoTIFF selected but no file is loaded — re-select the .tif in this dialog. Using the model bounding domain for now.');
            } else if (terrainSource !== 'NONE' && terrainSampler && !terrainSampler.boundsLngLat) {
                log('⚠ Raster bounds unavailable for this DEM source — using the model bounding domain instead of the full raster.');
            } else {
                log('Domain: auto bounding domain (nodes + subcatchments).');
            }
        }

        var ctx = {
            transform: transform,
            terrainSampler: terrainSampler,
            sampleZ: terrainSampler ? function (x, y) { return terrainSampler.sampleLngLat(transform.toLngLat([x, y])); } : null,
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
                 limiterEpsilon: s.limiterEpsilon,
                 fluxDhEps: s.fluxDhEps,
                 cellClosure: s.cellClosure,
                 faceReconstruction: s.faceReconstruction,
                 vfrMinWetFrac: s.vfrMinWetFrac,
                 couplingCd: s.couplingCd,
                couplingArea: s.couplingArea,
                defaultN: s.defaultN,
                outputMode: s.outputMode
            }
        };

        var btnGen = $('m2d-btn-generate');
        if (btnGen) { btnGen.disabled = true; btnGen.textContent = '⏳ Generating…'; }
        requestAnimationFrame(function () {
            window.Mesh2DTriangle.runGeneration(sources, quality, ctx, log).then(async function (result) {
                if (result.fallback) {
                    log('⚠ Fell back to poly2tri: ' + (result.fallbackResult.cells || 0) + ' cells.');
                    if (window.refreshNetworkData) window.refreshNetworkData();
                } else {
                    await resolveElevations(result, s, transform, terrainSampler);
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
        // Keep the selected GeoTIFF across dialog reopens (the File object
        // cannot be persisted to localStorage).
        var tifInput = $('m2d-geotiff-file');
        if (tifInput && !tifInput._m2dBound) {
            tifInput._m2dBound = true;
            tifInput.addEventListener('change', function () {
                if (window.App && tifInput.files && tifInput.files.length) {
                    window.App.mesh2DGeoTiffFile = tifInput.files[0];
                }
            });
        }
        populateLayers();
        writeSettings(loadSettings());
        modal.classList.remove('hidden');

        var btnGen = $('m2d-btn-generate');
        var btnClose = $('m2d-btn-close');
        var btnCloseX = $('m2d-close-x');
        var btnDownload = $('m2d-btn-download-2dm');
        var btnClear = $('m2d-btn-clear');
        if (btnGen) btnGen.onclick = generate;
        if (btnClose) btnClose.onclick = close;
        if (btnCloseX) btnCloseX.onclick = close;
        if (btnClear) {
            btnClear.onclick = function () {
                if (window.Mesh2DGenerator) window.Mesh2DGenerator.clearMesh();
                if (window.Net) window.Net.clearIndexedMesh();
                if (window.refreshNetworkData) window.refreshNetworkData();
                log('✓ 2D Mesh cleared.');
                if (window.showResultsWarning) window.showResultsWarning('2D Mesh cleared.');
                if (btnDownload) btnDownload.disabled = true;
            };
        }
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
