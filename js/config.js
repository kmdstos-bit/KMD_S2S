const CONFIG = {
    // Your GitHub details
    repoOwner: 'alecjong-lab',
    repoName: 'ECMWF-S2S4AFRICA',
    branchName: 'website',

    // Data URL
    dataBaseUrl: 'https://raw.githubusercontent.com/alecjong-lab/ECMWF-S2S4AFRICA/website/data',

    // Africa bounding box
    mapBounds: {
        north: 40,
        south: -40,
        west: -25,
        east: 55
    },

    dataType: 'weekly',
    weeks: [1, 2, 3, 4, 5, 6],
    weekLabels: { 1:'Week 1', 2:'Week 2', 3:'Week 3', 4:'Week 4', 5:'Week 5', 6:'Week 6' },

    // ─────────────────────────────────────────────────────────────────────
    // LAYER TYPES
    // id          : used to build the folder/filename prefix
    // label       : shown in the dropdown
    // group       : section header in the dropdown
    // prefix      : folder name prefix; {var} is replaced with the variable key
    //               empty string means "use the variable key directly" (ensemble mean)
    // unit        : overrides the variable unit when set (e.g. % for probabilities)
    // colorScheme : key into getColorScale(); null = use variable default
    // defaultMin/Max : default colour-scale stretch for this layer type
    //               null = defer to the variable's own defaults
    // ─────────────────────────────────────────────────────────────────────
    layerTypes: {
        mean: {
            label: 'Ensemble Mean',
            group: 'Mean',
            prefix: '',          // folder = variable name, e.g. data/weekly/DATE/temp/
            unit: null,
            colorScheme: null,   // use variable default
            defaultMin: null,
            defaultMax: null,
        },
        anom_p25: {
            label: 'Anomaly from P25',
            group: 'Anomaly vs climate quantile',
            prefix: 'anomclim_{var}_P25',
            unit: null,          // same unit as variable
            colorScheme: 'anomaly',
            defaultMin: null,    // will be set per-variable below
            defaultMax: null,
        },
        anom_p50: {
            label: 'Anomaly from P50',
            group: 'Anomaly vs climate quantile',
            prefix: 'anomclim_{var}_P50',
            unit: null,
            colorScheme: 'anomaly',
            defaultMin: null,
            defaultMax: null,
        },
        anom_p75: {
            label: 'Anomaly from P75',
            group: 'Anomaly vs climate quantile',
            prefix: 'anomclim_{var}_P75',
            unit: null,
            colorScheme: 'anomaly',
            defaultMin: null,
            defaultMax: null,
        },
        chance_p25: {
            label: 'Chance of exceeding P25',
            group: 'Exceedance probability',
            prefix: 'chance2xseed_{var}_P25',
            unit: '%',
            colorScheme: 'probability',
            defaultMin: 0,
            defaultMax: 100,
        },
        chance_p50: {
            label: 'Chance of exceeding P50',
            group: 'Exceedance probability',
            prefix: 'chance2xseed_{var}_P50',
            unit: '%',
            colorScheme: 'probability',
            defaultMin: 0,
            defaultMax: 100,
        },
        chance_p75: {
            label: 'Chance of exceeding P75',
            group: 'Exceedance probability',
            prefix: 'chance2xseed_{var}_P75',
            unit: '%',
            colorScheme: 'probability',
            defaultMin: 0,
            defaultMax: 100,
        },
        tercile: {
            label: '<- Below or Above normal->',
            group: 'Tercile',
            prefix: 'tercilecat_{var}',
            unit: '',
            colorScheme: 'tercile',
            defaultMin: -100,
            defaultMax: 100,
        },
    },

    // Which layer types are available for each base variable.
    // Variables not listed here get only 'mean'.
    layerAvailability: {
        temp:   ['mean','anom_p25','anom_p50','anom_p75','chance_p25','chance_p50','chance_p75','tercile'],
        precip: ['mean','anom_p25','anom_p50','anom_p75','chance_p25','chance_p50','chance_p75','tercile'],
        cape:   ['mean','anom_p25','anom_p50','anom_p75','chance_p25','chance_p50','chance_p75','tercile'],
        w500:   ['mean','anom_p25','anom_p50','anom_p75','chance_p25','chance_p50','chance_p75','tercile'],
        d2m:   ['mean','anom_p25','anom_p50','anom_p75','chance_p25','chance_p50','chance_p75','tercile'],
        tcw:   ['mean','anom_p25','anom_p50','anom_p75','chance_p25','chance_p50','chance_p75','tercile'],
        // others default to ['mean'] only
    },

    // ─────────────────────────────────────────────────────────────────────
    // Per-variable anomaly stretch defaults (used when layerType is anom_*)
    // ─────────────────────────────────────────────────────────────────────
    anomalyDefaults: {
        temp:   { defaultMin: -5,   defaultMax: 5   },
        precip: { defaultMin: -30,  defaultMax: 30  },
        cape:   { defaultMin: -500, defaultMax: 500 },
        w500:   { defaultMin: -0.3, defaultMax: 0.3 },
        d2m:   { defaultMin: -500, defaultMax: 500 },
        tcw:   { defaultMin: -5, defaultMax: 5 },
    },

    // ─────────────────────────────────────────────────────────────────────
    // VARIABLES
    // ─────────────────────────────────────────────────────────────────────
    variables: {
        temp: {
            label: '2 Metre Temperature',
            unit: '°C',
            colorScheme: 'temperature',
            defaultMin: 15,
            defaultMax: 35,
            absoluteMin: -20,
            absoluteMax: 55,
            step: 1
        },
        precip: {
            label: 'Total Precipitation',
            unit: 'mm',
            colorScheme: 'precipitation',
            defaultMin: 0,
            defaultMax: 100,
            absoluteMin: 0,
            absoluteMax: 500,
            step: 5
        },
        tcw: {
            label: 'Total Column Water',
            unit: 'kg/m²',
            colorScheme: 'humidity',
            defaultMin: 0,
            defaultMax: 50,
            absoluteMin: 0,
            absoluteMax: 200,
            step: 5
        },
        cape: {
            label: 'CAPE',
            unit: 'J/kg',
            colorScheme: 'temperature',
            defaultMin: 0,
            defaultMax: 2500,
            absoluteMin: 0,
            absoluteMax: 5000,
            step: 100
        },
        d2m: {
            label: '2 Metre Dewpoint Temperature',
            unit: '°C',
            colorScheme: 'humidity',
            defaultMin: 10,
            defaultMax: 30,
            absoluteMin: -20,
            absoluteMax: 40,
            step: 1
        },
        mx2t6: {
            label: 'Max Temperature',
            unit: '°C',
            colorScheme: 'temperature',
            defaultMin: 15,
            defaultMax: 40,
            absoluteMin: -20,
            absoluteMax: 55,
            step: 1
        },
        mn2t6: {
            label: 'Min Temperature',
            unit: '°C',
            colorScheme: 'temperature',
            defaultMin: 15,
            defaultMax: 30,
            absoluteMin: -20,
            absoluteMax: 55,
            step: 1
        },
        w500: {
            label: '500hPa Vertical Wind',
            unit: 'Pa/s',
            colorScheme: 'temperature',
            defaultMin: -0.1,
            defaultMax: 0.1,
            absoluteMin: -1,
            absoluteMax: 1,
            step: 0.005
        },
        u10: {
            label: '10m U-Wind',
            unit: 'm/s',
            colorScheme: 'wind',
            defaultMin: -10,
            defaultMax: 10,
            absoluteMin: -100,
            absoluteMax: 100,
            step: 1
        },
        v10: {
            label: '10m V-Wind',
            unit: 'm/s',
            colorScheme: 'wind',
            defaultMin: -10,
            defaultMax: 10,
            absoluteMin: -100,
            absoluteMax: 100,
            step: 1
        },
        u700: {
            label: '700hPa U-Wind',
            unit: 'm/s',
            colorScheme: 'wind',
            defaultMin: 0,
            defaultMax: 15,
            absoluteMin: 0,
            absoluteMax: 100,
            step: 1
        },
        v700: {
            label: '700hPa V-Wind',
            unit: 'm/s',
            colorScheme: 'wind',
            defaultMin: -15,
            defaultMax: 15,
            absoluteMin: -100,
            absoluteMax: 100,
            step: 1
        },
    },

    // ─────────────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────────────

    /** Return the list of available layer type ids for a given variable key. */
    getAvailableLayerTypes(varKey) {
        return this.layerAvailability[varKey] || ['mean'];
    },

    /**
     * Build the data folder name for a given variable + layerType combination.
     * e.g. varKey='temp', layerTypeId='anom_p50' → 'anomclim_temp_P50'
     *      varKey='temp', layerTypeId='mean'      → 'temp'
     */
    getFolderName(varKey, layerTypeId) {
        const lt = this.layerTypes[layerTypeId];
        if (!lt) return varKey;
        if (!lt.prefix) return varKey;
        return lt.prefix.replace('{var}', varKey);
    },

    /**
     * Return the effective defaultMin/Max for a variable + layerType pair.
     */
    getDefaultRange(varKey, layerTypeId) {
        const lt = this.layerTypes[layerTypeId];
        if (!lt) return { min: this.variables[varKey].defaultMin, max: this.variables[varKey].defaultMax };

        // Fixed range (probabilities, tercile)
        if (lt.defaultMin !== null) {
            return { min: lt.defaultMin, max: lt.defaultMax };
        }

        // Anomaly — use per-variable anomaly defaults if available
        if (lt.colorScheme === 'anomaly' && this.anomalyDefaults[varKey]) {
            return { min: this.anomalyDefaults[varKey].defaultMin, max: this.anomalyDefaults[varKey].defaultMax };
        }

        // Fallback: variable default
        return { min: this.variables[varKey].defaultMin, max: this.variables[varKey].defaultMax };
    },

    /**
     * Return the unit string for a variable + layerType pair.
     */
    getUnit(varKey, layerTypeId) {
        const lt = this.layerTypes[layerTypeId];
        if (lt && lt.unit !== null) return lt.unit;
        return this.variables[varKey] ? this.variables[varKey].unit : '';
    },

    // Map defaults
    mapDefaults: {
        center: [0, 20],
        zoom: 4,
        maxZoom: 10,
        minZoom: 3
    }
};
