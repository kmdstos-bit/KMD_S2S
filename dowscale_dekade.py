import get_ECMWF_functions as gef
import xarray as xr
import numpy as np
import matplotlib.pyplot as plt
import geopandas as gpd
import rioxarray
from matplotlib.colors import LinearSegmentedColormap
from datetime import datetime, timedelta
import os
import pandas as pd
import regionmask

today = datetime.today()
two_days_earlier = today - timedelta(days=2)
date_str = two_days_earlier.strftime("%Y-%m-%d")

data_dekade=xr.open_dataset(f'data/{date_str}/data_dekade.nc')
month=int(data_dekade.time.dt.month.values)
day=int(data_dekade.time.dt.day.values)

districts=gpd.read_file("Kenya_shapes/ken_admin2.shp")


forecast_files = {
    (2, 17): ["ECMWF_tp_forecasts_02-17-2025_day2_to_day11_Kenya.nc","chirpsv3_dekads_2005_2025_sorted_06_Kenya.nc","Febuary_Dekad3.tif"],
    (2, 27): ["ECMWF_tp_forecasts_02-27-2025_day2_to_day11_Kenya.nc","chirpsv3_dekads_2005_2025_sorted_07_Kenya.nc","March_Dekad1.tif"],
    (3, 9): ["ECMWF_tp_forecasts_03-09-2025_day2_to_day11_Kenya.nc","chirpsv3_dekads_2005_2025_sorted_08_Kenya.nc","March_Dekad2.tif"],
    (3, 20): ["ECMWF_tp_forecasts_03-19-2025_day2_to_day11_Kenya.nc","chirpsv3_dekads_2005_2025_sorted_09_Kenya.nc","March_Dekad3.tif"],
    (4, 1): ["ECMWF_tp_forecasts_03-31-2025_day2_to_day11_Kenya.nc","chirpsv3_dekads_2005_2025_sorted_10_Kenya.nc","April_Dekad1.tif"],
    (4, 11): ["ECMWF_tp_forecasts_04-09-2025_day2_to_day11_Kenya.nc","chirpsv3_dekads_2005_2025_sorted_11_Kenya.nc","April_Dekad2.tif"],
    (4, 21): ["ECMWF_tp_forecasts_04-19-2025_day2_to_day11_Kenya.nc","chirpsv3_dekads_2005_2025_sorted_12_Kenya.nc","April_Dekad3.tif"],
    (5, 1): ["ECMWF_tp_forecasts_04-29-2025_day2_to_day11_Kenya.nc","chirpsv3_dekads_2005_2025_sorted_13_Kenya.nc","May_Dekad1.tif"],
    (5, 11): ["ECMWF_tp_forecasts_05-11-2025_day2_to_day11_Kenya.nc","chirpsv3_dekads_2005_2025_sorted_14_Kenya.nc","May_Dekad2"],
    (5, 21): ["ECMWF_tp_forecasts_05-21-2025_day2_to_day11_Kenya.nc","chirpsv3_dekads_2005_2025_sorted_15_Kenya.nc","May_Dekad3"],
    (6, 1): ["ECMWF_tp_forecasts_06-01-2025_day2_to_day11_Kenya.nc","chirpsv3_dekads_2005_2025_sorted_16_Great_Horn.nc","June_Dekad1"],
    (6, 11): ["ECMWF_tp_forecasts_06-11-2025_day2_to_day11_Kenya.nc","chirpsv3_dekads_2005_2025_sorted_17_Great_Horn.nc","June_Dekad2"],
    (6, 21): ["ECMWF_tp_forecasts_06-21-2025_day2_to_day11_Kenya.nc","chirpsv3_dekads_2005_2025_sorted_18_Great_Horn.nc","June_Dekad3"],
    (7, 1): ["ECMWF_tp_forecasts_07-01-2025_day2_to_day11_Kenya.nc","chirpsv3_dekads_2005_2025_sorted_19_Great_Horn.nc","July_Dekad1"],
    (7, 11): ["ECMWF_tp_forecasts_07-11-2025_day2_to_day11_Kenya.nc","chirpsv3_dekads_2005_2025_sorted_20_Great_Horn.nc","July_Dekad2"],
    (7, 21): ["ECMWF_tp_forecasts_07-21-2025_day2_to_day11_Kenya.nc","chirpsv3_dekads_2005_2025_sorted_21_Great_Horn.nc","July_Dekad3"],
    (8, 1): ["ECMWF_tp_forecasts_08-01-2025_day2_to_day11_Kenya.nc","chirpsv3_dekads_2005_2025_sorted_22_Great_Horn.nc","August_Dekad1"],
    (8, 11): ["ECMWF_tp_forecasts_08-11-2025_day2_to_day11_Kenya.nc","chirpsv3_dekads_2005_2025_sorted_23_Great_Horn.nc","August_Dekad2"],
}

try:
    keys = list(forecast_files)
    start = keys.index((month, day))

    bboxes = {
        "Kenya": {"lat1": 7, "lon1": 33, "lat2": -6, "lon2": 42},
        "kenya_plus":{"lat1": 7.5, "lon1":27, "lat2": -7.5, "lon2": 43},
        "Great_Horn":{"lat1": 25.5, "lon1": 19.5, "lat2": -8, "lon2": 57},
        "Ethiopia": {"lat1": 16, "lon1": 32, "lat2": 2, "lon2": 49},
    }

    country='Great_Horn'
    
    fclim_chirps = np.array([forecast_files[k] for k in keys[start:start+4]]).T

    reforecast_clims=[]
    for i,file in enumerate(fclim_chirps[0]):
        fclim=xr.open_dataset('downscale_data/'+file)
        reforecast_clims.append(fclim.assign_coords({'step':data_dekade.step.values[i]}))
    reforecast_clims_ds=xr.concat(reforecast_clims,dim='step').sel(longitude=slice(bboxes[country]['lon1'],bboxes[country]['lon2']),latitude=slice(bboxes[country]['lat1'],bboxes[country]['lat2']))
                
    chirps_dekades=[]
    for i,file in enumerate(fclim_chirps[1]):
        chirps=xr.open_dataset('downscale_data/'+file)
        chirps_dekades.append(chirps.assign_coords({'step':data_dekade.step.values[i]}))
    chirps_dekades_ds=xr.concat(chirps_dekades,dim='step').sel(longitude=slice(bboxes[country]['lon1'],bboxes[country]['lon2']),latitude=slice(bboxes[country]['lat1'],bboxes[country]['lat2']))
    
    data_to_add=data_dekade.isel(step=slice(None,len(reforecast_clims_ds.step))).assign_coords({"year":int(data_dekade.time.dt.year.values)}).mean('number').sel(longitude=slice(bboxes[country]['lon1'],bboxes[country]['lon2']),latitude=slice(bboxes[country]['lat1'],bboxes[country]['lat2']))
    extended_fclim=xr.concat([reforecast_clims_ds,data_to_add],dim='year')

    rescaled_forecast=gef.rank_upscale_and_align(extended_fclim.tp.sortby('latitude',ascending=False),chirps_dekades_ds.tp.sortby('latitude',ascending=False))
    rescaled_forecast=rescaled_forecast.assign_coords({'time':extended_fclim.time,'valid_time':extended_fclim.valid_time}).to_dataset(name='tp')
    rescaled_forecast=rescaled_forecast.where(rescaled_forecast>=0)

    rescaled_forecast.tp.attrs=data_dekade.tp.attrs
    rescaled_forecast.to_netcdf(f'data/{date_str}/data_dekade_{country}_downscaled.nc')

    anomaly=rescaled_forecast-chirps_dekades_ds.mean('rank')
    anomaly.tp.attrs['units']='mm'
    anomaly.tp.attrs['GRIB_name']='rainfall anomaly'

    for country in ["Kenya","Great_Horn","Ethiopia"]:
        fs=12

        gef.lat1=bboxes[country]['lat1']
        gef.lat2=bboxes[country]['lat2']
        gef.lon1=bboxes[country]['lon1']
        gef.lon2=bboxes[country]['lon2']

        cmap=gef.cmap

        os.makedirs(f'plots/{country}/{date_str}/dekadal/',exist_ok=True)

        ds_to_plot=rescaled_forecast.sortby('latitude',ascending=False).sel(longitude=slice(bboxes[country]['lon1'],bboxes[country]['lon2']),latitude=slice(bboxes[country]['lat1'],bboxes[country]['lat2'])).transpose('latitude', 'longitude','step')
        fig=gef.panel_plot_variable(ds_to_plot,variable='tp',forecast_timestep=ds_to_plot.step.values,cmap=cmap,fontsize=fs,vmax=int(ds_to_plot.quantile(0.99).tp.values))
        plt.savefig(f'plots/{country}/{date_str}/dekadal/dekadal_precip_downscaled.png',bbox_inches='tight')
       
        ds_to_plot_anom=anomaly.sortby('latitude',ascending=False).sel(longitude=slice(bboxes[country]['lon1'],bboxes[country]['lon2']),latitude=slice(bboxes[country]['lat1'],bboxes[country]['lat2']))

        vmax=int(ds_to_plot_anom.quantile(0.99).tp.values)
        vmin=int(ds_to_plot_anom.quantile(0.01).tp.values)
        ranges=[np.abs(vmax),np.abs(vmin)]
        limit_index=np.argmax(ranges)
        vmax=ranges[limit_index]
        vmin=-ranges[limit_index]

        fig=gef.panel_plot_variable(ds_to_plot_anom,variable='tp',forecast_timestep=ds_to_plot_anom.step.values,cmap='BrBG',fontsize=fs,vmax=vmax,vmin=vmin)
        plt.savefig(f'plots/{country}/{date_str}/dekadal/dekadal_precip_downscaled_anomaly.png',bbox_inches='tight')

        if country=='Kenya':
            ##### update the dekadal forecast timeseries per administrative district
            df = pd.read_csv("data/Kenya2026.csv",index_col='Feature')
            mask = regionmask.mask_geopandas(
                districts,
                rescaled_forecast["longitude"],   
                rescaled_forecast["latitude"],   
            )

            records = np.zeros((districts.shape[0],4))
            for i, row in districts.iterrows():
                district_name = row['adm2_name']
                
                ds_masked = rescaled_forecast.where(mask == i)
                ds_mean = ds_masked.mean({'longitude', 'latitude'}).drop_vars({'year','time','valid_time'})
                
                # Convert to dataframe with step as index, add district column
                records[i]=ds_mean.tp.values

            dekade_names=[f'ire2026{i[33:35]}' for i in fclim_chirps[1]]
            districts_names=df.index

            dff=pd.DataFrame(data=records, index=districts_names, columns=dekade_names)
            for name in dekade_names:
                df[name]=dff[name]

            df.to_csv('data/Kenya2026.csv')

            #Generate geotiffs and other file formats
            dirname=f'data/{date_str}/geotifs_kenya/'
            os.makedirs(dirname,exist_ok=True)
            for i,forecast_timestep in enumerate(data_dekade.step.values):
                #get start and end time
                if forecast_timestep == np.atleast_1d(data_dekade.step)[0]:
                    start_time=data_dekade.time
                    end_time=(data_dekade.time+forecast_timestep)
                else:
                    dt=data_dekade.step[1]-data_dekade.step[0]
                    start_time=data_dekade.sel(step=forecast_timestep).valid_time-dt
                    end_time=data_dekade.sel(step=forecast_timestep).valid_time
                fname=f'downscaled_rainfall_forecast_init_{str(data_dekade.time.values)[0:10]}_{fclim_chirps[2][i]}.tif'

                to_save=ds_to_plot.isel(step=i)
                to_save.rio.to_raster(dirname+fname)    
                to_save.rio.write_crs("EPSG:4326", inplace=True)
                to_save.tp.rio.to_raster(f"{dirname+fname}.bil", driver="EHdr")

            gdf = gpd.read_file("downscale_data/Kenya_Counties_KNSDI.shp").set_crs("EPSG:4326")

            rescaled_forecast = rescaled_forecast.rio.write_crs("EPSG:4326")

            # Reproject shapefile
            gdf = gdf.to_crs(rescaled_forecast.rio.crs)

            # Clip forecast
            ds_to_plot = rescaled_forecast.rio.clip(gdf.geometry, gdf.crs, drop=True).transpose('latitude', 'longitude','step').sortby('latitude',ascending=False)
            fig=gef.panel_plot_variable(ds_to_plot,variable='tp',forecast_timestep=ds_to_plot.step.values,cmap=cmap,fontsize=fs,vmax=int(ds_to_plot.quantile(0.99).tp.values))
            plt.savefig(f'plots/{country}/{date_str}/dekadal/dekadal_precip_downscaled_clipped.png',bbox_inches='tight')

            gdf = gpd.read_file("downscale_data/Kenya_Counties_KNSDI.shp").set_crs("EPSG:4326")

            anomaly = anomaly.rio.write_crs("EPSG:4326")

            # Clip anomaly
            ds_to_plot = anomaly.rio.clip(gdf.geometry, gdf.crs, drop=True)
            vmax=int(ds_to_plot.quantile(0.99).tp.values)
            vmin=int(ds_to_plot.quantile(0.01).tp.values)
            ranges=[np.abs(vmax),np.abs(vmin)]
            limit_index=np.argmax(ranges)
            vmax=ranges[limit_index]
            vmin=-ranges[limit_index]
            fig=gef.panel_plot_variable(ds_to_plot,variable='tp',forecast_timestep=ds_to_plot.step.values,cmap='BrBG',fontsize=fs,vmax=vmax,vmin=vmin)

            for ax in fig.axes[:6]:
                districts.boundary.plot(ax=ax, color="black", linewidth=0.5)

            plt.savefig(f'plots/{country}/{date_str}/dekadal/dekadal_precip_downscaled_anomaly_clipped.png',bbox_inches='tight')
except ValueError:
    print('these are not the days you are looking for...')

bboxes = {
    "Kenya": {"lat1": 7, "lon1": 33, "lat2": -6, "lon2": 42},
    "Kenya_plus":{"lat1": 7.5, "lon1":27, "lat2": -7.5, "lon2": 43},
    "Ghana":{"lat1": 12, "lon1": -4, "lat2": 4, "lon2": 2},
    "Ghana_plus": {"lat1": 12, "lon1": -4.5, "lat2": 4, "lon2": 3},
}

countries_to_downscale=[('Kenya',30),('Ghana',27)]

for country,upscale_factor in countries_to_downscale:
    forecast_year = 2026
    all_dates = []

    # Loop months March (3)–December (12)
    for month in range(1, 13):
        # Start at the 1st of the month
        day = datetime(forecast_year, month, 1)
        
        # Compute last day of month
        if month == 12:
            next_month = datetime(forecast_year + 1, 1, 1)
        else:
            next_month = datetime(forecast_year, month + 1, 1)
        last_day = next_month - timedelta(days=1)

        # Add every 2 days from day 1
        while day <= last_day:
            all_dates.append(day)
            day += timedelta(days=2)

    data_weekly=xr.open_dataset(f'data/{date_str}/data_weekly.nc')

    dates=[pd.to_datetime(str(date)[:10])- timedelta(days=7) for date in data_weekly.valid_time.values]

    closest=[pd.Series(all_dates).iloc[(pd.Series(all_dates) - date).abs().idxmin()] for date in dates]
    day_and_month=[("%02d" % ((pd.to_datetime(str(date)[:10])).month,),"%02d" % ((pd.to_datetime(str(date)[:10])).day,)) for date in closest]

    freforecast_clims=[f"downscale_data/chirpsv3_weeks/ECMWF_tp_forecasts_2025-{dix[0]}-{dix[1]}_1week_{country}.nc" for dix in day_and_month]
    reforecast_clims=[]
    for i,file in enumerate(freforecast_clims):
        fclim=xr.open_dataset(file)
        reforecast_clims.append(fclim.assign_coords({'step':data_weekly.step.values[i]}))
    reforecast_clims_ds=xr.concat(reforecast_clims,dim='step')

    fclim_chirps=[f"downscale_data/chirpsv3_weeks/chirpsv3_weeks_2005_2025_sorted_{dix[0]}-{dix[1]}_{country}.nc" for dix in day_and_month]
    chirps_weeks=[]
    for i,file in enumerate(fclim_chirps):
            chirps=xr.open_dataset(file)
            chirps_weeks.append(chirps.assign_coords({'step':data_weekly.step.values[i]}))
    chirps_weeks_ds=xr.concat(chirps_weeks,dim='step')

    data_to_add=data_weekly.assign_coords({"year":int(data_weekly.time.dt.year.values)}).mean('number').sel(longitude=slice(bboxes[country+'_plus']['lon1'],bboxes[country+'_plus']['lon2']),latitude=slice(bboxes[country+'_plus']['lat1'],bboxes[country+'_plus']['lat2']))
    extended_fclim=xr.concat([reforecast_clims_ds,data_to_add],dim='year')

    rescaled_forecast=gef.rank_upscale_and_align(extended_fclim.tp,chirps_weeks_ds.tp,upscale_factor=upscale_factor)
    rescaled_forecast=rescaled_forecast.assign_coords({'time':extended_fclim.time,'valid_time':extended_fclim.valid_time}).to_dataset(name='tp')
    rescaled_forecast=rescaled_forecast.where(rescaled_forecast>=0)
    rescaled_forecast.tp.attrs=data_weekly.tp.attrs

    fs=12

    gef.lat1=bboxes[country]['lat1']
    gef.lat2=bboxes[country]['lat2']
    gef.lon1=bboxes[country]['lon1']
    gef.lon2=bboxes[country]['lon2']

    cmap=gef.cmap

    ds_to_plot=rescaled_forecast.sel(longitude=slice(bboxes[country]['lon1'],bboxes[country]['lon2']),latitude=slice(bboxes[country]['lat1'],bboxes[country]['lat2'])).transpose('latitude', 'longitude','step')
    fig=gef.panel_plot_variable(ds_to_plot,variable='tp',forecast_timestep=ds_to_plot.step.values,cmap=cmap,fontsize=fs,vmax=int(ds_to_plot.quantile(0.99).tp.values))
    plt.savefig(f'plots/{country}/{date_str}/weekly/weekly_precip_downscaled.png',bbox_inches='tight')

    if country=='Kenya':
        gdf = gpd.read_file("downscale_data/Kenya_Counties_KNSDI.shp").set_crs("EPSG:4326")

        rescaled_forecast = rescaled_forecast.rio.write_crs("EPSG:4326")

        # Reproject shapefile
        gdf = gdf.to_crs(rescaled_forecast.rio.crs)

        # Clip
        ds_to_plot = rescaled_forecast.rio.clip(gdf.geometry, gdf.crs, drop=True).transpose('latitude', 'longitude','step')
        fig=gef.panel_plot_variable(ds_to_plot,variable='tp',forecast_timestep=ds_to_plot.step.values,cmap=cmap,fontsize=fs,vmax=int(ds_to_plot.quantile(0.99).tp.values))
        for ax in fig.axes[:6]:
            districts.boundary.plot(ax=ax, color="black", linewidth=0.5)
        plt.savefig(f'plots/{country}/{date_str}/weekly/weekly_precip_downscaled_clipped.png',bbox_inches='tight')

        anomaly=rescaled_forecast-chirps_weeks_ds.mean('rank')

        anomaly.tp.attrs['units']='mm'
        anomaly.tp.attrs['GRIB_name']='rainfall anomaly'

        ds_to_plot=anomaly.sel(longitude=slice(bboxes[country]['lon1'],bboxes[country]['lon2']),latitude=slice(bboxes[country]['lat1'],bboxes[country]['lat2'])).transpose('latitude', 'longitude','step')

        vmax=int(ds_to_plot.quantile(0.99).tp.values)
        vmin=int(ds_to_plot.quantile(0.01).tp.values)
        ranges=[np.abs(vmax),np.abs(vmin)]
        limit_index=np.argmax(ranges)
        vmax=ranges[limit_index]
        vmin=-ranges[limit_index]

        fig=gef.panel_plot_variable(ds_to_plot,variable='tp',forecast_timestep=ds_to_plot.step.values,cmap='BrBG',fontsize=fs,vmax=vmax,vmin=vmin)
        plt.savefig(f'plots/{country}/{date_str}/weekly/weekly_precip_downscaled_anomaly.png',bbox_inches='tight')

        gdf = gpd.read_file("downscale_data/Kenya_Counties_KNSDI.shp").set_crs("EPSG:4326")

        anomaly = anomaly.rio.write_crs("EPSG:4326")

        # Reproject shapefile
        gdf = gdf.to_crs(anomaly.rio.crs)

        # Clip
        ds_to_plot = anomaly.rio.clip(gdf.geometry, gdf.crs, drop=True).transpose('latitude', 'longitude','step')
        vmax=int(ds_to_plot.quantile(0.99).tp.values)
        vmin=int(ds_to_plot.quantile(0.01).tp.values)
        ranges=[np.abs(vmax),np.abs(vmin)]
        limit_index=np.argmax(ranges)
        vmax=ranges[limit_index]
        vmin=-ranges[limit_index]
        fig=gef.panel_plot_variable(ds_to_plot,variable='tp',forecast_timestep=ds_to_plot.step.values,cmap='BrBG',fontsize=fs,vmax=vmax,vmin=vmin)
        for ax in fig.axes[:6]:
            districts.boundary.plot(ax=ax, color="black", linewidth=0.5)
        plt.savefig(f'plots/{country}/{date_str}/weekly/weekly_precip_downscaled_anomaly_clipped.png',bbox_inches='tight')

