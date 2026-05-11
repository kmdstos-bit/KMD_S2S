class UIController {
    constructor() {
        this.weatherMap = new WeatherMap();
        this.dataLoader = this.weatherMap.dataLoader;
        
        this.initDateSelect = document.getElementById('init-date');
        this.variableSelect = document.getElementById('variable');
        this.timestepSelect = document.getElementById('timestep');
        this.opacitySlider = document.getElementById('opacity');
        this.opacityValue = document.getElementById('opacity-value');
        
        this.init();
    }
    
    async init() {
        // Set up event listeners
        this.setupEventListeners();
        
        // Load catalog and populate UI
        await this.loadInitialData();
        
        // Update last update time
        this.updateTimestamp();
    }
    
    setupEventListeners() {
        // Variable change
        this.variableSelect.addEventListener('change', (e) => {
            this.onVariableChange(e.target.value);
        });
        
        // Init date change
        this.initDateSelect.addEventListener('change', (e) => {
            this.onInitDateChange(e.target.value);
        });
        
        // Timestep change
        this.timestepSelect.addEventListener('change', (e) => {
            this.onTimestepChange(e.target.value);
        });
        
        // Opacity change
        this.opacitySlider.addEventListener('input', (e) => {
            const opacity = e.target.value;
            this.opacityValue.textContent = `${opacity}%`;
            this.weatherMap.setLayerOpacity(opacity);
        });
    }
    
    async loadInitialData() {
        try {
            // Show loading
            document.getElementById('loading').classList.add('active');
            
            // Load catalog
            await this.dataLoader.loadCatalog();
            
            // Populate dates
            this.populateDates();
            
            // Hide loading
            document.getElementById('loading').classList.remove('active');
            
        } catch (error) {
            console.error('Failed to load initial data:', error);
            document.getElementById('loading').classList.remove('active');
            alert('Failed to load data catalog. Please check your connection and try again.');
        }
    }
    
    populateDates() {
        const dates = this.dataLoader.getAvailableDates();
        
        this.initDateSelect.innerHTML = '<option value="">Select date</option>';
        
        dates.sort().reverse().forEach(date => {
            const option = document.createElement('option');
            option.value = date;
            option.textContent = this.formatDate(date);
            this.initDateSelect.appendChild(option);
        });
        
        // Auto-select the latest date
        if (dates.length > 0) {
            this.initDateSelect.value = dates[0];
            this.onInitDateChange(dates[0]);
        }
    }
    
    formatDate(dateString) {
        // Format: 2024-01-01 -> January 1, 2024
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }) + ' (00Z)';
    }
    
    async onInitDateChange(initDate) {
        if (!initDate) return;
        
        const selectedVariable = this.variableSelect.value;
        
        if (selectedVariable) {
            this.populateTimesteps(initDate, selectedVariable);
        }
    }
    
    async onVariableChange(variable) {
        if (!variable) {
            this.timestepSelect.innerHTML = '<option value="">Select timestep</option>';
            return;
        }
        
        const initDate = this.initDateSelect.value;
        if (initDate) {
            this.populateTimesteps(initDate, variable);
        }
    }
    
    populateTimesteps(initDate, variable) {
        const timesteps = this.dataLoader.getAvailableTimesteps(initDate, variable);
        
        this.timestepSelect.innerHTML = '<option value="">Select timestep</option>';
        
        timesteps.forEach(timestep => {
            const option = document.createElement('option');
            option.value = timestep;
            option.textContent = `F${String(timestep).padStart(3, '0')} (${timestep}h forecast)`;
            this.timestepSelect.appendChild(option);
        });
        
        // Auto-select first timestep
        if (timesteps.length > 0) {
            this.timestepSelect.value = timesteps[0];
            this.onTimestepChange(timesteps[0]);
        }
    }
    
    async onTimestepChange(timestep) {
        const initDate = this.initDateSelect.value;
        const variable = this.variableSelect.value;
        
        if (!initDate || !variable || !timestep) return;
        
        await this.weatherMap.loadAndDisplayWeather(initDate, variable, parseInt(timestep));
    }
    
    updateTimestamp() {
        fetch(`${CONFIG.dataBaseUrl}/catalog.json?t=${Date.now()}`)
            .then(response => response.json())
            .then(data => {
                const lastUpdate = new Date(data.last_updated || Date.now());
                document.getElementById('update-time').textContent = 
                    `Last updated: ${lastUpdate.toLocaleString()}`;
            })
            .catch(error => {
                console.error('Failed to fetch update timestamp:', error);
            });
    }
}

// Initialize the application when the page loads
window.addEventListener('DOMContentLoaded', () => {
    const app = new UIController();
});