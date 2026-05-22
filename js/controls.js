class UIController {
    // constructor() {
    //     this.weatherMap = new WeatherMap();
    //     this.dataLoader = this.weatherMap.dataLoader;
        
    //     this.initDateSelect = document.getElementById('init-date');
    //     this.variableSelect = document.getElementById('variable');
    //     this.weekSelect = document.getElementById('week');
    //     this.weekDates = document.getElementById('week-dates');
    //     this.opacitySlider = document.getElementById('opacity');
    //     this.opacityValue = document.getElementById('opacity-value');
    //     this.currentMin = null;
    //     this.currentMax = null;
    //     this.useAutoScale = false;
        
    //     this.isUpdating = false;
        
    //     this.init();
    // }

    constructor() {
    this.weatherMap = new WeatherMap();
    this.dataLoader = this.weatherMap.dataLoader;
    
    // Store reference globally for modal functions
    window.appInstance = this;
    
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
    // Variable change
    this.variableSelect.addEventListener('change', async (e) => {
        if (this.isUpdating) return;
        const variable = e.target.value;
        if (variable) {
            console.log(`Variable selected: ${variable}`);
            this.weatherMap.updateVariableDefaults(variable);
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
    
    // Reset view button
    const resetBtn = document.getElementById('reset-view');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            this.weatherMap.resetView();
        });
    }
    
    // Auto-scale button (sidebar)
    const autoScaleBtn = document.getElementById('auto-scale');
    if (autoScaleBtn) {
        autoScaleBtn.addEventListener('click', async () => {
            console.log('🔄 Auto-scale (all data)');
            this.weatherMap.useViewportAutoScale = false;
            this.weatherMap._pendingAutoScale = true;
            await this.plotData();
        });
    }
    
    // Viewport auto-scale button (sidebar)
    const autoScaleViewportBtn = document.getElementById('auto-scale-viewport');
    if (autoScaleViewportBtn) {
        autoScaleViewportBtn.addEventListener('click', async () => {
            console.log('🔄 Auto-scale (viewport only)');
            this.weatherMap.useViewportAutoScale = true;
            this.weatherMap._pendingAutoScale = true;
            await this.plotData();
        });
    }
    
    // VMin/VMax inputs
    const vminInput = document.getElementById('vmin');
    if (vminInput) {
        vminInput.addEventListener('change', async () => {
            const min = parseFloat(vminInput.value);
            const max = parseFloat(document.getElementById('vmax').value);
            if (!isNaN(min) && !isNaN(max)) {
                this.weatherMap.setManualRange(min, max);
                await this.plotData();
            }
        });
    }
    
    const vmaxInput = document.getElementById('vmax');
    if (vmaxInput) {
        vmaxInput.addEventListener('change', async () => {
            const min = parseFloat(document.getElementById('vmin').value);
            const max = parseFloat(vmaxInput.value);
            if (!isNaN(min) && !isNaN(max)) {
                this.weatherMap.setManualRange(min, max);
                await this.plotData();
            }
        });
    }
    
    // ============================================
    // FLOATING LEGEND CLICK
    // ============================================
    const floatingLegend = document.getElementById('floating-legend');
    if (floatingLegend) {
        floatingLegend.addEventListener('click', () => {
            console.log('Floating legend clicked');
            openColorPicker();
        });
    }
    
    // ============================================
    // MODAL BUTTONS
    // ============================================
    
    // Modal Apply button
    const modalApply = document.getElementById('modal-apply');
    if (modalApply) {
        modalApply.addEventListener('click', async () => {
            const min = parseFloat(document.getElementById('modal-vmin').value);
            const max = parseFloat(document.getElementById('modal-vmax').value);
            
            if (!isNaN(min) && !isNaN(max)) {
                document.getElementById('vmin').value = min;
                document.getElementById('vmax').value = max;
                this.weatherMap.setManualRange(min, max);
                await this.plotData();
            }
            closeColorPicker();
        });
    }
    
    // Modal Auto All button
    const modalAutoAll = document.getElementById('modal-auto-all');
    if (modalAutoAll) {
        modalAutoAll.addEventListener('click', async () => {
            this.weatherMap.useViewportAutoScale = false;
            this.weatherMap._pendingAutoScale = true;
            await this.plotData();
        });
    }
    
    // Modal Auto Viewport button
    const modalAutoViewport = document.getElementById('modal-auto-viewport');
    if (modalAutoViewport) {
        modalAutoViewport.addEventListener('click', async () => {
            this.weatherMap.useViewportAutoScale = true;
            this.weatherMap._pendingAutoScale = true;
            await this.plotData();
        });
    }
    
    // Sidebar toggle
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    
    const toggleSidebar = () => {
        if (!sidebar) return;
        const isCollapsed = sidebar.classList.toggle('collapsed');
        if (sidebarToggle) {
            sidebarToggle.innerHTML = isCollapsed ? '▶' : '◀';
        }
        localStorage.setItem('sidebar-collapsed', isCollapsed);
        setTimeout(() => {
            this.weatherMap.leafletMap.invalidateSize();
        }, 350);
    };
    
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', toggleSidebar);
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'q' && 
            document.activeElement.tagName !== 'INPUT' &&
            document.activeElement.tagName !== 'TEXTAREA' &&
            document.activeElement.tagName !== 'SELECT') {
            e.preventDefault();
            toggleSidebar();
        }
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
        // The weatherMap will check _pendingAutoScale inside loadAndDisplayWeather
        await this.weatherMap.loadAndDisplayWeather(initDate, variable, parseInt(week));
    } catch (error) {
        console.error('Failed to plot data:', error);
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

// ============================================
// COLOR PICKER MODAL FUNCTIONS (GLOBAL)
// ============================================

// Make these globally accessible
window.openColorPicker = function() {
    const modal = document.getElementById('colorpicker-modal');
    if (!modal) {
        console.error('Modal not found!');
        return;
    }
    
    console.log('Opening color picker modal');
    
    // Show the modal
    modal.style.display = 'flex';
    modal.classList.add('active');
    
    // Sync inputs from sidebar to modal
    const vminInput = document.getElementById('vmin');
    const vmaxInput = document.getElementById('vmax');
    const modalVmin = document.getElementById('modal-vmin');
    const modalVmax = document.getElementById('modal-vmax');
    
    if (vminInput && modalVmin) {
        modalVmin.value = vminInput.value;
        console.log('Set modal vmin to:', vminInput.value);
    }
    if (vmaxInput && modalVmax) {
        modalVmax.value = vmaxInput.value;
        console.log('Set modal vmax to:', vmaxInput.value);
    }
    
    // Update the preview legend inside the modal
    if (window.appInstance && window.appInstance.weatherMap && window.appInstance.variableSelect) {
        const variable = window.appInstance.variableSelect.value;
        console.log('Current variable:', variable);
        if (variable) {
            // Call updateLegend which populates both the floating legend and the modal preview
            window.appInstance.weatherMap.updateLegend(variable);
            console.log('Modal preview updated');
        }
    }
    
    console.log('Modal display:', modal.style.display);
    console.log('Modal has active class:', modal.classList.contains('active'));
};

window.closeColorPicker = function() {
    const modal = document.getElementById('colorpicker-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
};

// ESC key closes modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('colorpicker-modal');
        if (modal && modal.classList.contains('active')) {
            closeColorPicker();
        }
    }
});

// Click overlay to close
const overlay = document.getElementById('colorpicker-overlay');
if (overlay) {
    overlay.addEventListener('click', (e) => {
        e.stopPropagation();
        closeColorPicker();
    });
}

// Initialize the application when the page loads
window.addEventListener('DOMContentLoaded', () => {
    const app = new UIController();
    window.appInstance = app;  // Ensure global reference
});