class UIController {
    constructor() {
        this.weatherMap = new WeatherMap();
        this.dataLoader = this.weatherMap.dataLoader;
        
        this.initDateSelect = document.getElementById('init-date');
        this.variableSelect = document.getElementById('variable');
        this.weekSelect = document.getElementById('week');
        this.weekDates = document.getElementById('week-dates');
        this.opacitySlider = document.getElementById('opacity');
        this.opacityValue = document.getElementById('opacity-value');
        
        this.isUpdating = false;
        
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        await this.loadInitialData();
        await this.autoSelectAndPlot();
        this.updateTimestamp();
    }
    
    setupEventListeners() {
        document.getElementById('reset-view').addEventListener('click', () => {
        this.weatherMap.resetView();
        });
        // Variable change
        this.variableSelect.addEventListener('change', async (e) => {
            if (this.isUpdating) return;
            const variable = e.target.value;
            if (variable) {
                await this.onVariableChange(variable);
            }
        });
        
        // Init date change
        this.initDateSelect.addEventListener('change', async (e) => {
            if (this.isUpdating) return;
            const date = e.target.value;
            if (date) {
                await this.onInitDateChange(date);
            }
        });
        
        // Week change
        this.weekSelect.addEventListener('change', async (e) => {
            if (this.isUpdating) return;
            const week = e.target.value;
            if (week) {
                await this.onWeekChange(week);
            }
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
            document.getElementById('loading').classList.add('active');
            await this.dataLoader.loadCatalog();
            this.populateDates();
            document.getElementById('loading').classList.remove('active');
        } catch (error) {
            console.error('Failed to load initial data:', error);
            document.getElementById('loading').classList.remove('active');
            alert('Failed to load data catalog. Please check your connection.');
        }
    }
    
    populateDates() {
        const dates = this.dataLoader.getAvailableDates();
        
        this.initDateSelect.innerHTML = '<option value="">Select date</option>';
        
        dates.forEach(date => {
            const option = document.createElement('option');
            option.value = date;
            option.textContent = this.formatDate(date);
            this.initDateSelect.appendChild(option);
        });
        
        if (dates.length > 0) {
            this.initDateSelect.value = dates[0];
        }
    }
    
    formatDate(dateString) {
        let year, month, day;
        
        if (dateString.includes('-')) {
            [year, month, day] = dateString.split('-');
        } else if (dateString.length === 8) {
            year = dateString.substring(0, 4);
            month = dateString.substring(4, 6);
            day = dateString.substring(6, 8);
        } else {
            return dateString;
        }
        
        const date = new Date(year, month - 1, day);
        
        if (isNaN(date.getTime())) return dateString;
        
        // Format as "Monday, 11 May 2026"
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    
    async onInitDateChange(initDate) {
        if (!initDate || this.isUpdating) return;
        
        const selectedVariable = this.variableSelect.value;
        this.populateWeeks(initDate, selectedVariable);
        
        if (selectedVariable) {
            const week = this.weekSelect.value;
            if (week) {
                await this.plotData();
            }
        }
    }
    
    async onVariableChange(variable) {
        if (!variable || this.isUpdating) return;
        
        const initDate = this.initDateSelect.value;
        
        if (initDate) {
            this.populateWeeks(initDate, variable);
            const week = this.weekSelect.value;
            if (week) {
                await this.plotData();
            }
        }
    }
    
    async onWeekChange(week) {
        if (!week || this.isUpdating) return;
        
        // Show date range for selected week
        this.updateWeekDates(week);
        await this.plotData();
    }
    
    populateWeeks(initDate, variable) {
        if (!initDate || !variable) return;
        
        const weeks = this.dataLoader.getAvailableWeeks(initDate, variable);
        
        this.weekSelect.innerHTML = '<option value="">Select week</option>';
        
        if (weeks.length === 0) {
            this.weekSelect.innerHTML += '<option value="" disabled>No weeks available</option>';
            return;
        }
        
        weeks.forEach(week => {
            const option = document.createElement('option');
            option.value = week;
            option.textContent = `Week ${week}`;
            this.weekSelect.appendChild(option);
        });
        
        // Auto-select Week 1
        if (weeks.includes(1)) {
            this.weekSelect.value = 1;
        } else {
            this.weekSelect.value = weeks[0];
        }
        
        this.updateWeekDates(this.weekSelect.value);
    }
    
    updateWeekDates(week) {
        // Calculate approximate dates for the selected week
        const initDate = this.initDateSelect.value;
        if (!initDate || !week) return;
        
        let date;
        if (initDate.includes('-')) {
            date = new Date(initDate);
        } else if (initDate.length === 8) {
            const year = initDate.substring(0, 4);
            const month = initDate.substring(4, 6);
            const day = initDate.substring(6, 8);
            date = new Date(year, month - 1, day);
        }
        
        if (date && !isNaN(date.getTime())) {
            const startDate = new Date(date);
            startDate.setDate(startDate.getDate() + (week - 1) * 7);
            
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);
            
            const options = { month: 'short', day: 'numeric' };
            const endOptions = { month: 'short', day: 'numeric', year: 'numeric' };
            
            this.weekDates.textContent = 
                `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', endOptions)}`;
        }
    }
    
    async autoSelectAndPlot() {
        const dates = this.dataLoader.getAvailableDates();
        if (dates.length === 0) return;
        
        const firstDate = dates[0];
        this.initDateSelect.value = firstDate;
        
        // Auto-select temperature
        this.variableSelect.value = 'temp';
        
        // Populate weeks
        this.populateWeeks(firstDate, 'temp');
        
        // Auto-plot
        await this.plotData();
    }
    
    async plotData() {
        const initDate = this.initDateSelect.value;
        const variable = this.variableSelect.value;
        const week = this.weekSelect.value;
        
        if (!initDate || !variable || !week) return;
        
        this.isUpdating = true;
        
        try {
            await this.weatherMap.loadAndDisplayWeather(initDate, variable, parseInt(week));
        } catch (error) {
            console.error('Failed to plot data:', error);
            alert('Failed to load weather data: ' + error.message);
        } finally {
            this.isUpdating = false;
        }
    }
    
    updateTimestamp() {
        fetch(`${CONFIG.dataBaseUrl}/weekly/catalog.json?t=${Date.now()}`)
            .then(response => response.json())
            .then(data => {
                if (data.last_updated) {
                    const lastUpdate = new Date(data.last_updated);
                    document.getElementById('update-time').textContent = 
                        `Last updated: ${lastUpdate.toLocaleString()}`;
                }
            })
            .catch(error => console.error('Failed to fetch timestamp:', error));
    }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
    const app = new UIController();
});