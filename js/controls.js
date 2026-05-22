class UIController {
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
    
    // ============================================
    // SYNC HELPER
    // ============================================
    
    syncModalInputs() {
        const variable = this.variableSelect.value;
        if (!variable) return;
        
        const range = this.weatherMap.getCurrentRange(variable);
        
        // Update modal inputs
        const modalVmin = document.getElementById('modal-vmin');
        const modalVmax = document.getElementById('modal-vmax');
        if (modalVmin) modalVmin.value = range.min;
        if (modalVmax) modalVmax.value = range.max;
        
        // Update sidebar inputs
        const vminInput = document.getElementById('vmin');
        const vmaxInput = document.getElementById('vmax');
        if (vminInput) vminInput.value = range.min;
        if (vmaxInput) vmaxInput.value = range.max;
        
        // Update both legends
        this.weatherMap.updateLegend(variable);
        
        console.log('Synced inputs to:', range.min, '-', range.max);
    }
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    
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
        
        // ============================================
        // AUTO-SCALE HELPERS
        // ============================================
        
        const autoScaleAll = async (source) => {
            console.log(`Auto-scale all data (${source})`);
            this.weatherMap.useViewportAutoScale = false;
            this.weatherMap._pendingAutoScale = true;
            await this.plotData();
            this.syncModalInputs();
        };
        
        const autoScaleViewport = async (source) => {
            console.log(`Auto-scale viewport (${source})`);
            this.weatherMap.useViewportAutoScale = true;
            this.weatherMap._pendingAutoScale = true;
            await this.plotData();
            this.syncModalInputs();
        };
        
        // Sidebar auto-scale buttons
        const autoScaleBtn = document.getElementById('auto-scale');
        if (autoScaleBtn) {
            autoScaleBtn.addEventListener('click', () => autoScaleAll('sidebar'));
        }
        
        const autoScaleViewportBtn = document.getElementById('auto-scale-viewport');
        if (autoScaleViewportBtn) {
            autoScaleViewportBtn.addEventListener('click', () => autoScaleViewport('sidebar'));
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
                    this.syncModalInputs();
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
                    this.syncModalInputs();
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
                    // Turn off auto-scale since user manually set values
                    this.weatherMap.useAutoScale = false;
                    this.weatherMap.currentMin = min;
                    this.weatherMap.currentMax = max;
                    
                    // Update sidebar inputs
                    document.getElementById('vmin').value = min;
                    document.getElementById('vmax').value = max;
                    
                    // Apply and re-plot
                    this.weatherMap.setManualRange(min, max);
                    await this.plotData();
                }
                closeColorPicker();
            });
        }
        
        // Modal Auto All button
        const modalAutoAll = document.getElementById('modal-auto-all');
        if (modalAutoAll) {
            modalAutoAll.addEventListener('click', () => autoScaleAll('modal'));
        }
        
        // Modal Auto Viewport button
        const modalAutoViewport = document.getElementById('modal-auto-viewport');
        if (modalAutoViewport) {
            modalAutoViewport.addEventListener('click', () => autoScaleViewport('modal'));
        }
        
        // ============================================
        // SIDEBAR TOGGLE
        // ============================================
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
    
    // ============================================
    // DATA LOADING
    // ============================================
    
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
        
        if (weeks.includes(1)) {
            this.weekSelect.value = 1;
        } else {
            this.weekSelect.value = weeks[0];
        }
        
        this.updateWeekDates(this.weekSelect.value);
    }
    
    updateWeekDates(week) {
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
        
        this.variableSelect.value = 'temp';
        
        this.populateWeeks(firstDate, 'temp');
        
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
    }
    if (vmaxInput && modalVmax) {
        modalVmax.value = vmaxInput.value;
    }
    
    // Update the preview legend inside the modal
    if (window.appInstance && window.appInstance.weatherMap && window.appInstance.variableSelect) {
        const variable = window.appInstance.variableSelect.value;
        if (variable) {
            window.appInstance.weatherMap.updateLegend(variable);
        }
    }
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
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('colorpicker-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            e.stopPropagation();
            closeColorPicker();
        });
    }
});

// Initialize the application when the page loads
window.addEventListener('DOMContentLoaded', () => {
    const app = new UIController();
    window.appInstance = app;
});