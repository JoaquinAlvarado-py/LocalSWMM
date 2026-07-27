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
