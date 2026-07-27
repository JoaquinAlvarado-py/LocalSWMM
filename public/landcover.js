/**
 * Land Cover Classification & OpenTopography DTM Module for SWMM 6
 * Based on VITO Remote Sensing LCM-10 / ESA WorldCover 10m land cover standard.
 */
(function(window) {
    'use strict';

    const VITO_LCM10_CLASSES = {
        10: {
            code: 10,
            name: 'Tree cover',
            color: '#006400',
            nManningPerv: 0.120,
            nManningImperv: 0.080,
            description: 'Dense forest, heavy canopy, tree litter & brush'
        },
        20: {
            code: 20,
            name: 'Shrubland',
            color: '#ffbb22',
            nManningPerv: 0.080,
            nManningImperv: 0.050,
            description: 'Shrubs, bushes, scattered trees and medium vegetation'
        },
        30: {
            code: 30,
            name: 'Grassland',
            color: '#ffff4c',
            nManningPerv: 0.045,
            nManningImperv: 0.025,
            description: 'Pasture, lawn grass, prairie, uncultivated turf'
        },
        40: {
            code: 40,
            name: 'Cropland',
            color: '#f096ff',
            nManningPerv: 0.060,
            nManningImperv: 0.035,
            description: 'Agricultural field crops, row crops, tilled soil'
        },
        50: {
            code: 50,
            name: 'Herbaceous wetland',
            color: '#00cfd4',
            nManningPerv: 0.100,
            nManningImperv: 0.070,
            description: 'Marshes, reeds, seasonally flooded herbaceous land'
        },
        60: {
            code: 60,
            name: 'Mangroves',
            color: '#00e676',
            nManningPerv: 0.180,
            nManningImperv: 0.120,
            description: 'Coastal tidal mangroves, dense aerial root systems'
        },
        70: {
            code: 70,
            name: 'Moss and lichen',
            color: '#ffe8a3',
            nManningPerv: 0.035,
            nManningImperv: 0.020,
            description: 'Tundra vegetation, alpine lichen, smooth rock moss'
        },
        80: {
            code: 80,
            name: 'Bare / sparse vegetation',
            color: '#b2b2b2',
            nManningPerv: 0.030,
            nManningImperv: 0.018,
            description: 'Bare soil, gravel, unpaved ground, smooth rock'
        },
        90: {
            code: 90,
            name: 'Built-up',
            color: '#ff0000',
            nManningPerv: 0.015,
            nManningImperv: 0.013,
            nManningObstacle: 0.150,
            description: 'Asphalt roads, concrete pavement, roofs, urban structures'
        },
        95: {
            code: 95,
            name: 'Permanent water bodies',
            color: '#0066ff',
            nManningPerv: 0.030,
            nManningImperv: 0.025,
            description: 'Lakes, rivers, ponds, open water surfaces'
        },
        100: {
            code: 100,
            name: 'Snow and ice',
            color: '#f0f8ff',
            nManningPerv: 0.020,
            nManningImperv: 0.015,
            description: 'Permanent glaciers, packed snow, ice sheets'
        }
    };

    const OpenTopographyDemTypes = {
        'COP30': 'Copernicus Global DSM 30m',
        'USGS10m': 'USGS 3DEP 10m High-Res DTM',
        'SRTMGL1': 'NASA SRTM 30m Global DTM',
        'NASADEM': 'NASADEM Global 30m'
    };

    const LandCoverModule = {
        classes: VITO_LCM10_CLASSES,
        demTypes: OpenTopographyDemTypes,

        getClass(code) {
            return VITO_LCM10_CLASSES[code] || null;
        },

        getRoughness(code, options = {}) {
            const lc = VITO_LCM10_CLASSES[code];
            if (!lc) return { nPerv: 0.10, nImperv: 0.01 };
            
            if (code === 90 && options.builtUpMode === 'OBSTACLE') {
                return {
                    nPerv: lc.nManningObstacle,
                    nImperv: lc.nManningObstacle,
                    classInfo: lc
                };
            }

            return {
                nPerv: lc.nManningPerv,
                nImperv: lc.nManningImperv,
                classInfo: lc
            };
        },

        applyToSubcatchment(subcatchment, landCoverCode, options = {}) {
            if (!subcatchment || !subcatchment.props) return false;
            const roughness = this.getRoughness(landCoverCode, options);
            subcatchment.props.landCoverClass = parseInt(landCoverCode, 10) || 0;
            subcatchment.props.nPerv = roughness.nPerv;
            subcatchment.props.nImperv = roughness.nImperv;
            return true;
        },

        /**
         * Performs grid-cell sampling over a subcatchment polygon to detect land cover breakdown and compute weighted SWMM roughness.
         */
        sampleSubcatchmentLandCover(subcatchment, mapInstance) {
            if (!subcatchment) return null;
            const ring = subcatchment.ring || (subcatchment.geometry && subcatchment.geometry.coordinates && subcatchment.geometry.coordinates[0]);
            if (!ring || ring.length < 3) return null;

            // Compute Bounding Box
            let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
            ring.forEach(pt => {
                if (pt[0] < minLng) minLng = pt[0];
                if (pt[0] > maxLng) maxLng = pt[0];
                if (pt[1] < minLat) minLat = pt[1];
                if (pt[1] > maxLat) maxLat = pt[1];
            });

            // Point-in-polygon helper
            function pointInPoly(pt, poly) {
                const x = pt[0], y = pt[1];
                let inside = false;
                for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                    const xi = poly[i][0], yi = poly[i][1];
                    const xj = poly[j][0], yj = poly[j][1];
                    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                    if (intersect) inside = !inside;
                }
                return inside;
            }

            // Generate regular grid sampling points inside subcatchment polygon
            const gridSteps = 10;
            const stepLng = (maxLng - minLng) / gridSteps;
            const stepLat = (maxLat - minLat) / gridSteps;
            const pointsInPolygon = [];

            for (let i = 0; i <= gridSteps; i++) {
                for (let j = 0; j <= gridSteps; j++) {
                    const testPt = [minLng + i * stepLng, minLat + j * stepLat];
                    if (pointInPoly(testPt, ring)) {
                        pointsInPolygon.push(testPt);
                    }
                }
            }

            if (pointsInPolygon.length === 0) {
                // Fallback to centroid
                const cLng = (minLng + maxLng) / 2;
                const cLat = (minLat + maxLat) / 2;
                pointsInPolygon.push([cLng, cLat]);
            }

            // Count occurrences using spatial heuristics / canvas pixel sampling
            const counts = {};
            let totalSampled = pointsInPolygon.length;

            // In urban areas, sample canvas or default to proportional land cover breakdown
            pointsInPolygon.forEach(pt => {
                let code = 30; // Grassland default
                if (mapInstance && typeof mapInstance.queryRenderedFeatures === 'function') {
                    try {
                        const pixel = mapInstance.project(pt);
                        const features = mapInstance.queryRenderedFeatures(pixel);
                        let isBuilding = false, isRoad = false, isWater = false, isForest = false;
                        features.forEach(f => {
                            const layerId = (f.layer && f.layer.id) || '';
                            if (layerId.includes('building') || f.properties?.building) isBuilding = true;
                            if (layerId.includes('road') || layerId.includes('street') || f.properties?.highway) isRoad = true;
                            if (layerId.includes('water') || f.properties?.water) isWater = true;
                            if (layerId.includes('park') || layerId.includes('landuse') || layerId.includes('wood')) isForest = true;
                        });

                        if (isBuilding || isRoad) code = 90; // Built-up
                        else if (isWater) code = 95; // Water
                        else if (isForest) code = 10; // Tree cover
                        else code = 30; // Grassland
                    } catch (e) {
                        code = 30;
                    }
                }
                counts[code] = (counts[code] || 0) + 1;
            });

            // Calculate weighted stats
            let builtUpCount = counts[90] || 0;
            let perviousCount = totalSampled - builtUpCount;
            let impervPct = Math.round((builtUpCount / totalSampled) * 100 * 10) / 10;

            let weightedNPervSum = 0;
            let perviousSampleTotal = 0;

            const breakdown = [];
            Object.keys(counts).forEach(codeStr => {
                const code = parseInt(codeStr, 10);
                const count = counts[codeStr];
                const pct = Math.round((count / totalSampled) * 100 * 10) / 10;
                const lcInfo = VITO_LCM10_CLASSES[code] || { name: `Class ${code}`, nManningPerv: 0.05, nManningImperv: 0.013 };

                if (code !== 90) {
                    weightedNPervSum += count * lcInfo.nManningPerv;
                    perviousSampleTotal += count;
                }

                breakdown.push({
                    code,
                    name: lcInfo.name,
                    pct,
                    color: lcInfo.color || '#888888',
                    count
                });
            });

            const finalNPerv = perviousSampleTotal > 0 ? (weightedNPervSum / perviousSampleTotal) : 0.045;
            const finalNImperv = 0.013;

            return {
                totalSamples: totalSampled,
                impervPct,
                nPervWeighted: Math.round(finalNPerv * 1000) / 1000,
                nImpervWeighted: finalNImperv,
                breakdown
            };
        },

        /**
         * Formats an OpenTopography REST point/global elevation request API URL.
         */
        getOpenTopographyPointUrl(lat, lon, demType = 'COP30', apiKey = '') {
            const baseUrl = 'https://portal.opentopography.org/API/pointElevation';
            const params = new URLSearchParams({
                demtype: demType,
                latitude: lat.toFixed(6),
                longitude: lon.toFixed(6),
                outputFormat: 'JSON'
            });
            if (apiKey) params.append('API_Key', apiKey);
            return `${baseUrl}?${params.toString()}`;
        },

        /**
         * Formats an OpenTopography REST GeoTIFF / Bounding Box DEM download URL.
         */
        getOpenTopographyBboxUrl(south, west, north, east, demType = 'COP30', apiKey = '') {
            const baseUrl = 'https://portal.opentopography.org/API/globaldem';
            const params = new URLSearchParams({
                demtype: demType,
                south: south.toFixed(6),
                west: west.toFixed(6),
                north: north.toFixed(6),
                east: east.toFixed(6),
                outputFormat: 'GTiff'
            });
            if (apiKey) params.append('API_Key', apiKey);
            return `${baseUrl}?${params.toString()}`;
        }
    };

    window.VITO_LCM10_CLASSES = VITO_LCM10_CLASSES;
    window.LandCoverModule = LandCoverModule;

})(window);
