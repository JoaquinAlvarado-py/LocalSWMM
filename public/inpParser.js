// inpParser.js â€” Parse a SWMM .inp file into a Network-model shape
// Coordinates are returned raw (may be UTM/local); the caller
// reprojects before loading into the Network.

class InpParser {

    parse(text) {
        const sections = {};
        const rawSections = {};
        const lines = text.split(/\r?\n/);
        let current = null;

        for (let line of lines) {
            let cleanLine = line.replace(/;.*$/, '').trim(); // strip inline comments
            if (cleanLine.startsWith('[') && cleanLine.endsWith(']')) {
                current = cleanLine.substring(1, cleanLine.length - 1).toUpperCase();
                if (!sections[current]) sections[current] = [];
                if (!rawSections[current]) rawSections[current] = [];
            } else if (current) {
                if (cleanLine) sections[current].push(cleanLine.split(/\s+/));
                rawSections[current].push(line);
            }
        }
        this.sections = sections;
        this.rawSections = rawSections;
        const originMatch = String(text).match(/;;\s*2D_ORIGIN\s+([-+\d.eE]+)\s+([-+\d.eE]+)/i);
        this.mesh2DOrigin = originMatch ? { lng: Number(originMatch[1]), lat: Number(originMatch[2]) } : { lng: 0, lat: 0 };
        return this.buildModel();
    }

    num(v, fallback = 0) {
        const n = parseFloat(v);
        return isNaN(n) ? fallback : n;
    }

    buildModel() {
        const S = this.sections;
        const model = {
            title: (S['TITLE'] || []).map(r => r.join(' ')).join(' ').trim() || 'Imported SWMM Project',
            units: 'SI',
            options: {},
            nodes: [],
            links: [],
            subcatchments: [],
            mesh2D: [],
            mesh2DIndexed: null,
            timeseries: {},
            rawSections: this.rawSections,
            curves: [],
            lidControls: [],
            lidUsages: [],
            pollutants: [],
            landUses: [],
            treatments: [],
            aquifers: [],
            snowpacks: [],
            snowpackAssignments: []
        };

        // --- TIMESERIES ---
        (S['TIMESERIES'] || []).forEach(row => {
            if (row.length < 3) return;
            const tsName = row[0];
            if (!model.timeseries[tsName]) model.timeseries[tsName] = [];
            let date = '', time = '', val = 0;
            if (row.length >= 4) {
                date = row[1];
                time = row[2];
                val = this.num(row[3]);
            } else {
                time = row[1];
                val = this.num(row[2]);
            }
            model.timeseries[tsName].push({ date, time, value: val });
        });

        // --- OPTIONS ---
        // Every option is kept verbatim in options.raw so the exporter can
        // reproduce settings it has no UI for (ALLOW_PONDING, MAX_TRIALS, â€¦).
        model.options.raw = {};
        (S['OPTIONS'] || []).forEach(row => {
            const key = (row[0] || '').toUpperCase();
            const val = row.slice(1).join(' ');
            model.options.raw[key] = val;
            switch (key) {
                case 'FLOW_UNITS':
                    model.units = ['CFS', 'GPM', 'MGD'].includes(val.toUpperCase()) ? 'US' : 'SI';
                    model.options.flowUnits = val.toUpperCase();
                    break;
                case 'INFILTRATION': model.options.infiltration = val; break;
                case 'FLOW_ROUTING': model.options.flowRouting = val; break;
                case 'START_DATE': model.options.startDate = val; break;
                case 'START_TIME': model.options.startTime = val; break;
                case 'END_DATE': model.options.endDate = val; break;
                case 'END_TIME': model.options.endTime = val; break;
                case 'REPORT_STEP': model.options.reportStep = val; break;
                case 'WET_STEP': model.options.wetStep = val; break;
                case 'DRY_STEP': model.options.dryStep = val; break;
                case 'ROUTING_STEP': model.options.routingStep = val; break;
                case 'NODE_CONTINUITY': model.options.nodeContinuity = val; break;
                case 'ANDERSON_ACCEL': model.options.andersonAccel = val; break;
            }
        });

        // --- RDII_DECAY ---
        if (S['RDII_DECAY'] && S['RDII_DECAY'].length > 0) {
            const row = S['RDII_DECAY'][0];
            if (row.length >= 3) {
                model.options.rdiiDecay = { k0: row[0], kT: row[1], tRef: row[2] };
            }
        }

        // --- Coordinates lookup ---
        const coords = {};
        (S['COORDINATES'] || []).forEach(row => {
            if (row.length >= 3) coords[row[0]] = [this.num(row[1]), this.num(row[2])];
        });

        // --- Nodes ---
        (S['JUNCTIONS'] || []).forEach(row => {
            if (!coords[row[0]]) return;
            model.nodes.push({
                id: row[0], type: 'JUNCTION', lngLat: coords[row[0]],
                props: {
                    invertEl: this.num(row[1]), maxDepth: this.num(row[2]),
                    initDepth: this.num(row[3]), surDepth: this.num(row[4]), aponded: this.num(row[5])
                }
            });
        });

        (S['OUTFALLS'] || []).forEach(row => {
            if (!coords[row[0]]) return;
            const type = (row[2] || 'FREE').toUpperCase();
            const hasStage = ['FIXED', 'TIDAL', 'TIMESERIES'].includes(type);
            model.nodes.push({
                id: row[0], type: 'OUTFALL', lngLat: coords[row[0]],
                props: {
                    invertEl: this.num(row[1]), outfallType: type,
                    stageData: hasStage ? (row[3] || '') : '',
                    gated: (hasStage ? row[4] : row[3]) || 'NO'
                }
            });
        });

        (S['STORAGE'] || []).forEach(row => {
            if (!coords[row[0]]) return;
            const shape = (row[4] || 'FUNCTIONAL').toUpperCase();
            // TABULAR storages carry a geometry curve name where FUNCTIONAL
            // ones carry coeff/exponent/constant numbers
            const tabular = shape === 'TABULAR';
            model.nodes.push({
                id: row[0], type: 'STORAGE', lngLat: coords[row[0]],
                props: {
                    invertEl: this.num(row[1]), maxDepth: this.num(row[2]), initDepth: this.num(row[3]),
                    shape,
                    curveName: tabular ? (row[5] || '') : '',
                    coeff: tabular ? 1000 : this.num(row[5], 1000),
                    exponent: tabular ? 0 : this.num(row[6]),
                    constant: tabular ? 0 : this.num(row[7]),
                    surDepth: tabular ? this.num(row[6]) : this.num(row[8]),
                    fevap: tabular ? this.num(row[7]) : this.num(row[9])
                }
            });
        });

        (S['DIVIDERS'] || []).forEach(row => {
            if (!coords[row[0]]) return;
            model.nodes.push({
                id: row[0], type: 'DIVIDER', lngLat: coords[row[0]],
                props: {
                    invertEl: this.num(row[1]), divertedLink: row[2] || '',
                    dividerType: (row[3] || 'CUTOFF').toUpperCase(),
                    param: this.num(row[4]), maxDepth: this.num(row[5], 2)
                }
            });
        });

        // --- Rain gages (placed via [SYMBOLS] if present) ---
        const symbols = {};
        (S['SYMBOLS'] || []).forEach(row => {
            if (row.length >= 3) symbols[row[0]] = [this.num(row[1]), this.num(row[2])];
        });
        const defaultCoord = Object.values(coords)[0] || [0, 0];
        (S['RAINGAGES'] || []).forEach(row => {
            const pos = symbols[row[0]] || [defaultCoord[0], defaultCoord[1]];
            const sourceType = (row[4] || 'TIMESERIES').toUpperCase();
            model.nodes.push({
                id: row[0], type: 'RAINGAGE', lngLat: pos,
                props: {
                    format: (row[1] || 'INTENSITY').toUpperCase(), interval: row[2] || '1:00',
                    scf: this.num(row[3], 1.0),
                    sourceType: sourceType,
                    sourceName: sourceType === 'TIMESERIES' ? (row[5] || 'TS1') : '',
                    fileName: sourceType === 'FILE' ? (row[5] || '') : '',
                    stationID: sourceType === 'FILE' ? (row[6] || '*') : '*',
                    rainUnits: sourceType === 'FILE' ? (row[7] || 'IN') : 'IN',
                    description: '', tag: ''
                }
            });
        });

        // --- Link vertices ---
        const vertices = {};
        (S['VERTICES'] || []).forEach(row => {
            if (row.length < 3) return;
            if (!vertices[row[0]]) vertices[row[0]] = [];
            vertices[row[0]].push([this.num(row[1]), this.num(row[2])]);
        });

        const nodeIds = new Set(model.nodes.map(n => n.id));
        const pushLink = (row, type, props) => {
            if (!nodeIds.has(row[1]) || !nodeIds.has(row[2])) return;
            model.links.push({
                id: row[0], type, from: row[1], to: row[2],
                vertices: vertices[row[0]] || [],
                props: Object.assign({ description: '', tag: '' }, props)
            });
        };

        (S['CONDUITS'] || []).forEach(row => pushLink(row, 'CONDUIT', {
            length: this.num(row[3], 100), autoLength: false, roughness: this.num(row[4], 0.013),
            inOffset: this.num(row[5]), outOffset: this.num(row[6]),
            initFlow: this.num(row[7]), maxFlow: this.num(row[8]),
            entryLoss: 0, exitLoss: 0, avgLoss: 0, seepageRate: 0, gated: 'NO', culvertCode: '',
            xShape: 'CIRCULAR', geom1: 1.0, geom2: 0, geom3: 0, geom4: 0, barrels: 1
        }));

        (S['PUMPS'] || []).forEach(row => pushLink(row, 'PUMP', {
            pumpCurve: row[3] || '*', status: (row[4] || 'ON').toUpperCase(),
            startup: this.num(row[5]), shutoff: this.num(row[6])
        }));

        (S['WEIRS'] || []).forEach(row => pushLink(row, 'WEIR', {
            weirType: (row[3] || 'TRANSVERSE').toUpperCase(), crestHt: this.num(row[4]),
            offset: this.num(row[4]), qCoeff: this.num(row[5], 3.33), gated: (row[6] || 'NO').toUpperCase(),
            endCon: this.num(row[7]), endCoeff: this.num(row[8]),
            // … Surcharge RoadWidth RoadSurf CoeffCurve — the road pair sits
            // between Surcharge and the coefficient curve name
            surcharge: (row[9] || 'YES').toUpperCase(),
            roadWidth: this.num(row[10]), roadSurface: (row[11] || 'PAVED').toUpperCase(),
            coeffCurve: row[12] || '',
            xShape: 'RECT_OPEN', geom1: 1.0, geom2: 1.0, geom3: 0, geom4: 0
        }));

        (S['ORIFICES'] || []).forEach(row => pushLink(row, 'ORIFICE', {
            orificeType: (row[3] || 'SIDE').toUpperCase(), offset: this.num(row[4]),
            qCoeff: this.num(row[5], 0.65), gated: (row[6] || 'NO').toUpperCase(),
            xShape: 'CIRCULAR', geom1: 1.0, geom2: 0, geom3: 0, geom4: 0
        }));

        (S['OUTLETS'] || []).forEach(row => {
            const outletType = (row[4] || 'FUNCTIONAL/DEPTH').toUpperCase();
            const tabular = outletType.startsWith('TABULAR');
            pushLink(row, 'OUTLET', tabular ? {
                offset: this.num(row[3]), outletType,
                curveName: row[5] || '', qCoeff: 10, qExpon: 0.5,
                gated: (row[6] || 'NO').toUpperCase()
            } : {
                offset: this.num(row[3]), outletType,
                curveName: '', qCoeff: this.num(row[5], 10), qExpon: this.num(row[6], 0.5),
                gated: (row[7] || 'NO').toUpperCase()
            });
        });

        // --- Cross sections applied onto links ---
        const geomVal = (v, fallback) => {
            if (v === undefined || v === '') return fallback;
            const n = parseFloat(v);
            return isNaN(n) ? v : n;
        };
        const linkById = {};
        model.links.forEach(l => linkById[l.id.toUpperCase()] = l);
        (S['XSECTIONS'] || []).forEach(row => {
            const l = linkById[row[0].toUpperCase()];
            if (!l) return;
            l.props.xShape = (row[1] || 'CIRCULAR').toUpperCase();
            l.props.geom1 = geomVal(row[2], 1);
            l.props.geom2 = geomVal(row[3], 0);
            l.props.geom3 = geomVal(row[4], 0);
            l.props.geom4 = geomVal(row[5], 0);
            l.props.barrels = this.num(row[6], 1);
        });

        // --- Losses applied onto links ---
        (S['LOSSES'] || []).forEach(row => {
            const l = linkById[row[0].toUpperCase()];
            if (!l) return;
            l.props.entryLoss = this.num(row[1]);
            l.props.exitLoss = this.num(row[2]);
            l.props.avgLoss = this.num(row[3]);
            if (row[4]) l.props.gated = row[4].toUpperCase();
            if (row[5]) l.props.seepageRate = this.num(row[5]);
        });

        // --- Subcatchments ---
        const polygons = {};
        (S['POLYGONS'] || []).forEach(row => {
            if (row.length < 3) return;
            const key = row[0].toUpperCase();
            if (!polygons[key]) polygons[key] = [];
            polygons[key].push([this.num(row[1]), this.num(row[2])]);
        });

        const subMap = {};
        (S['SUBCATCHMENTS'] || []).forEach(row => {
            const key = row[0].toUpperCase();
            let ring = polygons[key];
            if (!ring || ring.length < 3) {
                const c = coords[row[0]] || coords[key] || defaultCoord;
                const d = 0.001;
                ring = [
                    [c[0] - d, c[1] - d],
                    [c[0] + d, c[1] - d],
                    [c[0] + d, c[1] + d],
                    [c[0] - d, c[1] + d]
                ];
            }
            const sub = {
                id: row[0],
                ring: ring,
                props: {
                    description: '', tag: '',
                    raingage: row[1] || 'RG1', outlet: row[2] || '',
                    area: this.num(row[3], 10), autoArea: false,
                    imperv: this.num(row[4], 50), width: this.num(row[5], 500),
                    slope: this.num(row[6], 0.5), curbLen: this.num(row[7]),
                    nImperv: 0.01, nPerv: 0.1, dstoreImperv: 0.05, dstorePerv: 0.05,
                    pctZero: 25, subareaRouting: 'OUTLET', pctRouted: 100,
                    infilMaxRate: 3.0, infilMinRate: 0.5, infilDecay: 4.0, infilDryTime: 7.0, infilMaxInfil: 0
                }
            };
            subMap[key] = sub;
            model.subcatchments.push(sub);
        });

        // --- Subareas applied onto subcatchments ---
        (S['SUBAREAS'] || []).forEach(row => {
            const s = subMap[row[0].toUpperCase()];
            if (!s) return;
            s.props.nImperv = this.num(row[1], 0.01);
            s.props.nPerv = this.num(row[2], 0.1);
            s.props.dstoreImperv = this.num(row[3], 0.05);
            s.props.dstorePerv = this.num(row[4], 0.05);
            s.props.pctZero = this.num(row[5], 25);
            if (row[6]) s.props.subareaRouting = row[6].toUpperCase();
            if (row[7] !== undefined) s.props.pctRouted = this.num(row[7], 100);
        });

        // --- Infiltration applied onto subcatchments ---
        (S['INFILTRATION'] || []).forEach(row => {
            const s = subMap[row[0].toUpperCase()];
            if (!s) return;
            s.props.infilMaxRate = this.num(row[1], 3.0);
            s.props.infilMinRate = this.num(row[2], 0.5);
            s.props.infilDecay = this.num(row[3], 4.0);
            s.props.infilDryTime = this.num(row[4], 7.0);
            s.props.infilMaxInfil = this.num(row[5], 0);
        });

        // --- Tags applied onto all elements ---
        const nodeMap = {};
        model.nodes.forEach(n => nodeMap[n.id.toUpperCase()] = n);
        (S['TAGS'] || []).forEach(row => {
            if (row.length >= 3) {
                const key = row[1].toUpperCase();
                const tag = row.slice(2).join(' ');
                const el = nodeMap[key] || linkById[key] || subMap[key];
                if (el && el.props) el.props.tag = tag;
            }
        });

        // --- Curves ---
        const curveMap = {};
        (S['CURVES'] || []).forEach(row => {
            if (row.length >= 2) {
                const id = row[0], type = row[1];
                curveMap[id] = { id, type, description: '', data: [] };
                model.curves.push(curveMap[id]);
            }
        });
        // Read curve data from raw sections (continuation lines after CURVES header)
        if (model.curves.length > 0) {
            const rawLines = this.rawSections['CURVES'] || [];
            let currentCurve = null;
            rawLines.forEach(line => {
                const clean = line.replace(/;.*$/, '').trim();
                if (!clean) return;
                const parts = clean.split(/\s+/);
                if (parts.length >= 2 && curveMap[parts[0]]) {
                    currentCurve = curveMap[parts[0]];
                } else if (currentCurve && parts.length >= 2) {
                    const x = parseFloat(parts[0]), y = parseFloat(parts[1]);
                    if (!isNaN(x) && !isNaN(y)) currentCurve.data.push({ x, y });
                }
            });
        }

        // --- LID Controls ---
        const lidMap = {};
        (S['LID_CONTROLS'] || []).forEach(row => {
            if (row.length >= 2) {
                const id = row[0], type = row[1];
                const lid = { id, type, surface: {}, soil: {}, storage: {}, drain: {}, drainmat: {}, description: '', displayColor: '#4caf50' };
                lidMap[id] = lid;
                model.lidControls.push(lid);
            }
        });
        // Parse LID layer data from raw sections
        const lidRawLines = this.rawSections['LID_CONTROLS'] || [];
        let currentLid = null;
        lidRawLines.forEach(line => {
            const clean = line.replace(/;.*$/, '').trim();
            if (!clean) return;
            const parts = clean.split(/\s+/);
            if (parts.length >= 2 && lidMap[parts[0]] && !['SURFACE','SOIL','STORAGE','DRAIN','DRAINMAT'].includes(parts[1])) {
                // Name/Type line
            } else if (parts.length >= 2 && lidMap[parts[0]] && ['SURFACE','SOIL','STORAGE','DRAIN','DRAINMAT'].includes(parts[1])) {
                currentLid = lidMap[parts[0]];
            } else if (currentLid) {
                const vals = parts.map(v => parseFloat(v));
                const layer = currentLid.type === 'SURFACE' ? 'surface' : currentLid.type === 'SOIL' ? 'soil' : currentLid.type === 'STORAGE' ? 'storage' : currentLid.type === 'DRAIN' ? 'drain' : 'drainmat';
                // Simple assignment
            }
        });

        // --- LID Usage ---
        (S['LID_USAGE'] || []).forEach(row => {
            if (row.length >= 8) {
                model.lidUsages.push({
                    subcatchment: row[0], lidControl: row[1],
                    number: parseInt(row[2]) || 1, area: parseFloat(row[3]) || 100,
                    width: parseFloat(row[4]) || 10, initSat: parseFloat(row[5]) || 0,
                    fromImp: parseFloat(row[6]) || 100, toPerv: parseFloat(row[7]) || 0
                });
            }
        });

        // --- Pollutants ---
        (S['POLLUTANTS'] || []).forEach(row => {
            if (row.length >= 2) {
                model.pollutants.push({
                    id: 'P' + (model.pollutants.length + 1),
                    name: row[0], units: row[1] || 'MG/L',
                    rainConcentration: parseFloat(row[2]) || 0,
                    gwConcentration: parseFloat(row[3]) || 0,
                    iiConcentration: parseFloat(row[4]) || 0,
                    decayCoeff: parseFloat(row[5]) || 0
                });
            }
        });

        // --- Land Uses ---
        (S['LANDUSES'] || []).forEach(row => {
            if (row.length >= 1) {
                model.landUses.push({ id: 'LU' + (model.landUses.length + 1), name: row[0], description: row.slice(1).join(' '), buildup: [], washoff: [], lastSwept: '' });
            }
        });

        // --- Treatment ---
        (S['TREATMENT'] || []).forEach(row => {
            if (row.length >= 3) {
                model.treatments.push({ node: row[0], pollutant: row[1], function: row.slice(2).join(' ') });
            }
        });

        // --- Aquifers ---
        (S['AQUIFERS'] || []).forEach(row => {
            if (row.length >= 2) {
                model.aquifers.push({
                    id: 'A' + (model.aquifers.length + 1), name: row[0],
                    porosity: parseFloat(row[1]) || 0.5, wiltingPoint: parseFloat(row[2]) || 0.15,
                    fieldCapacity: parseFloat(row[3]) || 0.3, conductivity: parseFloat(row[4]) || 5,
                    conductivitySlope: parseFloat(row[5]) || 10, tensionSlope: parseFloat(row[6]) || 10,
                    upperEvapFrac: parseFloat(row[7]) || 0.2, lowerEvapDepth: parseFloat(row[8]) || 1,
                    bottomElevation: parseFloat(row[9]) || -10, waterTableElevation: parseFloat(row[10]) || -2,
                    unsaturatedZone: parseFloat(row[11]) || 0.5, evapSurfaceFrac: parseFloat(row[12]) || 0,
                    etUpperDepth: parseFloat(row[13]) || 0.1, etLowerDepth: parseFloat(row[14]) || 0.5,
                    etLowerFrac: parseFloat(row[15]) || 0
                });
            }
        });

        // --- Snowpacks ---
        (S['SNOWPACKS'] || []).forEach(row => {
            if (row.length >= 2) {
                model.snowpacks.push({
                    id: 'S' + (model.snowpacks.length + 1), name: row[0],
                    minMeltCoeff: parseFloat(row[1]) || 1, maxMeltCoeff: parseFloat(row[2]) || 3,
                    baseTemp: parseFloat(row[3]) || 0, fracRiv: parseFloat(row[4]) || 0.5
                });
            }
        });
        // --- 2D Mesh (OpenSWMM Engine and legacy app dialect) ---
        const engineRows = (S['2D_VERTICES'] || []).filter(row => row.length >= 3 && isFinite(Number(row[0])));
        const engineTriangles = (S['2D_TRIANGLES'] || []).filter(row => row.length >= 4 && isFinite(Number(row[0])));
        if (engineRows.length && engineTriangles.length) {
            const origin = this.mesh2DOrigin || { lng: 0, lat: 0 };
            const metersLng = 111320 * Math.cos(origin.lat * Math.PI / 180);
            const vertices = engineRows.map(row => {
                const x = this.num(row[0]), y = this.num(row[1]), z = this.num(row[2], 0);
                return { x, y, z, lng: origin.lng + x / metersLng, lat: origin.lat + y / 111320, tag: row[3] && row[3] !== '-' ? row[3] : '' };
            });
            const triangles = engineTriangles.map(row => ({ v: [this.num(row[0]), this.num(row[1]), this.num(row[2])], n: this.num(row[3], 0.045), tag: row[4] && row[4] !== '-' ? row[4] : '' }));
            const vertexNodeMap = (S['2D_VERTEX_NODE_MAP'] || []).filter(row => row.length >= 2 && isFinite(Number(row[0]))).map(row => ({ vertexIndex: this.num(row[0]), nodeId: row[1], cd: this.num(row[2], 0.65), area: this.num(row[3], 0) }));
            const nodeVertexIndex = {}; vertexNodeMap.forEach(row => { nodeVertexIndex[row.nodeId] = row.vertexIndex; });
            const options = {};
            (S['2D_OPTIONS'] || []).forEach(row => {
                if (row.length < 2) return;
                const key = row[0].toUpperCase(), value = row[1];
                const map = { MAX_TIMESTEP: 'maxTimestep', DRY_DEPTH: 'dryDepth', COUPLING_CD: 'couplingCd', COUPLING_SYNC: 'couplingSync', LIMITER_EPSILON: 'limiterEpsilon', FLUX_DH_EPS: 'fluxDhEps', CELL_CLOSURE: 'cellClosure', FACE_RECONSTRUCTION: 'faceReconstruction', VFR_MIN_WET_FRAC: 'vfrMinWetFrac', INTEGRATOR: 'integrator', THETA: 'theta', CFL_NUMBER: 'cflNumber', H_MOVE: 'hMove', LTS_TIERS: 'ltsTiers', FROUDE_MAX: 'froudeMax', COUPLING_AREA: 'couplingArea', RAINFALL_MODE: 'rainfallMode', REPORT_2D: 'report2d' };
                if (map[key]) options[map[key]] = /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(value) ? Number(value) : value;
            });
            model.mesh2DIndexed = { origin, vertices, triangles, vertexNodeMap, nodeVertexIndex, options };
            triangles.forEach((t, i) => {
                const a = vertices[t.v[0]], b = vertices[t.v[1]], c = vertices[t.v[2]];
                if (!a || !b || !c) return;
                model.mesh2D.push({ id: 'M2D_' + (i + 1), ring: [[a.lng, a.lat], [b.lng, b.lat], [c.lng, c.lat], [a.lng, a.lat]], manningN: t.n, parentSubcatch: t.tag, props: { manningN: t.n, parentSubcatch: t.tag } });
            });
        }
        const meshVertices = {};
        (S['2D_VERTICES'] || []).forEach(row => {
            if (row.length >= 3 && !isFinite(Number(row[0]))) meshVertices[row[0]] = [this.num(row[1]), this.num(row[2])];
        });

        if (!model.mesh2DIndexed) (S['2D_CELLS'] || []).forEach(row => {
            if (row.length < 4) return; // Need ID and at least 3 vertices
            const cellId = row[0];
            const ring = [];
            let valid = true;
            for (let i = 1; i < row.length; i++) {
                const vId = row[i];
                if (meshVertices[vId]) {
                    ring.push(meshVertices[vId]);
                } else {
                    valid = false;
                }
            }
            if (valid && ring.length >= 3) {
                // Ensure polygon is closed for GeoJSON
                if (ring[0][0] !== ring[ring.length-1][0] || ring[0][1] !== ring[ring.length-1][1]) {
                    ring.push([...ring[0]]);
                }
                model.mesh2D.push({
                    id: cellId,
                    ring: ring
                });
            }
        });

        return model;
    }
}

// Works on the main thread (window) and inside parseWorker.js (self)
(typeof window !== 'undefined' ? window : self).inpParser = new InpParser();

