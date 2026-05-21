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
            console.log('📍 First load - fitting to data bounds');
            
            // Use pre-calculated edges if available
            let southEdge = rasterData.southEdge;
            let northEdge = rasterData.northEdge;
            let westEdge = rasterData.westEdge;
            let eastEdge = rasterData.eastEdge;
            
            // Fallback calculation if edges aren't available
            if (isNaN(southEdge) || isNaN(northEdge)) {
                const halfLat = (rasterData.latStep || 1.5) / 2;
                southEdge = rasterData.latMin - halfLat;
                northEdge = rasterData.latMax + halfLat;
            }
            if (isNaN(westEdge) || isNaN(eastEdge)) {
                const halfLon = (rasterData.lonStep || 1.5) / 2;
                westEdge = rasterData.lonMin - halfLon;
                eastEdge = rasterData.lonMax + halfLon;
            }
            
            console.log('Fitting to bounds:', [[southEdge, westEdge], [northEdge, eastEdge]]);
            
            // Safety: ensure all values are valid numbers
            if (isFinite(southEdge) && isFinite(northEdge) && isFinite(westEdge) && isFinite(eastEdge)) {
                this.leafletMap.fitBounds([
                    [southEdge, westEdge],
                    [northEdge, eastEdge]
                ]);
            } else {
                console.warn('Invalid bounds, using default Africa view');
                this.leafletMap.setView([0, 20], 4);
            }
            
            this._hasInitialized = true;
        }

        else {
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
            precip:[ // Low values: transparent → light blue (barely visible rain)
            'rgba(0,0,0,0)',       // 0 mm: fully transparent
            'rgba(180,220,255,0.3)', // trace: very light blue, mostly transparent
            'rgba(140,200,255,0.5)', // light rain
            'rgba(100,180,255,0.7)',
            // Moderate rain: transitioning to greens
            '#87ceeb',
            '#60b8d8',
            '#40a0c8',
            '#2088b0',
            // Heavy rain: darker blues to greens
            '#007098',
            '#005880',
            '#30a030',
            '#40b840',
            '#60d060',
            // Very heavy: bright greens to yellows
            '#80e880',
            '#ffff00',
            '#ffcc00',
            '#ff9900',
            // Extreme: oranges to reds to purples
            '#ff6600',
            '#ff3300',
            '#cc0000',
            '#990000',
            '#800080',],
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