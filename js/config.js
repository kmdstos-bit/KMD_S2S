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
    
    // Available variables with metadata
    variables: {
        temp: {
            label: 'Weekly Mean Temperature',
            unit: '°C',
            colorScheme: 'temperature',
            min: -10,
            max: 45
        },
        precip: {
            label: 'Weekly Total Precipitation',
            unit: 'mm',
            colorScheme: 'precipitation',
            min: 0,
            max: 200
        },
        wind_speed: {
            label: 'Weekly Mean Wind Speed',
            unit: 'm/s',
            colorScheme: 'wind',
            min: 0,
            max: 15
        },
        rh: {
            label: 'Weekly Mean Relative Humidity',
            unit: '%',
            colorScheme: 'humidity',
            min: 20,
            max: 100
        },
        mslp: {
            label: 'Weekly Mean Sea Level Pressure',
            unit: 'hPa',
            colorScheme: 'pressure',
            min: 995,
            max: 1025
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