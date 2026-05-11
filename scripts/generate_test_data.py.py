#!/usr/bin/env python3
"""Generate sample weather data for testing the web application."""

import numpy as np
import json
import os
from datetime import datetime, timedelta
from pathlib import Path

def generate_test_data():
    """Generate synthetic weather data for testing."""
    
    output_dir = Path("../data/weather")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Grid parameters for Africa
    lat = np.arange(-40, 40.25, 0.25)
    lon = np.arange(-25, 55.25, 0.25)
    
    # Generate dates (last 3 days)
    test_dates = [(datetime.now() - timedelta(days=i)).strftime('%Y%m%d') 
                  for i in range(3)]
    
    # Variables to generate
    variables = {
        'temp': {
            'label': 'Temperature',
            'unit': '°C',
            'min': -10, 'max': 45,
            'pattern': 'latitudinal'  # Hotter near equator
        },
        'precip': {
            'label': 'Precipitation',
            'unit': 'mm',
            'min': 0, 'max': 50,
            'pattern': 'tropical'  # More rain in tropics
        },
        'wind_speed': {
            'label': 'Wind Speed',
            'unit': 'm/s',
            'min': 0, 'max': 20,
            'pattern': 'random'
        },
        'rh': {
            'label': 'Relative Humidity',
            'unit': '%',
            'min': 20, 'max': 100,
            'pattern': 'coastal'  # More humid near coasts
        },
        'mslp': {
            'label': 'Mean Sea Level Pressure',
            'unit': 'hPa',
            'min': 990, 'max': 1030,
            'pattern': 'pressure_systems'
        }
    }
    
    forecast_hours = [0, 3, 6, 9, 12, 18, 24, 36, 48]
    
    catalog = {
        'last_updated': datetime.utcnow().isoformat() + 'Z',
        'dates': test_dates,
        'data': {}
    }
    
    for date_str in test_dates:
        print(f"Generating test data for {date_str}")
        catalog['data'][date_str] = {}
        
        for var_name, var_info in variables.items():
            print(f"  Variable: {var_name}")
            
            var_dir = output_dir / date_str / var_name
            var_dir.mkdir(parents=True, exist_ok=True)
            
            timesteps = []
            for fhour in forecast_hours:
                # Generate synthetic data based on pattern
                values = generate_pattern(
                    lat, lon, var_info['pattern'],
                    var_info['min'], var_info['max'],
                    fhour
                )
                
                # Create JSON structure
                json_data = {
                    "metadata": {
                        "variable": var_name,
                        "label": var_info['label'],
                        "unit": var_info['unit'],
                        "init_date": date_str,
                        "forecast_hour": fhour,
                        "timestamp": datetime.utcnow().isoformat() + 'Z'
                    },
                    "grid": {
                        "lat": [float(lat[0]), float(lat[-1]), 0.25],
                        "lon": [float(lon[0]), float(lon[-1]), 0.25],
                        "nlat": len(lat),
                        "nlon": len(lon)
                    },
                    "values": values
                }
                
                # Save file
                filename = f"{var_name}_{date_str}_f{fhour:03d}.json"
                filepath = var_dir / filename
                
                with open(filepath, 'w') as f:
                    json.dump(json_data, f, separators=(',', ':'))
                
                timesteps.append(fhour)
                
                file_size = filepath.stat().st_size / 1024
                print(f"    Saved: {filename} ({file_size:.1f} KB)")
            
            catalog['data'][date_str][var_name] = {
                'timesteps': timesteps,
                'count': len(timesteps)
            }
    
    # Save catalog
    catalog_path = output_dir / 'catalog.json'
    with open(catalog_path, 'w') as f:
        json.dump(catalog, f, indent=2)
    
    print(f"\n✅ Test data generated in {output_dir}")
    print(f"   Catalog saved: {catalog_path}")
    
    return catalog


def generate_pattern(lat, lon, pattern, vmin, vmax, fhour):
    """Generate synthetic weather patterns."""
    
    nlat, nlon = len(lat), len(lon)
    values = np.zeros((nlat, nlon))
    
    if pattern == 'latitudinal':
        # Temperature decreases with latitude
        lat_2d = lat[:, np.newaxis].repeat(nlon, axis=1)
        values = 30 - 0.8 * np.abs(lat_2d)
        # Add some noise
        values += np.random.normal(0, 2, (nlat, nlon))
        # Add diurnal variation based on forecast hour
        hour_of_day = (int(datetime.now().strftime('%H')) + fhour) % 24
        if 6 <= hour_of_day <= 18:
            values += 5 * np.sin(np.pi * (hour_of_day - 6) / 12)
        
    elif pattern == 'tropical':
        # More precipitation near equator
        lat_2d = lat[:, np.newaxis].repeat(nlon, axis=1)
        values = vmax * np.exp(-lat_2d**2 / 200) * np.random.random((nlat, nlon))
        # Some areas of heavy rain
        for _ in range(np.random.randint(3, 8)):
            center_lat = np.random.uniform(-10, 15)
            center_lon = np.random.uniform(10, 50)
            radius = np.random.uniform(3, 8)
            dist = np.sqrt((lat_2d - center_lat)**2 + 
                          (lon[np.newaxis, :] - center_lon)**2)
            values += vmax * np.exp(-dist**2 / (2 * radius**2))
        
    elif pattern == 'coastal':
        # Higher humidity near coasts
        values = vmin + (vmax - vmin) * np.random.random((nlat, nlon))
        # Add coastal effect (simplified)
        lat_2d = lat[:, np.newaxis].repeat(nlon, axis=1)
        lon_2d = lon[np.newaxis, :].repeat(nlat, axis=0)
        coast_effect = (np.abs(lon_2d + 15) < 5) | (np.abs(lon_2d - 35) < 5)
        values[coast_effect] += 15
        
    elif pattern == 'pressure_systems':
        # Generate high and low pressure systems
        values = 1013 + np.random.normal(0, 5, (nlat, nlon))
        for _ in range(np.random.randint(2, 5)):
            center_lat = np.random.uniform(-30, 30)
            center_lon = np.random.uniform(-10, 45)
            is_high = np.random.choice([True, False])
            strength = np.random.uniform(5, 15)
            radius = np.random.uniform(5, 15)
            
            lat_2d = lat[:, np.newaxis].repeat(nlon, axis=1)
            lon_2d = lon[np.newaxis, :].repeat(nlat, axis=0)
            dist = np.sqrt((lat_2d - center_lat)**2 + (lon_2d - center_lon)**2)
            values += (strength if is_high else -strength) * \
                     np.exp(-dist**2 / (2 * radius**2))
        
    else:  # random
        values = np.random.uniform(vmin, vmax, (nlat, nlon))
    
    # Clip to valid range
    values = np.clip(values, vmin, vmax)
    
    # Round appropriately
    values = np.round(values, 1)
    
    # Replace NaN with None for JSON
    values = np.where(np.isnan(values), None, values)
    
    return values.tolist()


if __name__ == "__main__":
    print("🎲 Generating test data for weather viewer...")
    generate_test_data()
    print("\n✨ Test data generation complete!")