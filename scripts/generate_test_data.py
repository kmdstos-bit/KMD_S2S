#!/usr/bin/env python3
"""Generate sample weekly weather data for testing."""

import numpy as np
import json
import os
from datetime import datetime, timedelta
from pathlib import Path

def generate_weekly_test_data():
    """Generate synthetic weekly weather data."""
    
    output_dir = Path("../data/weekly")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Grid parameters for Africa
    lat = np.arange(-40, 40.25, 0.5)  # Lower resolution for smaller files
    lon = np.arange(-25, 55.25, 0.5)
    
    # Generate dates (last 4 weekly initializations)
    # Weekly forecasts typically start on Mondays or specific days
    today = datetime.now()
    # Find last Monday
    last_monday = today - timedelta(days=today.weekday())
    test_dates = [(last_monday - timedelta(weeks=i)).strftime('%Y%m%d') 
                  for i in range(4)]
    
    # Variables to generate
    variables = {
        'temp': {
            'label': 'Weekly Mean Temperature',
            'unit': '°C',
            'min': -10, 'max': 45,
            'pattern': 'latitudinal'
        },
        'precip': {
            'label': 'Weekly Total Precipitation',
            'unit': 'mm',
            'min': 0, 'max': 200,
            'pattern': 'tropical'
        },
        'wind_speed': {
            'label': 'Weekly Mean Wind Speed',
            'unit': 'm/s',
            'min': 0, 'max': 15,
            'pattern': 'random'
        },
        'rh': {
            'label': 'Weekly Mean Relative Humidity',
            'unit': '%',
            'min': 20, 'max': 100,
            'pattern': 'coastal'
        },
        'mslp': {
            'label': 'Weekly Mean Sea Level Pressure',
            'unit': 'hPa',
            'min': 995, 'max': 1025,
            'pattern': 'pressure_systems'
        }
    }
    
    # Week numbers (1-6)
    weeks = list(range(1, 7))
    
    catalog = {
        'last_updated': datetime.utcnow().isoformat() + 'Z',
        'dates': test_dates,
        'data': {},
        'type': 'weekly',
        'weeks': weeks
    }
    
    for date_str in test_dates:
        print(f"Generating weekly test data for {date_str}")
        catalog['data'][date_str] = {}
        
        for var_name, var_info in variables.items():
            print(f"  Variable: {var_name}")
            
            var_dir = output_dir / date_str / var_name
            var_dir.mkdir(parents=True, exist_ok=True)
            
            weeks_saved = []
            for week in weeks:
                # Generate synthetic data with weekly patterns
                values = generate_weekly_pattern(
                    lat, lon, var_info['pattern'],
                    var_info['min'], var_info['max'],
                    week
                )
                
                # Create JSON structure
                json_data = {
                    "metadata": {
                        "variable": var_name,
                        "label": var_info['label'],
                        "unit": var_info['unit'],
                        "init_date": date_str,
                        "week": week,
                        "week_label": f"Week {week}",
                        "valid_dates": f"{get_week_dates(date_str, week)}",
                        "timestamp": datetime.utcnow().isoformat() + 'Z'
                    },
                    "grid": {
                        "lat": [float(lat[0]), float(lat[-1]), 0.5],
                        "lon": [float(lon[0]), float(lon[-1]), 0.5],
                        "nlat": len(lat),
                        "nlon": len(lon)
                    },
                    "values": values
                }
                
                # Save file
                filename = f"{var_name}_{date_str}_w{week:02d}.json"
                filepath = var_dir / filename
                
                with open(filepath, 'w') as f:
                    json.dump(json_data, f, separators=(',', ':'))
                
                weeks_saved.append(week)
                
                file_size = filepath.stat().st_size / 1024
                print(f"    Saved: {filename} ({file_size:.1f} KB)")
            
            catalog['data'][date_str][var_name] = {
                'weeks': weeks_saved
            }
    
    # Save catalog
    catalog_path = output_dir / 'catalog.json'
    with open(catalog_path, 'w') as f:
        json.dump(catalog, f, indent=2)
    
    print(f"\n✅ Weekly test data generated in {output_dir}")
    return catalog


def get_week_dates(init_date_str, week_num):
    """Get the date range for a specific week."""
    init_date = datetime.strptime(init_date_str, '%Y%m%d')
    start_date = init_date + timedelta(weeks=week_num - 1)
    end_date = start_date + timedelta(days=6)
    
    return f"{start_date.strftime('%d %b')} - {end_date.strftime('%d %b %Y')}"


def generate_weekly_pattern(lat, lon, pattern, vmin, vmax, week):
    """Generate synthetic weather patterns that vary by week."""
    
    nlat, nlon = len(lat), len(lon)
    values = np.zeros((nlat, nlon))
    
    # Base pattern
    if pattern == 'latitudinal':
        lat_2d = lat[:, np.newaxis].repeat(nlon, axis=1)
        values = 30 - 0.8 * np.abs(lat_2d)
        # Seasonal variation by week
        values += week * 0.5  # Warming trend
        
    elif pattern == 'tropical':
        lat_2d = lat[:, np.newaxis].repeat(nlon, axis=1)
        values = vmax * np.exp(-lat_2d**2 / 200) * (0.5 + 0.1 * week)
        # More rain in later weeks (seasonal progression)
        
    elif pattern == 'coastal':
        values = vmin + (vmax - vmin) * 0.5 * np.random.random((nlat, nlon))
        lat_2d = lat[:, np.newaxis].repeat(nlon, axis=1)
        lon_2d = lon[np.newaxis, :].repeat(nlat, axis=0)
        coast_effect = (np.abs(lon_2d + 15) < 5) | (np.abs(lon_2d - 35) < 5)
        values[coast_effect] += 15 + week
        
    elif pattern == 'pressure_systems':
        values = 1013 + np.random.normal(0, 5, (nlat, nlon))
        # Shifting pressure systems by week
        for i in range(2):
            center_lat = np.random.uniform(-30, 30) + week * 2
            center_lon = np.random.uniform(-10, 45) + week
            is_high = np.random.choice([True, False])
            strength = np.random.uniform(5, 15)
            radius = np.random.uniform(5, 15)
            
            lat_2d = lat[:, np.newaxis].repeat(nlon, axis=1)
            lon_2d = lon[np.newaxis, :].repeat(nlat, axis=0)
            dist = np.sqrt((lat_2d - center_lat)**2 + (lon_2d - center_lon)**2)
            values += (strength if is_high else -strength) * \
                     np.exp(-dist**2 / (2 * radius**2))
    else:
        values = np.random.uniform(vmin, vmax, (nlat, nlon))
    
    # Add weekly variation
    values += np.random.normal(0, 2, (nlat, nlon))
    
    # Clip to valid range
    values = np.clip(values, vmin, vmax)
    values = np.round(values, 1)
    values = np.where(np.isnan(values), None, values)
    
    return values.tolist()


if __name__ == "__main__":
    print("🎲 Generating weekly test data for weather viewer...")
    generate_weekly_test_data()
    print("\n✨ Weekly test data generation complete!")