class UIController {
    constructor() {
        this.weatherMap = new WeatherMap();
        this.dataLoader = this.weatherMap.dataLoader;
        window.appInstance = this;

        this.initDateSelect  = document.getElementById('init-date');
        this.variableSelect  = document.getElementById('variable');
        this.layerTypeSelect = document.getElementById('layer-type');
        this.weekSelect      = document.getElementById('week');
        this.weekDates       = document.getElementById('week-dates');
        this.opacitySlider   = document.getElementById('opacity');
        this.opacityValue    = document.getElementById('opacity-value');

        this.isUpdating = false;

        this.init();
    }

    // ============================================
    // INIT
    // ============================================

    async init() {
        this.setupEventListeners();
        await this.loadInitialData();
        await this.autoSelectAndPlot();
        this.updateTimestamp();
    }

    // ============================================
    // HELPERS
    // ============================================

    getActiveLayerType() {
        return this.layerTypeSelect ? this.layerTypeSelect.value || 'mean' : 'mean';
    }

    syncModalInputs() {
        const variable    = this.variableSelect.value;
        const layerTypeId = this.getActiveLayerType();
        if (!variable) return;

        const range = this.weatherMap.getCurrentRange(variable, layerTypeId);

        const modalVmin = document.getElementById('modal-vmin');
        const modalVmax = document.getElementById('modal-vmax');
        if (modalVmin) modalVmin.value = range.min;
        if (modalVmax) modalVmax.value = range.max;

        const vminInput = document.getElementById('vmin');
        const vmaxInput = document.getElementById('vmax');
        if (vminInput) vminInput.value = range.min;
        if (vmaxInput) vmaxInput.value = range.max;

        this.weatherMap.updateLegend(variable, layerTypeId);
    }

    // ============================================
    // LAYER TYPE DROPDOWN
    // ============================================

    /**
     * Rebuild the Layer Type <select> for the given variable and date.
     * Options that exist on the server are enabled; others are greyed out.
     */
    async populateLayerTypes(varKey, initDate) {
        if (!this.layerTypeSelect) return;

        // While we're checking availability show a loading state
        this.layerTypeSelect.innerHTML = '<option value="mean">Loading…</option>';
        this.layerTypeSelect.disabled = true;

        // Get which types exist for this date+variable (async HEAD checks)
        let availability;
        try {
            availability = await this.dataLoader.getAvailableLayerTypes(initDate, varKey);
        } catch {
            availability = [{ id: 'mean', exists: true }];
        }

        // Remember current selection so we can restore it if still available
        const previousId = this.layerTypeSelect.dataset.lastValue || 'mean';

        this.layerTypeSelect.innerHTML = '';

        // Group the options by their group label
        const groups = {};
        availability.forEach(({ id, exists }) => {
            const lt = CONFIG.layerTypes[id];
            if (!lt) return;
            if (!groups[lt.group]) groups[lt.group] = [];
            groups[lt.group].push({ id, exists, lt });
        });

        let firstAvailableId = 'mean';
        let restoredPrevious = false;

        Object.entries(groups).forEach(([groupLabel, items]) => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = groupLabel;

            items.forEach(({ id, exists, lt }) => {
                const opt = document.createElement('option');
                opt.value = id;

                if (exists) {
                    opt.textContent = lt.label;
                    if (id !== 'mean' && firstAvailableId === 'mean') firstAvailableId = id;
                } else {
                    opt.textContent = `${lt.label} (not available)`;
                    opt.disabled = true;
                    opt.style.color = '#252525';
                    opt.style.background = '#252525';
                }

                if (id === previousId && exists) restoredPrevious = true;
                optgroup.appendChild(opt);
            });

            this.layerTypeSelect.appendChild(optgroup);
        });

        // Set value: restore previous selection if still available, else 'mean'
        this.layerTypeSelect.value = restoredPrevious ? previousId : 'mean';
        this.layerTypeSelect.dataset.lastValue = this.layerTypeSelect.value;
        this.layerTypeSelect.disabled = false;
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================

    setupEventListeners() {

        // ── Variable ───────────────────────────────────────────────────
        this.variableSelect.addEventListener('change', async (e) => {
            if (this.isUpdating) return;
            const variable = e.target.value;
            if (!variable) return;
            this.weatherMap.updateVariableDefaults(variable, 'mean');
            // Reset layer type to mean when variable changes, then repopulate
            // if (this.layerTypeSelect) {
            //     this.layerTypeSelect.dataset.lastValue = 'mean';
            // }
            await this.onVariableChange(variable);
        });

        // ── Layer type ─────────────────────────────────────────────────
        if (this.layerTypeSelect) {
            this.layerTypeSelect.addEventListener('change', async (e) => {
                if (this.isUpdating) return;
                const layerTypeId = e.target.value;
                if (!layerTypeId) return;
                this.layerTypeSelect.dataset.lastValue = layerTypeId;

                const variable = this.variableSelect.value;
                if (variable) {
                    this.weatherMap.updateVariableDefaults(variable, layerTypeId);
                    await this.plotData();
                    this.syncModalInputs();
                }
            });
        }

        // ── Init date ──────────────────────────────────────────────────
        this.initDateSelect.addEventListener('change', async (e) => {
            if (this.isUpdating) return;
            const date = e.target.value;
            if (date) await this.onInitDateChange(date);
        });

        // ── Week slider ────────────────────────────────────────────────
        const weekSlider = document.getElementById('week-slider');
        if (weekSlider) {
            weekSlider.addEventListener('input', (e) => {
                const week = parseInt(e.target.value);
                const lbl = document.getElementById('current-week-label');
                if (lbl) lbl.textContent = `Week ${week}`;
                if (this.weekSelect) this.weekSelect.value = week;
                this.updateWeekDates(week);
            });
            weekSlider.addEventListener('change', async (e) => {
                if (this.isUpdating) return;
                const week = parseInt(e.target.value);
                if (this.weekSelect) this.weekSelect.value = week;
                await this.onWeekChange(week);
            });
        }

        // ── Opacity ────────────────────────────────────────────────────
        this.opacitySlider.addEventListener('input', (e) => {
            this.opacityValue.textContent = `${e.target.value}%`;
            this.weatherMap.setLayerOpacity(e.target.value);
        });

        // ── Reset view ─────────────────────────────────────────────────
        const resetBtn = document.getElementById('reset-view');
        if (resetBtn) resetBtn.addEventListener('click', () => this.weatherMap.resetView());

        // ── Auto-scale helpers ─────────────────────────────────────────
        const autoScaleAll = async (source) => {
            this.weatherMap.useViewportAutoScale = false;
            this.weatherMap._pendingAutoScale = true;
            await this.plotData();
            this.syncModalInputs();
        };
        const autoScaleViewport = async (source) => {
            this.weatherMap.useViewportAutoScale = true;
            this.weatherMap._pendingAutoScale = true;
            await this.plotData();
            this.syncModalInputs();
        };

        document.getElementById('auto-scale')?.addEventListener('click', () => autoScaleAll('sidebar'));
        document.getElementById('auto-scale-viewport')?.addEventListener('click', () => autoScaleViewport('sidebar'));

        // ── VMin / VMax inputs ─────────────────────────────────────────
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

        // ── Floating legend ────────────────────────────────────────────
        document.getElementById('floating-legend')?.addEventListener('click', () => openColorPicker());

        // ── Modal buttons ──────────────────────────────────────────────
        document.getElementById('modal-apply')?.addEventListener('click', async () => {
            const min = parseFloat(document.getElementById('modal-vmin').value);
            const max = parseFloat(document.getElementById('modal-vmax').value);
            if (!isNaN(min) && !isNaN(max)) {
                this.weatherMap.useAutoScale = false;
                this.weatherMap.currentMin = min;
                this.weatherMap.currentMax = max;
                document.getElementById('vmin').value = min;
                document.getElementById('vmax').value = max;
                await this.plotData();
            }
            closeColorPicker();
        });

        document.getElementById('modal-auto-all')?.addEventListener('click', () => autoScaleAll('modal'));
        document.getElementById('modal-auto-viewport')?.addEventListener('click', () => autoScaleViewport('modal'));

        // ── Sidebar toggle ─────────────────────────────────────────────
        const sidebar       = document.getElementById('sidebar');
        const sidebarToggle = document.getElementById('sidebar-toggle');
        const toggleSidebar = () => {
            if (!sidebar) return;
            const collapsed = sidebar.classList.toggle('collapsed');
            if (sidebarToggle) sidebarToggle.innerHTML = collapsed ? '▶' : '◀';
            localStorage.setItem('sidebar-collapsed', collapsed);
            setTimeout(() => this.weatherMap.leafletMap.invalidateSize(), 350);
        };
        sidebarToggle?.addEventListener('click', toggleSidebar);

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
            const opt = document.createElement('option');
            opt.value = date;
            opt.textContent = this.formatDate(date);
            this.initDateSelect.appendChild(opt);
        });
        if (dates.length > 0) this.initDateSelect.value = dates[0];
    }

    formatDate(dateString) {
        let year, month, day;
        if (dateString.includes('-')) {
            [year, month, day] = dateString.split('-');
        } else if (dateString.length === 8) {
            year  = dateString.substring(0, 4);
            month = dateString.substring(4, 6);
            day   = dateString.substring(6, 8);
        } else return dateString;
        const date = new Date(year, month - 1, day);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    }

    // ============================================
    // CHANGE HANDLERS
    // ============================================

    async onInitDateChange(initDate) {
        if (!initDate || this.isUpdating) return;
        const variable = this.variableSelect.value;
        this.populateWeeks(initDate, variable);
        // Re-check layer type availability for the new date
        if (variable) await this.populateLayerTypes(variable, initDate);
        if (variable && this.weekSelect.value) await this.plotData();
    }

    async onVariableChange(variable) {
        if (!variable || this.isUpdating) return;
        const initDate = this.initDateSelect.value;
        if (initDate) {
            this.populateWeeks(initDate, variable);
            await this.populateLayerTypes(variable, initDate);
        }
        if (initDate && this.weekSelect.value) await this.plotData();
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
            const opt = document.createElement('option');
            opt.value = week;
            opt.textContent = `Week ${week}`;
            this.weekSelect.appendChild(opt);
        });

        const weekSlider = document.getElementById('week-slider');
        if (weekSlider) {
            weekSlider.min = Math.min(...weeks);
            weekSlider.max = Math.max(...weeks);
            weekSlider.step = 1;
            document.getElementById('week-min-label').textContent = `W${Math.min(...weeks)}`;
            document.getElementById('week-max-label').textContent = `W${Math.max(...weeks)}`;
        }

        const defaultWeek = weeks.includes(1) ? 1 : weeks[0];
        this.weekSelect.value = defaultWeek;
        if (weekSlider) {
            weekSlider.value = defaultWeek;
            const lbl = document.getElementById('current-week-label');
            if (lbl) lbl.textContent = `Week ${defaultWeek}`;
        }
        this.updateWeekDates(defaultWeek);
    }

    updateWeekDates(week) {
        const initDate = this.initDateSelect.value;
        if (!initDate || !week) return;
        let date;
        if (initDate.includes('-')) {
            date = new Date(initDate);
        } else if (initDate.length === 8) {
            date = new Date(+initDate.substring(0,4), +initDate.substring(4,6) - 1, +initDate.substring(6,8));
        }
        if (date && !isNaN(date.getTime())) {
            const start = new Date(date);
            start.setDate(start.getDate() + (week - 1) * 7);
            const end = new Date(start);
            end.setDate(end.getDate() + 6);
            this.weekDates.textContent =
                `${start.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${end.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
        }
    }

    async autoSelectAndPlot() {
        const dates = this.dataLoader.getAvailableDates();
        if (dates.length === 0) return;

        const firstDate = dates[0];
        this.initDateSelect.value = firstDate;
        this.variableSelect.value = 'precip';

        this.populateWeeks(firstDate, 'precip');
        await this.populateLayerTypes('precip', firstDate);
        await this.plotData();
    }

    async plotData() {
        const initDate    = this.initDateSelect.value;
        const variable    = this.variableSelect.value;
        const week        = this.weekSelect.value;
        const layerTypeId = this.getActiveLayerType();

        if (!initDate || !variable || !week) return;

        this.isUpdating = true;
        try {
            await this.weatherMap.loadAndDisplayWeather(initDate, variable, parseInt(week), layerTypeId);
        } catch (error) {
            console.error('Failed to plot data:', error);
        } finally {
            this.isUpdating = false;
        }
    }

    updateTimestamp() {
        fetch(`${CONFIG.dataBaseUrl}/weekly/catalog.json?t=${Date.now()}`)
            .then(r => r.json())
            .then(data => {
                if (data.last_updated) {
                    document.getElementById('update-time').textContent =
                        `Last updated: ${new Date(data.last_updated).toLocaleString()}`;
                }
            })
            .catch(err => console.error('Failed to fetch timestamp:', err));
    }
}

// ============================================
// COLOR PICKER MODAL (global functions)
// ============================================

window.openColorPicker = function () {
    const modal = document.getElementById('colorpicker-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.classList.add('active');

    const vminInput = document.getElementById('vmin');
    const vmaxInput = document.getElementById('vmax');
    const modalVmin = document.getElementById('modal-vmin');
    const modalVmax = document.getElementById('modal-vmax');
    if (vminInput && modalVmin) modalVmin.value = vminInput.value;
    if (vmaxInput && modalVmax) modalVmax.value = vmaxInput.value;

    if (window.appInstance?.weatherMap && window.appInstance.variableSelect) {
        const variable    = window.appInstance.variableSelect.value;
        const layerTypeId = window.appInstance.getActiveLayerType();
        if (variable) window.appInstance.weatherMap.updateLegend(variable, layerTypeId);
    }
};

window.closeColorPicker = function () {
    const modal = document.getElementById('colorpicker-modal');
    if (modal) { modal.style.display = 'none'; modal.classList.remove('active'); }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('colorpicker-modal');
        if (modal?.classList.contains('active')) closeColorPicker();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('colorpicker-overlay')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeColorPicker();
    });
});

window.addEventListener('DOMContentLoaded', () => {
    window.appInstance = new UIController();
});
