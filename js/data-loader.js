class DataLoader {
    constructor() {
        this.cache = new Map();
        this.catalog = null;
    }
    
    async loadCatalog() {
        try {
            const response = await fetch(`${CONFIG.dataBaseUrl}/catalog.json`);
            if (!response.ok) throw new Error(`Failed to load burdiiiiiiiiiiiiiiii ${CONFIG.dataBaseUrl}/catalog.json`);
            this.catalog = await response.json();
            return this.catalog;
        } catch (error) {
            console.error('Error loading catalog:', error);
            throw error;
        }
    }
    
    getAvailableDates() {
        if (!this.catalog) return [];
        return this.catalog.dates || [];
    }
    
    getAvailableTimesteps(initDate, variable) {
        if (!this.catalog || !this.catalog.data[initDate]) return [];
        const varData = this.catalog.data[initDate][variable];
        return varData ? varData.timesteps : [];
    }
    
    async loadJson(url) {
        if (this.cache.has(url)) {
            return this.cache.get(url);
        }
        
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            this.cache.set(url, data);
            return data;
        } catch (error) {
            console.error('Error loading data:', error);
            throw error;
        }
    }
    
    async loadWeatherData(initDate, variable, timestep) {
        const filename = `${variable}_${initDate}_f${String(timestep).padStart(3, '0')}.json`;
        const url = `${CONFIG.dataBaseUrl}/weather/${initDate}/${variable}/${filename}`;
        return await this.loadJson(url);
    }
    
    // Method to convert JSON to raster format for leaflet
    parseWeatherData(data) {
        // Expected JSON format:
        // {
        //   "metadata": { "variable": "temp", "init": "2024-01-01", "timestep": 12 },
        //   "grid": {
        //     "lat": [min, max, step],
        //     "lon": [min, max, step],
        //     "values": [[val1, val2, ...], ...]
        //   }
        // }
        
        const { lat, lon, values } = data.grid;
        const latMin = lat[0], latMax = lat[1], latStep = lat[2];
        const lonMin = lon[0], lonMax = lon[1], lonStep = lon[2];
        
        return {
            position: {
                lat: (latMin + latMax) / 2,
                lng: (lonMin + lonMax) / 2
            },
            latMin, latMax, lonMin, lonMax,
            nRows: values.length,
            nCols: values[0].length,
            values: values,
            latStep, lonStep
        };
    }
}