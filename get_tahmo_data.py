"""Get all TAHMO stations in a specific country and download the data for the last 3 decades."""

from datetime import datetime, timedelta
from dateutil import parser as dateparser
import os
import pandas as pd
import geopandas as gpd
from tahmo_api import tahmo_deployment, tahmo_wide
from sheerwater.spatial_subdivisions import admin_level_gdf

import argparse

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Download and process TAHMO data for a specific country.")
    parser.add_argument(
        "--country", type=str, default="Kenya,Ghana", help="Country code for stations to process (default: Kenya)"
    )
    parser.add_argument(
        "--time", type=str, default=datetime.now().date().strftime("%Y-%m-%d"), help="Time to run script for"
    )
    country_to_code = {
        "Burkina Faso": "BF",
        "Benin": "BJ",
        "DR Congo": "CD",
        "Côte d'Ivoire": "CI",
        "Cameroon": "CM",
        "Ethiopia": "ET",
        "Ghana": "GH",
        "Lesotho": "LS",
        "Madagascar": "MG",
        "Mali": "ML",
        "Malawi": "MW",
        "Mozambique": "MZ",
        "Niger": "NE",
        "Nigeria": "NG",
        "Rwanda": "RW",
        "Senegal": "SN",
        "Chad": "TD",
        "Togo": "TG",
        "Tanzania": "TZ",
        "Uganda": "UG",
        "South Africa": "ZA",
        "Zambia": "ZM",
        "Zimbabwe": "ZW",
        "Kenya": "KE",
    }
    args = parser.parse_args()
    countries = args.country.split(',')
    stations = tahmo_deployment()
    for country in countries:
        try:
            country_code = country_to_code[country]
        except KeyError:
            print(
                f"Country {country} not found in country_to_code. Available countries: {country_to_code.keys()}")
            continue

        country_stations = stations[stations.location_countrycode == country_code][
            ["code", "location_latitude", "location_longitude", "location_name"]
        ]
        country_stations = country_stations.rename(columns={"code": "station_id"})
        country_stations = country_stations[country_stations['station_id'].str.startswith(
            'TA')]
        if len(country_stations) == 0:
            print(f"No stations found for country {country}")
            continue

        station_data = []
        # Get data for the last 4 decads
        now = dateparser.parse(args.time)
        start_time = now - timedelta(days=60)
        for i, station_id in enumerate(country_stations.station_id):
            try:
                ds = tahmo_wide(start_time=start_time, end_time=now,
                                station_id=station_id, dataset="controlled")
                if ds is None or len(ds) == 0:
                    print(
                        f"Station {i + 1} of {len(country_stations)}: {station_id} has no data")
                    continue

                # Remove data with quality flag > 2, manually flagged as bad
                if "precipitation_1_quality_tahmo" in ds.columns:
                    ds = ds[ds["precipitation_1_quality_tahmo"] <= 2]
                if "humidity_quality_tahmo" in ds.columns:
                    ds = ds[ds["humidity_quality_tahmo"] <= 2]
                if "temperature_quality_tahmo" in ds.columns:
                    ds = ds[ds["temperature_quality_tahmo"] <= 2]
                if "pressure_quality_tahmo" in ds.columns:
                    ds = ds[ds["pressure_quality_tahmo"] <= 2]

                ds = ds[["time", "precipitation_1_tahmo", "precipitation_1_sensor_id_tahmo",
                        "humidity_tahmo", "temperature_tahmo", "pressure_tahmo"]]
                ds = ds.set_index("time")

                # Resample by day
                ds = ds.resample("24h", offset=pd.Timedelta(hours=6)).agg({
                    "precipitation_1_tahmo": "sum",
                    "precipitation_1_sensor_id_tahmo": "first",
                    "humidity_tahmo": "mean",
                    "temperature_tahmo": ["mean", "max", "min"],
                    "pressure_tahmo": "mean",
                })
                ds.columns = ["_".join(c).strip("_") for c in ds.columns]
                ds = ds.rename(columns={
                    "precipitation_1_tahmo_sum": "cumulative_precipitation_mm",
                    "precipitation_1_sensor_id_tahmo_first": "precipitation_sensor_id",
                })

                # Remove data with quality flag > 2, manually flagged as bad
                ds["station_id"] = station_id
                station_data.append(ds)
                print(f"Station {i + 1} of {len(country_stations)}: {station_id}")
            except Exception as e:
                print(
                    f"Station {i + 1} of {len(country_stations)}: {station_id} has no data")
                continue

        if len(station_data) == 0:
            print(f"No data found for country {country}")
            continue
        all_ds = pd.concat(station_data).reset_index()

        # Merge in the station metadata
        all_ds = all_ds.merge(country_stations, on="station_id", how="left")

        # Spatially join in the admin level 1 geometry
        gdf = admin_level_gdf(admin_level=1, cache_mode='local')
        gdf = gdf[['NAME_0', 'NAME_1', 'geometry']]
        all_ds = gpd.GeoDataFrame(all_ds, geometry=gpd.points_from_xy(
            all_ds.location_longitude, all_ds.location_latitude), crs="EPSG:4326")
        all_ds = gpd.sjoin(all_ds, gdf, how="left", predicate="within")

        all_ds = all_ds.rename(
            columns={'NAME_0': 'country', 'NAME_1': 'admin_level_1'})

        # Sortby time index
        all_ds = all_ds.sort_values(by=["time", "station_id", "admin_level_1"])

        # Reorder the columns to put the station metadata first
        order = ['time', 'station_id', 'location_latitude', 'location_longitude',
                'country', 'admin_level_1', 'location_name',
                'cumulative_precipitation_mm', 'humidity_tahmo_mean', 'pressure_tahmo_mean',
                'temperature_tahmo_mean', 'temperature_tahmo_max', 'temperature_tahmo_min',
                'precipitation_sensor_id']
        all_ds = all_ds[order]
        today = now.strftime('%Y-%m-%d')
        dirpath = f"private_data/station_data/{country}/{today}"
        os.makedirs(dirpath, exist_ok=True)
        all_ds.to_csv(f"{dirpath}/tahmo_data_{country}.csv", index=False, mode='w')
