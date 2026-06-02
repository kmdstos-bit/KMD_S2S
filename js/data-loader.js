class DataLoader {
    constructor() {
        this.cache = new Map();
        this.catalog = null;
    }

    // ============================================
    // CATALOG
    // ============================================

    async loadCatalog() {
        try {
            const url = `${CONFIG.dataBaseUrl}/weekly/catalog.json`;
            console.log('Loading catalog from:', url);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to load catalog: ${response.status}`);
            this.catalog = await response.json();
            console.log('✅ Catalog loaded:', this.catalog);
            return this.catalog;
        } catch (error) {
            console.error('Error loading catalog:', error);
            throw error;
        }
    }

    getAvailableDates() {
        if (!this.catalog || !this.catalog.dates) return [];
        return [...this.catalog.dates].sort().reverse();
    }

    getAvailableWeeks(initDate, variable) {
        if (!this.catalog || !this.catalog.data) return [];
        const dateData = this.catalog.data[initDate];
        if (!dateData) return [];
        // For ensemble statistics the week list is the same as the mean variable
        const varData = dateData[variable] || dateData[Object.keys(dateData)[0]];
        if (!varData) return [];
        return varData.weeks || varData.timesteps || [];
    }

    /**
     * Check whether a specific layerType exists for a given date + variable.
     *
     * Strategy: we do a lightweight HEAD request to the expected URL.
     * The result is cached so subsequent calls are instant.
     */
    async layerExists(initDate, varKey, layerTypeId) {
        const folder = CONFIG.getFolderName(varKey, layerTypeId);
        const url = `${CONFIG.dataBaseUrl}/weekly/${initDate}/${folder}/${folder}_${initDate}_w01.json`;
        const cacheKey = `exists:${url}`;

        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        try {
            const resp = await fetch(url, { method: 'HEAD' });
            const exists = resp.ok;
            this.cache.set(cacheKey, exists);
            return exists;
        } catch {
            this.cache.set(cacheKey, false);
            return false;
        }
    }

    /**
     * Return which layerTypeIds actually exist on the server for this
     * date + variable combination.  Always includes 'mean'.
     */
    async getAvailableLayerTypes(initDate, varKey) {
        const candidates = CONFIG.getAvailableLayerTypes(varKey);
        const results = await Promise.all(
            candidates.map(async (id) => {
                if (id === 'mean') return { id, exists: true };
                const exists = await this.layerExists(initDate, varKey, id);
                return { id, exists };
            })
        );
        return results;  // [{id, exists}, ...]
    }

    // ============================================
    // DATA LOADING
    // ============================================

    async loadWeatherData(initDate, varKey, week, layerTypeId = 'mean') {
        const folder = CONFIG.getFolderName(varKey, layerTypeId);
        const weekPad = String(week).padStart(2, '0');

        // Build candidate URLs (handles minor naming inconsistencies)
        const urls = [
            `${CONFIG.dataBaseUrl}/weekly/${initDate}/${folder}/${folder}_${initDate}_w${weekPad}.json`,
            `${CONFIG.dataBaseUrl}/weekly/${initDate}/${folder}/${folder}_${initDate}_w${week}.json`,
        ];

        let lastError = null;
        for (const url of urls) {
            console.log('Trying:', url);
            try {
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    console.log('✅ Loaded from:', url);
                    return data;
                }
            } catch (e) {
                lastError = e;
            }
        }

        throw new Error(`Could not load layer "${layerTypeId}" for ${varKey} on ${initDate} week ${week}. ${lastError ? lastError.message : ''}`);
    }

    // ============================================
    // PARSING
    // ============================================

    normalizeDate(dateString) {
        if (!dateString) return dateString;
        if (dateString.includes('-')) {
            const parts = dateString.split('-');
            if (parts.length === 3) {
                return `${parts[0]}-${String(parts[1]).padStart(2,'0')}-${String(parts[2]).padStart(2,'0')}`;
            }
        }
        if (dateString.length === 8 && !dateString.includes('-')) {
            return `${dateString.substring(0,4)}-${dateString.substring(4,6)}-${dateString.substring(6,8)}`;
        }
        return dateString;
    }

    parseWeatherData(data) {
        if (!data || !data.values) throw new Error('Data missing values array');

        const grid   = data.grid || {};
        const values = data.values;

        if (!Array.isArray(values) || values.length === 0) throw new Error('Data values must be a non-empty array');

        const firstLat   = grid.lat ? grid.lat[0] : 22.5;
        const lastLat    = grid.lat ? grid.lat[1] : -36;
        const absLatStep = Math.abs(grid.lat ? grid.lat[2] : 1.5);
        const firstLon   = grid.lon ? grid.lon[0] : -19.5;
        const lastLon    = grid.lon ? grid.lon[1] : 54;
        const absLonStep = Math.abs(grid.lon ? grid.lon[2] : 1.5);

        const northCenter = Math.max(firstLat, lastLat);
        const southCenter = Math.min(firstLat, lastLat);
        const westCenter  = Math.min(firstLon, lastLon);
        const eastCenter  = Math.max(firstLon, lastLon);

        return {
            latMin: southCenter,
            latMax: northCenter,
            lonMin: westCenter,
            lonMax: eastCenter,
            southEdge: southCenter - absLatStep / 2,
            northEdge: northCenter + absLatStep / 2,
            westEdge:  westCenter  - absLonStep / 2,
            eastEdge:  eastCenter  + absLonStep / 2,
            nRows: values.length,
            nCols: values[0].length,
            values,
            latStep: absLatStep,
            lonStep: absLonStep,
            firstRowIsNorth: true,
            metadata: data.metadata || {}
        };
    }
}
