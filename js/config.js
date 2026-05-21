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
        tcw: {
            label: 'Weekly Mean Total Column Water',
            unit: 'kg/m²',
            colorScheme: 'humidity',
            defaultMin: 0,
            defaultMax: 50,
            absoluteMin: 0,
            absoluteMax: 200,
            step: 5
        },
        cape: {
            label: 'Weekly Mean CAPE (J/kg)',
            unit: 'J/kg',
            colorScheme: 'temperature',
            defaultMin: 0,
            defaultMax: 2500,
            absoluteMin: 0,
            absoluteMax: 5000,
            step: 100
        },
            d2m: {
            label: 'Weekly Mean Relative Dewpoint Temperature',
            unit: '°C',
            colorScheme: 'humidity',
            defaultMin: 0,
            defaultMax: 50,
            absoluteMin: 0,
            absoluteMax: 200,
            step: 5
        },
          mx2t6: {
            label: 'Weekly Mean Max Temperature',
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
          mn2t6: {
            label: 'Weekly Mean Min Temperature',
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
            u700: {
            label: "Weekly Mean 700hPa U-Wind",
            unit: 'm/s',
            colorScheme: 'wind',
            defaultMin: 0,
            defaultMax: 15,
            absoluteMin: 0,
            absoluteMax: 100,
            step: 1
        },
            u10: {
            label: "Weekly Mean 10m U-Wind",
            unit: 'm/s',
            colorScheme: 'wind',
            defaultMin: 0,
            defaultMax: 15,
            absoluteMin: 0,
            absoluteMax: 100,
            step: 1
        },
        v10: {
            label: "Weekly Mean 10m V-Wind",
            unit: 'm/s',
            colorScheme: 'wind',
            defaultMin: 0,
            defaultMax: 15,
            absoluteMin: 0,
            absoluteMax: 100,
            step: 1
        },
        v700: {
            label: "Weekly Mean 700hPa V-Wind",
            unit: 'm/s',
            colorScheme: 'wind',
            defaultMin: 0,
            defaultMax: 15,
            absoluteMin: 0,
            absoluteMax: 100,
            step: 1
        },
    },
    
    // Map defaults
    mapDefaults: {
        center: [0, 20],
        zoom: 4,
        maxZoom: 10,
        minZoom: 3
    }
};