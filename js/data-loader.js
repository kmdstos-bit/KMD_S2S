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
            console.log('✅ Weekly catalog loaded:', this.catalog.dates);
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
        const varData = dateData[variable];
        return varData ? (varData.weeks || []) : [];
    }
    
    async loadWeatherData(initDate, variable, week) {
        console.log(`Loading weekly data: ${variable}, ${initDate}, Week ${week}`);
        
        // Build filename for weekly data
        const filename = `${variable}_${initDate}_w${String(week).padStart(2, '0')}.json`;
        
        // Try multiple paths
        const paths = [
            `${initDate}/${variable}`,
            `weekly/${initDate}/${variable}`,
        ];
        
        for (const path of paths) {
            const url = `${CONFIG.dataBaseUrl}/${path}/${filename}`;
            console.log('Trying:', url);
            
            try {
                const response = await fetch(url);
                if (response.ok) {
                    console.log('✅ Found:', url);
                    return await response.json();
                }
            } catch (e) {
                continue;
            }
        }
        
        throw new Error(`Could not load ${variable} data for ${initDate} Week ${week}`);
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
        
        return {
            position: {
                lat: grid.lat ? (grid.lat[0] + grid.lat[1]) / 2 : 0,
                lng: grid.lon ? (grid.lon[0] + grid.lon[1]) / 2 : 20
            },
            latMin: grid.lat ? grid.lat[0] : -40,
            latMax: grid.lat ? grid.lat[1] : 40,
            lonMin: grid.lon ? grid.lon[0] : -25,
            lonMax: grid.lon ? grid.lon[1] : 55,
            nRows: values.length,
            nCols: Array.isArray(values[0]) ? values[0].length : 0,
            values: values,
            latStep: grid.lat ? grid.lat[2] : 0.5,
            lonStep: grid.lon ? grid.lon[2] : 0.5,
            metadata: data.metadata || {}
        };
    }
}