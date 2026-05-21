#!/usr/bin/env python3
"""
NetCDF → JSON converter and catalog updater for Africa Weather Viewer.

Scans ncdf_data/yyyy-mm-dd/ folders on the website branch, converts any
new NetCDF files to week-level JSON under data/weekly/, and updates catalog.json.

Filename convention:
    ECMWF_s2s_control_forecast_<VARIABLE>_42days_<BBOX>.nc
e.g.
    ECMWF_s2s_control_forecast_precip_42days_7N-32E-6S-43E.nc

Usage (called by GitHub Actions):
    python scripts/nc_to_json_and_catalog.py \
        --ncdf-dir   ncdf_data \
        --output-dir data/weekly \
        --catalog    catalog.json \
        --variables  "temp,precip,wind_speed,rh,mslp" \
        --n-weeks    6 \
        --keep       7
"""

import argparse
import json
import re
import shutil
import sys
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import xarray as xr


# ============================================================
# CONFIGURATION
# ============================================================

# Dimension names inside the NetCDF file
LAT_DIM  = "latitude"
LON_DIM  = "longitude"
TIME_DIM = "step"        # forecast-step dimension (weeks 1-6)

# Africa bounding box
LAT_MIN, LAT_MAX = -40,  40
LON_MIN, LON_MAX = -25,  55

# Per-variable metadata + possible internal NetCDF variable names.
# To add a new variable: add an entry here, then include its name
# in the VARIABLES env var in the workflow YAML.
VAR_METADATA = {
    "temp": {
        "label":    "Weekly Mean Temperature",
        "unit":     "°C",
        "nc_names": ["t2m", "2m_temperature", "temperature", "temp"],
    },
    "precip": {
        "label":    "Weekly Total Precipitation",
        "unit":     "mm",
        "nc_names": ["tp", "total_precipitation", "precipitation", "precip"],
    },
    "u700": {
        "label":    "Weekly Mean 700hPa U-Wind",
        "unit":     "m/s",
        "nc_names": ["u"],
    },
    "v700": {
        "label":    "Weekly Mean 700hPa V-Wind",
        "unit":     "m/s",
        "nc_names": ["v"],
    },
    "w500": {
        "label":    "Weekly Mean 500hPa Vertical Wind",
        "unit":     "m/s",
        "nc_names": ["w"],
    },
    "d2m": {
        "label":    "Weekly Mean Relative Dewpoint Temperature",
        "unit":      "°C",
        "nc_names": ["d2m"],
    },
    # ── Uncomment or add new variables below ─────────────────────
    "cape": {
        "label":    "Convective Available Potential Energy",
        "unit":     "J/kg",
        "nc_names": ["cape"],
    },
    "tcwv": {
        "label":    "Total Column Water Vapour",
        "unit":     "kg/m²",
        "nc_names": ["tcwv", "tcw"],
    },
    "u10": {
        "label":    "Weekly Mean 10m U-Wind",
        "unit":     "m/s",
        "nc_names": ["u10", "10u"],
    },
    "v10": {
        "label":    "Weekly Mean 10m V-Wind",
        "unit":     "m/s",
        "nc_names": ["v10", "10v"],
    },
    "mx2t6": {
        "label":    "Weekly Mean Max Temperature",
        "unit":     "°C",
        "nc_names": ["mx2t6"],
    },"mn2t6": {
        "label":    "Weekly Mean Min Temperature",
        "unit":     "°C",
        "nc_names": ["mx2t6"],
    },
}

# Unit conversions applied after loading (add lambdas as needed)
UNIT_CONVERSIONS = {
    "temp":  lambda v: v - 273.15 if np.nanmax(v) > 100   else v,   # K → °C
    "d2m":  lambda v: v - 273.15 if np.nanmax(v) > 100   else v,   # K → °C
    "mslp":  lambda v: v / 100.0  if np.nanmax(v) > 10000 else v,   # Pa → hPa
    "precip": lambda v: v * 1000.0 if np.nanmax(v) < 10   else v,   # m → mm
}


# ============================================================
# HELPERS
# ============================================================

def find_nc_variable(ds: xr.Dataset, standard_name: str) -> str:
    """Return the in-dataset name that corresponds to a standard variable."""
    candidates = VAR_METADATA.get(standard_name, {}).get("nc_names", [standard_name])
    for name in candidates:
        if name in ds.data_vars:
            return name
    fallback = list(ds.data_vars)[0]
    print(f"  ⚠  '{standard_name}' not matched by name — falling back to '{fallback}'")
    return fallback


def extract_africa(da: xr.DataArray) -> xr.DataArray:
    """Crop DataArray to the Africa bounding box."""
    lats = da[LAT_DIM].values
    if lats[0] > lats[-1]:                                      # N→S ordering
        da = da.sel(**{LAT_DIM: slice(LAT_MAX, LAT_MIN)})
    else:
        da = da.sel(**{LAT_DIM: slice(LAT_MIN, LAT_MAX)})
    return da.sel(**{LON_DIM: slice(LON_MIN, LON_MAX)})


def grid_info(da: xr.DataArray) -> dict:
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
    """Round floats and replace NaN/inf with None for JSON serialisation."""
    values = np.where(np.isfinite(values), np.round(values.astype(float), 1), np.nan)
    return np.where(np.isnan(values), None, values)


def week_date_range(init_date_str: str, week_num: int) -> str:
    """Human-readable date range for a forecast week, e.g. '11 - 17 May 2026'."""
    init  = datetime.strptime(init_date_str, "%Y%m%d")
    start = init + timedelta(weeks=week_num - 1)
    end   = start + timedelta(days=6)
    if start.month == end.month:
        return f"{start.strftime('%d')} - {end.strftime('%d %b %Y')}"
    return f"{start.strftime('%d %b')} - {end.strftime('%d %b %Y')}"

def folder_to_init_date(folder_name: str) -> str:
    """'2026-05-11' → '20260511'"""
    return folder_name.replace("-", "")


def all_weeks_exist(output_dir: Path, init_date: str,
                    variable: str, n_weeks: int) -> bool:
    """True if every week JSON already exists for this date/variable."""
    return all(
        (output_dir / init_date / variable /
         f"{variable}_{init_date}_w{w:02d}.json").exists()
        for w in range(1, n_weeks + 1)
    )

# ============================================================
# CONVERSION
# ============================================================

def convert_nc(nc_path: Path, output_dir: Path, init_date: str,
               variable: str, n_weeks: int) -> list[int]:
    """
    Convert one NetCDF file to per-week JSON files.
    Returns a list of week numbers that were successfully written.
    """
    print(f"\n  📂 {nc_path.name}")

    try:
        ds = xr.open_dataset(nc_path)
    except Exception as exc:
        print(f"  ✗ Could not open file: {exc}")
        return []

    # Average over ensemble members if present
    if "number" in ds.dims:
        ds = ds.mean("number")

    nc_var = find_nc_variable(ds, variable)
    da     = ds[nc_var]

    if TIME_DIM not in da.dims:
        print(f"  ✗ Dimension '{TIME_DIM}' not found. Available: {list(da.dims)}")
        ds.close()
        return []

    da_africa  = extract_africa(da)
    out_dir    = output_dir / init_date / variable
    out_dir.mkdir(parents=True, exist_ok=True)

    converter  = UNIT_CONVERSIONS.get(variable)
    meta       = VAR_METADATA[variable]
    saved      = []

    for i in range(min(len(da_africa[TIME_DIM]), n_weeks)):
        week_num = i + 1
        values   = da_africa.isel(**{TIME_DIM: i}).values.copy().astype(float)
        if converter:
            values = converter(values)
        values = clean_values(values)

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
            "grid":   grid_info(da_africa.isel(**{TIME_DIM: i})),
            "values": values.tolist(),
        }

        fname = out_dir / f"{variable}_{init_date}_w{week_num:02d}.json"
        with open(fname, "w") as f:
            json.dump(payload, f, separators=(",", ":"))

        print(f"  ✅ Week {week_num}: {fname.name}  ({week_date_range(init_date, week_num)})")
        saved.append(week_num)

    ds.close()
    return saved


# ============================================================
# CATALOG
# ============================================================

def load_catalog(catalog_path: Path) -> dict:
    if catalog_path.exists():
        with open(catalog_path) as f:
            return json.load(f)
    return {
        "last_updated": "",
        "dates":        [],
        "data":         {},
        "type":         "weekly",
        "weeks":        list(range(1, 7)),
    }


def save_catalog(catalog: dict, catalog_path: Path):
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    with open(catalog_path, "w") as f:
        json.dump(catalog, f, indent=2)
    print(f"\n📋 Catalog saved → {catalog_path}")


def update_catalog(catalog: dict, init_date: str,
                   variable: str, weeks: list[int]) -> dict:
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
                        keep: int) -> tuple[dict, bool]:
    """
    Retain only the `keep` most-recent forecast dates.
    Deletes their JSON folders from output_dir and removes them from the catalog.
    """
    all_dates     = catalog.get("dates", [])   # already newest-first
    dates_to_drop = all_dates[keep:]

    if not dates_to_drop:
        return catalog, False

    for old_date in dates_to_drop:
        folder = output_dir / old_date
        if folder.exists():
            shutil.rmtree(folder)
            print(f"  🗑  Deleted {folder}")
        catalog["data"].pop(old_date, None)

    catalog["dates"]        = all_dates[:keep]
    catalog["last_updated"] = datetime.utcnow().isoformat() + "Z"
    print(f"\n🧹 Pruned {len(dates_to_drop)} old forecast(s): {dates_to_drop}")
    return catalog, True


# ============================================================
# MAIN
# ============================================================

def parse_args():
    p = argparse.ArgumentParser(description="NetCDF → JSON + catalog updater")
    p.add_argument("--ncdf-dir",   required=True, help="Source NetCDF folder (ncdf_data/)")
    p.add_argument("--output-dir", required=True, help="Destination JSON folder (data/weekly/)")
    p.add_argument("--catalog",    required=True, help="Path to catalog.json")
    p.add_argument("--variables",  required=True, help="Comma-separated variable names")
    p.add_argument("--n-weeks",    type=int, default=6, help="Forecast weeks per file")
    p.add_argument("--keep",       type=int, default=7, help="Forecast dates to retain")
    return p.parse_args()


def main():
    args      = parse_args()
    ncdf_dir  = Path(args.ncdf_dir)
    out_dir   = Path(args.output_dir)
    cat_path  = Path(args.catalog)
    variables = [v.strip() for v in args.variables.split(",")]
    n_weeks   = args.n_weeks
    keep      = args.keep

    # Warn about any variables not defined in VAR_METADATA
    unknown = [v for v in variables if v not in VAR_METADATA]
    if unknown:
        print(f"⚠  Unknown variable(s): {unknown}")
        print(f"   Add them to VAR_METADATA in the script and re-run.")

    catalog    = load_catalog(cat_path)
    any_change = False

    # Discover date folders: ncdf_data/yyyy-mm-dd/
    date_dirs = sorted(
        [d for d in ncdf_dir.iterdir()
         if d.is_dir() and re.match(r"^\d{4}-\d{2}-\d{2}$", d.name)],
        reverse=True,
    )

    if not date_dirs:
        print(f"No yyyy-mm-dd folders found in {ncdf_dir}")
        sys.exit(0)

    print(f"Found {len(date_dirs)} date folder(s): {[d.name for d in date_dirs]}")

    for date_dir in date_dirs:
        init_date = folder_to_init_date(date_dir.name)   # "2026-05-11" → "20260511"

        for variable in variables:
            if variable not in VAR_METADATA:
                continue

            # Skip if all week JSONs already exist
            if all_weeks_exist(out_dir, init_date, variable, n_weeks):
                print(f"  ✓ {init_date}/{variable}: already converted, skipping.")
                # Ensure it is registered in the catalog even if it was skipped before
                if not catalog.get("data", {}).get(init_date, {}).get(variable):
                    catalog    = update_catalog(catalog, init_date, variable,
                                                list(range(1, n_weeks + 1)))
                    any_change = True
                continue

            # Find matching NetCDF file
            matches = (list(date_dir.glob(f"*forecast_{variable}_*.nc")) +
                       list(date_dir.glob(f"*_{variable}_*.nc")) +
                       list(date_dir.glob(f"*{variable}*.nc")))

            if not matches:
                print(f"  — {date_dir.name}/{variable}: no .nc file found, skipping.")
                continue

            weeks = convert_nc(matches[0], out_dir, init_date, variable, n_weeks)

            if weeks:
                catalog    = update_catalog(catalog, init_date, variable, weeks)
                any_change = True

    # Prune old forecasts
    catalog, pruned = prune_old_forecasts(catalog, out_dir, keep)
    any_change = any_change or pruned

    if any_change:
        save_catalog(catalog, cat_path)
    else:
        print("\n✓ Nothing new — catalog unchanged.")


if __name__ == "__main__":
    main()
