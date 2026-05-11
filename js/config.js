const CONFIG = {
    // GitHub Pages repository info
    repoOwner: 'YOUR_USERNAME',
    repoName: 'YOUR_REPO_NAME',
    
    // Base URL for data
    dataBaseUrl: 'https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO_NAME/main/data',
    
    // Africa bounding box
    mapBounds: {
        north: 40,
        south: -40,
        west: -25,
        east: 55
    },
    
    // Available variables with metadata
    variables: {
        temp: {
            label: 'Temperature (°C)',
            unit: '°C',
            colorScheme: 'temperature',
            min: -40,
            max: 50
        },
        precip: {
            label: 'Precipitation (mm)',
            unit: 'mm',
            colorScheme: 'precipitation',
            min: 0,
            max: 100
        },
        wind: {
            label: 'Wind Speed (m/s)',
            unit: 'm/s',
            colorScheme: 'wind',
            min: 0,
            max: 30
        },
        rh: {
            label: 'Relative Humidity (%)',
            unit: '%',
            colorScheme: 'humidity',
            min: 0,
            max: 100
        },
        mslp: {
            label: 'Mean Sea Level Pressure (hPa)',
            unit: 'hPa',
            colorScheme: 'pressure',
            min: 950,
            max: 1050
        }
    },
    
    // Timesteps in hours
    timesteps: [0, 3, 6, 9, 12, 18, 24, 30, 36, 42, 48, 60, 72, 84, 96, 108, 120],
    
    // Map configuration
    mapDefaults: {
        center: [0, 20],
        zoom: 4,
        maxZoom: 10,
        minZoom: 3
    }
};