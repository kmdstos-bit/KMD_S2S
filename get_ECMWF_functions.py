import time
import os
import glob
import numpy as np
import pandas as pd
import xarray as xr
import cfgrib
import matplotlib
import matplotlib.pyplot as plt
from mpl_toolkits.axes_grid1 import make_axes_locatable
import cartopy.crs as ccrs
import cartopy.feature as cfeature
from datetime import date, timedelta, datetime
from ecmwfapi import ECMWFDataServer
import json
import re
import operator
from scipy.ndimage import gaussian_filter
from scipy.ndimage import grey_opening, grey_closing
from IPython.display import clear_output
from matplotlib.colors import LinearSegmentedColormap
import subprocess
import requests
from cfgrib.xarray_to_grib import to_grib
import matplotlib.colors as mcolors

colors = ["white","wheat","lightgreen", "green","lightblue", "blue","yellow","orange", "red","purple"]
cmap = LinearSegmentedColormap.from_list("wgbrp", colors)

colors = ["red","yellow","blue"]
cmap_traffic = LinearSegmentedColormap.from_list("wgbrp", colors)

from matplotlib.colors import LinearSegmentedColormap

colors = ["white","#ffff00","#ffcc00", "#ff9900","#ff6600", "#ff3300","#ff0000"]
cmap_efi = LinearSegmentedColormap.from_list("wgbrp", colors)

# # # namibia botswana
lat1=-15
lat2=-29.5
lon1=11
lon2=29

def windspeed(ds,u_name,v_name):
    """
    function to calculate windspeed from and add to a xarray dataset containing u and v components
    """
    ds_speed=xr.merge([ds,np.sqrt(ds[u_name]**2+ds[v_name]**2).to_dataset(name='speed')])
    for wind in [u_name,v_name]:
        ds_speed[wind].attrs=ds[wind].attrs
    ds_speed['speed'].attrs=ds[wind].attrs
    ds_speed.speed.attrs['GRIB_name']='wind speed'
    return ds_speed

def open_forecast(date_str,name,path=None):
    if path==None:
        path=f'*data/{date_str}'
    pf_path=glob.glob(f"{path}/*perturbed_forecast_{name}*.grib")[0]
    cf_path=glob.glob(f"{path}/*control_forecast_{name}*.grib")[0]

    pf_daily_var=xr.open_dataset(pf_path,engine='cfgrib')
    cf_daily_var=xr.open_dataset(cf_path,engine='cfgrib')

    ds=xr.concat([pf_daily_var,cf_daily_var],dim='number')

    return ds

def rank_upscale_and_align(
    source_da,
    target_da,
    rank_dim="year",
    upscale_factor=30,
    rank_threshold=1,
    lat_name="latitude",
    lon_name="longitude",
):
    """
    perform empirical quantile matching and downscaling of the ECMWF s2s forecasts.
    
    first step is to get the rank of the ECMWF data. 

    then the data array with the ranks is increased in resolution by transforming a 1.5x1.5 cube of data -
    - to 30 pixels of 0.05x0.05deg 

    the resulting longitude dimension does not completly allign with chirps, so they are aligned

    the upscaled ranks are then passed to a gray closing, filling in areas of low precip by surounding precip

    then it is all smoothed with a gaussian filter

    Parameters
    ----------
    source_da : xr.DataArray
        Input data to rank and upscale.
    target_da : xr.DataArray
        Target data to align to and sort.
    rank_dim : str
        Dimension along which to compute ranks.
    upscale_factor : int
        Factor to increase spatial resolution.
    rank_threshold : int or float, optional
        Minimum allowed rank value.
    lat_name : str
        Name of latitude dimension.
    lon_name : str
        Name of longitude dimension.

    Returns
    -------
    sorted_target : xr.DataArray
        Target dataset reordered using aligned rank indices.
    """

    # ---- Rank ----
    #get ranks of forecast compared to the model climatology
    ranks = source_da.rank(dim=rank_dim)

    if rank_threshold is not None:
        ranks = ranks.where(ranks >= rank_threshold, ranks.max() + 1) - 1

    # ---- Upscale ----
    n_lat = ranks.sizes[lat_name] * upscale_factor
    n_lon = ranks.sizes[lon_name] * upscale_factor

    new_lat = np.linspace(
        ranks[lat_name].max().values,
        ranks[lat_name].min().values,
        n_lat,
    )
    new_lon = np.linspace(
        ranks[lon_name].min().values,
        ranks[lon_name].max().values,
        n_lon,
    )

    #construct new higher resolution DataArray
    upscaled = xr.DataArray(
        np.repeat(
            np.repeat(ranks.values, upscale_factor, axis=2),
            upscale_factor,
            axis=3,
        ),
        coords={
            'step':ranks['step'],
            rank_dim: ranks[rank_dim],
            lat_name: new_lat,
            lon_name: new_lon,
        },
        dims=['step',rank_dim, lat_name, lon_name],
    )

    # ---- Align to target grid ----
    aligned = (
        upscaled
        .isel(
            longitude=slice(0, target_da.sizes[lon_name]),
            latitude=slice(0, target_da.sizes[lat_name]),
        )
        .assign_coords({
            lat_name: target_da[lat_name],
            lon_name: target_da[lon_name],
        })
        .astype("int")
    )
   
    #apply gray closing filter to fill up some wierd artifacts
    smoothed = xr.apply_ufunc(
    grey_closing,
    aligned,
    kwargs={"size": (50, 50)},   # 50x50 spatial window (chosen by trail and error)
    input_core_dims=[["latitude", "longitude"]],
    output_core_dims=[["latitude", "longitude"]],
    vectorize=True,
    output_dtypes=[aligned.dtype],
    )
    #apply gaussian filter to smooth away the obvious artifacts but keep data similar
    smoothed = xr.apply_ufunc(
    gaussian_filter,
    smoothed,
    kwargs={"sigma": 1.5}, #relatively low smoothing value
    input_core_dims=[["latitude", "longitude"]],
    output_core_dims=[["latitude", "longitude"]],
    vectorize=True,
    output_dtypes=[aligned.dtype],
    )
    
    # ---- Sort target ----
    # select the last year as this will be the forecast: smoothed.isel(year=-1)
    # then we clipi the values so the rank cannot be larger than the amount of years in the climatology: .clip(min=None,max=len(target_da['rank'])-1)
    sorted_target = target_da.isel(rank=smoothed.isel(year=-1).clip(min=None,max=len(target_da['rank'])-1))

    return sorted_target.T

def link_ECMWF_key(api_config):
    # Get the current working directory
    current_path = os.getcwd()
    
    # Define the full path to the file in the current directory
    file_path = os.path.join(current_path, 'ecmwf_api_key.json')
    
    # Write the dictionary to a JSON file
    with open(file_path, 'w') as f:
        json.dump(api_config, f)
    
    # Get the current working directory
    current_path = os.getcwd()
    
    # Define the full path to the file in the current directory
    file_path = os.path.join(current_path, 'ecmwf_api_key.json')
    
    # Set the environment variable to point to this file
    os.environ['ECMWF_API_RC_FILE'] = file_path
    
    # Check if the file was created and the environment variable is set
    print(f"API key file saved at: {file_path}")
    print(f"ECMWF_API_RC_FILE is set to: {os.environ['ECMWF_API_RC_FILE']}")

def open_allfiles_and_compute_weekly(filename):
    if filename+'_hourly' in os.listdir():   
        ds_list=cfgrib.open_datasets(f'{filename}_hourly',decode_timedelta=True)
        # Drop conflicting dimensions if they exist
        ds_list_cleaned = []
        for ds in ds_list:
            drop_dims = [dim for dim in ["heightAboveGround", "surface"] if dim in ds]
            ds_list_cleaned.append(ds.drop_vars(drop_dims, errors="ignore"))
        # Merge all datasets into one
        ds_inst_acc= xr.merge(ds_list_cleaned, combine_attrs="drop_conflicts")
        
        if filename+'_6hourly_temperature' in os.listdir():
            temp_data=xr.load_dataset(f'{filename}_6hourly_temperature', engine="cfgrib",decode_timedelta=True)
        else:
            temp_data=None
        print("✅ Opened Hourly Data")
            
    daily_var=[]
    weekly_var=[]

    print("⏳ Converting Hourly Data to Daily and Weekly")
    #check if any 6 houtly variables where chosen to then convert them to daily
    if "ds_inst_acc" in locals() or "ds_inst_acc" in globals():
        if "u10" in ds_inst_acc.data_vars or "v10" in ds_inst_acc.data_vars:    ### Get daily and weekly values for wind
            u_cond,v_cond="u10" in ds_inst_acc.data_vars,"v10" in ds_inst_acc.data_vars
            selected_wind =[x for x, cond in zip(['u10', 'v10'], [u_cond, v_cond]) if cond]
            wind_day=day_mean(ds_inst_acc[selected_wind])
            daily_var.append(wind_day)
            if int(len(np.atleast_1d(ds_inst_acc.step.values))/4/7)>1:
                wind_week=week_mean(wind_day)
                weekly_var.append(wind_week)
    
        if 'tp' in ds_inst_acc.data_vars:
            ### Get daily and weekly values for precip
            data_store=[]
            for i in range(1,int((len(ds_inst_acc.step.values)-1)/4+1)):
                one_day=ds_inst_acc['tp'].isel(step=4*(i))-ds_inst_acc['tp'].isel(step=4*(i-1))
                one_day=one_day.assign_coords(step=ds_inst_acc['tp'].isel(step=4*(i)).step)
                data_store.append(one_day)
            tp_day=xr.concat(data_store,dim='step',coords='different',compat='equals').to_dataset()
            tp_day.tp.attrs=ds_inst_acc.tp.attrs.copy()
            daily_var.append(tp_day.clip(min=0))
    
            if int(len(np.atleast_1d(ds_inst_acc.step.values))/4/7)>1:
                data_store=[]
                for i in range(1,int(len(ds.step)/4/7)+1):
                    one_week=ds_inst_acc['tp'].isel(step=4*7*(i))-ds_inst_acc['tp'].isel(step=4*7*(i-1))
                    one_week=one_week.assign_coords(step=ds_inst_acc['tp'].isel(step=4*7*(i)).step-np.timedelta64(6, 'D'))
                    data_store.append(one_week)
                tp_week=xr.concat(data_store,dim='step',coords='different',compat='equals').to_dataset()
                tp_week.tp.attrs=ds_inst_acc.tp.attrs.copy()
                weekly_var.append(tp_week.clip(min=0))
    
    #check if the min/max temp in last 6 hour variable has been chosen, this is downloaded as a seperate file cause they cannot be downloaded with the same MARS request as the other variables
    if filename+'_6hourly_temperature'in os.listdir():
        if "mx2t6" in temp_data.data_vars or "mn2t6" in temp_data.data_vars:
            ### Get daily and weekly values for max/min temperature
            tmax_cond,tmin_cond="mx2t6" in temp_data.data_vars,"mn2t6" in temp_data.data_vars
            selected_temp =[x for x, cond in zip(['mx2t6', 'mn2t6'], [tmax_cond, tmin_cond]) if cond]
            temp_6h_day=day_mean_6h_accum(temp_data,selected_temp)
            daily_var.append(temp_6h_day)
            if int(len(np.atleast_1d(ds_inst_acc.step.values))/4/7)>1:
                temp_6h_week=week_mean(temp_6h_day)
                weekly_var.append(temp_6h_week)

    # if filename+'_hourly' in os.listdir():
    #     print("✅ Done")
    # clear_output(wait=True)
    
    #Pressure also gets downloaded as a seperate file, becuase the timestep is different than the other variables
    #So we check if it has been downloaded and then open it
    if filename+'_pressure' in os.listdir():
        print("⏳ Opening and Agregating Pressure Data")
        ### Get daily and weekly values for pressure
        pressure_day=xr.load_dataset(f'{filename}_pressure', engine="cfgrib",decode_timedelta=True).isel(step=slice(1,-1))
        daily_var.append(pressure_day)
        if int(len(np.atleast_1d(pressure_day.step.values))/7)>1:
            pressure_week=week_mean(pressure_day)
            weekly_var.append(pressure_week)
        print("✅ Done")
        clear_output(wait=True)
        
            
    if filename+'_daily' in os.listdir():
        print("⏳ Opening and Agregating Daily Data")
        ### Get weekly values for ECWMF daily averaged variables
        daily_averaged=xr.load_dataset(f'{filename}_daily',engine="cfgrib",decode_timedelta=True)
        daily_var.append(daily_averaged)
        if int(len(np.atleast_1d(daily_averaged.step.values))/7)>1:
            daily_averaged_week=week_mean(daily_averaged)
            weekly_var.append(daily_averaged_week)
            
    ### combine all chosen parameter into one dataset
    daily_all_vars=xr.merge(daily_var,compat='no_conflicts',join='outer')
    weekly_all_vars=xr.merge(weekly_var,compat='no_conflicts')

    clear_output(wait=True)
    print("🎉 All files opened and Agregated")

    
    return daily_all_vars,weekly_all_vars,ds_inst_acc,temp_data

def day_mean(ds):
    #"calculate daily mean"
    arrr=[]
    for i in range(int(len(ds.step)/4)):
        oneday=ds.isel(step=slice(0+i*4,4*(i+1))).mean(dim='step')
        oneday=oneday.assign_coords(step=ds.isel(step=4*(i+1)).step)
        arrr.append(oneday)
    d_mean=xr.concat(arrr,dim='step')
    for i in ds.data_vars:
        d_mean[i].attrs=ds[i].attrs.copy()
    return d_mean

def acum_to_instant(data):
    #funtion to turn accumulated data into daily/ weekly values 
    diff_data = xr.DataArray(
        data.isel(step=slice(1,None)).tp.values - data.isel(step=slice(0,len(data.step)-1)).tp.values,
        coords={'latitude':data.latitude,'longitude':data.longitude,'step': data.step[1:],'time':data.time,'valid_time':data.valid_time[1:]},  # new step coordinate
        dims=data.dims
    ).clip(min=0)
    diff_data=diff_data.to_dataset(name='tp')
    diff_data.tp.attrs=data.tp.attrs
    return diff_data

def day_mean_6h_accum(temp_data,variable):
    #function to calculate the day maximmum or mimimum of 6 hour temperature variables
    steps_in_1D=len(temp_data.sel(step=slice(None,np.timedelta64(86400000000000,'ns'))).step)
    if 'mx2t6' in temp_data.keys():
        if int(len(np.atleast_1d(temp_data.step.values))/steps_in_1D)>1: 
            arrr=[]
            for i in range(int(len(temp_data.step)/steps_in_1D)):
                day_data=temp_data[variable].isel(step=slice(0+i*steps_in_1D,steps_in_1D*(i+1))).max(dim='step')
                day_data=day_data.assign_coords(step=temp_data.isel(step=slice(0+i*steps_in_1D,steps_in_1D*(i+1))).step.dt.round('D')[-1])
                arrr.append(day_data)
            temp_day_max=xr.concat(arrr,dim='step')
            if len(variable)>1:
                for i in variable:
                    temp_day_max[i].attrs=temp_data[i].attrs.copy()
            else:
                temp_day_max.attrs=temp_data[variable].attrs.copy()
        else:
            raise ValueError(f'⚠️The dataset contains less than 1 day of data⚠️')
        
    if 'mn2t6' in temp_data.keys():
        if int(len(np.atleast_1d(temp_data.step.values))/steps_in_1D)>1: 
            arrr=[]
            for i in range(int(len(temp_data.step)/steps_in_1D)):
                day_data=temp_data[variable].isel(step=slice(0+i*steps_in_1D,steps_in_1D*(i+1))).min(dim='step')
                day_data=day_data.assign_coords(step=temp_data.isel(step=slice(0+i*steps_in_1D,steps_in_1D*(i+1))).step.dt.round('D')[-1])
                arrr.append(day_data)
            temp_day_min=xr.concat(arrr,dim='step')
            if len(variable)>1:
                for i in variable:
                    temp_day_min[i].attrs=temp_data[i].attrs.copy()
            else:
                temp_day_min.attrs=temp_data[variable].attrs.copy()
        else:
            raise ValueError(f'⚠️The dataset contains less than 1 day of data⚠️')
        
    has_max = 'mx2t6' in temp_data
    has_min = 'mn2t6' in temp_data

    if has_max and has_min:
        temp_day = xr.merge([temp_day_max.mx2t6,
                            temp_day_min.mn2t6])
        return temp_day

    elif has_max:
        return temp_day_max.mx2t6.to_dataset()

    elif has_min:
        return temp_day_min.mn2t6.to_dataset()
    
def week_mean(ds):
    #"calculate weekly mean"
    if int(len(np.atleast_1d(ds.step.values))/7)<1:
        raise ValueError(f'⚠️The dataset contains less than 1 week of data⚠️')
    w_mean=ds.isel(step=slice(0,int(len(ds.step)/7)*7)).resample(step='7D').mean()
    new_times = w_mean.step + pd.Timedelta(days=6)
    w_mean = w_mean.assign_coords(step=new_times)
    return w_mean

def lon_convert(ds,cut=True):
    #"Convert from 0-360 to -180-180"
    ds = ds.assign_coords(longitude=((ds.longitude + 180) % 360 - 180))
    # Sort longitudes to maintain order from -180 to 180
    ds = ds.sortby("longitude")
    return ds

def compute_figsize_from_extent(lon_min, lon_max, lat_min, lat_max, base_height_per_row=5):
    #"Scale width of plot according to the lat/lon extent to make it look nice"
    lat_range = lat_max - lat_min
    lon_range = lon_max - lon_min
    aspect = lon_range / lat_range
    height = base_height_per_row
    width =  height/aspect
    return width, height

def diff_ds(ds,weeks):
    #calculate the change in day/week  
    ds_list=[]
    for i in range(weeks-1):
        diff = ds.isel(step=i + 1) - ds.isel(step=i)
        diff = diff.assign_coords(step=ds.step[i])  # Ensure step coordinate is assigned
        
        for var in diff.data_vars:
            if var in ds:
                diff[var].attrs = ds[var].attrs.copy()
        ds_list.append(diff)
    ds_diff=xr.concat(ds_list,dim='step')
    ds_diff.attrs=ds.attrs.copy()
    ds_diff.attrs['GRIB_name']='Weekly Change in Total Precipitation'
    return ds_diff

def get_check_box_value(checkboxes, name):
    #transfer the value of the clicked buttons to request ready string
    arr = [i.description for i in checkboxes if i.value]
    if not arr:
        raise ValueError(f'⚠️Please check at least one of the {name} boxes⚠️')
    elif len(arr) == 1:
        return arr[0]
    else:
        return '/'.join(arr)

def generate_date_range(year, month,day):
    # Function to generate the date range string from the year and month values
    months = ["January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"]
    # Get the month number
    year=int(year)
    month_number = months.index(month) + 1
    day=int(day)
    # Return the date range string
    return f"{year}-{month_number:02d}-{day:02d}"

def edit_base_request(request,param,step,name,ensemble_mean=True):
    #update the base request with the things clicked on the button
    #if you have selected ensemble mean than you can only download control forecast
    request['param']=param
    request['step']=step
    if ensemble_mean==True:
        request['ensembleMean']='true'
        request['type']='cf'
    else:
        request['number']='1/to/100'
        request['type']='pf'
    request['target']=name
    return request
        
def get_ECMWF(gui, name):
#function to download ECMWF forecast based on clicked buttons
    # Find all matching files and don't delete files with a file ending
    files_to_delete = [f for f in os.listdir() if f.startswith(name+'_') and '.' not in f]
    
    if files_to_delete:
        # Ask for confirmation
        print('⚠️File name already exists⚠️')
        answer = input(f"Do you want to delete/overwrite all {len(files_to_delete)} files starting with '{name}'? [y/N]: ").strip().lower()
        
        if answer == 'y':
            for f in files_to_delete:
                try:
                    os.remove(f)
                    print(f"Deleted {f}")
                except PermissionError:
                    print(f"Permission denied: {f}")
                except Exception as e:
                    print(f"Could not delete {f}: {e}")
        else:
            raise ValueError('⚠️ The chosen filename exists already, please chose another filename or overwrite the existing files ⚠️')
    mask = []
    
    # Short codes for corresponding variables
    vars = np.array([
        '165', '166', '121', '122', '134', '228228',
        '167', '59', '34', '228086', '228087', '136'
    ])
    
    # Build boolean mask from GUI state
    selected_variables = gui.get_selected_variables()
    mask = [(var in selected_variables) for var in gui.variable_checkbox]
    
    var_hourly = vars[:6][mask[:6]]     # first 6 = instantaneous/accumulated
    var_daily  = vars[6:][mask[6:]]     # last 6 = daily averaged
    
    if len(vars[mask]) < 1:
        raise ValueError('⚠️ Please choose at least one parameter ⚠️')
    
    # Detect pressure variable and separate it
    surface_pressure = '134' in var_hourly
    chosen_vars_hourly = '/'.join([v for v in var_hourly if v != '134'])
    chosen_vars_daily  = '/'.join(var_daily)
    
    # Get forecast step ranges from GUI
    selected_ranges = gui.get_forecast_steps()
    
    # Convert '0-24', '24-48', etc. to integer boundaries
    arr = np.array([item.split('-') for item in selected_ranges]).astype(int).flatten()
    
    step_array = np.unique(
        np.concatenate([
            np.arange(arr[i*2], arr[i*2+1] + 1, 6)
            for i in range(len(arr)//2)
        ])
    )
    
    steps_hourly = '/'.join(map(str, step_array))
    div_by_24 = step_array[step_array % 24 == 0]
    steps_div_by_24 = '/'.join(map(str, div_by_24))
    
    # Read date from GUI
    date = generate_date_range(
        gui.get_year(),
        gui.get_month(),
        gui.get_day()
    )
    
    server = ECMWFDataServer()
    
    base_request = {
        "class": "s2",
        "dataset": "s2s",
        "date": date,
        "expver": "prod",
        "levtype": "sfc",
        "model": "glob",
        "area": f"{lat1}/{lon1}/{lat2}/{lon2}",
        "origin": "ecmf",
        "stream": "enfo",
        "time": "00:00:00",
    }
    #make seperate downloads for the variables that cannot be downloaded with the same request
    # ---------- HOURLY VARIABLES ----------
    if len(chosen_vars_hourly) > 0:
        print("⏳ Downloading instantaneous and accumulated variables")
        time.sleep(1)
    
        # Handle special temperature logic
        global temp_flag
        temp_flag = False
    
        if 0 in step_array:
            items = chosen_vars_hourly.split('/')
            #check if 6 hourly temperature data is chosen
            if any(v in ["121", "122"] for v in items):
                temp_flag = True
    
                step_except_zero = step_array[step_array != 0]
                steps_hourly_temp = '/'.join(map(str, step_except_zero))
    
                not_temp = pd.Series(items)[~pd.Series(items).isin(['121', '122'])].to_list()
                temp = pd.Series(items)[pd.Series(items).isin(['121', '122'])].to_list()
    
                chosen_vars_hourly = '/'.join(not_temp)
                chosen_vars_hourly_temp = '/'.join(temp)

            #make the request and download the temperature data
                req = edit_base_request(
                    base_request,
                    chosen_vars_hourly_temp,
                    steps_hourly_temp,
                    f"{name}_6hourly_temperature",
                    ensemble_mean=gui.ensemble_checkbox.value
                )
                server.retrieve(req)


        req = edit_base_request(
            base_request,
            chosen_vars_hourly,
            steps_hourly,
            f"{name}_hourly",
            ensemble_mean=gui.ensemble_checkbox.value
        )
        server.retrieve(req)
        clear_output(wait=True)
        print("✅ Download of hourly variables complete")
    
    # ---------- DAILY VARIABLES ----------
    if len(var_daily) > 0:
        print("⏳ Downloading daily-averaged variables")
        time.sleep(1)
    
        req = edit_base_request(
            base_request,
            chosen_vars_daily,
            selected_ranges,
            f"{name}_daily",
            ensemble_mean=gui.ensemble_checkbox.value
        )
        server.retrieve(req)
        clear_output(wait=True)
        print("✅ Download of daily variables complete")
    
    # ---------- SURFACE PRESSURE ----------
    if surface_pressure:
        print("⏳ Downloading mean sea level pressure")
        time.sleep(1)
    
        req = edit_base_request(
            base_request,
            '151',
            steps_div_by_24,
            f"{name}_pressure",
            ensemble_mean=gui.ensemble_checkbox.value
        )
        server.retrieve(req)
        clear_output(wait=True)
        print("✅ Download of mean sea level pressure complete")
    
    time.sleep(1)
    clear_output(wait=True)
    print("🎉 All requested data has been downloaded")

def convert_to_celcius(ds,var,reverse=False):
    #change units from kelvin to degree celcius
    units=ds[var].attrs.copy()
    units['units']='°C'
    celcius_ds=(ds[var]-273.15).to_dataset()
    celcius_ds[var].attrs=units
 
    return celcius_ds
    
def ensemble_mean(ds,dim='number'):
    ens_mean=ds.mean(dim='number')
    ens_mean.attrs=ds.attrs.copy()
    #keep atributes, because they are needed for plotting
    if isinstance(ds, xr.Dataset):
        for var in ens_mean.data_vars:
                if var in ds:
                    ens_mean[var].attrs = ds[var].attrs.copy()
    return ens_mean

def open_mclimate(daily_all_vars,folder_path=f'{os.getcwd()}/m-climate/',var="T_pr"):

    folder_path=f"{folder_path}/{var}/"
    # List all files
    files = os.listdir(folder_path)
    
    # Define a regex pattern to extract dates (assuming 'yiping_cd_YYYY-MM-DD.nc' format)
    pattern = re.compile(r"m-climate_(\d{4})-(\d{2})-(\d{2})\.nc")
    
    # Extract month and day, ignoring year
    file_dates = []
    file_list = []
    
    for file in files:
        match = pattern.search(file)
        if match:
            month, day = int(match.group(2)), int(match.group(3))
            # Normalize all dates to the year 2000
            date_obj = datetime(2000, month, day)
            file_dates.append(date_obj)
            file_list.append(file)  # Keep track of valid files
    
    # Convert file_dates to NumPy datetime64 for easier comparison
    file_dates_np = np.array(file_dates, dtype="datetime64")
    
    # Specify the target date (only considering month and day)
    target_date = daily_all_vars.time.values # Example target date
    target_date_md = datetime(2000, target_date.astype("M8[D]").astype(object).month, target_date.astype("M8[D]").astype(object).day)
    
    # Find the index of the closest date
    closest_index = np.argmin(np.abs(file_dates_np - np.datetime64(target_date_md)))
    
    # Get the closest file
    closest_file = file_list[closest_index]

    print(f"Model climatology starting on: {closest_file[10:20]}")
    
    #open climatology
    file= closest_file
    m_climate = xr.open_dataset(folder_path+file, engine="netcdf4",decode_timedelta=True)
    
    return m_climate.sortby('latitude',ascending=False)

def list_github_folder(var,repo="alecjong-lab/ECMWF-S2S4AFRICA"):
    url = f"https://api.github.com/repos/{repo}/contents/m-climate/{var}"
    response = requests.get(url)
    files = [item["name"] for item in response.json()]
    return files

def open_mclimate_colab(daily_all_vars,folder_path=f'{os.getcwd()}/m-climate/',var="T_pr"):

    # List all files
    files = list_github_folder(var)
    
    # Define a regex pattern to extract dates (assuming 'yiping_cd_YYYY-MM-DD.nc' format)
    pattern = re.compile(r"m-climate_(\d{4})-(\d{2})-(\d{2})\.nc")
    
    # Extract month and day, ignoring year
    file_dates = []
    file_list = []
    
    for file in files:
        match = pattern.search(file)
        if match:
            month, day = int(match.group(2)), int(match.group(3))
            # Normalize all dates to the year 2000
            date_obj = datetime(2000, month, day)
            file_dates.append(date_obj)
            file_list.append(file)  # Keep track of valid files
    
    # Convert file_dates to NumPy datetime64 for easier comparison
    file_dates_np = np.array(file_dates, dtype="datetime64")
    
    # Specify the target date (only considering month and day)
    target_date = daily_all_vars.time.values # Example target date
    target_date_md = datetime(2000, target_date.astype("M8[D]").astype(object).month, target_date.astype("M8[D]").astype(object).day)
    
    # Find the index of the closest date
    closest_index = np.argmin(np.abs(file_dates_np - np.datetime64(target_date_md)))
    
    # Get the closest file
    closest_file = file_list[closest_index]
    
    os.makedirs(folder_path,exist_ok=True)
    url = f"https://raw.githubusercontent.com/alecjong-lab/ECMWF-S2S4AFRICA/main/m-climate/{var}/{closest_file}"

    if not os.path.exists(f"{folder_path}/{closest_file}"):
        subprocess.run(["wget", "-q", url, "-O", f"{folder_path}/{closest_file}"])
    print(f"Model climatology starting on: {closest_file[10:20]}")
    
    #open climatology
    m_climate = xr.open_dataset(f"{folder_path}/{closest_file}", engine="netcdf4",decode_timedelta=True)
    
    return m_climate.sortby('latitude',ascending=False)

# Wind direction name-to-angle mapping
DIRECTION_NAMES = ("N","NNE","NE","ENE"
                   ,"E","ESE","SE","SSE"
                   ,"S","SSW","SW","WSW"
                   ,"W","WNW","NW","NNW")

DIRECTION_ANGLES = np.arange(0, 2*np.pi, 2*np.pi/16)
NAME2ANGLE = dict(zip(DIRECTION_NAMES, DIRECTION_ANGLES))

def windrose_histogram(wspd, wdir, speed_bins=12, normed=False, norm_axis=None):
    """
    Compute a windrose histogram given wind speed and direction data.
    
    wspd: array of wind speeds
    wdir: array of wind directions
    speed_bins: Integer or Sequence, defines the bin edges for the wind speed (default is 12 equally spaced bins)
    normed: Boolean, optional, whether to normalize the histogram values. (default is False)
    norm_axis: Integer, optional, the axis along which the histograms are normalized (default is None) 
    """

    # If speed_bins is an integer, we create linearly spaced bins from 0 to max speed
    if isinstance(speed_bins, int):
        speed_bins = np.linspace(0, wspd.max(), speed_bins)

    num_spd = len(speed_bins)
    num_angle = 16

    # Shift wind directions by 11.25 degrees (one sector) to ensure proper alignment
    wdir_shifted = (wdir + 11.25) % 360

    angle_bins = np.linspace(0, 360, num_angle + 1)

    # Generate a 2D histogram using the defined speeds bins and shifted wind directions
    hist, *_ = np.histogram2d(wspd, wdir_shifted, bins=(speed_bins, angle_bins))

    # Normalize if required
    if normed:
        hist /= hist.sum(axis=norm_axis, keepdims=True)
        hist *= 100

    return hist, angle_bins, speed_bins
    
def make_wind_df(ds, lon, lat, start_date, end_date,normed=False, norm_axis=None, num_partitions=20, max_speed=None):
    """
    Converts xarray dataset to a DataFrame for windrose plotting for a specific week.

    Parameters:
        ds : xarray.Dataset
            Dataset containing 'u' and 'v' wind components.
        lon : float
            Longitude of the location.
        lat : float
            Latitude of the location.
        start_date : str
            Start date for the week (in 'YYYY-MM-DD' format).
        end_date : str
            End date for the week (in 'YYYY-MM-DD' format).
        num_partitions : int, optional
            Number of partitions for wind speed (default: 4).
        max_speed : float, optional
            Maximum wind speed (default: 4 m/s).

    Returns:
        pd.DataFrame with 'direction', 'strength', 'frequency' columns.
    """
    # Select nearest grid point
    u = ds['u10'].sel(longitude=lon, latitude=lat, method="nearest")
    v = ds['v10'].sel(longitude=lon, latitude=lat, method="nearest")
    
    # Select the data for the entire dataset (not just the week)
    u_full = ds['u10'].sel(longitude=lon, latitude=lat,method="nearest")
    v_full = ds['v10'].sel(longitude=lon, latitude=lat,method="nearest")
    
    # Compute wind speed for the entire dataset
    wind_speed_full = np.sqrt(u_full**2 + v_full**2)
    
    # Get the maximum wind speed for the entire dataset (for consistent binning)
    max_speed_full = wind_speed_full.max().values
    
    # Select the data for the specified week (using valid_time slice)
    week_data = u.sel(valid_time=slice(start_date, end_date))
    v_week_data = v.sel(valid_time=slice(start_date, end_date))
    
    # Compute wind speed and direction for the selected week
    wind_speed = np.sqrt(week_data**2 + v_week_data**2)
    wind_direction=(np.arctan2(v_week_data, week_data) * 180  / np.pi) % 360 
    wind_direction=np.degrees(np.arctan2(week_data, v_week_data))+180 % 360
    
    # Convert to Pandas DataFrame
    data_df = pd.DataFrame({
        'SPD': wind_speed.values.flatten(),
        'DIR': wind_direction.values.flatten()
    })
    
    wspd = data_df['SPD'].values
    wdir = data_df['DIR'].values
    
    # Define wind speed bins based on the entire dataset
    if max_speed is None:
        speed_bins = np.linspace(0, max_speed_full, num_partitions + 1)
    else:
        speed_bins = np.append(np.linspace(0, max_speed, num_partitions + 1), np.inf)
    
    # Compute histogram
    h, *_ = windrose_histogram(wspd, wdir, speed_bins, normed=normed, norm_axis=norm_axis)
    
    # Convert histogram data to DataFrame
    wind_df = pd.DataFrame(data=h, columns=DIRECTION_NAMES)
    
    # Generate readable labels for speed bins
    speed_bin_names = [f'{start:g}-{end:g}' if end < np.inf else f'>{start:g}' 
                       for start, end in zip(speed_bins[:-1], speed_bins[1:])]
    
    wind_df['strength'] = speed_bin_names
    wind_df = wind_df.melt(id_vars=['strength'], var_name='direction', value_name='frequency')
    
    return wind_df

def matplotlib_windrose(ds, lon, lat, start_date, end_date, fig,axis,i,num_partitions=4):
    """
    Creates a windrose plot for a specific week using Matplotlib.

    Parameters:
        ds : xarray.Dataset
            Dataset containing 'u' and 'v' wind components.
        lon : float
            Longitude of the location.
        lat : float
            Latitude of the location.
        start_date : str
            Start date for the week (in 'YYYY-MM-DD' format).
        end_date : str
            End date for the week (in 'YYYY-MM-DD' format).
        num_partitions : int, optional
            Number of partitions for wind speed.
        max_speed : float, optional
            Maximum wind speed for binning.

    Returns:
        fig : Matplotlib figure with windrose plot.
    """

    # Get wind data for the specific week
    wind_df2 = make_wind_df(ds, lon, lat, start_date, end_date, num_partitions=num_partitions)

    # Convert direction names to angles
    wind_df2['angle'] = wind_df2.direction.map(NAME2ANGLE)

    # Sort by strength start value
    wind_df2 = wind_df2.assign(strength_start=[float(x.split('-')[0]) for x in wind_df2.strength.values])
    wind_df2 = wind_df2.sort_values(by='strength_start')
    # Compute cumulative frequency for stacking
    wind_df2['cumulative_frequency'] = wind_df2.groupby('direction')['frequency'].cumsum()
    with plt.style.context('seaborn-v0_8-notebook'):
        #fig, axis = plt.subplots(figsize=(8, 8), subplot_kw=dict(projection="polar"))

        # Grid color
        axis.grid(color='k')

        # Assign colors based on strength
        colours = plt.cm.jet(np.linspace(0, 1, wind_df2.strength.nunique()))

        # Plot stacked bars
        strength_splits = wind_df2.groupby('strength')
        total=0
        for clr, strength in list(zip(colours, wind_df2.strength.unique()))[::-1]:
            split = strength_splits.get_group(strength)
            # print(split['cumulative_frequency'].values)
            total+=np.sum(split['cumulative_frequency'].values)
            axis.bar((split['angle'].values), 
                     split['cumulative_frequency'].values, 
                     color=clr, 
                     label=strength, 
                     width=np.deg2rad(19), 
                     edgecolor='black',
                     linewidth=0.5,
                     zorder=2)

        # # Set wind direction labels
        axis.set_xticks(DIRECTION_ANGLES)
        axis.set_xticklabels(DIRECTION_NAMES)

        x=[1.2,1,0.92,0.89,0.45,0.55]
        y=[0.5,0.5,0.5,0.5,0.3,0.3]
        handles, labels = axis.get_legend_handles_labels()
        global legend_count  # tell Python to use the global one
        fig.subplots_adjust(right=0.8) 
        if legend_count<1:
            fig.legend(
               handles[::-1], 
                ('-'.join([f"{round(float(k), 2)}" for k in j.split('-')]) for j in labels[::-1]),
               # loc='lower right', 
               # bbox_to_anchor=(0.6+num_partitions/115, 0.15),ncol=np.ceil(num_partitions / 10),
                loc="center",
                bbox_to_anchor=(x[i], y[i]),
                ncol=min(num_partitions, 2),
                title='Wind speed [m/s]'
            );
            legend_count+=1

        # Set windrose title
        axis.set_theta_zero_location('N')
        axis.set_theta_direction(-1)
        axis.set_title(f'{start_date} to {end_date}',pad=23)

        #Set radial tick labels
        axis.set_rlabel_position(135)
        yticks = axis.get_yticks()
        ytick_labels = [f"{round(i/total*100, 2)}%" for i in yticks]
        axis.set_yticks(yticks)
        axis.set_yticklabels(ytick_labels)
        fig.suptitle(f'windrose for latitude:{ds.sel(longitude=lon, latitude=lat, method="nearest").latitude.values}, longitude:{ds.sel(longitude=lon, latitude=lat, method="nearest").longitude.values}',y=1.01)

def make_windroses(ensemble_mean,lat,lon,num_partitions,num_steps):  
    ncols = min(4, num_steps)  # Maximum 4 columns
    nrows = int(np.ceil(num_steps / ncols))  # Compute needed rows
    fig, axes = plt.subplots(nrows, ncols, figsize=(5.5 * ncols, 5 * nrows),subplot_kw=dict(projection="polar"))
    axes = np.array(axes).reshape(nrows, ncols)  # Ensure axes is 2D
    axes = axes.flatten()
    global legend_count
    legend_count=0

    for i in range(num_steps):
        matplotlib_windrose(ensemble_mean.swap_dims({"step": "valid_time"}), lon=lon, lat=lat, start_date=str(ensemble_mean.time.values+ np.timedelta64(i*7, 'D'))[:10], end_date=str(ensemble_mean.time.values+ np.timedelta64(7*(i+1), 'D'))[:10],fig=fig,axis=axes[i],i=num_steps-1, num_partitions=num_partitions)
            
    for j in range(num_steps, len(axes)):
        axes[j].set_visible(False)  # or axes[j].remove() for Matplotlib >= 3.4

cities = {
}

def plot_variable(ds,variable,forecast_timestep,vmax,vmin,cmap,cities=cities,ax='None',add_contour=None,contourlevels=None,contourcmap=None,contourwidths=None,fontsize=16,norm=None):
    '''
    function to plot a variable from the ECMWF forecast with the option of adding another variable as contour

    inputs:
    ds: dataset to plot from
    variable: which variable to plot
    forecast_timestep: which forecast timesteps to plot

    '''
    lines=None
    
    #get start and end time
    if forecast_timestep == np.atleast_1d(ds.step)[0]:
        start_time=ds.time
        end_time=(ds.time+forecast_timestep)
    else:
        dt=ds.step[1]-ds.step[0]
        start_time=ds.time+forecast_timestep-dt
        end_time=ds.time+forecast_timestep

    ax.set_title(f"{str(start_time.values)[:16]} until {str(end_time.values)[:16]}", fontsize=int(fontsize*0.8))
        
    ds = ds.sel(step=forecast_timestep)

    #plot
    contour = ax.pcolormesh(ds.longitude, ds.latitude, ds[variable], cmap=cmap,vmax=vmax,vmin=vmin,norm=norm) 

    if isinstance(add_contour, (xr.DataArray, xr.Dataset)):
        add_contour=lon_convert(add_contour)
        add_contour=add_contour.sel(longitude=slice(lon1, lon2), latitude=slice(lat1, lat2))
        if len(np.atleast_1d(add_contour['step'].values))>1:
            contour_sel = add_contour.sel(step=forecast_timestep)
        if isinstance(contourlevels, (np.ndarray, list)):
            levels=np.linspace(np.nanmin(add_contour),np.nanmax(add_contour),5)
        if contourwidths==None:
            widths=2
        elif type(contourlevels)==int:
            levels=np.linspace(np.nanmin(add_contour),np.nanmax(add_contour),contourlevels)
        #make the option to have a one digit color code instead of colormap (contourcmap='k',for all black contours)
        if len(contourcmap)>1:
            lines=ax.contour(add_contour.longitude, add_contour.latitude, contour_sel, levels=contourlevels,cmap=contourcmap,linewidths=widths)
        else:
            lines=ax.contour(add_contour.longitude, add_contour.latitude, contour_sel, levels=contourlevels,colors=contourcmap,linewidths=widths)
    #focus on target area
    ax.set_extent([lon1, lon2, lat2, lat1], crs=ccrs.PlateCarree())
    
    # Add natural features for context (e.g., coastlines, borders)
    ax.add_feature(cfeature.COASTLINE, edgecolor='black')
    ax.add_feature(cfeature.BORDERS, linestyle=':',alpha=0.7)
    
    gl = ax.gridlines(draw_labels=True,alpha=0)
    gl.top_labels = False
    gl.right_labels = False
    
    # Add axis labels
    ax.set_xlabel('Longitude')
    ax.set_ylabel('Latitude')
    
    for city, (lat, lon) in cities.items():
        ax.plot(lon, lat, marker='o', color='k', markersize=6, transform=ccrs.PlateCarree())
        ax.text(lon-2.0, lat+0.5, city, fontsize=10, transform=ccrs.PlateCarree())
             
    return contour,lines

def panel_plot_variable(ds,variable,forecast_timestep,cmap,cities=cities,vmax=None,vmin=None,units=None,change=False,add_contour=None,contourlevels=None,contourcmap=None,contourwidths=None,fontsize=16,level=None,norm=None):
    ds=ds.sel(longitude=slice(lon1,lon2),latitude=slice(lat1,lat2))

    if any(t == 0 for t in [len(ds.longitude),len(ds.latitude)]):
        return None

    if level is not None:
        ds = ds.sel(level=level)
    #take ensemble mean before plotting if needed
    if 'number' in ds.dims:
        ds=ensemble_mean(ds)
        if isinstance(add_contour, (xr.DataArray, xr.Dataset)):
            add_contour=ensemble_mean(add_contour)
        
    ds=lon_convert(ds)

    #if only a single step is selected, make sure rest of code still works
    if 'step' not in ds.dims and 'step' in ds.coords:
        ds = ds.expand_dims(step=[ds.step.values])
        
    #plot the change in a variable
    if change==True:
        ds=diff_ds(ds.sel(step=forecast_timestep),len(forecast_timestep))
        # if len(np.atleast_1d(forecast_timestep))>5:
        forecast_timestep=ds.step.values
        units=str(ds[variable].units)+'/week'
    
    #define vmax and vmin to ensure plots have same color scale
    if units==None:
            units=ds[variable].units
    if norm==None:
        if vmax==None:
            vmax=np.nanmax(ds[variable].sel(step=forecast_timestep).values)
        if vmin==None:
            vmin=np.nanmin(ds[variable].sel(step=forecast_timestep).values)
        if vmax>0 and vmin<0:
            ranges=[np.abs(vmax),np.abs(vmin)]
            limit_index=np.argmax(ranges)
            vmax=ranges[limit_index]
            vmin=-ranges[limit_index]
    else:
        vmax=None
        vmin=None
            
    #logic to check if there is only one forcast step or if there are more
    steps = np.atleast_1d(forecast_timestep)  # Converts single value to an array
    #logic to check how many columns should be made
    num_steps = len(steps)
    ncols = min(4, num_steps)  # Maximum 4 columns
    nrows = int(np.ceil(num_steps / ncols))  # Compute needed rows
    #logic to determine aspect ratio of chosen lat lon box and then adjust figsize accordingly
    lat_min, lat_max = lon1, lon2
    lon_min, lon_max = lat2, lat1

    #calculate the figure size so that the chosen lat lon area does not change the look of the plot
    single_width, single_height = compute_figsize_from_extent(
        lon_min, lon_max, lat_min, lat_max
    )

    fig_width = single_width * ncols 
    fig_height = single_height * nrows
    fig, axes = plt.subplots(nrows, ncols, figsize=(fig_width, fig_height),sharex=True,sharey=True,subplot_kw={'projection': ccrs.PlateCarree()})
    axes = np.array(axes).reshape(nrows, ncols)  # Ensure axes is 2D
    axes = axes.flatten()  # Flatten for easy iteration
    
    for i, s in enumerate(np.atleast_1d(forecast_timestep)):
        ax = axes[i]
        contour,lines=plot_variable(ds,variable,s,vmax,vmin,cities=cities,cmap=cmap,ax=ax,add_contour=add_contour,contourlevels=contourlevels,contourcmap=contourcmap,contourwidths=contourwidths,fontsize=fontsize,norm=norm)
    for j in range(num_steps, len(axes)):
        axes[j].set_visible(False) #delete extra empty plots
    fig.tight_layout() 
    cbar_ax = fig.add_axes([0.15, -0.04 , 0.7, 0.01+ 0.02/nrows])  # [left, bottom, width, height]
    cbar = fig.colorbar(contour, cax=cbar_ax, orientation='horizontal',fraction=5)
    cbar.set_label(ds[variable].GRIB_name+f' [{units}]')

    #manage the location of the colorbar
    if lines!=None:
        pos = cbar.ax.get_position()  # Bbox in figure coordinates
        # Shift down by some fraction of the height
        height = pos.height * 0.8   # make second cbar smaller
        gap    = 4 * pos.height  # gap between label and second bar

        new_pos = [
            pos.x0,
            pos.y0 - height - gap,
            pos.width,
            height
        ]
        
        cax2 = fig.add_axes(new_pos)
        cbar2 = fig.colorbar(lines, cax=cax2, orientation='horizontal')
        cbar2.set_label(add_contour.attrs['GRIB_name']+f"[{add_contour.attrs['units']}]")
    return fig

def quiver_plot_variable(ds,name_u,name_v,forecast_timestep,cmap='virdis',level=None,fontsize=13,scale=40):
    ds=ds.sel(longitude=slice(lon1,lon2),latitude=slice(lat1,lat2))
    if level is not None:
        ds = ds.sel(level=level)

    # take ensemble mean before plotting if needed
    if 'number' in ds.dims:
        ds=ensemble_mean(ds)
        #if isinstance(add_contour, (xr.DataArray, xr.Dataset)):
        #    add_contour=ensemble_mean(add_contour)
        
    ds=lon_convert(ds)

    #if only a single step is selected, make sure rest of code still works
    if 'step' not in ds.dims and 'step' in ds.coords:
        ds = ds.expand_dims(step=[ds.step.values])
    
    #logic to check if there is only one forcast step or if there are more
    steps = np.atleast_1d(forecast_timestep)  # Converts single value to an array
    #logic to check how many columns should be made
    num_steps = len(steps)
    ncols = min(4, num_steps)  # Maximum 4 columns
    nrows = int(np.ceil(num_steps / ncols))  # Compute needed rows
    #logic to determine aspect ratio of chosen lat lon box and then adjust figsize accordingly
    lat_min, lat_max = lon1, lon2
    lon_min, lon_max = lat2, lat1

    #calculate the figure size so that the chosen lat lon area does not change the look of the plot
    single_width, single_height = compute_figsize_from_extent(
        lon_min, lon_max, lat_min, lat_max
    )

    fig_width = single_width * ncols 
    fig_height = single_height * nrows
    fig, axes = plt.subplots(nrows, ncols, figsize=(fig_width, fig_height),sharex=True,sharey=True,subplot_kw={'projection': ccrs.PlateCarree()})
    axes = np.array(axes).reshape(nrows, ncols)  # Ensure axes is 2D
    axes = axes.flatten()  # Flatten for easy iteration

    speeds=ds.speed
    vmax=speeds.max()
    vmin=speeds.min()

    norm = matplotlib.colors.Normalize(vmin=vmin, vmax=vmax)

    if vmax>0 and vmin<0:
        ranges=[np.abs(vmax),np.abs(vmin)]
        limit_index=np.argmax(ranges)
        vmax=ranges[limit_index]
        vmin=-ranges[limit_index]
            
    for i, step in enumerate(np.atleast_1d(forecast_timestep)):
        ax = axes[i]

        # plotting magic
        if step == np.atleast_1d(ds.step)[0]:
            start_time=ds.time
            end_time=(ds.time+step)
        else:
            dt=ds.step.values[1]-ds.step.values[0]
            start_time=ds.time+step-dt
            end_time=ds.time+step

        ax.set_title(f"{str(start_time.values)[:16]} until {str(end_time.values)[:16]}", fontsize=int(fontsize*0.8))
            
        ds_step = ds.sel(step=step)
        speed = speeds.sel(step=step)

        gl = ax.gridlines(draw_labels=True, linewidth=0.5, color='gray', alpha=0, linestyle='--')
        gl.top_labels = False
        gl.right_labels = False
        ax.coastlines()
        ax.add_feature(cfeature.BORDERS)
        ax.set_extent([lon1, lon2, lat1, lat2], ccrs.PlateCarree())
        q=ax.pcolormesh(ds_step["longitude"], ds_step["latitude"],speed,transform=ccrs.PlateCarree(),cmap=cmap,vmin=vmin,vmax=vmax)
        quiv=ax.quiver(ds_step["longitude"], ds_step["latitude"], ds_step[name_u], ds_step[name_v], transform=ccrs.PlateCarree(), norm=norm,scale=scale,regrid_shape=10)

    #fig.tight_layout() 
    for j in range(num_steps, len(axes)):
        axes[j].set_visible(False) #delete extra empty plots

    last_ax = fig.axes[num_steps-1]  # or whichever subplot you want to align with
    pos = last_ax.get_position()  # returns Bbox in figure coordinates

    # Place ax_key just to the right of it
    pad = 0.01  # gap between subplot and key
    key_width = 0.08

    ax_key = fig.add_axes([
        pos.x1 + pad,           # left edge: just right of last subplot
        pos.y0,                 # bottom: aligned with last subplot
        key_width,              # width
        pos.height * 0.3        # height: fraction of subplot height
    ])

    ax_key.axis("off")

    if scale==40:
        qk  = matplotlib.quiver.QuiverKey(quiv, X=1.15, Y=0.55, U=5,  label='5 m/s',  coordinates='axes', labelpos='E')
        qk2 = matplotlib.quiver.QuiverKey(quiv, X=1.27, Y=0.45, U=10, label='10 m/s', coordinates='axes', labelpos='E')
    else:
        qk  = matplotlib.quiver.QuiverKey(quiv, X=1.40, Y=0.55, U=5,  label='5 m/s',  coordinates='axes', labelpos='E')
        qk2 = matplotlib.quiver.QuiverKey(quiv, X=1.52, Y=0.45, U=10, label='10 m/s', coordinates='axes', labelpos='E')
    ax_key.add_artist(qk)
    ax_key.add_artist(qk2)

    #manage the location of the colorbar
    cbar_ax = fig.add_axes([0.15, 0.05 , 0.7, 0.01+ 0.02/nrows])  # [left, bottom, width, height]
    cbar = fig.colorbar(q, cax=cbar_ax, orientation='horizontal',fraction=10)
    title="Wind speed (m s**1)"
    if 'Anomaly' in ds[name_v].GRIB_name:
        title='Wind speed anomaly (m s**1)'
    cbar.set_label(title)

    return fig

def spagetti_plot(ds,variable,lat,lon):
    data=ds[variable].sel(latitude=lat,longitude=lon,method='nearest')
    time=data.time+data.step
    plt.figure(figsize=(14,8))
    for i,j in enumerate(ds.number):
        plt.plot(time,data.sel(number=j),c='k',alpha=0.2,linewidth=0.9)
    plt.plot(time,data.sel(number=j)*np.nan,c='k',alpha=0.2,linewidth=0.9,label='single ensemble members')
    
    plt.plot(time,data.mean(dim='number'),c='red',linewidth=2,label='ensemble mean')
    plt.ylabel(data.attrs['GRIB_name']+f"[{data.attrs['units']}]")
    plt.xticks(time[::int(len(data.step)/6)],rotation=0) ;
    
    if variable=='tp':
        gpcp=xr.open_dataset("GPCPV3.2_2000-2021_dailyclim.nc").sel(lat=lat,lon=lon,method='nearest')
        gpcp=gpcp.sel(time=pd.to_datetime(ds.valid_time).strftime("2000-%m-%d %H:%M:%S"))
        plt.plot(time,gpcp.precip,label='GPCP climatology',c='navy')

    plt.title(f"Spagetti plot for latitude:{data.latitude.values}, longitude:{data.longitude.values}")
    plt.legend(loc='best', frameon=False)

    plt.tight_layout()
    
def get_exceedance_percentage(ds,variable, threshold, comparison='None', dim="number"):
    """
    Returns the percentage of ensemble members (along `dim`) that meet a given condition.

    Parameters:
    - da: xarray.DataArray with an ensemble member dimension (e.g. "number")
    - threshold: float or DataArray, value to compare against
    - comparison: logical function, e.g., operator.gt, operator.le
    - dim: str, ensemble member dimension (default: "number")

    Returns:
    - xarray.DataArray: percentage (0–100) of members satisfying the condition, per grid cell
    """
    word='to'
    if comparison.lower()=='greater':
        comp=operator.gt
        word='than'
    elif comparison.lower()=='smaller':
        comp=operator.lt
        word='than'
    elif comparison.lower()=='equal':
        comp=operator.eq
    elif comparison.lower()=='not equal':
        comp=operator.ne
    elif comparison.lower()=='greater or equal':
        comp=operator.ge
    elif comparison.lower()=='smaller or equal':
        comp=operator.se
    else:
        raise ValueError('please choose one of these conditions: greater, smaller, equal, not equal, greater/equal, smaller/equal')
    da=ds[variable]
    # Apply the comparison (this creates a boolean array)
    condition_met = comp(da, threshold)
    
    # Convert to percentage
    percentage = condition_met.sum(dim=dim) / da.sizes[dim] * 100
    percentage.attrs={'GRIB_name':f"percentage of ensemble members {comparison} {word} {threshold} {da.attrs['units']}",'units':'%'}

    return percentage.to_dataset()  

def chance_to_exceed_mclimate(ds,quantile,m_climate,var='tp'):
    hold=[]    
    for i,forecast_timestep in enumerate(ds.step.values):
        m_climate_interp = m_climate.isel(time=i).isel(quantile=quantile)
        comparison = ds[var].sel(step=forecast_timestep)>m_climate_interp[var]
        chance=comparison.sum(dim='number')/ ds.sizes['number']*100
        hold.append(chance)
        
    chance_to_exceed=xr.concat(hold,dim='step',coords='different',compat='equals')
    chance_to_exceed.attrs=ds[var].attrs
    chance_to_exceed.attrs['units']='%'
    chance_to_exceed.attrs['GRIB_name']='chance to exceed climatology'
    chance_to_exceed=chance_to_exceed.to_dataset()
    chance_to_exceed=chance_to_exceed.assign_coords(time=ds.time)
    return(chance_to_exceed)

def anomaly_from_mclimate(ds,quantile,m_climate,var='tp'):
    hold=[]
    units=ds[var].attrs['units']
    
    for i,forecast_timestep in enumerate(ds.step.values):
        m_climate_interp = m_climate.isel(time=i).isel(quantile=quantile)
        difference = ensemble_mean(ds[var].sel(step=forecast_timestep))-m_climate_interp[var]
        hold.append(difference)
        
    anom_clim=xr.concat(hold,dim='step',coords='different',compat='equals')
    anom_clim.attrs=ds[var].attrs
    anom_clim.attrs['GRIB_name']='Anomaly from climatology'
    anom_clim.attrs['units']=units

    anom_clim=anom_clim.to_dataset()
    anom_clim=anom_clim.assign_coords(time=ds.time)
    return anom_clim

def tercile_from_mclimate(ds,category_choice,m_climate,var='tp'):
    hold=[]

    for i,forecast_timestep in enumerate(ds.step.values):
        
        lowerbound = m_climate.isel(time=i).isel(quantile=33)[var]
        higherbound = m_climate.isel(time=i).isel(quantile=67)[var]
    
        forecast=ds[var].sel(step=forecast_timestep)
    
        category = xr.full_like(forecast, fill_value=1)  # 1=average by default
        category = xr.where(forecast < lowerbound, 0, category)  # below
        category = xr.where(forecast > higherbound, 2, category)  # above
    
        # stack lat/lon if needed or keep dimensions
        counts = []
        labels = ["below-normal", "near-normal", "above-normal"]
    
        for i, label in enumerate(labels):
            counts.append((category == i).sum(dim="number"))
    
        # Combine counts into a single DataArray with a "category" coordinate
        ensemble_counts = xr.concat(counts, dim="category")
        ensemble_counts = ensemble_counts.assign_coords(category=labels)
    
        hold.append(ensemble_counts)
        
    tercile_clim=xr.concat(hold,dim='step',coords='different',compat='equals')
    tercile_clim=tercile_clim.to_dataset().sel(category=category_choice)
    
    tercile_clim.attrs=ds[var].attrs
    tercile_clim[var].attrs['GRIB_name']=f'chance of being {category_choice}'
    tercile_clim[var].attrs['units']='%'
    tercile_clim=tercile_clim.assign_coords(time=ds.time)
    return tercile_clim

def meteogram_double(ds,m_climate,lat,lon,cityname,var='tp'):
    wh=ds.sel(longitude=lon,latitude=lat,method="nearest")
    data2=m_climate.sel(longitude=lon,latitude=lat,method="nearest")[var].isel(time=slice(0,len(wh.step.values)))
    data = wh[var]
    # Compute ensemble meanSS
    time_steps = np.arange(0,len(wh.step.values))

    # Transpose the data to get a list of arrays for each time step
    data_list = [data.isel(step=i) for i in range(len(time_steps))]  # Each time step has an array
    climate_list= [data2.isel(time=i) for i in range(len(time_steps))]
    
    # Create the figure
    fig, ax = plt.subplots(figsize=(10, 5))
    #create innner boxes forecast
    # # Compute custom percentiles
    def custom_box_stats(values):
        """Returns a dictionary with ECMWF-style boxplot percentiles."""
        return {
            "whislo": np.percentile(values, 0),  # 10th percentile (lower whisker)
            "q1": np.percentile(values, 10),      # 25th percentile (lower quartile)
            "med": np.percentile(values, 50),     # Median
            "q3": np.percentile(values, 90),      # 75th percentile (upper quartile)
            "whishi": np.percentile(values, 100),  # 90th percentile (upper whisker)
            "fliers": []  # No outliers
        }
        # Create boxplot statistics for each time step
    box_stats = [custom_box_stats(data_list[i]) for i in range(len(time_steps))]

    # Custom box plot using ECMWF-style percentiles
    adjusted_positions = np.arange(len(time_steps)) - 0.2
    ax.bxp(box_stats, positions=adjusted_positions, widths=0.2, showfliers=False, patch_artist=True,
           boxprops=dict(facecolor="cyan", alpha=1),  # ECMWF-style color
           medianprops=dict(color="black", linewidth=1.5),  # Median line
           whiskerprops=dict(color="black", linewidth=1),  # Whiskers
           capprops=dict(color="gray", linewidth=1,alpha=0))  # Caps

    #create innner boxes climate

    box_stats = [custom_box_stats(climate_list[i]) for i in range(len(time_steps))]

    # Custom box plot using ECMWF-style percentiles
    adjusted_positions = np.arange(len(time_steps)) + 0.2
    ax.bxp(box_stats, positions=adjusted_positions, widths=0.2, showfliers=False, patch_artist=True,
           boxprops=dict(facecolor="red", alpha=1),  # ECMWF-style color
           medianprops=dict(color="black", linewidth=1.5),  # Median line
           whiskerprops=dict(color="black", linewidth=1),  # Whiskers
           capprops=dict(color="gray", linewidth=1,alpha=0))  # Caps
    
    #create outer boxes forecast

    # Compute custom percentiles
    def custom_box_stats(values):
        """Returns a dictionary with ECMWF-style boxplot percentiles."""
        return {
            "whislo": np.percentile(values, 25),  # 10th percentile (lower whisker)
            "q1": np.percentile(values, 25),      # 25th percentile (lower quartile)
            "med": np.percentile(values, 50),     # Median
            "q3": np.percentile(values, 75),      # 75th percentile (upper quartile)
            "whishi": np.percentile(values, 75),  # 90th percentile (upper whisker)
            "fliers": []  # No outliers
        }
    
    # Create boxplot statistics for each time step
    box_stats = [custom_box_stats(data_list[i]) for i in range(len(time_steps))]


    adjusted_positions = np.arange(len(time_steps)) - 0.2
    #Custom box plot using ECMWF-style percentiles
    ax.bxp(box_stats, positions=adjusted_positions, widths=0.4, showfliers=False, patch_artist=True,
           boxprops=dict(facecolor="cyan", alpha=1),  # ECMWF-style color
           medianprops=dict(color="black", linewidth=1.5),  # Median line
           whiskerprops=dict(color="gray", linewidth=2),  # Whiskers
           capprops=dict(color="black", linewidth=1),label='forecast')

    #create outer boxes climate

    box_stats = [custom_box_stats(climate_list[i]) for i in range(len(time_steps))]

    adjusted_positions = np.arange(len(time_steps)) + 0.2
    #Custom box plot using ECMWF-style percentiles
    ax.bxp(box_stats, positions=adjusted_positions, widths=0.4, showfliers=False, patch_artist=True,
           boxprops=dict(facecolor="red", alpha=1),  # ECMWF-style color
           medianprops=dict(color="black", linewidth=1.5),  # Median line
           whiskerprops=dict(color="gray", linewidth=2),  # Whiskers
           capprops=dict(color="black", linewidth=1),label='climatology')

    #plot climatology as shading
    climate=m_climate.sel(longitude=lon,latitude=lat,method="nearest")[var]
    climate=climate.isel(time=slice(0,len(wh.step.values)))
    plt.fill_between(time_steps, climate.isel(quantile=10), climate.isel(quantile=25), color='gray', alpha=0.3)  # 10th to 25th
    plt.fill_between(time_steps, climate.isel(quantile=50), climate.isel(quantile=75), color='gray', alpha=0.5)  # 25th to 50th
    plt.fill_between(time_steps, climate.isel(quantile=25), climate.isel(quantile=50), color='gray', alpha=0.5)  # 25th to 50th
    plt.fill_between(time_steps, climate.isel(quantile=75), climate.isel(quantile=90), color='gray', alpha=0.3)  # 75th to 90th
    
    # Customize
    ax.set_xticks(time_steps)
    ax.set_xticklabels([f"T+{t+1} week" for t in time_steps])
    ax.set_xlabel("Forecast Time Step")
    ax.set_ylabel(ds[var].GRIB_name+f' ({ds[var].units})')
    ax.set_title(f"Meteogram for gridcell closest to {cityname} (lat:{m_climate.sel(longitude=lon,latitude=lat,method='nearest')[var].isel(time=slice(0,len(wh.step.values))).latitude.values} lon: {m_climate.sel(longitude=lon,latitude=lat,method='nearest')[var].isel(time=slice(0,len(wh.step.values))).longitude.values})");
    ax.grid(True, linestyle="--", alpha=0.6)
    ax.legend()
    return ax

def ensemble_data(ds_to_plot,m_climate,var,quantiles=[75,50,25]):
    ds_to_plot, m_climate = xr.align(ds_to_plot, m_climate, join="inner")
    chances_to_exceed=[]
    anom_clims=[]
    tercile_clims=[]
    for quantile in quantiles:
        chances_to_exceed.append(chance_to_exceed_mclimate(ds_to_plot,quantile=quantile,m_climate=m_climate,var=var).assign_coords({'quantile':quantile}))          
        anom_clims.append(anomaly_from_mclimate(ds_to_plot,quantile=quantile,m_climate=m_climate,var=var).assign_coords({'quantile':quantile}))
    
    tercil_cats=['below-normal','above-normal']
    
    for cat in tercil_cats:
        tercile_clims.append(tercile_from_mclimate(ds_to_plot,category_choice=cat,m_climate=m_climate,var=var).assign_coords({'cat':cat})) 
    # return chances_to_exceed,anom_clims,tercile_clims

    return xr.concat(chances_to_exceed,dim='quantile',coords='different',compat='equals'),xr.concat(anom_clims,dim='quantile',coords='different',compat='equals'),xr.concat(tercile_clims,dim='cat',coords='different',compat='equals')

bounds = [0,1, 10, 25, 45,55, 75, 90,99, 100]
colors = [
    'purple',  # 0%   — deep blue (very unlikely to exceed)
    '#08306b',  # 0%   — deep blue (very unlikely to exceed)
    '#2171b5',  # 10%  — medium blue
    '#6baed6',  # 25%  — light blue
    'lightgreen',  # 50%  — neutral yellow (50/50)
    'yellow',
    '#fd8d3c',  # 75%  — light orange
    '#d7301f',  # 90%  — medium red
    '#7f0000',  # 100% — deep red (certain exceedance)
]

anom_cmap = mcolors.ListedColormap(colors)
norm = mcolors.BoundaryNorm(bounds, anom_cmap.N)

def ensemble_plots(ds_to_plot,m_climate,chances_to_exceed,anom_clims,tercile_clims,var,save_path,country,fontsize,major_cities,quantiles=[75,50,25]):
    os.makedirs(save_path, exist_ok=True)

    for quantile in quantiles:
        chance_to_exceed=chances_to_exceed.sel(quantile=quantile).sel(longitude=slice(lon1, lon2),latitude=slice(lat1,lat2))

        if any(t == 0 for t in [len(chance_to_exceed.longitude),len(chance_to_exceed.latitude)]):
            return None
    
        fig=panel_plot_variable(chance_to_exceed,var,chance_to_exceed.step.values,fontsize=fontsize,cmap=anom_cmap,norm=norm)
        plt.savefig(f'{save_path}/{quantile}th_percentile_exedance.png',bbox_inches='tight')
        plt.close()

        if 'temperature' in ds_to_plot[var].long_name and 'dew' not in ds_to_plot[var].long_name:
            cmap='RdBu_r'
        else:
            cmap='RdBu'
            
        anom_clim=anom_clims.sel(quantile=quantile).sel(longitude=slice(lon1, lon2),latitude=slice(lat1,lat2))

        if float(anom_clim[var].min().values)>0:
            vmin=-float(anom_clim[var].max().values)
        else:
            vmin=None
        if float(anom_clim[var].max().values)<0:
            vmax=-float(anom_clim[var].min().values)
        else:
            vmax=None
            
        panel_plot_variable(anom_clim,var,anom_clim.step.values,cmap=cmap,fontsize=fontsize,vmax=vmax,vmin=vmin)
        plt.savefig(f'{save_path}/anomaly_from_{quantile}th.png',bbox_inches='tight')
        plt.close()

    tercile_clims=tercile_clims.sel(longitude=slice(lon1, lon2),latitude=slice(lat1,lat2))
    Below_or_above=tercile_clims.sel(cat='above-normal')-tercile_clims.sel(cat='below-normal')
    Below_or_above[var].attrs={'GRIB_name': '       <---Below normal   or  Above normal--->', 'units': '%'}
    fig=panel_plot_variable(Below_or_above,var,Below_or_above.step.values,cmap='BrBG',fontsize=13,vmax=100,vmin=-100)
    plt.savefig(f'{save_path}/chance_of_above_or_below.png',bbox_inches='tight')
    plt.close()
    
    for i in range(2):
        latf,lonf=major_cities[country][i][0],major_cities[country][i][1]
        meteogram_double(ds_to_plot,m_climate,lat=latf,lon=lonf,var=var,cityname=major_cities[country][2][i])
        plt.savefig(f'{save_path}/meteogram_{major_cities[country][2][i]}.png',bbox_inches='tight')
        plt.close()

    return fig

def ensemble_plots_quiver(ds_to_plot,m_climate,var,u_name,v_name,save_path,country,fontsize,major_cities,quantiles=[75,50,25]):
    os.makedirs(save_path, exist_ok=True)
    for quantile in quantiles:
        chance_to_exceed=chance_to_exceed_mclimate(ds_to_plot,quantile=quantile,m_climate=m_climate,var=var)
        panel_plot_variable(chance_to_exceed,var,chance_to_exceed.step.values,cmap=anom_cmap,norm=norm,fontsize=fontsize)
        plt.savefig(f'{save_path}/{quantile}th_percentile_exedance_{var}.png',bbox_inches='tight')
        plt.close()

        hold=[]
        for wind in [u_name,v_name,'speed']:
            hold.append(anomaly_from_mclimate(ds_to_plot,quantile=quantile,m_climate=m_climate,var=wind))
        hold[-1]=hold[-1]*np.nan
        anom=xr.merge(hold)
        
        fig=quiver_plot_variable(anom,u_name,v_name,ds_to_plot["step"],cmap='PiYG',scale=20,fontsize=fontsize)
        plt.savefig(f'{save_path}/anomaly_from_{quantile}th.png',bbox_inches='tight')
        plt.close()

    tercil_cats=['near-normal','below-normal','above-normal']
    
    for cat in tercil_cats:
        tercile_clim=tercile_from_mclimate(ds_to_plot,category_choice=cat,m_climate=m_climate,var=var)
        panel_plot_variable(tercile_clim,var,tercile_clim.step.values,cmap='rainbow',fontsize=fontsize)
        plt.savefig(f'{save_path}/chance_of_{cat}_{var}.png',bbox_inches='tight')
        plt.close()
    
    for i in range(2):
        latf,lonf=major_cities[country][i][0],major_cities[country][i][1]
        meteogram_double(ds_to_plot,m_climate,lat=latf,lon=lonf,var=var,cityname=major_cities[country][2][i])
        plt.savefig(f'{save_path}/meteogram_{major_cities[country][2][i]}_{var}.png',bbox_inches='tight')
        plt.close()

def clip_by_overlap(ds, regions_gdf, region_name, threshold=0.5, lat_dim='latitude', lon_dim='longitude'):
    """
    Clip a dataset to a region, keeping only grid cells with overlap fraction above threshold.
    
    Parameters
    ----------
    ds : xarray.Dataset or DataArray
    regions_gdf : GeoDataFrame with region geometries (dissolved, region name as index)
    region_name : str
    threshold : float, fraction of cell area that must be inside region (default 0.5)
    lat_dim, lon_dim : str, dimension names in ds
    """
    import numpy as np
    import xarray as xr
    from shapely.geometry import box

    region_geom = regions_gdf.loc[[region_name]].geometry.union_all()

    lats = ds[lat_dim].values
    lons = ds[lon_dim].values

    dlat = float(ds[lat_dim].diff(lat_dim).mean())
    dlon = float(ds[lon_dim].diff(lon_dim).mean())

    frac = np.zeros((len(lats), len(lons)))

    for i, lat in enumerate(lats):
        for j, lon in enumerate(lons):
            cell = box(lon - dlon/2, lat - dlat/2, lon + dlon/2, lat + dlat/2)
            if region_geom.intersects(cell):
                frac[i, j] = region_geom.intersection(cell).area / cell.area

    frac_da = xr.DataArray(
        frac,
        coords={lat_dim: lats, lon_dim: lons},
        dims=[lat_dim, lon_dim]
    )

    return ds.where(frac_da > threshold, drop=True)

def zone_stats_per_step(da_zone):
    """da_zone: xarray DataArray with dims (step, lat, lon) or similar, already masked to zone"""
    results = []
    for step in da_zone.step.values:
        step_data = da_zone.sel(step=step)
        flat = step_data.values.flatten()
        flat = flat[~np.isnan(flat)]
        total = len(flat)
        entry = {
            "efi_pct_above_05": round(float(100 * (flat > 0.5).sum() / total), 1),
            "efi_pct_above_08": round(float(100 * (flat > 0.8).sum() / total), 1),
            "efi_max": round(float(flat.max()), 2),
        }
        results.append(entry)
    return results

SKILL = {
    "week1": "Usually high skill",
    "week2": "Usually high skill",
    "week3": "Medium to low skill",
    "week4": "low skill",
    "week5": "Climatology almost always better",
    "week6": "Climatology almost always better",
}

def format_prompt_data(data: dict) -> str:
    lines = []
    for zone, weeks in data.items():
        lines.append(f"\n{zone}:")
        for week, stats in weeks.items():
            lines.append(
                f"  {week} ({SKILL[week]}): "
                f"anom={stats['anom_prct']:+.0f}% ({stats['anom']:+.1f}mm), "
                f"p66={stats['p66']:.0f}%, p33={stats['p33']:.0f}%, "
                f"EFI>0.5={stats['efi_pct_above_05']:.0f}%, "
                f"EFI>0.8={stats['efi_pct_above_08']:.0f}%, "
                f"max_EFI={stats['efi_max']:.2f}"
            )
    return "\n".join(lines)