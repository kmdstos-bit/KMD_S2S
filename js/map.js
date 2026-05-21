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
        this.useViewportAutoScale = false;  // Default: use all data
        this._currentRasterData = null; 
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

        // Create custom pane for borders (highest z-index)
        // Create custom panes for layering
        this.leafletMap.createPane('bordersPane');
        this.leafletMap.getPane('bordersPane').style.zIndex = 640;
        this.leafletMap.getPane('bordersPane').style.pointerEvents = 'none';
        
        this.leafletMap.createPane('labelsPane');
        this.leafletMap.getPane('labelsPane').style.zIndex = 650;
        this.leafletMap.getPane('labelsPane').style.pointerEvents = 'none';
        
        // Add base tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 10
        }).addTo(this.leafletMap);
        
    //     this.bordersLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
    //     attribution: '© OpenStreetMap, © CartoDB',
    //     maxZoom: 10,
    //     opacity: 0.9,
    //     pane: 'bordersPane',  // This keeps it above everything
    //     zIndex: 1000
    // }).addTo(this.leafletMap);

        this.addCountryBorders();
        
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

    async addCountryBorders() {
    try {
        // Load Africa GeoJSON
        const response = await fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson');
        const data = await response.json();
        
        // Add country borders
        this.countryBorders = L.geoJSON(data, {
            style: function(feature) {
                return {
                    color: '#ffffff',       // Dark gray borders
                    weight: 1.5,            // Line thickness
                    opacity: 1,           // Border opacity
                    fillOpacity: 0,         // No fill
                    dashArray: null,        // Solid lines
                    lineJoin: 'round',
                    lineCap: 'round'
                };
            },
            pane: 'bordersPane',           // Put in borders pane
            interactive: false,             // Allow clicking through to map
            // onEachFeature: function(feature, layer) {
            //     // Optional: add country name on hover
            //     layer.bindTooltip(feature.properties.ADMIN || feature.properties.name || '', {
            //         permanent: false,
            //         direction: 'center',
            //         className: 'country-label',
            //         opacity: 0.8
            //     });
            // }
        }).addTo(this.leafletMap);
        
        console.log('✅ Country borders loaded');
        
    } catch (e) {
        console.log('⚠️ Could not load country borders, using tile fallback:', e.message);
        
        // Fallback: Use a tile layer that includes borders
        this.countryBorders = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '',
            maxZoom: 10,
            opacity: 0.3,
            pane: 'bordersPane'
        }).addTo(this.leafletMap);
    }
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
    
    getDataRange(values, rasterData) {
    // Check if we should only use visible data
    if (this.useViewportAutoScale && rasterData) {
        return this.getVisibleDataRange(values, rasterData);
    }
    
    // Default: use all data
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

getVisibleDataRange(values, rasterData) {
    // Get current map bounds
    const bounds = this.leafletMap.getBounds();
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const west = bounds.getWest();
    const east = bounds.getEast();
    
    console.log('Visible bounds:', { south, north, west, east });
    
    // Calculate which cells are visible
    const latStep = rasterData.latStep || 1.5;
    const lonStep = rasterData.lonStep || 1.5;
    
    // Cell centers (accounting for North-to-South ordering)
    const firstLat = rasterData.latMax;  // 22.5 (north, row 0)
    const lastLat = rasterData.latMin;   // -36 (south, row 39)
    const firstLon = rasterData.lonMin;  // -19.5 (west, col 0)
    
    const nRows = rasterData.nRows;
    const nCols = rasterData.nCols;
    
    // Find visible row range
    let firstVisibleRow = -1;
    let lastVisibleRow = -1;
    
    for (let row = 0; row < nRows; row++) {
        const cellLat = firstLat - row * latStep;  // Row 0=22.5, row 1=21.0, etc.
        
        // Check if this cell's center is within visible bounds
        if (cellLat >= south && cellLat <= north) {
            if (firstVisibleRow === -1) firstVisibleRow = row;
            lastVisibleRow = row;
        }
    }
    
    // Find visible column range
    let firstVisibleCol = -1;
    let lastVisibleCol = -1;
    
    for (let col = 0; col < nCols; col++) {
        const cellLon = firstLon + col * lonStep;
        
        if (cellLon >= west && cellLon <= east) {
            if (firstVisibleCol === -1) firstVisibleCol = col;
            lastVisibleCol = col;
        }
    }
    
    console.log('Visible cells: rows', firstVisibleRow, 'to', lastVisibleRow, 
                'cols', firstVisibleCol, 'to', lastVisibleCol);
    
    // No visible cells? Use all data
    if (firstVisibleRow === -1 || firstVisibleCol === -1) {
        console.log('No cells in view, using all data');
        return this.getDataRange(values, null);
    }
    
    // Collect values from visible cells only
    let min = Infinity;
    let max = -Infinity;
    
    for (let row = firstVisibleRow; row <= lastVisibleRow; row++) {
        if (!values[row]) continue;
        for (let col = firstVisibleCol; col <= lastVisibleCol; col++) {
            const val = values[row][col];
            if (val !== null && val !== undefined && !isNaN(val) && isFinite(val)) {
                if (val < min) min = val;
                if (val > max) max = val;
            }
        }
    }
    
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
    
    console.log('Visible data range:', min, 'to', max);
    return { min, max };
}

autoScaleToData(values, variable, rasterData) {
    // Check if viewport-aware auto-scale is enabled
    const dataRange = this.getDataRange(values, rasterData);
    this._lastDataRange = dataRange;
    this.useAutoScale = true;
    
    // Update input fields
    const vminInput = document.getElementById('vmin');
    const vmaxInput = document.getElementById('vmax');
    if (vminInput) vminInput.value = dataRange.min;
    if (vmaxInput) vmaxInput.value = dataRange.max;
    
    // Update info display
    const rangeInfo = document.getElementById('data-range-info');
    if (rangeInfo) {
        const unit = CONFIG.variables[variable].unit;
        const scopeText = this.useViewportAutoScale ? ' (viewport)' : ' (all data)';
        rangeInfo.textContent = `Auto-scaled${scopeText}: ${dataRange.min} to ${dataRange.max} ${unit}`;
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
        
        const currentCenter = this.leafletMap.getCenter();
        const currentZoom = this.leafletMap.getZoom();
        
        if (this.currentLayer) {
            this.leafletMap.removeLayer(this.currentLayer);
            this.currentLayer = null;
        }
        
        const data = await this.dataLoader.loadWeatherData(initDate, variable, week);
        const rasterData = this.dataLoader.parseWeatherData(data);
        
        // Store rasterData for viewport calculations
        this._currentRasterData = rasterData;
        
        const variableChanged = (this._lastVariable && this._lastVariable !== variable);
        if (variableChanged) {
            this.updateVariableDefaults(variable);
        }
        
        // Handle auto-scale WITH rasterData
        if (this._pendingAutoScale) {
            console.log('Applying auto-scale...');
            this.autoScaleToData(rasterData.values, variable, rasterData);
            this._pendingAutoScale = false;
        }
        
        this._lastVariable = variable;
        
        this.currentLayer = this.createGridCellLayer(rasterData, variable);
        
        if (this.currentLayer) {
            this.currentLayer.addTo(this.leafletMap);
            this.updateLegend(variable);
            
            if (!this._hasInitialized) {
                this.leafletMap.fitBounds([
                    [rasterData.southEdge || rasterData.latMin - rasterData.latStep/2,
                     rasterData.westEdge || rasterData.lonMin - rasterData.lonStep/2],
                    [rasterData.northEdge || rasterData.latMax + rasterData.latStep/2,
                     rasterData.eastEdge || rasterData.lonMax + rasterData.lonStep/2]
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
    console.log('rasterData keys:', Object.keys(rasterData));
    console.log('latMin:', rasterData.latMin, 'latMax:', rasterData.latMax);
    console.log('lonMin:', rasterData.lonMin, 'lonMax:', rasterData.lonMax);
    console.log('southEdge:', rasterData.southEdge, 'northEdge:', rasterData.northEdge);
    
    const canvas = document.createElement('canvas');
    const nCols = rasterData.nCols;
    const nRows = rasterData.nRows;
    const cellPixelSize = 6;
    
    canvas.width = nCols * cellPixelSize;
    canvas.height = nRows * cellPixelSize;
    
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    
    const colorScale = this.getColorScale(variable);
    const range = this.getCurrentRange(variable);
    const values = rasterData.values;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw cells
    // Row 0 = 22.5°N (north) → TOP of canvas
    // Row 39 = -36°S (south) → BOTTOM of canvas
    for (let row = 0; row < nRows; row++) {
        for (let col = 0; col < nCols; col++) {
            const value = (values[row] && values[row][col] !== undefined) ? values[row][col] : null;
            
            const x = col * cellPixelSize;
            const y = row * cellPixelSize;
            
            if (value === null || value === undefined || isNaN(value)) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0)';
            } else {
                const [r, g, b, a] = this.valueToColor(value, range.min, range.max, colorScale);
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a !== undefined ? a : 1})`;
            }
            ctx.fillRect(x, y, cellPixelSize, cellPixelSize);
        }
    }
    
    const imageUrl = canvas.toDataURL('image/png');
    
    // Use pre-calculated edges from parseWeatherData
    const southEdge = rasterData.southEdge;
    const northEdge = rasterData.northEdge;
    const westEdge = rasterData.westEdge;
    const eastEdge = rasterData.eastEdge;
    
    // Safety check for NaN
    if (isNaN(southEdge) || isNaN(northEdge) || isNaN(westEdge) || isNaN(eastEdge)) {
        console.error('Invalid edge values, recalculating...');
        const halfLat = rasterData.latStep / 2;
        const halfLon = rasterData.lonStep / 2;
        const southEdge2 = rasterData.latMin - halfLat;
        const northEdge2 = rasterData.latMax + halfLat;
        const westEdge2 = rasterData.lonMin - halfLon;
        const eastEdge2 = rasterData.lonMax + halfLon;
        console.log('Recalculated:', {southEdge2, northEdge2, westEdge2, eastEdge2});
    }
    
    console.log('Using bounds:', [[southEdge, westEdge], [northEdge, eastEdge]]);
    
    const bounds = [
        [southEdge, westEdge],
        [northEdge, eastEdge]
    ];
    
    const overlay = L.imageOverlay(imageUrl, bounds, {
        opacity: 0.9,
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
        const color = this.parseColor(colorScale[Math.floor(colorScale.length / 2)]);
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
    
    const lowerColor = this.parseColor(colorScale[lowerIndex]);
    const upperColor = this.parseColor(colorScale[upperIndex]);
    
    // Interpolate between colors (including alpha)
    const r = Math.round(lowerColor[0] + (upperColor[0] - lowerColor[0]) * fraction);
    const g = Math.round(lowerColor[1] + (upperColor[1] - lowerColor[1]) * fraction);
    const b = Math.round(lowerColor[2] + (upperColor[2] - lowerColor[2]) * fraction);
    const a = lowerColor[3] + (upperColor[3] - lowerColor[3]) * fraction;
    
    return [r, g, b, a];
}

parseColor(colorStr) {
    // Handle rgba() format
    if (typeof colorStr === 'string' && colorStr.startsWith('rgba')) {
        const match = colorStr.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
        if (match) {
            return [
                parseInt(match[1]),
                parseInt(match[2]),
                parseInt(match[3]),
                parseFloat(match[4])
            ];
        }
    }
    
    // Handle rgb() format
    if (typeof colorStr === 'string' && colorStr.startsWith('rgb')) {
        const match = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            return [
                parseInt(match[1]),
                parseInt(match[2]),
                parseInt(match[3]),
                1.0  // fully opaque
            ];
        }
    }
    
    // Handle hex format
    if (typeof colorStr === 'string' && colorStr.startsWith('#')) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colorStr);
        if (result) {
            return [
                parseInt(result[1], 16),
                parseInt(result[2], 16),
                parseInt(result[3], 16),
                1.0
            ];
        }
    }
    
    // Fallback
    return [128, 128, 128, 1.0];
}
    
  hexToRgb(hex) {
    // Handle rgba strings
    if (typeof hex === 'string' && hex.startsWith('rgba')) {
        return this.parseColor(hex);
    }
    
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
        1.0  // fully opaque
    ] : [128, 128, 128, 1.0];
}
  getColorScale(variable) {
    const scales = {
        temp: [
            '#000080', '#0000cc', '#0033ff', '#0066ff', 
            '#0099ff', '#00ccff', '#00ffff', '#00ffcc',
            '#00ff66', '#33ff00', '#99ff00', '#ffff00', 
            '#ffcc00', '#ff9900', '#ff3300', '#cc0000', '#800000'
        ],
        mx2t6: [
            '#000080', '#0000cc', '#0033ff', '#0066ff', 
            '#0099ff', '#00ccff', '#00ffff', '#00ffcc',
            '#00ff66', '#33ff00', '#99ff00', '#ffff00', 
            '#ffcc00', '#ff9900', '#ff3300', '#cc0000', '#800000'
        ],
        mn2t6: [
            '#000080', '#0000cc', '#0033ff', '#0066ff', 
            '#0099ff', '#00ccff', '#00ffff', '#00ffcc',
            '#00ff66', '#33ff00', '#99ff00', '#ffff00', 
            '#ffcc00', '#ff9900', '#ff3300', '#cc0000', '#800000'
        ], 
        cape: [
            '#000080', '#0000cc', '#0033ff', '#0066ff', 
            '#0099ff', '#00ccff', '#00ffff', '#00ffcc',
            '#00ff66', '#33ff00', '#99ff00', '#ffff00', 
            '#ffcc00', '#ff9900', '#ff3300', '#cc0000', '#800000'
        ],
        precip: [
            'rgba(0,0,0,0)',
            'rgba(180,220,255,0.3)',
            'rgba(140,200,255,0.5)',
            'rgba(100,180,255,0.7)',
            '#87ceeb',
            '#60b8d8',
            '#40a0c8',
            '#2088b0',
            '#007098',
            '#005880',
            '#30a030',
            '#40b840',
            '#60d060',
            '#80e880',
            '#ffff00',
            '#ffcc00',
            '#ff9900',
            '#ff6600',
            '#ff3300',
            '#cc0000',
            '#990000',
            '#800080',
        ],
        tcw: [
            '#fff7fb', '#ece7f2', '#d0d1e6', '#a6bddb',
            '#74a9cf', '#3690c0', '#0570b0', '#045a8d',
            '#023858', '#011428'
        ],
        d2m: [
            '#67001f', '#b2182b', '#d6604d', '#f4a582',
            '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', 
            '#4393c3', '#2166ac', '#053061'
        ],
        w500: [
            '#67001f', '#b2182b', '#d6604d', '#f4a582',
            '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', 
            '#4393c3', '#2166ac', '#053061'
        ],
        u10: [
            '#ffffff', '#e6f0ff', '#cce0ff', '#99ccff',
            '#66b3ff', '#3399ff', '#0080ff', '#0066cc',
            '#004d99', '#ffcc00', '#ff9900', '#ff6600', 
            '#ff3300', '#cc0000', '#990000'
        ],
        v10: [
            '#ffffff', '#e6f0ff', '#cce0ff', '#99ccff',
            '#66b3ff', '#3399ff', '#0080ff', '#0066cc',
            '#004d99', '#ffcc00', '#ff9900', '#ff6600', 
            '#ff3300', '#cc0000', '#990000'
        ],
        u700: [
            '#ffffff', '#e6f0ff', '#cce0ff', '#99ccff',
            '#66b3ff', '#3399ff', '#0080ff', '#0066cc',
            '#004d99', '#ffcc00', '#ff9900', '#ff6600', 
            '#ff3300', '#cc0000', '#990000'
        ],
        v700: [
            '#ffffff', '#e6f0ff', '#cce0ff', '#99ccff',
            '#66b3ff', '#3399ff', '#0080ff', '#0066cc',
            '#004d99', '#ffcc00', '#ff9900', '#ff6600', 
            '#ff3300', '#cc0000', '#990000'
        ],
    };

    return scales[variable] || scales.temp;
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
    
    // Title
    html += '<div style="font-size: 0.85em; margin-bottom: 8px; text-align: center; font-weight: 500;">';
    html += `${CONFIG.variables[variable].label}`;
    html += '</div>';
    
    // Range indicator
    html += '<div style="font-size: 0.7em; margin-bottom: 4px; text-align: center; opacity: 0.8;">';
    html += `${range.min} to ${range.max} ${varConfig.unit}`;
    if (this.useAutoScale) {
        html += ' <span style="color: #4CAF50;">(auto)</span>';
    }
    html += '</div>';
    
    // Color bar
    html += '<div style="display: flex; height: 22px; margin: 6px 0; border: 1px solid rgba(255,255,255,0.4); border-radius: 3px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">';
    colorScale.forEach(color => {
        html += `<div style="flex: 1; background: ${color};"></div>`;
    });
    html += '</div>';
    
    // Tick marks and labels
    const numTicks = 9;  // Number of labeled ticks
    html += '<div style="display: flex; justify-content: space-between; font-size: 0.7em; margin-top: 4px; padding: 0 1px;">';
    
    for (let i = 0; i < numTicks; i++) {
        const value = range.min + (range.max - range.min) * (i / (numTicks - 1));
        let formattedValue;
        
        // Smart formatting based on value size
        if (Math.abs(value) < 0.1 && value !== 0) {
            formattedValue = value.toFixed(2);
        } else if (Math.abs(value) < 1) {
            formattedValue = value.toFixed(1);
        } else if (Math.abs(value) < 100) {
            formattedValue = value.toFixed(1);
        } else {
            formattedValue = Math.round(value).toString();
        }
        
        // Add tick mark above the label
        html += '<div style="flex: 1; text-align: center; position: relative;">';
        html += '<div style="position: absolute; top: -8px; left: 50%; width: 1px; height: 5px; background: rgba(255,255,255,0.5);"></div>';
        html += formattedValue;
        html += '</div>';
    }
    
    html += '</div>';
    
    legendContent.innerHTML = html;
}
}