// class WeatherMap {
//     constructor() {
//         this.map = null;
//         this.currentLayer = null;
//         this.dataLoader = new DataLoader();
//         this.leafletMap = null;
        
//         this.init();
//     }
    
//     init() {
//         // Initialize Leaflet map centered on Africa
//         this.leafletMap = L.map('map', {
//             center: CONFIG.mapDefaults.center,
//             zoom: CONFIG.mapDefaults.zoom,
//             maxZoom: CONFIG.mapDefaults.maxZoom,
//             minZoom: CONFIG.mapDefaults.minZoom,
//             zoomControl: true
//         });
        
//         // Add base tile layer (OpenStreetMap)
//         L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
//             attribution: '© OpenStreetMap contributors',
//             maxZoom: 10
//         }).addTo(this.leafletMap);
        
//         // Add a semi-transparent overlay for ocean masking (optional)
//         this.setupMapBounds();
//     }
    
//     setupMapBounds() {
//         // Add country boundaries overlay
//         L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
//             attribution: '© OpenStreetMap, © CartoDB',
//             maxZoom: 10,
//             opacity: 0.7
//         }).addTo(this.leafletMap);
//     }

//     // In the loadAndDisplayWeather method:
// async loadAndDisplayWeather(initDate, variable, timestep) {
//     try {
//         document.getElementById('loading').classList.add('active');
        
//         // Remove previous layer if exists
//         if (this.currentLayer) {
//             this.leafletMap.removeLayer(this.currentLayer);
//             this.currentLayer = null;
//         }
        
//         // Load data
//         const data = await this.dataLoader.loadWeatherData(initDate, variable, timestep);
//         console.log('Raw data loaded:', data);
        
//         // Parse the data
//         const rasterData = this.dataLoader.parseWeatherData(data);
//         console.log('Parsed raster data:', rasterData);
        
//         // Create and add layer
//         this.currentLayer = this.createWeatherLayer(rasterData, variable);
        
//         if (this.currentLayer) {
//             this.currentLayer.addTo(this.leafletMap);
//             this.updateLegend(variable);
//         } else {
//             throw new Error('Failed to create weather layer');
//         }
        
//         document.getElementById('loading').classList.remove('active');
        
//     } catch (error) {
//         console.error('Error loading weather data:', error);
//         document.getElementById('loading').classList.remove('active');
//         alert('Failed to load weather data. Please try again.\n\nError: ' + error.message);
//     }
// }
    
//     createWeatherLayer(rasterData, variable) {
//         const varConfig = CONFIG.variables[variable];
//         const colorScale = this.getColorScale(variable);
        
//         // Create canvas layer
//         const canvasLayer = L.canvasLayerField({
//             data: rasterData.values,
//             lngMin: rasterData.lonMin,
//             lngMax: rasterData.lonMax,
//             latMin: rasterData.latMin,
//             latMax: rasterData.latMax,
//             colorScale: colorScale,
//             opacity: 0.7
//         });
        
//         return canvasLayer;
//     }
    
//     getColorScale(variable) {
//         // Define color scales for different variables
//         const scales = {
//             temperature: [
//                 '#000080', '#0000ff', '#0080ff', '#00ffff', 
//                 '#00ff80', '#80ff00', '#ffff00', '#ff8000', '#ff0000', '#800000'
//             ],
//             precipitation: [
//                 '#ffffff', '#e0f0ff', '#80c0ff', '#0080ff',
//                 '#00ff00', '#80ff00', '#ffff00', '#ff8000', '#ff0000', '#800080'
//             ],
//             wind: [
//                 '#ffffff', '#d4f0ff', '#a0d8ff', '#6bb5ff',
//                 '#3399ff', '#0066cc', '#ffcc00', '#ff6600', '#ff3300', '#cc0000'
//             ],
//             humidity: [
//                 '#67001f', '#b2182b', '#d6604d', '#f4a582',
//                 '#fddbc7', '#e0e0e0', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac'
//             ],
//             pressure: [
//                 '#8e0152', '#c51b7d', '#de77ae', '#f1b6da',
//                 '#fde0ef', '#f7f7f7', '#e6f5d0', '#b8e186', '#7fbc41', '#276419'
//             ]
//         };
        
//         return scales[variable] || scales.temperature;
//     }
    
//     updateLegend(variable) {
//         const varConfig = CONFIG.variables[variable];
//         const legendContent = document.getElementById('legend-content');
//         const colorScale = this.getColorScale(variable);
        
//         // Create gradient bar
//         const gradientBar = document.createElement('div');
//         gradientBar.className = 'legend-gradient';
//         gradientBar.style.background = `linear-gradient(to right, ${colorScale.join(', ')})`;
        
//         // Create labels
//         const labels = document.createElement('div');
//         labels.className = 'legend-labels';
        
//         const minLabel = document.createElement('span');
//         minLabel.textContent = `${varConfig.min}${varConfig.unit}`;
        
//         const maxLabel = document.createElement('span');
//         maxLabel.textContent = `${varConfig.max}${varConfig.unit}`;
        
//         labels.appendChild(minLabel);
//         labels.appendChild(maxLabel);
        
//         // Clear and update legend
//         legendContent.innerHTML = '';
//         legendContent.appendChild(gradientBar);
//         legendContent.appendChild(labels);
//     }
    
//     setLayerOpacity(opacity) {
//         if (this.currentLayer) {
//             this.currentLayer.setOpacity(opacity / 100);
//         }
//     }
// }

class WeatherMap {
    constructor() {
        this.map = null;
        this.currentLayer = null;
        this.dataLoader = new DataLoader();
        this.leafletMap = null;
        this.canvasLayer = null;
        
        this.init();
    }
    
    init() {
        // Initialize Leaflet map centered on Africa
        this.leafletMap = L.map('map', {
            center: CONFIG.mapDefaults.center,
            zoom: CONFIG.mapDefaults.zoom,
            maxZoom: CONFIG.mapDefaults.maxZoom,
            minZoom: CONFIG.mapDefaults.minZoom,
            zoomControl: true
        });
        
        // Add base tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 10
        }).addTo(this.leafletMap);
        
        // Add country labels
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap, © CartoDB',
            maxZoom: 10,
            opacity: 0.7
        }).addTo(this.leafletMap);
    }
    
   async loadAndDisplayWeather(initDate, variable, week) {
    try {
        console.log('=== LOADING WEATHER DATA ===');
        console.log('InitDate:', initDate);
        console.log('Variable:', variable);
        console.log('Week:', week);
        
        document.getElementById('loading').classList.add('active');
        
        // Remove previous layer
        if (this.currentLayer) {
            this.leafletMap.removeLayer(this.currentLayer);
            this.currentLayer = null;
        }
        
        // Load the data
        const data = await this.dataLoader.loadWeatherData(initDate, variable, week);
        console.log('Data received:', data);
        
        // Parse the data
        let rasterData;
        try {
            rasterData = this.dataLoader.parseWeatherData(data);
            console.log('Data parsed successfully');
        } catch (parseError) {
            console.error('Parse error:', parseError);
            console.error('Data that failed to parse:', data);
            throw new Error(`Parse error: ${parseError.message}`);
        }
        
        // Create and add layer
        this.currentLayer = this.createImageOverlay(rasterData, variable);
        
        if (this.currentLayer) {
            this.currentLayer.addTo(this.leafletMap);
            
            // Add popup with info
            const weekLabel = data.metadata ? data.metadata.week_label : `Week ${week}`;
            this.currentLayer.bindPopup(`<b>${CONFIG.variables[variable].label}</b><br>${weekLabel}`);
            
            // Update legend
            this.updateLegend(variable);
            
            // Fit bounds
            this.leafletMap.fitBounds([
                [rasterData.latMin, rasterData.lonMin],
                [rasterData.latMax, rasterData.lonMax]
            ]);
        }
        
        console.log('✅ Map updated successfully');
        document.getElementById('loading').classList.remove('active');
        
    } catch (error) {
        console.error('❌ Error in loadAndDisplayWeather:', error);
        console.error('Error stack:', error.stack);
        document.getElementById('loading').classList.remove('active');
        alert('Failed to load weather data.\n\nError: ' + error.message + '\n\nCheck browser console (F12) for details.');
    }
}
    
    createCanvasLayer(rasterData, variable) {
        const varConfig = CONFIG.variables[variable];
        const colorScale = this.getColorScale(variable);
        const bounds = [
            [rasterData.latMin, rasterData.lonMin],
            [rasterData.latMax, rasterData.lonMax]
        ];
        
        // Create a canvas element
        const canvas = L.canvasLayer ? null : null; // We'll implement our own
        
        // Use a simple image overlay approach instead
        return this.createImageOverlay(rasterData, variable, colorScale, bounds);
    }
    

    createImageOverlay(rasterData, variable, colorScale, bounds) {
        // Create an off-screen canvas to render the data
        const canvas = document.createElement('canvas');
        canvas.width = rasterData.nCols || 321;
        canvas.height = rasterData.nRows || 321;
        
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(canvas.width, canvas.height);
        
        // Map values to colors
        const varConfig = CONFIG.variables[variable];
        const minVal = varConfig.min;
        const maxVal = varConfig.max;
        
        // Flatten values if needed
        const values = rasterData.values;
        
        for (let row = 0; row < canvas.height; row++) {
            for (let col = 0; col < canvas.width; col++) {
                let value;
                if (Array.isArray(values[row]) && values[row][col] !== undefined) {
                    value = values[row][col];
                } else {
                    value = null;
                }
                
                const pixelIndex = (row * canvas.width + col) * 4;
                
                if (value === null || value === undefined || isNaN(value)) {
                    // Transparent for no data
                    imageData.data[pixelIndex] = 0;
                    imageData.data[pixelIndex + 1] = 0;
                    imageData.data[pixelIndex + 2] = 0;
                    imageData.data[pixelIndex + 3] = 0;
                } else {
                    // Get color for this value
                    const color = this.valueToColor(value, minVal, maxVal, colorScale);
                    
                    imageData.data[pixelIndex] = color[0];     // R
                    imageData.data[pixelIndex + 1] = color[1]; // G
                    imageData.data[pixelIndex + 2] = color[2]; // B
                    imageData.data[pixelIndex + 3] = 180;      // A (semi-transparent)
                }
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // Convert canvas to image overlay
        const imageUrl = canvas.toDataURL();
        
        // Remove previous layer if exists
        if (this.currentLayer) {
            this.leafletMap.removeLayer(this.currentLayer);
        }
        
        // Create image overlay
        const overlay = L.imageOverlay(imageUrl, bounds, {
            opacity: 0.7,
            interactive: true,
            zIndex: 1
        });
        
        return overlay;
    }
    
    valueToColor(value, min, max, colorScale) {
        // Normalize value to 0-1 range
        let normalized = (value - min) / (max - min);
        normalized = Math.max(0, Math.min(1, normalized));
        
        // Get color from scale
        const index = normalized * (colorScale.length - 1);
        const lowerIndex = Math.floor(index);
        const upperIndex = Math.ceil(index);
        const fraction = index - lowerIndex;
        
        const lowerColor = this.hexToRgb(colorScale[lowerIndex]);
        const upperColor = this.hexToRgb(colorScale[upperIndex]);
        
        // Interpolate between colors
        const r = Math.round(lowerColor[0] + (upperColor[0] - lowerColor[0]) * fraction);
        const g = Math.round(lowerColor[1] + (upperColor[1] - lowerColor[1]) * fraction);
        const b = Math.round(lowerColor[2] + (upperColor[2] - lowerColor[2]) * fraction);
        
        return [r, g, b];
    }
    
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16)
        ] : [0, 0, 0];
    }
    
    getColorScale(variable) {
        const scales = {
            temperature: [
                '#000080', '#0000ff', '#0080ff', '#00ffff', 
                '#00ff80', '#80ff00', '#ffff00', '#ff8000', 
                '#ff0000', '#800000'
            ],
            precipitation: [
                '#ffffff', '#e0f0ff', '#80c0ff', '#0080ff',
                '#00ff00', '#80ff00', '#ffff00', '#ff8000', 
                '#ff0000', '#800080'
            ],
            wind: [
                '#ffffff', '#d4f0ff', '#a0d8ff', '#6bb5ff',
                '#3399ff', '#0066cc', '#ffcc00', '#ff6600', 
                '#ff3300', '#cc0000'
            ],
            humidity: [
                '#67001f', '#b2182b', '#d6604d', '#f4a582',
                '#fddbc7', '#e0e0e0', '#d1e5f0', '#92c5de', 
                '#4393c3', '#2166ac'
            ],
            pressure: [
                '#8e0152', '#c51b7d', '#de77ae', '#f1b6da',
                '#fde0ef', '#f7f7f7', '#e6f5d0', '#b8e186', 
                '#7fbc41', '#276419'
            ]
        };
        
        return scales[variable] || scales.temperature;
    }
    
    setLayerOpacity(opacity) {
        if (this.currentLayer) {
            this.currentLayer.setOpacity(opacity / 100);
        }
    }
    
    updateLegend(variable) {
        const varConfig = CONFIG.variables[variable];
        const legendContent = document.getElementById('legend-content');
        const colorScale = this.getColorScale(variable);
        
        let html = '';
        
        // Create color bar
        html += '<div style="height: 20px; background: linear-gradient(to right, ';
        html += colorScale.join(', ');
        html += '); border-radius: 4px; margin: 10px 0;"></div>';
        
        // Create labels
        html += '<div style="display: flex; justify-content: space-between; font-size: 0.8em;">';
        html += `<span>${varConfig.min}${varConfig.unit}</span>`;
        html += `<span>${varConfig.max}${varConfig.unit}</span>`;
        html += '</div>';
        
        legendContent.innerHTML = html;
    }
}