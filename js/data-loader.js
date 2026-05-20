class DataLoader {
    constructor() {
        this.cache = new Map();
        this.catalog = null;
    }
    
    async loadCatalog() {
        try {
            const url = `${CONFIG.dataBaseUrl}/weekly/catalog.json`;
            console.log('Loading catalog from:', url);
            
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to load catalog: ${response.status}`);
            
            this.catalog = await response.json();
            console.log('✅ Catalog loaded:', this.catalog);
            console.log('Dates:', this.catalog.dates);
            console.log('Data keys:', Object.keys(this.catalog.data || {}));
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
        if (!this.catalog || !this.catalog.data) {
            console.warn('No catalog data available');
            return [];
        }
        
        const dateData = this.catalog.data[initDate];
        if (!dateData) {
            console.warn(`No data for date: ${initDate}`);
            console.log('Available dates:', Object.keys(this.catalog.data));
            return [];
        }
        
        const varData = dateData[variable];
        if (!varData) {
            console.warn(`No ${variable} data for date: ${initDate}`);
            console.log('Available variables:', Object.keys(dateData));
            return [];
        }
        
        // Handle both 'weeks' and 'timesteps' keys
        return varData.weeks || varData.timesteps || [];
    }
    
    async loadWeatherData(initDate, variable, week) {
        console.log(`Loading data: variable=${variable}, date=${initDate}, week=${week}`);
        
        // Try multiple filename formats
        const filenames = [
            `${variable}_${initDate}_w${String(week).padStart(2, '0')}.json`,
            `${variable}_${initDate}_w${week}.json`,
            `${variable}_${initDate}_f${String(week).padStart(3, '0')}.json`,
            `${variable}_${this.normalizeDate(initDate)}_w${String(week).padStart(2, '0')}.json`,
        ];
        
        // Try multiple path formats
        const paths = [
            `/weekly/${initDate}/${variable}`,                   // with weather prefix
        ];
        
        let lastError = null;
        
        for (const path of paths) {
            for (const filename of filenames) {
                const url = `${CONFIG.dataBaseUrl}/${path}/${filename}`;
                console.log('Trying URL:', url);
                
                try {
                    const response = await fetch(url);
                    console.log(`  Status: ${response.status}`);
                    
                    if (response.ok) {
                        const data = await response.json();
                        console.log('✅ SUCCESS! Data loaded from:', url);
                        console.log('Data keys:', Object.keys(data));
                        
                        // Validate data structure
                        if (data.values) {
                            console.log('Values type:', typeof data.values);
                            console.log('Values is array:', Array.isArray(data.values));
                            if (Array.isArray(data.values)) {
                                console.log('Values length:', data.values.length);
                                if (data.values.length > 0) {
                                    console.log('First row type:', typeof data.values[0]);
                                    console.log('First row is array:', Array.isArray(data.values[0]));
                                }
                            }
                        }
                        
                        return data;
                    }
                } catch (e) {
                    lastError = e;
                    console.log(`  Failed: ${e.message}`);
                    continue;
                }
            }
        }
        
        throw new Error(`Could not load data. Last error: ${lastError ? lastError.message : 'Unknown'}`);
    }
    
    normalizeDate(dateString) {
        if (!dateString) return dateString;
        
        // Convert "2026-5-11" to "2026-05-11"
        if (dateString.includes('-')) {
            const parts = dateString.split('-');
            if (parts.length === 3) {
                const year = parts[0];
                const month = String(parts[1]).padStart(2, '0');
                const day = String(parts[2]).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }
        }
        
        // Convert "20260511" to "2026-05-11"
        if (dateString.length === 8 && !dateString.includes('-')) {
            const year = dateString.substring(0, 4);
            const month = dateString.substring(4, 6);
            const day = dateString.substring(6, 8);
            return `${year}-${month}-${day}`;
        }
        
        return dateString;
    }
    
    parseWeatherData(data) {
    console.log('Parsing data:', data);
    
    if (!data || !data.values) {
        console.error('Invalid data structure:', data);
        throw new Error('Data missing values array');
    }
    
    const grid = data.grid || {};
    const values = data.values;
    
    if (!Array.isArray(values) || values.length === 0) {
        throw new Error('Data values must be a non-empty array');
    }
    
    // Grid info from JSON
    // lat: [22.5, -36, 1.5] → 40 rows from 22.5°N down to 36°S, step 1.5°
    // Row 0 = 22.5°N (northernmost)
    // Row 39 = -36°S (southernmost)
    // lon: [-19.5, 54, 1.5] → 50 cols from 19.5°W to 54°E, step 1.5°
    
    const firstLat = grid.lat ? grid.lat[0] : 22.5;    // Row 0: 22.5°N (north)
    const lastLat = grid.lat ? grid.lat[1] : -36;      // Row 39: -36°S (south)
    const absLatStep = Math.abs(grid.lat ? grid.lat[2] : 1.5);  // 1.5° (always positive)
    
    const firstLon = grid.lon ? grid.lon[0] : -19.5;   // Col 0: 19.5°W (west)
    const lastLon = grid.lon ? grid.lon[1] : 54;       // Col 49: 54°E (east)
    const absLonStep = Math.abs(grid.lon ? grid.lon[2] : 1.5);
    
    // Determine which is north, south, east, west
    const northCenter = Math.max(firstLat, lastLat);   // 22.5
    const southCenter = Math.min(firstLat, lastLat);   // -36
    const westCenter = Math.min(firstLon, lastLon);    // -19.5
    const eastCenter = Math.max(firstLon, lastLon);    // 54
    
    console.log('Grid parsed:');
    console.log('  Rows:', values.length, '| North:', northCenter, 'to South:', southCenter, '| Step:', absLatStep, '°');
    console.log('  Cols:', values[0].length, '| West:', westCenter, 'to East:', eastCenter, '| Step:', absLonStep, '°');
    console.log('  Row 0 =', firstLat, '(top of canvas = north)');
    console.log('  Row', values.length-1, '=', lastLat, '(bottom of canvas = south)');
    
    return {
        firstLat: firstLat,        // 22.5 - Row 0 center (NORTH)
        lastLat: lastLat,          // -36 - Row 39 center (SOUTH)
        northCenter: northCenter,  // 22.5
        southCenter: southCenter,  // -36
        firstLon: firstLon,        // -19.5 - Col 0 center (WEST)
        lastLon: lastLon,          // 54 - Col 49 center (EAST)
        westCenter: westCenter,
        eastCenter: eastCenter,
        nRows: values.length,      // 40
        nCols: values[0].length,   // 50
        values: values,
        latStep: absLatStep,       // 1.5
        lonStep: absLonStep,       // 1.5
        metadata: data.metadata || {}
    };
}
};