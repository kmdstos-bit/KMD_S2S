#!/usr/bin/env python3
"""
GRIB → JSON converter and catalog updater for Africa Weather Viewer.

Scans data/yyyy-mm-dd/ folders on the main branch, converts any new
GRIB files to week-level JSON, and writes an updated catalog.json to
the website branch.

Filename convention expected:
    ECMWF_s2s_control_forecast_<VARIABLE>_42days_<BBOX>.grib
e.g.
    ECMWF_s2s_control_forecast_precip_42days_7N-32E-6S-43E.grib

Usage (called by GitHub Actions):
    python scripts/grib_to_json_and_catalog.py \
        --data-dir   data \
        --output-dir data \
        --catalog    catalog.json \
        --variables  "temp,precip,wind_speed,rh,mslp" \
        --n-weeks    6
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import xarray as xr

# ============================================================
# CONFIGURATION
# ============================================================

# Dimension names inside the GRIB/NetCDF dataset
LAT_DIM  = "latitude"
LON_DIM  = "longitude"
TIME_DIM = "step"          # forecast step dimension

# Africa bounding box
LAT_MIN, LAT_MAX = -40,  40
LON_MIN, LON_MAX = -25,  55

# Metadata shown on the website per variable.
# Add new variables here — the workflow VARIABLES env var controls which
# ones are actually processed.
VAR_METADATA = {
    "temp": {
        "label": "Weekly Mean Temperature",
        "unit":  "°C",
        # Possible names inside the GRIB/NetCDF file
        "nc_names": ["t2m", "2m_temperature", "temperature", "temp"],
    },
    "precip": {
        "label": "Weekly Total Precipitation",
        "unit":  "mm",
        "nc_names": ["tp", "total_precipitation", "precipitation", "precip"],
    },
    "wind_speed": {
        "label": "Weekly Mean Wind Speed",
        "unit":  "m/s",
        "nc_names": ["ws", "si10", "wind_speed", "wind"],
    },
    "rh": {
        "label": "Weekly Mean Relative Humidity",
        "unit":  "%",
        "nc_names": ["r", "rh", "relative_humidity", "d2m"],
    },
    "mslp": {
        "label": "Weekly Mean Sea Level Pressure",
        "unit":  "hPa",
        "nc_names": ["msl", "mslp", "mean_sea_level_pressure", "prmsl"],
    },
    # ── Add more variables below ──────────────────────────────────
    # "cape": {
    #     "label": "Convective Available Potential Energy",
    #     "unit":  "J/kg",
    #     "nc_names": ["cape"],
    # },
    # "tcwv": {
    #     "label": "Total Column Water Vapour",
    #     "unit":  "kg/m²",
    #     "nc_names": ["tcwv", "tcw"],
    # },
    # "u10": {
    #     "label": "Weekly Mean 10m U-Wind Component",
    #     "unit":  "m/s",
    #     "nc_names": ["u10", "10u"],
    # },
    # "v10": {
    #     "label": "Weekly Mean 10m V-Wind Component",
    #     "unit":  "m/s",
    #     "nc_names": ["v10", "10v"],
    # },
}

# Unit conversions applied after loading
UNIT_CONVERSIONS = {
    # Temperature: Kelvin → Celsius
    "temp": lambda v: v - 273.15 if np.nanmax(v) > 100 else v,
    # Pressure: Pa → hPa
    "mslp": lambda v: v / 100.0 if np.nanmax(v) > 10000 else v,
    # Precipitation: m → mm
    "precip": lambda v: v * 1000.0 if np.nanmax(v) < 10 else v,
}


# ============================================================
# HELPERS
# ============================================================

def find_nc_variable(ds, standard_name: str) -> str:
    """Return the in-dataset name for a standard variable."""
    candidates = VAR_METADATA.get(standard_name, {}).get("nc_names", [standard_name])
    for name in candidates:
        if name in ds.data_vars:
            return name
    # Last resort: first data variable
    fallback = list(ds.data_vars)[0]
    print(f"  ⚠  '{standard_name}' not found by name — falling back to '{fallback}'")
    return fallback


def extract_africa(da):
    """Crop DataArray to the Africa bounding box."""
    lats = da[LAT_DIM].values
    if lats[0] > lats[-1]:                                  # N→S ordering
        da = da.sel(**{LAT_DIM: slice(LAT_MAX, LAT_MIN)})
    else:
        da = da.sel(**{LAT_DIM: slice(LAT_MIN, LAT_MAX)})
    da = da.sel(**{LON_DIM: slice(LON_MIN, LON_MAX)})
    return da


def grid_info(da) -> dict:
    lats = da[LAT_DIM].values
    lons = da[LON_DIM].values
    dlat = float(abs(lats[1] - lats[0])) if len(lats) > 1 else 0.25
    dlon = float(abs(lons[1] - lons[0])) if len(lons) > 1 else 0.25
    return {
        "lat":  [float(lats[0]),  float(lats[-1]),  dlat],
        "lon":  [float(lons[0]),  float(lons[-1]),  dlon],
        "nlat": int(len(lats)),
        "nlon": int(len(lons)),
    }


def clean_values(values: np.ndarray) -> np.ndarray:
    """Round floats and replace NaN/inf with None for JSON."""
    values = np.where(~np.isfinite(values), np.nan, values)
    values = np.round(values.astype(float), 1)
    return np.where(np.isnan(values), None, values)


def week_date_range(init_date_str: str, week_num: int) -> str:
    """Return a human-readable date range string for a forecast week."""
    init  = datetime.strptime(init_date_str, "%Y%m%d")
    start = init + timedelta(weeks=week_num - 1)
    end   = start + timedelta(days=6)
    if start.month == end.month:
        return f"{start.strftime('%d')} - {end.strftime('%d %b %Y')}"
    return f"{start.strftime('%d %b')} - {end.strftime('%d %b %Y')}"


def folder_date_to_init(folder_name: str) -> str:
    """Convert yyyy-mm-dd folder name to YYYYMMDD init-date string."""
    return folder_name.replace("-", "")


def output_already_exists(output_dir: Path, init_date: str, variable: str, n_weeks: int) -> bool:
    """Return True if all week JSON files for this date/variable already exist."""
    for w in range(1, n_weeks + 1):
        p = output_dir / init_date / variable / f"{variable}_{init_date}_w{w:02d}.json"
        if not p.exists():
            return False
    return True


# ============================================================
# CONVERSION
# ============================================================

def convert_grib(grib_path: Path, output_dir: Path, init_date: str,
                 variable: str, n_weeks: int) -> list[int]:
    """
    Open a GRIB file, convert each forecast week to JSON, return list of
    week numbers that were successfully written.
    """
    print(f"\n  📂 {grib_path.name}")

    try:
        # cfgrib backend; squeeze=False keeps all dimensions explicit
        ds = xr.open_dataset(grib_path, engine="cfgrib",
                             backend_kwargs={"indexpath": ""})
    except Exception as e:
        print(f"  ✗ Could not open GRIB: {e}")
        return []

    # Average over ensemble members if present
    if "number" in ds.dims:
        ds = ds.mean("number")

    nc_var = find_nc_variable(ds, variable)
    da = ds[nc_var]

    # Ensure TIME_DIM exists
    if TIME_DIM not in da.dims:
        print(f"  ✗ Dimension '{TIME_DIM}' not found. Available: {list(da.dims)}")
        ds.close()
        return []

    da_africa = extract_africa(da)
    out_dir   = output_dir / init_date / variable
    out_dir.mkdir(parents=True, exist_ok=True)

    converter = UNIT_CONVERSIONS.get(variable)
    saved_weeks = []

    n = min(len(da_africa[TIME_DIM]), n_weeks)
    for i in range(n):
        week_num  = i + 1
        da_week   = da_africa.isel(**{TIME_DIM: i})

        values    = da_week.values.copy().astype(float)
        if converter:
            values = converter(values)
        values = clean_values(values)

        meta = VAR_METADATA.get(variable, {"label": variable, "unit": ""})
        payload = {
            "metadata": {
                "variable":    variable,
                "label":       meta["label"],
                "unit":        meta["unit"],
                "init_date":   init_date,
                "week":        week_num,
                "week_label":  f"Week {week_num}",
                "valid_dates": week_date_range(init_date, week_num),
                "timestamp":   datetime.utcnow().isoformat() + "Z",
            },
            "grid":   grid_info(da_week),
            "values": values.tolist(),
        }

        fname = out_dir / f"{variable}_{init_date}_w{week_num:02d}.json"
        with open(fname, "w") as f:
            json.dump(payload, f, separators=(",", ":"))

        print(f"  ✅ Week {week_num}: {fname.name}  ({week_date_range(init_date, week_num)})")
        saved_weeks.append(week_num)

    ds.close()
    return saved_weeks


# ============================================================
# CATALOG
# ============================================================

def load_catalog(catalog_path: Path) -> dict:
    if catalog_path.exists():
        with open(catalog_path) as f:
            return json.load(f)
    return {"last_updated": "", "dates": [], "data": {}, "type": "weekly",
            "weeks": list(range(1, 7))}


def save_catalog(catalog: dict, catalog_path: Path):
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    with open(catalog_path, "w") as f:
        json.dump(catalog, f, indent=2)
    print(f"\n📋 Catalog saved → {catalog_path}")


def update_catalog(catalog: dict, init_date: str, variable: str,
                   weeks: list[int]) -> dict:
    catalog["last_updated"] = datetime.utcnow().isoformat() + "Z"

    if init_date not in catalog["dates"]:
        catalog["dates"].append(init_date)
    catalog["dates"] = sorted(catalog["dates"], reverse=True)

    catalog["data"].setdefault(init_date, {})
    catalog["data"][init_date][variable] = {
        "weeks": sorted(weeks),
        "count": len(weeks),
    }
    return catalog


def prune_old_forecasts(catalog: dict, output_dir: Path,
                        keep: int = 7) -> tuple[dict, bool]:
    """
    Keep only the `keep` most recent forecast dates.
    Older entries are deleted from the output_dir JSON folder tree
    and removed from the catalog.

    The cutoff is purely rank-based (the N newest dates are kept),
    so it works even if new data arrives irregularly.

    Returns the updated catalog and a bool indicating whether anything
    was actually pruned.
    """
    # Dates are already sorted newest-first in the catalog
    all_dates = catalog.get("dates", [])

    if len(all_dates) <= keep:
        return catalog, False

    dates_to_keep   = set(all_dates[:keep])
    dates_to_remove = [d for d in all_dates if d not in dates_to_keep]

    pruned = False
    for old_date in dates_to_remove:
        # Delete JSON output folder on website branch: output_dir/YYYYMMDD/
        folder = output_dir / old_date
        if folder.exists():
            import shutil
            shutil.rmtree(folder)
            print(f"  🗑  Deleted output folder: {folder}")
        else:
            print(f"  🗑  Output folder not found (already gone?): {folder}")

        # Remove from catalog
        catalog["data"].pop(old_date, None)
        catalog["dates"] = [d for d in catalog["dates"] if d != old_date]
        pruned = True

    if pruned:
        catalog["last_updated"] = datetime.utcnow().isoformat() + "Z"
        print(f"\n🧹 Pruned {len(dates_to_remove)} old forecast(s): {dates_to_remove}")

    return catalog, pruned


# ============================================================
# MAIN
# ============================================================

def parse_args():
    p = argparse.ArgumentParser(description="GRIB → JSON + catalog updater")
    p.add_argument("--data-dir",   required=True, help="Root data folder on main branch")
    p.add_argument("--output-dir", required=True, help="Root output folder on website branch")
    p.add_argument("--catalog",    required=True, help="Path to catalog.json on website branch")
    p.add_argument("--variables",  required=True, help="Comma-separated variable names")
    p.add_argument("--n-weeks",    type=int, default=6,  help="Number of forecast weeks per file")
    p.add_argument("--keep",       type=int, default=7,  help="Number of most-recent forecasts to retain")
    return p.parse_args()


def main():
    args     = parse_args()
    data_dir = Path(args.data_dir)
    out_dir  = Path(args.output_dir)
    cat_path = Path(args.catalog)
    variables = [v.strip() for v in args.variables.split(",")]
    n_weeks  = args.n_weeks
    keep     = args.keep

    # Validate variable list
    unknown = [v for v in variables if v not in VAR_METADATA]
    if unknown:
        print(f"⚠  Unknown variable(s): {unknown}")
        print(f"   Defined variables: {list(VAR_METADATA.keys())}")
        print("   Add them to VAR_METADATA in the script and re-run.")

    # Load existing catalog
    catalog = load_catalog(cat_path)
    any_change = False

    # Walk date folders: data/yyyy-mm-dd/
    date_dirs = sorted(
        [d for d in data_dir.iterdir()
         if d.is_dir() and re.match(r"^\d{4}-\d{2}-\d{2}$", d.name)],
        reverse=True,
    )

    if not date_dirs:
        print(f"No yyyy-mm-dd folders found in {data_dir}")
        sys.exit(0)

    print(f"Found {len(date_dirs)} date folder(s): "
          f"{[d.name for d in date_dirs]}")

    for date_dir in date_dirs:
        init_date = folder_date_to_init(date_dir.name)   # "2026-05-11" → "20260511"

        for variable in variables:
            if variable not in VAR_METADATA:
                continue

            # Find GRIB file matching this variable
            # Pattern: *forecast_<variable>_*
            matches = list(date_dir.glob(f"*forecast_{variable}_*.grib")) + \
                      list(date_dir.glob(f"*_{variable}_*.grib")) + \
                      list(date_dir.glob(f"*{variable}*.grib"))

            if not matches:
                print(f"  — {date_dir.name}/{variable}: no GRIB file found, skipping.")
                continue

            grib_path = matches[0]   # take the first match if multiple

            # Skip if JSON output already exists for all weeks
            if output_already_exists(out_dir, init_date, variable, n_weeks):
                print(f"  ✓ {init_date}/{variable}: already converted, skipping.")
                # Still make sure it is in the catalog
                existing_weeks = catalog.get("data", {}) \
                                        .get(init_date, {}) \
                                        .get(variable, {}) \
                                        .get("weeks", [])
                if not existing_weeks:
                    catalog = update_catalog(catalog, init_date, variable,
                                             list(range(1, n_weeks + 1)))
                    any_change = True
                continue

            weeks = convert_grib(grib_path, out_dir, init_date, variable, n_weeks)

            if weeks:
                catalog = update_catalog(catalog, init_date, variable, weeks)
                any_change = True

    # Prune forecasts older than the last `keep` dates
    catalog, pruned = prune_old_forecasts(catalog, out_dir, keep=keep)
    any_change = any_change or pruned

    if any_change:
        save_catalog(catalog, cat_path)
    else:
        print("\n✓ Nothing new to convert — catalog unchanged.")


if __name__ == "__main__":
    main()
