const CONFIG = {
    // Your GitHub details
    repoOwner: 'alecjong-lab',
    repoName: 'ECMWF-S2S4AFRICA',
    branchName: 'website',
    
    // Data URL (now points to weekly data)
    dataBaseUrl: 'https://raw.githubusercontent.com/alecjong-lab/ECMWF-S2S4AFRICA/website/data',
    
    // Africa bounding box
    mapBounds: {
        north: 40,
        south: -40,
        west: -25,
        east: 55
    },
    
    // Data type
    dataType: 'weekly',  // 'weekly' or 'forecast'
    
    // Available weeks
    weeks: [1, 2, 3, 4, 5, 6],
    
    // Week labels
    weekLabels: {
        1: 'Week 1',
        2: 'Week 2', 
        3: 'Week 3',
        4: 'Week 4',
        5: 'Week 5',
        6: 'Week 6'
    },
    
    variables: {
        temp: {
            label: 'Weekly Mean Temperature',
            unit: '°C',
            colorScheme: 'temperature',
            // These are the DEFAULT ranges (forecaster-trusted values)
            defaultMin: 0,
            defaultMax: 40,
            // Allowable range for the sliders
            absoluteMin: -20,
            absoluteMax: 55,
            step: 1
        },
        precip: {
            label: 'Weekly Total Precipitation',
            unit: 'mm',
            colorScheme: 'precipitation',
            defaultMin: 0,
            defaultMax: 100,
            absoluteMin: 0,
            absoluteMax: 500,
            step: 5
        },
        wind_speed: {
            label: 'Weekly Mean Wind Speed',
            unit: 'm/s',
            colorScheme: 'wind',
            defaultMin: 0,
            defaultMax: 15,
            absoluteMin: 0,
            absoluteMax: 40,
            step: 1
        },
        rh: {
            label: 'Weekly Mean Relative Humidity',
            unit: '%',
            colorScheme: 'humidity',
            defaultMin: 0,
            defaultMax: 100,
            absoluteMin: 0,
            absoluteMax: 100,
            step: 5
        },
        mslp: {
            label: 'Weekly Mean Sea Level Pressure',
            unit: 'hPa',
            colorScheme: 'pressure',
            defaultMin: 990,
            defaultMax: 1030,
            absoluteMin: 950,
            absoluteMax: 1060,
            step: 2
        }
    },
    
    // Map defaults
    mapDefaults: {
        center: [0, 20],
        zoom: 4,
        maxZoom: 10,
        minZoom: 3
    }
};