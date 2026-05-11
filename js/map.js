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
            zoomControl: true
        });
        
        // Add base tile layer (OpenStreetMap)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 10
        }).addTo(this.leafletMap);
        
        // Add a semi-transparent overlay for ocean masking (optional)
        this.setupMapBounds();
    }
    
    setupMapBounds() {
        // Add country boundaries overlay
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap, © CartoDB',
            maxZoom: 10,
            opacity: 0.7
        }).addTo(this.leafletMap);
    }
    
    async loadAndDisplayWeather(initDate, variable, timestep) {
        try {
            // Show loading indicator
            document.getElementById('loading').classList.add('active');
            
            // Remove previous layer if exists
            if (this.currentLayer) {
                this.leafletMap.removeLayer(this.currentLayer);
                this.currentLayer = null;
            }
            
            // Load data
            const data = await this.dataLoader.loadWeatherData(initDate, variable, timestep);
            const rasterData = this.dataLoader.parseWeatherData(data);
            
            // Create and add layer
            this.currentLayer = this.createWeatherLayer(rasterData, variable);
            this.currentLayer.addTo(this.leafletMap);
            
            // Update legend
            this.updateLegend(variable);
            
            // Hide loading indicator
            document.getElementById('loading').classList.remove('active');
            
        } catch (error) {
            console.error('Error loading weather data:', error);
            document.getElementById('loading').classList.remove('active');
            alert('Failed to load weather data. Please try again.');
        }
    }
    
    createWeatherLayer(rasterData, variable) {
        const varConfig = CONFIG.variables[variable];
        const colorScale = this.getColorScale(variable);
        
        // Create canvas layer
        const canvasLayer = L.canvasLayerField({
            data: rasterData.values,
            lngMin: rasterData.lonMin,
            lngMax: rasterData.lonMax,
            latMin: rasterData.latMin,
            latMax: rasterData.latMax,
            colorScale: colorScale,
            opacity: 0.7
        });
        
        return canvasLayer;
    }
    
    getColorScale(variable) {
        // Define color scales for different variables
        const scales = {
            temperature: [
                '#000080', '#0000ff', '#0080ff', '#00ffff', 
                '#00ff80', '#80ff00', '#ffff00', '#ff8000', '#ff0000', '#800000'
            ],
            precipitation: [
                '#ffffff', '#e0f0ff', '#80c0ff', '#0080ff',
                '#00ff00', '#80ff00', '#ffff00', '#ff8000', '#ff0000', '#800080'
            ],
            wind: [
                '#ffffff', '#d4f0ff', '#a0d8ff', '#6bb5ff',
                '#3399ff', '#0066cc', '#ffcc00', '#ff6600', '#ff3300', '#cc0000'
            ],
            humidity: [
                '#67001f', '#b2182b', '#d6604d', '#f4a582',
                '#fddbc7', '#e0e0e0', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac'
            ],
            pressure: [
                '#8e0152', '#c51b7d', '#de77ae', '#f1b6da',
                '#fde0ef', '#f7f7f7', '#e6f5d0', '#b8e186', '#7fbc41', '#276419'
            ]
        };
        
        return scales[variable] || scales.temperature;
    }
    
    updateLegend(variable) {
        const varConfig = CONFIG.variables[variable];
        const legendContent = document.getElementById('legend-content');
        const colorScale = this.getColorScale(variable);
        
        // Create gradient bar
        const gradientBar = document.createElement('div');
        gradientBar.className = 'legend-gradient';
        gradientBar.style.background = `linear-gradient(to right, ${colorScale.join(', ')})`;
        
        // Create labels
        const labels = document.createElement('div');
        labels.className = 'legend-labels';
        
        const minLabel = document.createElement('span');
        minLabel.textContent = `${varConfig.min}${varConfig.unit}`;
        
        const maxLabel = document.createElement('span');
        maxLabel.textContent = `${varConfig.max}${varConfig.unit}`;
        
        labels.appendChild(minLabel);
        labels.appendChild(maxLabel);
        
        // Clear and update legend
        legendContent.innerHTML = '';
        legendContent.appendChild(gradientBar);
        legendContent.appendChild(labels);
    }
    
    setLayerOpacity(opacity) {
        if (this.currentLayer) {
            this.currentLayer.setOpacity(opacity / 100);
        }
    }
}