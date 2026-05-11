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
            `weekly/${initDate}/${variable}`,                   // with weather prefix
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
        console.log('=== PARSING WEATHER DATA ===');
        console.log('Raw data:', data);
        console.log('Data type:', typeof data);
        
        if (!data) {
            throw new Error('No data provided');
        }
        
        if (typeof data !== 'object') {
            throw new Error(`Expected object, got ${typeof data}`);
        }
        
        // Get values from whatever format
        let values = data.values || data.data || data.d;
        
        if (!values) {
            console.error('Data keys:', Object.keys(data));
            throw new Error('No values found in data. Available keys: ' + Object.keys(data).join(', '));
        }
        
        // Handle case where values might be a string (serialized JSON)
        if (typeof values === 'string') {
            try {
                values = JSON.parse(values);
            } catch (e) {
                throw new Error('Values is a string but not valid JSON');
            }
        }
        
        // Ensure values is an array
        if (!Array.isArray(values)) {
            console.error('Values type:', typeof values);
            throw new Error(`Expected array for values, got ${typeof values}`);
        }
        
        if (values.length === 0) {
            throw new Error('Values array is empty');
        }
        
        // Check if first element is an array (2D grid) or number (1D array)
        const firstElement = values[0];
        console.log('First element type:', typeof firstElement);
        console.log('First element is array:', Array.isArray(firstElement));
        
        if (!Array.isArray(firstElement)) {
            // Might be a flat array that needs reshaping
            throw new Error('Values should be a 2D array (array of arrays)');
        }
        
        // Get grid info
        const grid = data.grid || data.g || {};
        
        const result = {
            latMin: grid.lat ? grid.lat[0] : -40,
            latMax: grid.lat ? grid.lat[1] : 40,
            lonMin: grid.lon ? grid.lon[0] : -25,
            lonMax: grid.lon ? grid.lon[1] : 55,
            nRows: values.length,
            nCols: firstElement.length,
            values: values,
            latStep: grid.lat ? (grid.lat[2] || 0.5) : 0.5,
            lonStep: grid.lon ? (grid.lon[2] || 0.5) : 0.5,
            metadata: data.metadata || data.m || {}
        };
        
        console.log('Parsed result:', {
            rows: result.nRows,
            cols: result.nCols,
            latRange: [result.latMin, result.latMax],
            lonRange: [result.lonMin, result.lonMax],
            hasMetadata: !!result.metadata
        });
        
        return result;
    }
}