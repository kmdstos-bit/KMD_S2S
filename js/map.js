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
        this.useViewportAutoScale = false;
        this._currentRasterData = null;
        this._lastDataRange = null;
        this._lastVariable = null;
        this._lastLayerType = 'mean';
        this._pendingAutoScale = false;

        this.init();
    }

    // ============================================
    // INIT
    // ============================================

    init() {
        this.leafletMap = L.map('map', {
            center: CONFIG.mapDefaults.center,
            zoom: CONFIG.mapDefaults.zoom,
            maxZoom: CONFIG.mapDefaults.maxZoom,
            minZoom: CONFIG.mapDefaults.minZoom,
            zoomControl: true,
            zoomSnap: 0.25,
            zoomDelta: 0.25,
            maxBounds: [[-35, -35], [22, 75]],
            maxBoundsViscosity: 0.8
        });

        const mapBounds = L.latLngBounds([[-35, -35], [22, 75]]);
        const enforceMinZoom = () => {
            const minZoom = this.leafletMap.getBoundsZoom(mapBounds, true);
            this.leafletMap.setMinZoom(minZoom);
        };
        this.leafletMap.whenReady(enforceMinZoom);
        this.leafletMap.on('zoomend', () => {
            const minZoom = this.leafletMap.getBoundsZoom(mapBounds, true);
            if (this.leafletMap.getZoom() < minZoom) this.leafletMap.setZoom(minZoom, { animate: true });
        });
        this.leafletMap.on('resize', enforceMinZoom);

        // Custom panes
        this.leafletMap.createPane('bordersPane');
        this.leafletMap.getPane('bordersPane').style.zIndex = 640;
        this.leafletMap.getPane('bordersPane').style.pointerEvents = 'none';
        this.leafletMap.createPane('labelsPane');
        this.leafletMap.getPane('labelsPane').style.zIndex = 650;
        this.leafletMap.getPane('labelsPane').style.pointerEvents = 'none';

        // Base tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 10
        }).addTo(this.leafletMap);

        this.addCountryBorders();
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
            document.querySelector('.coord-display').innerHTML =
                `📍 ${lat}°, ${lng}° | Zoom: ${this.leafletMap.getZoom()}`;
            this.updateLegendHoverMarker(this.getValueAtLatLng(e.latlng.lat, e.latlng.lng));
        });

        this.leafletMap.on('mouseout', () => this.updateLegendHoverMarker(null));
    }

    async addCountryBorders() {
        try {
            const response = await fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson');
            const data = await response.json();
            this.countryBorders = L.geoJSON(data, {
                style: () => ({ color: '#ffffff', weight: 1.5, opacity: 1, fillOpacity: 0 }),
                pane: 'bordersPane',
                interactive: false
            }).addTo(this.leafletMap);
            console.log('✅ Country borders loaded');
        } catch (e) {
            console.log('⚠️ Could not load country borders:', e.message);
        }
    }

    // ============================================
    // COLOR SCALE RANGE
    // ============================================

    getCurrentRange(variable, layerTypeId) {
        const ltId = layerTypeId || this._lastLayerType || 'mean';
        const defaultRange = CONFIG.getDefaultRange(variable, ltId);

        if (this.useAutoScale && this._lastDataRange) {
            return { min: this._lastDataRange.min, max: this._lastDataRange.max };
        }
        if (this.currentMin !== null && this.currentMax !== null && !this.useAutoScale) {
            return { min: this.currentMin, max: this.currentMax };
        }

        const vminInput = document.getElementById('vmin');
        const vmaxInput = document.getElementById('vmax');
        const min = (vminInput && vminInput.value !== '') ? parseFloat(vminInput.value) : defaultRange.min;
        const max = (vmaxInput && vmaxInput.value !== '') ? parseFloat(vmaxInput.value) : defaultRange.max;

        return {
            min: isNaN(min) ? defaultRange.min : min,
            max: isNaN(max) ? defaultRange.max : max
        };
    }

    getDataRange(values, rasterData) {
        if (this.useViewportAutoScale && rasterData) return this.getVisibleDataRange(values, rasterData);
        let min = Infinity, max = -Infinity;
        for (const row of values) {
            if (!row) continue;
            for (const val of row) {
                if (val !== null && val !== undefined && !isNaN(val) && isFinite(val)) {
                    if (val < min) min = val;
                    if (val > max) max = val;
                }
            }
        }
        if (min === Infinity || max === -Infinity) return { min: 0, max: 100 };
        const range = max - min;
        let step = range < 1 ? 0.1 : range < 10 ? 1 : range < 50 ? 5 : 10;
        return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step };
    }

    getVisibleDataRange(values, rasterData) {
        const bounds = this.leafletMap.getBounds();
        const latStep = rasterData.latStep || 1.5;
        const lonStep = rasterData.lonStep || 1.5;
        const firstLat = rasterData.latMax;
        const firstLon = rasterData.lonMin;
        const nRows = rasterData.nRows, nCols = rasterData.nCols;
        let firstR = -1, lastR = -1, firstC = -1, lastC = -1;
        for (let r = 0; r < nRows; r++) {
            const lat = firstLat - r * latStep;
            if (lat >= bounds.getSouth() && lat <= bounds.getNorth()) {
                if (firstR === -1) firstR = r;
                lastR = r;
            }
        }
        for (let c = 0; c < nCols; c++) {
            const lon = firstLon + c * lonStep;
            if (lon >= bounds.getWest() && lon <= bounds.getEast()) {
                if (firstC === -1) firstC = c;
                lastC = c;
            }
        }
        if (firstR === -1 || firstC === -1) return this.getDataRange(values, null);
        let min = Infinity, max = -Infinity;
        for (let r = firstR; r <= lastR; r++) {
            if (!values[r]) continue;
            for (let c = firstC; c <= lastC; c++) {
                const val = values[r][c];
                if (val !== null && val !== undefined && !isNaN(val) && isFinite(val)) {
                    if (val < min) min = val;
                    if (val > max) max = val;
                }
            }
        }
        if (min === Infinity || max === -Infinity) return { min: 0, max: 100 };
        const range = max - min;
        let step = range < 1 ? 0.1 : range < 10 ? 1 : range < 50 ? 5 : 10;
        return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step };
    }

    autoScaleToData(values, variable, rasterData, layerTypeId) {
        const dataRange = this.getDataRange(values, rasterData);
        this._lastDataRange = dataRange;
        this.useAutoScale = true;
        const vminInput = document.getElementById('vmin');
        const vmaxInput = document.getElementById('vmax');
        if (vminInput) vminInput.value = dataRange.min;
        if (vmaxInput) vmaxInput.value = dataRange.max;
        const rangeInfo = document.getElementById('data-range-info');
        if (rangeInfo) {
            const unit = CONFIG.getUnit(variable, layerTypeId || 'mean');
            const scopeText = this.useViewportAutoScale ? ' (viewport)' : ' (all data)';
            rangeInfo.textContent = `Auto-scaled${scopeText}: ${dataRange.min} to ${dataRange.max} ${unit}`;
        }
        return dataRange;
    }

    setManualRange(min, max) {
        this.useAutoScale = false;
        this.currentMin = min;
        this.currentMax = max;
        const rangeInfo = document.getElementById('data-range-info');
        if (rangeInfo) rangeInfo.textContent = `Manual range: ${min} to ${max}`;
    }

    updateVariableDefaults(variable, layerTypeId) {
        const ltId = layerTypeId || 'mean';
        const defaultRange = CONFIG.getDefaultRange(variable, ltId);
        const varConfig = CONFIG.variables[variable];

        this.useAutoScale = false;
        this._pendingAutoScale = false;
        this.currentMin = defaultRange.min;
        this.currentMax = defaultRange.max;
        this._lastDataRange = null;

        const vminInput = document.getElementById('vmin');
        const vmaxInput = document.getElementById('vmax');
        if (vminInput) {
            vminInput.value = defaultRange.min;
            vminInput.setAttribute('min', varConfig.absoluteMin);
            vminInput.setAttribute('max', varConfig.absoluteMax);
            vminInput.setAttribute('step', varConfig.step || 1);
        }
        if (vmaxInput) {
            vmaxInput.value = defaultRange.max;
            vmaxInput.setAttribute('min', varConfig.absoluteMin);
            vmaxInput.setAttribute('max', varConfig.absoluteMax);
            vmaxInput.setAttribute('step', varConfig.step || 1);
        }

        const rangeInfo = document.getElementById('data-range-info');
        if (rangeInfo) {
            const unit = CONFIG.getUnit(variable, ltId);
            rangeInfo.textContent = `Default: ${defaultRange.min} to ${defaultRange.max} ${unit}`;
        }
    }

    // ============================================
    // DATA LOADING & DISPLAY
    // ============================================

    async loadAndDisplayWeather(initDate, variable, week, layerTypeId = 'mean') {
        try {
            document.getElementById('loading').classList.add('active');
            const currentCenter = this.leafletMap.getCenter();
            const currentZoom   = this.leafletMap.getZoom();

            if (this.currentLayer) {
                this.leafletMap.removeLayer(this.currentLayer);
                this.currentLayer = null;
            }

            const data       = await this.dataLoader.loadWeatherData(initDate, variable, week, layerTypeId);
            const rasterData = this.dataLoader.parseWeatherData(data);
            this._currentRasterData = rasterData;

            // Reset colour scale when variable or layer type changes
            const variableChanged  = this._lastVariable  && this._lastVariable  !== variable;
            const layerTypeChanged = this._lastLayerType && this._lastLayerType !== layerTypeId;
            if (variableChanged || layerTypeChanged) {
                this.updateVariableDefaults(variable, layerTypeId);
            }

            if (this._pendingAutoScale) {
                this.autoScaleToData(rasterData.values, variable, rasterData, layerTypeId);
                this._pendingAutoScale = false;
            }

            this._lastVariable  = variable;
            this._lastLayerType = layerTypeId;

            this.currentLayer = this.createGridCellLayer(rasterData, variable, layerTypeId);

            if (this.currentLayer) {
                this.currentLayer.addTo(this.leafletMap);
                this.updateLegend(variable, layerTypeId);

                if (!this._hasInitialized) {
                    this.leafletMap.fitBounds([
                        [rasterData.southEdge || rasterData.latMin - rasterData.latStep / 2,
                         rasterData.westEdge  || rasterData.lonMin - rasterData.lonStep / 2],
                        [rasterData.northEdge || rasterData.latMax + rasterData.latStep / 2,
                         rasterData.eastEdge  || rasterData.lonMax + rasterData.lonStep / 2]
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
            try { this.leafletMap.fitBounds(this.currentLayer.getBounds()); }
            catch { this.leafletMap.setView(CONFIG.mapDefaults.center, CONFIG.mapDefaults.zoom); }
        } else {
            this.leafletMap.setView(CONFIG.mapDefaults.center, CONFIG.mapDefaults.zoom);
        }
    }

    // ============================================
    // GRID CELL LAYER
    // ============================================

    createGridCellLayer(rasterData, variable, layerTypeId = 'mean') {
        const colorScale = this.getColorScale(variable, layerTypeId);
        const range      = this.getCurrentRange(variable, layerTypeId);
        const values     = rasterData.values;
        const latStep    = rasterData.latStep;
        const lonStep    = rasterData.lonStep;
        const latMax     = rasterData.latMax;
        const lonMin     = rasterData.lonMin;
        const nRows      = rasterData.nRows;
        const nCols      = rasterData.nCols;
        const weatherMap = this;

        const gridLayer = L.GridLayer.extend({
            createTile(coords) {
                const tile     = document.createElement('canvas');
                const tileSize = this.getTileSize();
                tile.width  = tileSize.x;
                tile.height = tileSize.y;
                const ctx = tile.getContext('2d');
                ctx.imageSmoothingEnabled = false;

                const map        = this._map;
                const tileBounds = this._tileCoordsToBounds(coords);
                const tileOrigin = map.project(
                    [tileBounds.getNorth(), tileBounds.getWest()], coords.z
                );

                // Pass 1 – fully opaque cells
                for (let row = 0; row < nRows; row++) {
                    const cellLatN = latMax - row * latStep + latStep / 2;
                    const cellLatS = latMax - row * latStep - latStep / 2;
                    if (cellLatS > tileBounds.getNorth()) continue;
                    if (cellLatN < tileBounds.getSouth()) continue;
                    for (let col = 0; col < nCols; col++) {
                        const val = values[row] && values[row][col] !== undefined ? values[row][col] : null;
                        if (val === null || isNaN(val)) continue;
                        const cellLonW = lonMin + col * lonStep - lonStep / 2;
                        const cellLonE = lonMin + col * lonStep + lonStep / 2;
                        if (cellLonE < tileBounds.getWest()) continue;
                        if (cellLonW > tileBounds.getEast()) continue;
                        const [r, g, b, a] = weatherMap.valueToColor(val, range.min, range.max, colorScale,layerTypeId);
                        if (a < 0.99) continue;
                        const nwPx = map.project([cellLatN, cellLonW], coords.z);
                        const sePx = map.project([cellLatS, cellLonE], coords.z);
                        const x = nwPx.x - tileOrigin.x, y = nwPx.y - tileOrigin.y;
                        const w = sePx.x - nwPx.x,       h = sePx.y - nwPx.y;
                        if (w <= 0 || h <= 0) continue;
                        ctx.fillStyle = `rgb(${r},${g},${b})`;
                        ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w) + 1, Math.ceil(h) + 1);
                    }
                }

                // Pass 2 – semi-transparent cells
                for (let row = 0; row < nRows; row++) {
                    const cellLatN = latMax - row * latStep + latStep / 2;
                    const cellLatS = latMax - row * latStep - latStep / 2;
                    if (cellLatS > tileBounds.getNorth()) continue;
                    if (cellLatN < tileBounds.getSouth()) continue;
                    for (let col = 0; col < nCols; col++) {
                        const val = values[row] && values[row][col] !== undefined ? values[row][col] : null;
                        if (val === null || isNaN(val)) continue;
                        const cellLonW = lonMin + col * lonStep - lonStep / 2;
                        const cellLonE = lonMin + col * lonStep + lonStep / 2;
                        if (cellLonE < tileBounds.getWest()) continue;
                        if (cellLonW > tileBounds.getEast()) continue;
                        const [r, g, b, a] = weatherMap.valueToColor(val, range.min, range.max, colorScale,layerTypeId);
                        if (a >= 0.99 || a <= 0.01) continue;
                        const nwPx = map.project([cellLatN, cellLonW], coords.z);
                        const sePx = map.project([cellLatS, cellLonE], coords.z);
                        const x = nwPx.x - tileOrigin.x, y = nwPx.y - tileOrigin.y;
                        const w = sePx.x - nwPx.x,       h = sePx.y - nwPx.y;
                        if (w <= 0 || h <= 0) continue;
                        ctx.globalAlpha = a;
                        ctx.fillStyle = `rgb(${r},${g},${b})`;
                        ctx.fillRect(Math.floor(x) - 1, Math.floor(y) - 1, Math.ceil(w) + 2, Math.ceil(h) + 2);
                    }
                }

                ctx.globalAlpha = 1.0;
                return tile;
            }
        });

        return new gridLayer({ tileSize: 256, opacity: 1.0 });
    }

    // ============================================
    // COLOR UTILITIES
    // ============================================

    valueToColor(value, min, max, colorScale,layerTypeId = null) {

    if (layerTypeId === 'probability') {

        const bounds = [0,1,10,25,45,55,75,90,99,100];

        for (let i = 0; i < bounds.length - 1; i++) {
            if (value <= bounds[i + 1]) {
                return this.parseColor(colorScale[i]);
            }
        }

        return this.parseColor(colorScale[colorScale.length - 1]);
    }
        if (min === max) return this.parseColor(colorScale[Math.floor(colorScale.length / 2)]);
        let norm = Math.max(0, Math.min(1, (value - min) / (max - min)));
        const idx   = norm * (colorScale.length - 1);
        const lo    = Math.floor(idx);
        const hi    = Math.min(Math.ceil(idx), colorScale.length - 1);
        const frac  = idx - lo;
        const c0 = this.parseColor(colorScale[lo]);
        const c1 = this.parseColor(colorScale[hi]);
        return [
            Math.round(c0[0] + (c1[0] - c0[0]) * frac),
            Math.round(c0[1] + (c1[1] - c0[1]) * frac),
            Math.round(c0[2] + (c1[2] - c0[2]) * frac),
            c0[3] + (c1[3] - c0[3]) * frac
        ];
    }

    parseColor(colorStr) {
        if (typeof colorStr !== 'string') return [128, 128, 128, 1.0];
        let m;
        if (colorStr.startsWith('rgba')) {
            m = colorStr.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
            if (m) return [+m[1], +m[2], +m[3], +m[4]];
        }
        if (colorStr.startsWith('rgb')) {
            m = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (m) return [+m[1], +m[2], +m[3], 1.0];
        }
        if (colorStr.startsWith('#')) {
            m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colorStr);
            if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), 1.0];
        }
        return [128, 128, 128, 1.0];
    }

    hexToRgb(hex) {
        if (typeof hex === 'string' && hex.startsWith('rgba')) return this.parseColor(hex);
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), 1.0] : [128, 128, 128, 1.0];
    }

    /**
     * Return a colour scale array for a given variable + layerType.
     * Layer-type colour schemes take priority over variable defaults.
     */
    getColorScale(variable, layerTypeId = 'mean') {
        const lt = CONFIG.layerTypes[layerTypeId];
        const scheme = (lt && lt.colorScheme) ? lt.colorScheme : (CONFIG.variables[variable] ? CONFIG.variables[variable].colorScheme : null);

        // ── Layer-type specific schemes ─────────────────────────────────
        if (scheme === 'anomaly') {

        // Precipitation anomaly:
        // dry = brown/red, wet = blue
        if (variable === 'precip') {
            return [
                '#7f3b08',
                '#b35806',
                '#e08214',
                '#fdb863',
                '#fee0b6',
                '#f7f7f7',
                '#d8daeb',
                '#b2abd2',
                '#8073ac',
                '#542788',
                '#2b8cbe',
                '#0868ac',
                '#084081'
            ];
        }

        // Other anomalies:
        // below normal = blue, above normal = red
        return [
            '#053061',
            '#2166ac',
            '#4393c3',
            '#74add1',
            '#abd9e9',
            '#e0f3f8',
            '#ffffff',
            '#fee090',
            '#fdae61',
            '#f46d43',
            '#d73027',
            '#a50026',
            '#67001f'
        ];
    }

       if (scheme === 'probability') {
            return [
                'purple',      // 0
                '#08306b',     // 1
                '#2171b5',     // 10
                '#6baed6',     // 25
                'lightgreen',  // 45
                'yellow',      // 55
                '#fd8d3c',     // 75
                '#d7301f',     // 90
                '#7f0000'      // 99-100
            ];
        }
        if (scheme === 'tercile') {
            // Below(brown) → Normal(grey) → Above(green) — categorical-ish
            return [
                '#8c510a', '#bf812d', '#dfc27d',
                '#f5f5f5', '#f5f5f5',
                '#80cdc1', '#35978f', '#01665e'
            ];
        }

        // ── Variable-specific schemes ───────────────────────────────────
        const variableScales = {
            temperature: [
                '#000080','#0000cc','#0033ff','#0066ff',
                '#0099ff','#00ccff','#00ffff','#00ffcc',
                '#00ff66','#33ff00','#99ff00','#ffff00',
                '#ffcc00','#ff9900','#ff3300','#cc0000','#800000'
            ],
            precipitation: [
                'rgba(0,0,0,0)', 'rgba(168,210,250,0)', 'rgb(140,199,255)',
                'rgb(100,180,255)', '#87ceeb', '#60b8d8', '#40a0c8',
                '#2088b0', '#007098', '#005880',
                '#30a030', '#40b840', '#60d060', '#80e880',
                '#ffff00', '#ffcc00', '#ff9900', '#ff6600',
                '#ff3300', '#cc0000', '#990000', '#800080'
            ],
            humidity: [
                '#fff7fb','#ece7f2','#d0d1e6','#a6bddb',
                '#74a9cf','#3690c0','#0570b0','#045a8d','#023858','#011428'
            ],
            wind: [
                '#ffffff','#e6f0ff','#cce0ff','#99ccff',
                '#66b3ff','#3399ff','#0080ff','#0066cc',
                '#004d99','#ffcc00','#ff9900','#ff6600',
                '#ff3300','#cc0000','#990000'
            ],
        };

        // Map variable colorScheme keys to the scales above
        const varSchemeMap = {
            temperature: 'temperature',
            precipitation: 'precipitation',
            humidity: 'humidity',
            wind: 'wind',
        };

        // Also handle variable-name fallbacks (for backward compat)
        const varNameMap = {
            temp: 'temperature', mx2t6: 'temperature', mn2t6: 'temperature', cape: 'temperature',
            precip: 'precipitation',
            tcw: 'humidity', d2m: 'humidity',
            w500: 'wind', u10: 'wind', v10: 'wind', u700: 'wind', v700: 'wind',
        };

        const resolvedScheme = varSchemeMap[scheme] || varNameMap[variable] || 'temperature';
        return variableScales[resolvedScheme] || variableScales.temperature;
    }

    // ============================================
    // UI UPDATES
    // ============================================

    setLayerOpacity(opacity) {
        if (this.currentLayer) this.currentLayer.setOpacity(opacity / 100);
    }

    // ============================================
    // HOVER VALUE LOOKUP
    // ============================================

    getValueAtLatLng(lat, lng) {
        if (!this._currentRasterData) return null;
        const rd  = this._currentRasterData;
        const row = Math.round((rd.latMax - lat) / rd.latStep);
        const col = Math.round((lng - rd.lonMin) / rd.lonStep);
        if (row < 0 || row >= rd.nRows || col < 0 || col >= rd.nCols) return null;
        const val = rd.values[row] && rd.values[row][col];
        if (val === null || val === undefined || isNaN(val)) return null;
        return val;
    }

    updateLegendHoverMarker(value) {
        const marker = document.getElementById('legend-hover-marker');
        const bubble = document.getElementById('legend-hover-bubble');
        const bar    = document.getElementById('legend-colorbar');
        if (!marker || !bubble || !bar) return;

        if (value === null || value === undefined) {
            marker.style.display = 'none';
            bubble.style.display = 'none';
            return;
        }

        const variable    = this._lastVariable;
        const layerTypeId = this._lastLayerType || 'mean';
        if (!variable) return;

        const range = this.getCurrentRange(variable, layerTypeId);
        const unit  = CONFIG.getUnit(variable, layerTypeId);

        let pct = (value - range.min) / (range.max - range.min);
        pct = Math.max(0, Math.min(1, pct));

        marker.style.left    = (pct * 100).toFixed(2) + '%';
        marker.style.display = 'block';

        let formatted;
        if (Math.abs(value) < 0.01 && value !== 0) formatted = value.toFixed(3);
        else if (Math.abs(value) < 1)               formatted = value.toFixed(2);
        else if (Math.abs(value) < 100)             formatted = value.toFixed(1);
        else                                         formatted = Math.round(value).toString();

        bubble.textContent = `${formatted} ${unit}`;

        const barWidth    = bar.offsetWidth;
        const bubbleWidth = bubble.offsetWidth;
        const rawLeft     = pct * barWidth - bubbleWidth / 2;
        bubble.style.left    = Math.max(0, Math.min(barWidth - bubbleWidth, rawLeft)) + 'px';
        bubble.style.bottom  = '20px';
        bubble.style.display = 'block';
    }

    // ============================================
    // LEGEND
    // ============================================

    updateLegend(variable, layerTypeId = 'mean') {
        const varConfig = CONFIG.variables[variable];
        const lt        = CONFIG.layerTypes[layerTypeId] || CONFIG.layerTypes.mean;
        const colorScale = this.getColorScale(variable, layerTypeId);
        const range      = this.getCurrentRange(variable, layerTypeId);
        const unit       = CONFIG.getUnit(variable, layerTypeId);

        // Compose a concise title: "Variable — Layer type"
        const title = layerTypeId === 'mean'
            ? varConfig.label
            : `${varConfig.label} — ${lt.label}`;

        // ── Floating legend ────────────────────────────────────────────
        const floatingLegend = document.getElementById('floating-legend-content');
        if (floatingLegend) {
            let html = '';

            // Title
            html += `<div style="font-size:0.72em; text-align:center; margin-bottom:4px; font-weight:500; color:#ccc; line-height:1.3;">${title}</div>`;

            // Colour bar container (position:relative so marker/bubble can anchor to it)
            html += '<div id="legend-colorbar" style="position:relative;">';

            // The gradient bar
            html += '<div style="display:flex; height:15px; border-radius:3px; overflow:hidden; border:1px solid rgba(255,255,255,0.2);">';
            colorScale.forEach(c => { html += `<div style="flex:1; background:${c};"></div>`; });
            html += '</div>';

            // Hover marker line
            html += '<div id="legend-hover-marker" style="display:none; position:absolute; top:-3px; width:2px; height:22px; background:white; border-radius:1px; box-shadow:0 0 3px rgba(0,0,0,0.8); pointer-events:none; transform:translateX(-50%); z-index:10;"></div>';

            // Hover value bubble (floats above the bar)
            html += '<div id="legend-hover-bubble" style="display:none; position:absolute; bottom:20px; background:rgba(20,20,20,0.92); color:#fff; font-size:0.7em; font-weight:600; padding:2px 6px; border-radius:4px; border:1px solid rgba(255,255,255,0.25); white-space:nowrap; pointer-events:none; z-index:11;"></div>';

            // Tick marks
            html += '<div style="display:flex; justify-content:space-between; padding:0 1px; margin-top:0;">';
            for (let i = 0; i < 5; i++) html += '<div style="width:1px; height:3px; background:rgba(255,255,255,0.3);"></div>';
            html += '</div>';

            // Numeric labels
            html += '<div style="display:flex; justify-content:space-between; font-size:0.6em; margin-top:1px; opacity:0.7; color:#aaa;">';
            for (let i = 0; i < 5; i++) {
                const v = range.min + (range.max - range.min) * (i / 4);
                let fmt = Math.abs(v) < 0.1 && v !== 0 ? v.toFixed(2)
                        : Math.abs(v) < 1 ? v.toFixed(2)
                        : Math.abs(v) < 100 ? v.toFixed(1)
                        : Math.round(v).toString();
                if (i === 0 || i === 4) fmt += unit;
                html += `<span>${fmt}</span>`;
            }
            html += '</div>';

            html += '</div>'; // close #legend-colorbar
            floatingLegend.innerHTML = html;
        }

        // ── Modal preview ──────────────────────────────────────────────
        const modalPreview = document.getElementById('colorpicker-legend-preview');
        if (modalPreview) {
            let html = '';
            html += `<div style="font-size:0.85em; text-align:center; margin-bottom:8px;">
                        <strong>${varConfig.label}</strong><br>
                        <span style="opacity:0.7; font-size:0.9em;">${lt.label}</span><br>
                        <span style="opacity:0.8;">${range.min} to ${range.max} ${unit}</span>`;
            if (this.useAutoScale) html += ' <span style="color:#5b9bd5; font-size:0.8em;">(auto)</span>';
            html += '</div>';

            html += '<div style="display:flex; height:30px; border-radius:6px; overflow:hidden; border:2px solid rgba(255,255,255,0.2);">';
            colorScale.forEach(c => { html += `<div style="flex:1; background:${c};"></div>`; });
            html += '</div>';

            const numTicks = 5;
            html += '<div style="display:flex; justify-content:space-between; font-size:0.75em; margin-top:6px; opacity:0.9;">';
            for (let i = 0; i < numTicks; i++) {
                const v = range.min + (range.max - range.min) * (i / (numTicks - 1));
                let fmt = Math.abs(v) < 0.1 && v !== 0 ? v.toFixed(2)
                        : Math.abs(v) < 1 ? v.toFixed(2)
                        : Math.abs(v) < 100 ? v.toFixed(1)
                        : Math.round(v).toString();
                if (i === 0 || i === numTicks - 1) fmt += ` ${unit}`;
                html += `<span>${fmt}</span>`;
            }
            html += '</div>';

            modalPreview.innerHTML = html;
        }
    }

    syncSidebarInputs(min, max) {
        const vminInput = document.getElementById('vmin');
        const vmaxInput = document.getElementById('vmax');
        if (vminInput) vminInput.value = min;
        if (vmaxInput) vmaxInput.value = max;
    }
}
