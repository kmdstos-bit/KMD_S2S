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
    console.log('Parsing weekly data:', data);
    
    if (!data || !data.values) {
        console.error('Invalid data structure:', data);
        throw new Error('Data missing values array');
    }
    
    const grid = data.grid || {};
    const values = data.values;
    
    if (!Array.isArray(values) || values.length === 0) {
        throw new Error('Data values must be a non-empty array');
    }
    
    // Get grid info
    const latStart = grid.lat ? grid.lat[0] : 22.5;  // First lat value
    const latEnd = grid.lat ? grid.lat[1] : -36;      // Last lat value
    const latStep = grid.lat ? (grid.lat[2] || 1.5) : 1.5;
    const lonStart = grid.lon ? grid.lon[0] : -25;
    const lonEnd = grid.lon ? grid.lon[1] : 55;
    const lonStep = grid.lon ? (grid.lon[2] || 1.5) : 1.5;
    
    // Determine which is north and which is south
    const northCenter = Math.max(latStart, latEnd);  // 22.5
    const southCenter = Math.min(latStart, latEnd);  // -36
    const westCenter = Math.min(lonStart, lonEnd);
    const eastCenter = Math.max(lonStart, lonEnd);
    
    return {
        position: {
            lat: (northCenter + southCenter) / 2,
            lng: (westCenter + eastCenter) / 2
        },
        // Store the actual grid values
        latMin: latStart,   // Keep original for reference (22.5)
        latMax: latEnd,     // Keep original for reference (-36)
        lonMin: westCenter,
        lonMax: eastCenter,
        nRows: values.length,
        nCols: Array.isArray(values[0]) ? values[0].length : 0,
        values: values,
        latStep: latStep,
        lonStep: lonStep,
        metadata: data.metadata || {}
    };
}
};