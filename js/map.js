class WeatherMap {
    constructor() {
        this.map = null;
        this.currentLayer = null;
        this.dataLoader = new DataLoader();
        this.leafletMap = null;
        
        this.init();
    }
    
    init() {
        // Initialize Leaflet map centered on Africa
        this.leafletMap = L.map('map', {
            center: CONFIG.mapDefaults.center,
            zoom: CONFIG.mapDefaults.zoom,
            maxZoom: CONFIG.mapDefaults.maxZoom,
            minZoom: CONFIG.mapDefaults.minZoom,
            zoomControl: true,
            // Disable smooth zoom to keep grid crisp
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
            const rasterData = this.dataLoader.parseWeatherData(data);
            
            // Create grid cell layer
            this.currentLayer = this.createGridCellLayer(rasterData, variable);
            
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
            document.getElementById('loading').classList.remove('active');
            alert('Failed to load weather data.\n\nError: ' + error.message);
        }
    }
    
    createGridCellLayer(rasterData, variable) {
    console.log('Creating grid cell layer...');
    console.log('Grid size:', rasterData.nCols, 'x', rasterData.nRows);
    
    // Create a MUCH larger canvas
    const canvas = document.createElement('canvas');
    
    const nCols = rasterData.nCols;
    const nRows = rasterData.nRows;
    
    // Make each grid cell at least 3-4 pixels on screen
    // For a 161x161 grid, this gives a canvas of ~644x644 pixels
    const cellPixelSize = 4;  // Each cell will be 4x4 pixels
    const gridLineWidth = 1;  // 1 pixel grid lines
    
    canvas.width = nCols * cellPixelSize + (nCols - 1) * gridLineWidth;
    canvas.height = nRows * cellPixelSize + (nRows - 1) * gridLineWidth;
    
    console.log('Canvas size:', canvas.width, 'x', canvas.height);
    
    const ctx = canvas.getContext('2d');
    
    // CRITICAL: Disable all smoothing
    ctx.imageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
    
    // Get color scale
    const colorScale = this.getColorScale(variable);
    const varConfig = CONFIG.variables[variable];
    const minVal = varConfig.min;
    const maxVal = varConfig.max;
    const values = rasterData.values;
    
    // Clear canvas first
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw each grid cell as a block of pixels
    for (let row = 0; row < nRows; row++) {
        for (let col = 0; col < nCols; col++) {
            const value = (values[row] && values[row][col] !== undefined) ? values[row][col] : null;
            
            // Calculate position on canvas
            const x = col * (cellPixelSize + gridLineWidth);
            const y = row * (cellPixelSize + gridLineWidth);
            
            if (value === null || value === undefined || isNaN(value)) {
                // No data - make transparent (or white)
                ctx.fillStyle = 'rgba(255, 255, 255, 0)';
            } else {
                // Get color for this value
                const [r, g, b] = this.valueToColor(value, minVal, maxVal, colorScale);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            }
            
            // Fill the cell (cellPixelSize x cellPixelSize pixels)
            ctx.fillRect(x, y, cellPixelSize, cellPixelSize);
        }
    }
    
    // Add grid lines between cells
    if (gridLineWidth > 0) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = gridLineWidth;
        
        // Horizontal lines
        for (let row = 0; row <= nRows; row++) {
            const y = row * (cellPixelSize + gridLineWidth) - Math.floor(gridLineWidth / 2);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
        
        // Vertical lines
        for (let col = 0; col <= nCols; col++) {
            const x = col * (cellPixelSize + gridLineWidth) - Math.floor(gridLineWidth / 2);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
    }
    
    // CRITICAL: Use toDataURL with no compression
    const imageUrl = canvas.toDataURL('image/png');
    
    // Create bounds for overlay
    const bounds = [
        [rasterData.latMin, rasterData.lonMin],
        [rasterData.latMax, rasterData.lonMax]
    ];
    
    // Create the overlay
    const overlay = L.imageOverlay(imageUrl, bounds, {
        opacity: 0.85,
        interactive: false,
        zIndex: 1,
        // Add a class we can target with CSS
        className: 'weather-grid-overlay'
    });
    
    // After the overlay is added to the map, fix the image rendering
    overlay.on('add', () => {
        const img = overlay.getElement();
        if (img) {
            img.style.imageRendering = 'pixelated';
            img.style.imageRendering = 'crisp-edges';
            img.style.setProperty('image-rendering', 'pixelated', 'important');
            img.style.setProperty('image-rendering', 'crisp-edges', 'important');
            img.style.setProperty('-ms-interpolation-mode', 'nearest-neighbor');
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