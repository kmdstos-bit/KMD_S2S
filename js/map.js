class WeatherMap {
    constructor() {
        this.map = null;
        this.currentLayer = null;
        this.dataLoader = new DataLoader();
        this.leafletMap = null;
        this._hasInitialized = false;
        
        // Color scale tracking
        this.currentMin = null;
        this.currentMax = null;
        this.useAutoScale = false;
        this._lastDataRange = null;
        this._lastVariable = null;
        this._pendingAutoScale = false;
        
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
        
        // Add coordinate display
        this.addCoordinateDisplay();
    }
    
    addCoordinateDisplay() {
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
    
    // ============================================
    // COLOR SCALE METHODS
    // ============================================
    
   getCurrentRange(variable) {
    const varConfig = CONFIG.variables[variable];
    
    // If auto-scale is active and we have data range, use it
    if (this.useAutoScale && this._lastDataRange) {
        return {
            min: this._lastDataRange.min,
            max: this._lastDataRange.max
        };
    }
    
    // Check if we have stored manual values (set by user or variable change)
    if (this.currentMin !== null && this.currentMax !== null && !this.useAutoScale) {
        return {
            min: this.currentMin,
            max: this.currentMax
        };
    }
    
    // Fallback to reading from inputs
    const vminInput = document.getElementById('vmin');
    const vmaxInput = document.getElementById('vmax');
    
    const min = (vminInput && vminInput.value !== '') ? parseFloat(vminInput.value) : varConfig.defaultMin;
    const max = (vmaxInput && vmaxInput.value !== '') ? parseFloat(vmaxInput.value) : varConfig.defaultMax;
    
    return { 
        min: isNaN(min) ? varConfig.defaultMin : min, 
        max: isNaN(max) ? varConfig.defaultMax : max 
    };
}
    
    getDataRange(values) {
        let min = Infinity;
        let max = -Infinity;
        
        for (const row of values) {
            if (!row) continue;
            for (const val of row) {
                if (val !== null && val !== undefined && !isNaN(val) && isFinite(val)) {
                    if (val < min) min = val;
                    if (val > max) max = val;
                }
            }
        }
        
        // If no valid data found
        if (min === Infinity || max === -Infinity) {
            return { min: 0, max: 100 };
        }
        
        // Round to nice numbers
        const range = max - min;
        let step;
        if (range < 1) step = 0.1;
        else if (range < 10) step = 1;
        else if (range < 50) step = 5;
        else step = 10;
        
        min = Math.floor(min / step) * step;
        max = Math.ceil(max / step) * step;
        
        return { min, max };
    }
    
    autoScaleToData(values, variable) {
        const dataRange = this.getDataRange(values);
        this._lastDataRange = dataRange;
        this.useAutoScale = true;
        
        // Update the input fields
        const vminInput = document.getElementById('vmin');
        const vmaxInput = document.getElementById('vmax');
        if (vminInput) vminInput.value = dataRange.min;
        if (vmaxInput) vmaxInput.value = dataRange.max;
        
        // Update data range info display
        const rangeInfo = document.getElementById('data-range-info');
        if (rangeInfo) {
            const unit = CONFIG.variables[variable].unit;
            rangeInfo.textContent = `Data range: ${dataRange.min} to ${dataRange.max} ${unit}`;
        }
        
        console.log(`Auto-scale: ${dataRange.min} to ${dataRange.max}`);
        return dataRange;
    }
    
    setManualRange(min, max) {
        this.useAutoScale = false;
        this.currentMin = min;
        this.currentMax = max;
        
        const rangeInfo = document.getElementById('data-range-info');
        if (rangeInfo) {
            rangeInfo.textContent = `Manual range: ${min} to ${max}`;
        }
    }
    
    updateVariableDefaults(variable) {
    const varConfig = CONFIG.variables[variable];
    
    console.log(`Resetting color scale for ${variable}: ${varConfig.defaultMin} to ${varConfig.defaultMax}`);
    
    // Force reset all the tracking
    this.useAutoScale = false;
    this._pendingAutoScale = false;
    this.currentMin = varConfig.defaultMin;
    this.currentMax = varConfig.defaultMax;
    this._lastDataRange = null;
    
    // Update input fields forcefully
    const vminInput = document.getElementById('vmin');
    const vmaxInput = document.getElementById('vmax');
    
    if (vminInput) {
        vminInput.value = varConfig.defaultMin;
        vminInput.setAttribute('min', varConfig.absoluteMin);
        vminInput.setAttribute('max', varConfig.absoluteMax);
        vminInput.setAttribute('step', varConfig.step || 1);
    }
    if (vmaxInput) {
        vmaxInput.value = varConfig.defaultMax;
        vmaxInput.setAttribute('min', varConfig.absoluteMin);
        vmaxInput.setAttribute('max', varConfig.absoluteMax);
        vmaxInput.setAttribute('step', varConfig.step || 1);
    }
    
    // Update info display
    const rangeInfo = document.getElementById('data-range-info');
    if (rangeInfo) {
        rangeInfo.textContent = `Default: ${varConfig.defaultMin} to ${varConfig.defaultMax} ${varConfig.unit}`;
    }
}
    
    // ============================================
    // DATA LOADING & DISPLAY
    // ============================================
    
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
        
        // Load data
        const data = await this.dataLoader.loadWeatherData(initDate, variable, week);
        const rasterData = this.dataLoader.parseWeatherData(data);
        
        // CHECK IF VARIABLE CHANGED - update defaults BEFORE creating layer
        const variableChanged = (this._lastVariable && this._lastVariable !== variable);
        if (variableChanged) {
            console.log(`Variable changed: ${this._lastVariable} -> ${variable}`);
            this.updateVariableDefaults(variable);
        }
        
        // Handle auto-scale if pending
        if (this._pendingAutoScale) {
            console.log('Applying auto-scale...');
            const dataRange = this.getDataRange(rasterData.values);
            this._lastDataRange = dataRange;
            this.useAutoScale = true;
            
            const vminInput = document.getElementById('vmin');
            const vmaxInput = document.getElementById('vmax');
            if (vminInput) vminInput.value = dataRange.min;
            if (vmaxInput) vmaxInput.value = dataRange.max;
            
            const rangeInfo = document.getElementById('data-range-info');
            if (rangeInfo) {
                rangeInfo.textContent = `Auto-scaled: ${dataRange.min} to ${dataRange.max} ${CONFIG.variables[variable].unit}`;
            }
            
            this._pendingAutoScale = false;
        }
        
        // Store current variable for next comparison
        this._lastVariable = variable;
        
        // NOW create the layer with the correct range
        this.currentLayer = this.createGridCellLayer(rasterData, variable);
        
        if (this.currentLayer) {
            this.currentLayer.addTo(this.leafletMap);
            
            // Update legend with current range
            this.updateLegend(variable);
            
            // Handle view
            if (!this._hasInitialized) {
                this.leafletMap.fitBounds([
                    [rasterData.latMin, rasterData.lonMin],
                    [rasterData.latMax, rasterData.lonMax]
                ]);
                this._hasInitialized = true;
            } else {
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
    }
    
    // ============================================
    // GRID CELL LAYER
    // ============================================
    
    createGridCellLayer(rasterData, variable) {
    console.log('Creating grid cell layer...');
    console.log('Grid info:', {
        latMin: rasterData.latMin,
        latMax: rasterData.latMax,
        lonMin: rasterData.lonMin,
        lonMax: rasterData.lonMax,
        latStep: rasterData.latStep,
        lonStep: rasterData.lonStep,
        nRows: rasterData.nRows,
        nCols: rasterData.nCols
    });
    
    const canvas = document.createElement('canvas');
    const nCols = rasterData.nCols;
    const nRows = rasterData.nRows;
    const cellPixelSize = 5;
    
    canvas.width = nCols * cellPixelSize;
    canvas.height = nRows * cellPixelSize;
    
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    
    const colorScale = this.getColorScale(variable);
    const range = this.getCurrentRange(variable);
    const values = rasterData.values;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw cells
    for (let row = 0; row < nRows; row++) {
        for (let col = 0; col < nCols; col++) {
            const value = (values[row] && values[row][col] !== undefined) ? values[row][col] : null;
            const x = col * cellPixelSize;
            const y = row * cellPixelSize;
            
            if (value === null || value === undefined || isNaN(value)) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0)';
            } else {
                const [r, g, b] = this.valueToColor(value, range.min, range.max, colorScale);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            }
            ctx.fillRect(x, y, cellPixelSize, cellPixelSize);
        }
    }
    
    // // Subtle borders
    // ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    // ctx.lineWidth = 0.5;
    // for (let row = 0; row < nRows; row++) {
    //     for (let col = 0; col < nCols; col++) {
    //         const x = col * cellPixelSize;
    //         const y = row * cellPixelSize;
    //         ctx.strokeRect(x + 0.25, y + 0.25, cellPixelSize - 0.5, cellPixelSize - 0.5);
    //     }
    // }
    
    const imageUrl = canvas.toDataURL('image/png');
    
    // ============================================
    // CONFIGURABLE: Are your grid values centers or edges?
    // ============================================
    const GRID_VALUES_ARE_CELL_CENTERS = true;  // CHANGE THIS if needed
        
    const GRID_SPACING = 1.5;  // degrees per cell
    const HALF_CELL = GRID_SPACING / 2;  // 0.75°
    
    // Expand bounds by half a cell on each side
    const latMin = rasterData.latMin - HALF_CELL;
    const latMax = rasterData.latMax + HALF_CELL;
    const lonMin = rasterData.lonMin - HALF_CELL;
    const lonMax = rasterData.lonMax + HALF_CELL;
    
    console.log(`Bounds: [${latMin}, ${lonMin}] to [${latMax}, ${lonMax}]`);
    
    const bounds = [
        [latMin, lonMin],
        [latMax, lonMax]
    ];
    
    const overlay = L.imageOverlay(imageUrl, bounds, {
        opacity: 0.85,
        interactive: false,
        zIndex: 1,
        className: 'weather-grid-overlay'
    });
    
    overlay.on('add', () => {
        const img = overlay.getElement();
        if (img) {
            img.style.imageRendering = 'pixelated';
            img.style.setProperty('image-rendering', 'pixelated', 'important');
        }
    });
    
    return overlay;
}
    
    // ============================================
    // COLOR UTILITIES
    // ============================================
    
    valueToColor(value, min, max, colorScale) {
        // Handle edge cases
        if (min === max) {
            const color = this.hexToRgb(colorScale[Math.floor(colorScale.length / 2)]);
            return color;
        }
        
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
            temp: [
                '#000080', '#0000cc', '#0033ff', '#0066ff', 
                '#0099ff', '#00ccff', '#00ffff', '#00ffcc',
                '#00ff66', '#33ff00', '#99ff00', '#ffff00', 
                '#ffcc00', '#ff9900', '#ff3300', '#cc0000', '#800000'
            ],
            precip: [
                '#ffffff', '#e8f4f8', '#d1e8f0', '#b0d8e8',
                '#87ceeb', '#60b8d8', '#40a0c8', '#2088b0',
                '#007098', '#005880', '#004068', '#30a030',
                '#40b840', '#60d060', '#80e880', '#a0f0a0',
                '#c0f8c0', '#e0ffe0'
            ],
            wind_speed: [
                '#ffffff', '#e6f0ff', '#cce0ff', '#99ccff',
                '#66b3ff', '#3399ff', '#0080ff', '#0066cc',
                '#004d99', '#ffcc00', '#ff9900', '#ff6600', 
                '#ff3300', '#cc0000', '#990000'
            ],
            rh: [
                '#67001f', '#b2182b', '#d6604d', '#f4a582',
                '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', 
                '#4393c3', '#2166ac', '#053061'
            ],
            mslp: [
                '#8e0152', '#c51b7d', '#de77ae', '#f1b6da',
                '#fde0ef', '#f7f7f7', '#e6f5d0', '#b8e186', 
                '#7fbc41', '#4d9221', '#276419'
            ]
        };
        
        return scales[variable] || scales.temperature;
    }
    
    // ============================================
    // UI UPDATES
    // ============================================
    
    setLayerOpacity(opacity) {
        if (this.currentLayer) {
            this.currentLayer.setOpacity(opacity / 100);
        }
    }
    
    updateLegend(variable) {
        const varConfig = CONFIG.variables[variable];
        const legendContent = document.getElementById('legend-content');
        const colorScale = this.getColorScale(variable);
        const range = this.getCurrentRange(variable);
        
        let html = '';
        
        // Title showing current range
        html += '<div style="font-size: 0.8em; margin-bottom: 5px; text-align: center; opacity: 0.9;">';
        html += `${range.min} to ${range.max} ${varConfig.unit}`;
        if (this.useAutoScale) {
            html += ' <span style="color: #4CAF50; font-size: 0.8em;">(auto)</span>';
        }
        html += '</div>';
        
        // Color bar
        html += '<div style="display: flex; height: 25px; margin: 10px 0; border: 1px solid rgba(255,255,255,0.3);">';
        colorScale.forEach(color => {
            html += `<div style="flex: 1; background: ${color};"></div>`;
        });
        html += '</div>';
        
        // Labels with min, mid, max
        const mid = Math.round((range.max + range.min) / 2);
        html += '<div style="display: flex; justify-content: space-between; font-size: 0.8em; margin-top: 5px;">';
        html += `<span>${range.min}</span>`;
        html += `<span style="text-align: center;">${mid}</span>`;
        html += `<span>${range.max}</span>`;
        html += '</div>';
        
        legendContent.innerHTML = html;
    }
}