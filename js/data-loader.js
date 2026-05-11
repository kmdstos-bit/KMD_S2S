// class DataLoader {
//     constructor() {
//         this.cache = new Map();
//         this.catalog = null;
//     }
    
//     async loadCatalog() {
//         try {
//             const response = await fetch(`${CONFIG.dataBaseUrl}/catalog.json`);
//             if (!response.ok) throw new Error('Failed to load catalog');
//             this.catalog = await response.json();
//             return this.catalog;
//         } catch (error) {
//             console.error('Error loading catalog:', error);
//             throw error;
//         }
//     }
    
//     getAvailableDates() {
//         if (!this.catalog) return [];
//         return this.catalog.dates || [];
//     }
    
//     getAvailableTimesteps(initDate, variable) {
//         if (!this.catalog || !this.catalog.data[initDate]) return [];
//         const varData = this.catalog.data[initDate][variable];
//         return varData ? varData.timesteps : [];
//     }
    
//     async loadJson(url) {
//         if (this.cache.has(url)) {
//             return this.cache.get(url);
//         }
        
//         try {
//             const response = await fetch(url);
//             if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
//             const data = await response.json();
//             this.cache.set(url, data);
//             return data;
//         } catch (error) {
//             console.error('Error loading data:', error);
//             throw error;
//         }
//     }
    
//     async loadWeatherData(initDate, variable, timestep) {
//         const filename = `${variable}_${initDate}_f${String(timestep).padStart(3, '0')}.json`;
//         const url = `${CONFIG.dataBaseUrl}/${initDate}/${variable}/${filename}`;
//         return await this.loadJson(url);
//     }
    
//     // Method to convert JSON to raster format for leaflet
//     parseWeatherData(data) {
//         // Expected JSON format:
//         // {
//         //   "metadata": { "variable": "temp", "init": "2024-01-01", "timestep": 12 },
//         //   "grid": {
//         //     "lat": [min, max, step],
//         //     "lon": [min, max, step],
//         //     "values": [[val1, val2, ...], ...]
//         //   }
//         // }
        
//         const { lat, lon, values } = data.grid;
//         const latMin = lat[0], latMax = lat[1], latStep = lat[2];
//         const lonMin = lon[0], lonMax = lon[1], lonStep = lon[2];
        
//         return {
//             position: {
//                 lat: (latMin + latMax) / 2,
//                 lng: (lonMin + lonMax) / 2
//             },
//             latMin, latMax, lonMin, lonMax,
//             nRows: values.length,
//             nCols: values[0].length,
//             values: values,
//             latStep, lonStep
//         };
//     }
// }

class DataLoader {
    constructor() {
        this.cache = new Map();
        this.catalog = null;
    }
    
    async loadCatalog() {
        try {
            const url = `${CONFIG.dataBaseUrl}/weather/catalog.json`;
            console.log('Loading catalog from:', url);
            
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to load catalog: ${response.status}`);
            
            this.catalog = await response.json();
            console.log('✅ Catalog loaded:', this.catalog.dates);
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
    
    getAvailableTimesteps(initDate, variable) {
        if (!this.catalog || !this.catalog.data) return [];
        const dateData = this.catalog.data[initDate];
        if (!dateData) return [];
        const varData = dateData[variable];
        return varData ? (varData.timesteps || []) : [];
    }
    
    async loadWeatherData(initDate, variable, timestep) {
        console.log(`Loading: ${variable}, ${initDate}, F${String(timestep).padStart(3, '0')}`);
        
        // Try multiple filename formats
        const filenames = [
            `${variable}_${initDate}_f${String(timestep).padStart(3, '0')}.json`,
            `${variable}_${this.normalizeDate(initDate)}_f${String(timestep).padStart(3, '0')}.json`,
        ];
        
        // Try multiple paths
        const paths = [
            `weather/${initDate}/${variable}`,
            `weather/${this.normalizeDate(initDate)}/${variable}`,
        ];
        
        for (const path of paths) {
            for (const filename of filenames) {
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
        }
        
        throw new Error(`Could not load ${variable} data for ${initDate} at F${timestep}`);
    }
    
    normalizeDate(dateString) {
        // Convert "2026-5-11" to "2026-05-11"
        if (dateString.includes('-')) {
            const parts = dateString.split('-');
            const year = parts[0];
            const month = String(parts[1]).padStart(2, '0');
            const day = String(parts[2]).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
        return dateString;
    }
    
    parseWeatherData(data) {
        console.log('Parsing data:', data);
        
        // Check if we have valid data
        if (!data || !data.values) {
            console.error('Invalid data structure:', data);
            throw new Error('Data missing values array');
        }
        
        // Handle the format you have
        const grid = data.grid || {};
        const values = data.values;
        
        // Make sure values is an array
        if (!Array.isArray(values)) {
            console.error('Values is not an array:', typeof values);
            throw new Error('Data values must be an array');
        }
        
        // Check if values have any data
        if (values.length === 0) {
            throw new Error('Empty values array');
        }
        
        const result = {
            position: {
                lat: (grid.lat ? (grid.lat[0] + grid.lat[1]) / 2 : 0),
                lng: (grid.lon ? (grid.lon[0] + grid.lon[1]) / 2 : 20)
            },
            latMin: grid.lat ? grid.lat[0] : -40,
            latMax: grid.lat ? grid.lat[1] : 40,
            lonMin: grid.lon ? grid.lon[0] : -25,
            lonMax: grid.lon ? grid.lon[1] : 55,
            nRows: values.length,
            nCols: Array.isArray(values[0]) ? values[0].length : 0,
            values: values,
            latStep: grid.lat ? grid.lat[2] : 0.25,
            lonStep: grid.lon ? grid.lon[2] : 0.25
        };
        
        console.log('Parsed data:', {
            nRows: result.nRows,
            nCols: result.nCols,
            latRange: [result.latMin, result.latMax],
            lonRange: [result.lonMin, result.lonMax]
        });
        
        return result;
    }
}