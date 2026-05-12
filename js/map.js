class WeatherMap {
    constructor() {
        this.map = null;
        this.currentLayer = null;
        this.dataLoader = new DataLoader();
        this.leafletMap = null;
        this._hasInitialized = false;  // Track if we've done the initial fit
        
        this.init();
    }
    
    init() {
        this.leafletMap = L.map('map', {
            center: CONFIG.mapDefaults.center,
            zoom: CONFIG.mapDefaults.zoom,
            maxZoom: CONFIG.mapDefaults.maxZoom,
            minZoom: CONFIG.mapDefaults.minZoom,
            zoomControl: true,
            zoomSnap: 0.25,
            zoomDelta: 0.5
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
        
        // Add info control that shows current zoom/center
        this.addCoordinateDisplay();
    }
    
    addCoordinateDisplay() {
        // Show coordinates on mouse move (optional but nice for forecasters)
        const coordDisplay = L.control({ position: 'bottomleft' });
        coordDisplay.onAdd = () => {
            const div = L.DomUtil.create('div', 'coord-display');
            div.style.cssText = 'background: rgba(0,0,0,0.7); color: white; padding: 5px 10px; font-size: 12px; border-radius: 4px;';
            div.innerHTML = 'Move mouse over map';
            return div;
        };
        coordDisplay.addTo(this.leafletMap);
        
        this.leafletMap.on('mousemove', (e) => {
            const lat = e.latlng.lat.toFixed(4);
            const lng = e.latlng.lng.toFixed(4);
            const zoom = this.leafletMap.getZoom();
            document.querySelector('.coord-display').innerHTML = 
                `📍 ${lat}°, ${lng}° | Zoom: ${zoom}`;
        });
    }
    
    async loadAndDisplayWeather(initDate, variable, week) {
        try {
            document.getElementById('loading').classList.add('active');
            
            // Save current view state
            const currentCenter = this.leafletMap.getCenter();
            const currentZoom = this.leafletMap.getZoom();
            
            // Remove previous layer
            if (this.currentLayer) {
                this.leafletMap.removeLayer(this.currentLayer);
                this.currentLayer = null;
            }
            
            // Load and parse data
            const data = await this.dataLoader.loadWeatherData(initDate, variable, week);
            const rasterData = this.dataLoader.parseWeatherData(data);
            
            // Create new layer
            this.currentLayer = this.createGridCellLayer(rasterData, variable);
            
            if (this.currentLayer) {
                this.currentLayer.addTo(this.leafletMap);
                
                // Update legend
                this.updateLegend(variable);
                
                // Only reset view on first load
                if (!this._hasInitialized) {
                    console.log('📍 First load - fitting to data bounds');
                    this.leafletMap.fitBounds([
                        [rasterData.latMin, rasterData.lonMin],
                        [rasterData.latMax, rasterData.lonMax]
                    ]);
                    this._hasInitialized = true;
                } else {
                    // Keep the user's current view
                    console.log('📍 Keeping current view');
                    // Restore view silently (no animation)
                    this.leafletMap.setView(currentCenter, currentZoom, { animate: false });
                }
            }
            
            document.getElementById('loading').classList.remove('active');
            
        } catch (error) {
            console.error('Error:', error);
            document.getElementById('loading').classList.remove('active');
            alert('Failed to load weather data.\n\nError: ' + error.message);
        }
    }
    
    resetView() {
        // Reset to show all of Africa with data
        if (this.currentLayer) {
            try {
                const bounds = this.currentLayer.getBounds();
                this.leafletMap.fitBounds(bounds);
            } catch (e) {
                this.leafletMap.setView(CONFIG.mapDefaults.center, CONFIG.mapDefaults.zoom);
            }
        } else {
            this.leafletMap.setView(CONFIG.mapDefaults.center, CONFIG.mapDefaults.zoom);
        }
        // Don't reset _hasInitialized - user explicitly asked for reset
    }
    
    createGridCellLayer(rasterData, variable) {
    console.log('Creating grid cell layer...');
    
    const canvas = document.createElement('canvas');
    
    const nCols = rasterData.nCols;
    const nRows = rasterData.nRows;
    
    // Each cell will be exactly this many pixels (no gaps)
    const cellPixelSize = 5;  // 5x5 pixels per cell
    
    // Canvas size: exactly nCols * cellSize by nRows * cellSize
    canvas.width = nCols * cellPixelSize;
    canvas.height = nRows * cellPixelSize;
    
    console.log('Canvas size:', canvas.width, 'x', canvas.height);
    console.log('Grid:', nCols, 'cols x', nRows, 'rows');
    
    const ctx = canvas.getContext('2d');
    
    // Disable all smoothing
    ctx.imageSmoothingEnabled = false;
    
    // Get color scale
    const colorScale = this.getColorScale(variable);
    const varConfig = CONFIG.variables[variable];
    const minVal = varConfig.min;
    const maxVal = varConfig.max;
    const values = rasterData.values;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw each grid cell - cells are adjacent with NO gaps
    for (let row = 0; row < nRows; row++) {
        for (let col = 0; col < nCols; col++) {
            const value = (values[row] && values[row][col] !== undefined) ? values[row][col] : null;
            
            // Position: cells start right next to each other
            const x = col * cellPixelSize;
            const y = row * cellPixelSize;
            
            if (value === null || value === undefined || isNaN(value)) {
                // Make no-data areas fully transparent
                ctx.fillStyle = 'rgba(0, 0, 0, 0)';
            } else {
                const [r, g, b] = this.valueToColor(value, minVal, maxVal, colorScale);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            }
            
            // Fill the cell - exactly cellPixelSize x cellPixelSize
            ctx.fillRect(x, y, cellPixelSize, cellPixelSize);
        }
    }
    
    // Add a very subtle border around each cell (optional)
    // This draws ON TOP of the cells so there are no gaps
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 0.5;
    
    for (let row = 0; row < nRows; row++) {
        for (let col = 0; col < nCols; col++) {
            const x = col * cellPixelSize;
            const y = row * cellPixelSize;
            ctx.strokeRect(x + 0.25, y + 0.25, cellPixelSize - 0.5, cellPixelSize - 0.5);
        }
    }
    
    // Convert to image
    const imageUrl = canvas.toDataURL('image/png');
    
    const bounds = [
        [rasterData.latMin, rasterData.lonMin],
        [rasterData.latMax, rasterData.lonMax]
    ];
    
    const overlay = L.imageOverlay(imageUrl, bounds, {
        opacity: 0.85,
        interactive: false,
        zIndex: 1,
        className: 'weather-grid-overlay'
    });
    
    // Fix image rendering after adding to map
    overlay.on('add', () => {
        const img = overlay.getElement();
        if (img) {
            img.style.imageRendering = 'pixelated';
            img.style.setProperty('image-rendering', 'pixelated', 'important');
        }
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
        const upperIndex = Math.min(Math.ceil(index), colorScale.length - 1);
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
        ] : [128, 128, 128];
    }
    
    getColorScale(variable) {
        const scales = {
            temperature: [
                '#000080', '#0000cc', '#0033ff', '#0066ff', 
                '#0099ff', '#00ccff', '#00ffff', '#00ffcc',
                '#00ff66', '#33ff00', '#99ff00', '#ffff00', 
                '#ffcc00', '#ff9900', '#ff3300', '#cc0000', '#800000'
            ],
            precipitation: [
                '#ffffff', '#e8f4f8', '#d1e8f0', '#b0d8e8',
                '#87ceeb', '#60b8d8', '#40a0c8', '#2088b0',
                '#007098', '#005880', '#004068', '#30a030',
                '#40b840', '#60d060', '#80e880', '#a0f0a0',
                '#c0f8c0', '#e0ffe0'
            ],
            wind: [
                '#ffffff', '#e6f0ff', '#cce0ff', '#99ccff',
                '#66b3ff', '#3399ff', '#0080ff', '#0066cc',
                '#004d99', '#ffcc00', '#ff9900', '#ff6600', 
                '#ff3300', '#cc0000', '#990000'
            ],
            humidity: [
                '#67001f', '#b2182b', '#d6604d', '#f4a582',
                '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', 
                '#4393c3', '#2166ac', '#053061'
            ],
            pressure: [
                '#8e0152', '#c51b7d', '#de77ae', '#f1b6da',
                '#fde0ef', '#f7f7f7', '#e6f5d0', '#b8e186', 
                '#7fbc41', '#4d9221', '#276419'
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
        
        // Create discrete color blocks for each color
        html += '<div style="display: flex; height: 25px; margin: 10px 0; border: 1px solid rgba(255,255,255,0.3);">';
        colorScale.forEach(color => {
            html += `<div style="flex: 1; background: ${color};"></div>`;
        });
        html += '</div>';
        
        // Create labels
        html += '<div style="display: flex; justify-content: space-between; font-size: 0.8em; margin-top: 5px;">';
        html += `<span>${varConfig.min}${varConfig.unit}</span>`;
        html += `<span style="text-align: center;">${Math.round((varConfig.max + varConfig.min) / 2)}${varConfig.unit}</span>`;
        html += `<span>${varConfig.max}${varConfig.unit}</span>`;
        html += '</div>';
        
        legendContent.innerHTML = html;
    }
}