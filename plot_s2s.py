import xarray as xr
import get_ECMWF_functions as gef
import efi_sot
import xarray as xr
import numpy as np
import matplotlib.pyplot as plt
import os
from datetime import datetime, timedelta
from google import genai
from google.genai import types
import geopandas as gpd

today = datetime.today()
two_days_earlier = today - timedelta(days=2)
date_str = two_days_earlier.strftime("%Y-%m-%d")

# prefix = "C:\\Users\\alecj\\Bureaublad\\ECMWF-S2S4AFRICA\\" 
prefix=os.environ["MAIN_PATH"]
data_path=f'{prefix}/data/{date_str}'

#-----precip extended range---------------------------------------------------------------------------------------#
data_path_pf = f"{data_path}/ECMWF_s2s_perturbed_forecast_precip_46days_23N-20W-37S-59E.grib"
data_path_cf = f"{data_path}/ECMWF_s2s_control_forecast_precip_46days_23N-20W-37S-59E.grib"
filelist_path = f"{data_path}/m-climate/*.nc"

pf=xr.open_dataset(data_path_pf,engine='cfgrib')
cf=xr.open_dataset(data_path_cf,engine='cfgrib').assign_coords({'number':0})

data=xr.concat([pf,cf],dim='number')

steps=data.step.values*1e-9/3600
steps=steps.astype('int')
dekade = [data.step.values[i] for i in np.where(steps%240==0)[0]]
weekly=[data.step.values[i] for i in np.where(steps%168==0)[0]]

data_weekly=data.sel(step=weekly)
data_dekade=data.sel(step=dekade)

data_monthly=data_weekly.isel(step=4)
data_weekly=gef.acum_to_instant(data_weekly)
data_dekade=gef.acum_to_instant(data_dekade)

data_weekly.to_netcdf(f'{data_path}/data_weekly.nc')
data_dekade.to_netcdf(f'{data_path}/data_dekade.nc')
data_monthly.to_netcdf(f'{data_path}/data_monthly.nc')

m_climate_big = gef.open_mclimate(data_weekly,folder_path=f'{prefix}/m-climate/')

efi,sot = efi_sot.EFI_SOT(data_weekly, m_climate_big)

data_weekly_cut_to_mclimate=data_weekly.sel(longitude=slice(m_climate_big.longitude.min(),m_climate_big.longitude.max()),latitude=slice(m_climate_big.latitude.max(),m_climate_big.latitude.min()))

ensemble_stats_tp=gef.ensemble_data(data_weekly_cut_to_mclimate,m_climate_big,'tp',quantiles=[75,50,25])

# #-----precip medium range---------------------------------------------------------------------------------------#
data_weekly_medium=xr.open_dataset(f'{data_path}/medium_range_precip.nc')


# # #------other vars-----------------------------------------------------------------------------------------#
dailyvars=gef.open_forecast(date_str,'CAPE_tcw_t2m_d2m_RH',data_path)
Tminmax=gef.open_forecast(date_str,'Tminmax',data_path)
wind10=gef.open_forecast(date_str,'10wind',data_path)
wind500=gef.open_forecast(date_str,'500wind',data_path)
wind700=gef.open_forecast(date_str,'700wind',data_path)

week_dailyvars=gef.week_mean(dailyvars)
week_6hTminmax=gef.week_mean(gef.day_mean_6h_accum(Tminmax,['mx2t6', 'mn2t6']))
week_wind10=gef.week_mean(wind10)
week_wind500=gef.week_mean(wind500.assign_coords(step=[stepp + 86400000000000 for stepp in wind500.step.values ])).rename({"isobaricInhPa":"level"})
week_wind700=gef.week_mean(wind700.assign_coords(step=[stepp + 86400000000000 for stepp in wind500.step.values ])).rename({"isobaricInhPa":"level"})

weekly_temp_celcius=gef.convert_to_celcius(week_dailyvars,'t2m')
mclim_celcius=gef.convert_to_celcius(m_climate_big,'t2m')
ensemble_stats_t2m=gef.ensemble_data(weekly_temp_celcius,mclim_celcius,'t2m',quantiles=[75,50,25])

#----plotting-----------------------------------------------------------------------------------------#

bboxes = {
    "Namibia": {"lat1": -15, "lon1": 10, "lat2": -31, "lon2": 27},
    "Botswana": {"lat1": -15, "lon1": 18, "lat2": -28, "lon2": 31},
    "Kenya": {"lat1": 7, "lon1": 32, "lat2": -6, "lon2": 43},
    "Zambia": {"lat1": -6, "lon1": 20, "lat2": -20, "lon2": 35},
    "Madagascar": {"lat1": -10, "lon1": 42, "lat2": -27, "lon2": 52},
    "Angola": {"lat1": -4, "lon1": 11.5, "lat2": -18.5, "lon2": 24.5},
    "Ghana": {"lat1": 12, "lon1": -4, "lat2": 4, "lon2": 2},
    "Senegal": {"lat1": 17, "lon1": -17.5, "lat2": 12, "lon2": -11},
    "Ethiopia": {"lat1": 16, "lon1": 32, "lat2": 2, "lon2": 49},
    "Great_Horn":{"lat1": 25.5, "lon1": 19.5, "lat2": -8, "lon2": 57},
    "Zimbabwe": {"lat1": -15.5, "lon1": 25, "lat2": -22.5, "lon2": 33.5},
    "Malawi": {"lat1": -9, "lon1": 31.5, "lat2": -17.2, "lon2": 37},
}

major_cities = {
    "Namibia":     [(-22.5594, 17.0832), (-17.9333, 19.7667), ('Windhoek', 'Rundu')],
    "Botswana":    [(-24.6545, 25.9086), (-21.1700, 27.5000), ('Gaborone', 'Francistown')],
    "Kenya":       [(-1.28333, 36.8167), (-4.0547, 39.6636),  ('Nairobi', 'Mombasa')],
    "Zambia":      [(-15.4067, 28.2871), (-12.80243, 28.21323), ('Lusaka', 'Kitwe')],
    "Madagascar":  [(-18.9137, 47.5361), (-18.1500, 49.4000), ('Antananarivo', 'Toamasina')],
    "Angola":      [(-8.8368, 13.2343),  (-11.2027, 17.8739), ('Luanda', 'Huambo')],
    "Ghana":       [(5.5600, -0.2057),   (6.6885, -1.6244),   ('Accra', 'Kumasi')],
    "Senegal":     [(14.6937, -17.4441), (12.3500, -16.7167), ('Dakar', 'Ziguinchor')],
    "Ethiopia":    [(9.0272, 38.7369),   (11.1400, 42.8000),  ('Addis Ababa', 'Dire Dawa')],
    "Great_Horn":  [(9.0272, 38.7369),   (2.02000, 45.2000),  ('Addis Ababa', 'Mogadishu')],
    "Zimbabwe":    [(-17.8292, 31.0522), (-20.1500, 28.5833), ('Harare', 'Bulawayo')],
    "Malawi":      [(-13.9626, 33.7741), (-15.7861, 35.0058), ('Lilongwe', 'Blantyre')],
}

for country in bboxes.keys():
    gef.lat1=bboxes[country]['lat1']
    gef.lat2=bboxes[country]['lat2']
    gef.lon1=bboxes[country]['lon1']
    gef.lon2=bboxes[country]['lon2']

    m_climate=m_climate_big.sel(longitude=slice(gef.lon1, gef.lon2),latitude=slice(gef.lat1, gef.lat2))
    m_climate_celcius=m_climate.sel(longitude=slice(gef.lon1, gef.lon2),latitude=slice(gef.lat1, gef.lat2))
    if country=='Madagascar':
        fs=12
    if country=='Malawi':
        fs=14
    else:
        fs=16

    base_path=f'plots/{country}/{date_str}'
    weekly_path=f'{base_path}/weekly'
    dekade_path=f'{base_path}/dekadal'
    monthly_path=f'{base_path}/monthly'
    weekly_temp_path=f'{weekly_path}/t2m/'


    os.makedirs(base_path, exist_ok=True)
    os.makedirs(weekly_path, exist_ok=True)
    os.makedirs(dekade_path, exist_ok=True)
    os.makedirs(monthly_path, exist_ok=True)

    #plot weekly precip from extended range forecast
    ds_to_plot=data_weekly.sel(longitude=slice(gef.lon1, gef.lon2),latitude=slice(gef.lat1, gef.lat2))
    fig=gef.panel_plot_variable(ds_to_plot,variable='tp',forecast_timestep=ds_to_plot.step.values,cmap=gef.cmap,fontsize=fs)
    plt.savefig(f'{weekly_path}/weekly_precip.png',bbox_inches='tight')
    plt.close()

    #plot monthly precip from extended range forecast
    ds_to_plot_monthly=data_monthly.sel(longitude=slice(gef.lon1, gef.lon2),latitude=slice(gef.lat1, gef.lat2))
    fig=gef.panel_plot_variable(ds_to_plot_monthly,variable='tp',forecast_timestep=ds_to_plot_monthly.step.values,cmap=gef.cmap,fontsize=fs)
    plt.savefig(f'{monthly_path}/monthly_precip.png',bbox_inches='tight')
    plt.close()
    
    #plot dekadal precip from extended range forecast
    ds_to_plot_dekade=data_dekade.sel(longitude=slice(gef.lon1, gef.lon2),latitude=slice(gef.lat1, gef.lat2))
    fig=gef.panel_plot_variable(ds_to_plot_dekade,variable='tp',forecast_timestep=ds_to_plot_dekade.step.values,cmap=gef.cmap,fontsize=fs)
    plt.savefig(f'{dekade_path}/dekadal_precip.png',bbox_inches='tight')
    plt.close()

    #plot weekly precip from medium range forecast
    ds_to_plot_medium=gef.ensemble_mean(data_weekly_medium.sel(longitude=slice(gef.lon1, gef.lon2),latitude=slice(gef.lat1, gef.lat2)))
    fig=gef.panel_plot_variable(ds_to_plot_medium,variable='tp',forecast_timestep=ds_to_plot_medium.step.values,cmap=gef.cmap,fontsize=fs,vmin=0,vmax=int(ds_to_plot_medium.quantile(0.99).tp.values))
    plt.savefig(f'{weekly_path}/weekly_medium_range_precip.png',bbox_inches='tight')
    plt.close()

    #plot change in weekly extended range precip
    gef.panel_plot_variable(ds_to_plot,variable='tp',forecast_timestep=ds_to_plot.step.values,cmap='seismic',change=True,fontsize=fs)
    plt.savefig(f'{weekly_path}/weekly_change_in_precip.png',bbox_inches='tight')
    plt.close()

    if country!="Senegal":
        print(country)

        fig=gef.panel_plot_variable(efi,variable='tp',forecast_timestep=efi.step.values,vmax=1,vmin=0.5,cmap=gef.cmap_efi,add_contour=sot.tp,contourlevels=[0,1,2,5,8],contourcmap='k',fontsize=fs)
        plt.savefig(f'{weekly_path}/efi_sot_precip.png',bbox_inches='tight')
        plt.close()

        os.makedirs(weekly_temp_path, exist_ok=True)

        gef.ensemble_plots(ds_to_plot,m_climate,ensemble_stats_tp[0],ensemble_stats_tp[1],ensemble_stats_tp[2],'tp',weekly_path,country=country,fontsize=fs,major_cities=major_cities)
        
        ds_to_plot_temp=gef.convert_to_celcius(week_dailyvars,'t2m')

        gef.ensemble_plots(ds_to_plot_temp,mclim_celcius,ensemble_stats_t2m[0],ensemble_stats_t2m[1],ensemble_stats_t2m[2],'t2m',weekly_temp_path,country=country,fontsize=fs,major_cities=major_cities)

        fig=gef.panel_plot_variable(ds_to_plot_temp,variable='t2m',forecast_timestep=ds_to_plot_temp.step.values,cmap='rainbow',fontsize=fs)
        plt.savefig(f'{weekly_temp_path}/t2m.png',bbox_inches='tight')
        plt.close()

    if country=='Kenya':
        exceedance_percentage=gef.get_exceedance_percentage(ds_to_plot_dekade,'tp',20,comparison='greater')
        fig=gef.panel_plot_variable(exceedance_percentage,variable='tp',forecast_timestep=ds_to_plot_dekade.step.values,cmap=gef.cmap,fontsize=fs)
        plt.savefig(f'{dekade_path}/chance_higherthan_20mm.png',bbox_inches='tight')
        plt.close()

        exceedance_percentage=gef.get_exceedance_percentage(ds_to_plot_dekade,'tp',25,comparison='greater')
        fig=gef.panel_plot_variable(exceedance_percentage,variable='tp',forecast_timestep=ds_to_plot_dekade.step.values,cmap=gef.cmap,fontsize=fs)
        plt.savefig(f'{dekade_path}/chance_higherthan_25mm.png',bbox_inches='tight')
        plt.close()

        #-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
        inputs=['tcw','d2m','cape']
        cmaps=['YlGnBu','YlGnBu','jet']

        mclim=gef.open_mclimate(week_dailyvars,folder_path=f'{prefix}/m-climate/',var="CAPE_tcw_t2m_d2m_RH").sel(longitude=slice(gef.lon1, gef.lon2),latitude=slice(gef.lat1, gef.lat2))
        hold_ensemble_stats_var=[]    
        for i,var in enumerate(inputs):
            save_path=f'{weekly_path}/{var}/'
            ds_to_plot_var=week_dailyvars
            mclim_var=mclim
            ds_to_plot_var=ds_to_plot_var.sel(longitude=slice(gef.lon1, gef.lon2),latitude=slice(gef.lat1, gef.lat2))
            ensemble_stats_var=gef.ensemble_data(ds_to_plot_var,mclim_var,var,quantiles=[75,50,25])
            hold_ensemble_stats_var.append(ensemble_stats_var)
            gef.ensemble_plots(ds_to_plot_var,mclim,ensemble_stats_var[0],ensemble_stats_var[1],ensemble_stats_var[2],var,save_path,country=country,fontsize=fs,major_cities=major_cities)

            fig=gef.panel_plot_variable(ds_to_plot_var,variable=var,forecast_timestep=ds_to_plot_var.step.values,cmap=cmaps[i],fontsize=fs)
            plt.savefig(f'{save_path}/{var}.png',bbox_inches='tight')
            plt.close()

        # ------------winds 500hPa--------------------------------------------------------------------------------------------------------------------------------------------------------
       
        mclim=gef.open_mclimate(week_wind500,folder_path=f'{prefix}/m-climate/',var="700_500_wind_new").sel(level=500).sel(longitude=slice(gef.lon1, gef.lon2),latitude=slice(gef.lat1, gef.lat2))
        var='w'
        save_path=f'{weekly_path}/w_500hPa/'
        ds_to_plot_var=week_wind500.sel(longitude=slice(gef.lon1, gef.lon2),latitude=slice(gef.lat1, gef.lat2))

        ensemble_stats_w500=gef.ensemble_data(ds_to_plot_var,mclim,var,quantiles=[75,50,25])
        gef.ensemble_plots(ds_to_plot_var,mclim,ensemble_stats_w500[0],ensemble_stats_w500[1],ensemble_stats_w500[2],var,save_path,country=country,fontsize=fs,major_cities=major_cities)

        fig=gef.panel_plot_variable(ds_to_plot_var,variable=var,forecast_timestep=ds_to_plot_var.step.values,cmap='seismic',fontsize=fs)
        plt.savefig(f'{save_path}/{var}.png',bbox_inches='tight')
        plt.close()

        #----------winds 10m----------------------------------------------------------------------------------------------------------------------------------------------------------
        save_path=f'{weekly_path}/10m-wind/'
        week_wind10_speed=gef.windspeed(week_wind10,'u10','v10').sel(longitude=slice(gef.lon1, gef.lon2),latitude=slice(gef.lat1, gef.lat2))

        mclim=gef.open_mclimate(week_wind10,folder_path=f'{prefix}/m-climate/',var="10m_wind").sel(longitude=slice(gef.lon1, gef.lon2),latitude=slice(gef.lat1, gef.lat2))
        mclim_speed=gef.windspeed(mclim,'u10','v10')
        gef.ensemble_plots_quiver(week_wind10_speed,mclim_speed,'u10','u10','v10',save_path,'Kenya',fs,major_cities)
        gef.ensemble_plots_quiver(week_wind10_speed,mclim_speed,'v10','u10','v10',save_path,'Kenya',fs,major_cities)

        fig=gef.quiver_plot_variable(week_wind10_speed,"u10","v10",week_wind10["step"],cmap='YlGn')
        plt.savefig(f'{save_path}/10m-wind_vectors.png',bbox_inches='tight')
        plt.close()

        #----------winds 700hPa----------------------------------------------------------------------------------------------------------------------------------------------------------
        save_path=f'{weekly_path}/700hpa-wind/'

        week_wind700_speed=gef.windspeed(week_wind700,'u','v').sel(longitude=slice(gef.lon1, gef.lon2),latitude=slice(gef.lat1, gef.lat2))

        mclim=gef.open_mclimate(week_wind700_speed,folder_path=f'{prefix}/m-climate/',var="700_500_wind_new").sel(level=700).sel(longitude=slice(gef.lon1, gef.lon2),latitude=slice(gef.lat1, gef.lat2))
        mclim_speed=gef.windspeed(mclim,'u','v')
        gef.ensemble_plots_quiver(week_wind700_speed,mclim_speed,'u','u','v',save_path,'Kenya',fs,major_cities)
        gef.ensemble_plots_quiver(week_wind700_speed,mclim_speed,'v','u','v',save_path,'Kenya',fs,major_cities)

        fig=gef.quiver_plot_variable(week_wind700_speed,"u","v",week_wind700_speed["step"],cmap='YlGn')
        plt.savefig(f'{save_path}/700hPa-wind_vectors.png',bbox_inches='tight')
        plt.close()

        #--------------temp-----------------------------------------------------------------------------------------------------------------------------------------------------
        vmaxt6h=gef.convert_to_celcius(week_6hTminmax,'mx2t6').mean('number').mx2t6.max()
        vmint6h=gef.convert_to_celcius(week_6hTminmax,'mn2t6').mean('number').mn2t6.min()

        week_6hTminmax.mx2t6.attrs['GRIB_name']='Weekly mean maximum temperature at 2 metres'
        week_6hTminmax.mn2t6.attrs['GRIB_name']='Weekly mean minimum temperature at 2 metres'

        fig=gef.panel_plot_variable(gef.convert_to_celcius(week_6hTminmax,'mx2t6'),variable='mx2t6',forecast_timestep=week_6hTminmax.step.values,cmap='rainbow',fontsize=fs,vmax=vmaxt6h,vmin=vmint6h)
        plt.savefig(f'{weekly_path}/t2m/max_temp.png',bbox_inches='tight')
        plt.close()

        fig=gef.panel_plot_variable(gef.convert_to_celcius(week_6hTminmax,'mn2t6'),variable='mn2t6',forecast_timestep=week_6hTminmax.step.values,cmap='rainbow',fontsize=fs,vmax=vmaxt6h,vmin=vmint6h)
        plt.savefig(f'{weekly_path}/t2m/min_temp.png',bbox_inches='tight')
        plt.close()

# #---------Save data to website branch---------------------------------------------------------------------------
all_data=[data_weekly,week_dailyvars,week_6hTminmax,week_wind10,week_wind500,week_wind700]

website_path = f'{os.environ["WEBSITE_PATH"]}/ncdf_data//{date_str}/'

# #website_path = f'C:/Users/alecj/Bureaublad/website/ECMWF-S2S4AFRICA/ncdf_data//{date_str}/'

os.makedirs(website_path, exist_ok=True)

for data in all_data:
    latlon_str=f'{int(data.latitude.max())}N{int(data.longitude.min())}W{int(data.latitude.min())}S-{int(data.longitude.max())}E'
    for variable in data.data_vars:
        if variable=='t2m':
            var_name='temp'
        elif variable=='tp':
            var_name='precip'
        elif 'level' in data.coords:
            var_name=f'{variable}{int(data.level)}' 
        else:
            var_name=variable
        filepath = f'{website_path}/ECMWF_s2s_forecast_{var_name}_42days_{latlon_str}.nc'

        print(filepath)

        data[variable].to_netcdf(filepath)

names=['chance2xseed','anomclim','tercilecat']

ensemble_stats_var=[xr.merge([hold_ensemble_stats_var[i][j] for i in range(len(hold_ensemble_stats_var))]) for j in range(len(names))]

all_ensemble_data=[ensemble_stats_tp,ensemble_stats_t2m,ensemble_stats_w500,ensemble_stats_var]

for data in all_ensemble_data:
    latlon_str=f'{int(data[0].latitude.max())}N{int(data[0].longitude.min())}W{int(data[0].latitude.min())}S-{int(data[0].longitude.max())}E'

    for i,stat_type in enumerate(data):
        for variable in stat_type.data_vars:
            ds=stat_type[variable]
            if variable=='t2m':
                var_name='temp'
            elif variable=='tp':
                var_name='precip'
            elif 'level' in ds.coords:
                var_name=f'{variable}{int(ds.level)}' 
            else:
                var_name=variable
            if 'quantile' in ds.coords:
                for q in ds['quantile']:
                    ds.sel(quantile=q).to_netcdf(f'{website_path}/ECMWF_s2s_forecast_{names[i]}_{var_name}_P{int(q)}_42days_{latlon_str}.nc')
            else:
                ds=ds.sel(cat='above-normal')-ds.sel(cat='below-normal')
                ds.to_netcdf(f'{website_path}/ECMWF_s2s_forecast_{names[i]}_{var_name}_42days_{latlon_str}.nc')

#Short ai summary production
region_map = {
    "Nyandarua": "Highlands East of the Rift Valley","Laikipia": "Highlands East of the Rift Valley","Nyeri": "Highlands East of the Rift Valley",
    "Kirinyaga": "Highlands East of the Rift Valley","Murang'a": "Highlands East of the Rift Valley","Kiambu": "Highlands East of the Rift Valley",
    "Meru": "Highlands East of the Rift Valley","Embu": "Highlands East of the Rift Valley","Tharaka-Nithi": "Highlands East of the Rift Valley",
    "Nairobi": "Highlands East of the Rift Valley","Nandi": "Highlands West of the Rift Valley","Kakamega": "Highlands West of the Rift Valley",
    "Vihiga": "Highlands West of the Rift Valley","Bungoma": "Highlands West of the Rift Valley","Siaya": "Highlands West of the Rift Valley",
    "Busia": "Highlands West of the Rift Valley","Baringo": "Highlands West of the Rift Valley","Nakuru": "Highlands West of the Rift Valley",
    "Trans Nzoia": "Highlands West of the Rift Valley","Uasin Gishu": "Highlands West of the Rift Valley","Elgeyo-Marakwet": "Highlands West of the Rift Valley",
    "West Pokot": "Highlands West of the Rift Valley","Kisii": "Rift Valley and Lake Victoria Basin","Nyamira": "Rift Valley and Lake Victoria Basin",
    "Kericho": "Rift Valley and Lake Victoria Basin","Bomet": "Rift Valley and Lake Victoria Basin","Kisumu": "Rift Valley and Lake Victoria Basin",
    "Homa Bay": "Rift Valley and Lake Victoria Basin","Migori": "Rift Valley and Lake Victoria Basin","Narok": "Rift Valley and Lake Victoria Basin",
    "Mombasa": "Coast","Kilifi": "Coast","Lamu": "Coast","Kwale": "Coast","Marsabit": "Northeastern Kenya","Mandera": "Northeastern Kenya",
    "Wajir": "Northeastern Kenya","Garissa": "Northeastern Kenya","Isiolo": "Northeastern Kenya","Machakos": "Southeastern Lowlands"
    ,"Kitui": "Southeastern Lowlands","Makueni": "Southeastern Lowlands","Kajiado": "Southeastern Lowlands","Taita Taveta": "Southeastern Lowlands",
    "Tana River": "Southeastern Lowlands","Turkana": "Northwestern Kenya","Samburu": "Northwestern Kenya",
}

states1=gpd.read_file("Kenya_shapes/ken_admin1.shp")
states1['region'] = states1['adm1_name'].map(region_map)
regions = states1.dropna(subset=['region']).dissolve(by='region')

promt_unformat={}

for region in states1['region'].unique():
    promt_clim=gef.clip_by_overlap(m_climate_big.isel(quantile=50).tp, regions, region, threshold=0.15).mean({'latitude','longitude'})
    promt_anom=gef.clip_by_overlap(ensemble_stats_tp[1].sel(quantile=50).tp, regions, region, threshold=0.15).mean({'latitude','longitude'})
    anom_prct=promt_anom/promt_clim.rename({'time':'step'}).assign_coords({'step':promt_anom.step.values})*100
    promt_aboblnrml=gef.clip_by_overlap(ensemble_stats_tp[2].tp, regions, region, threshold=0.15).mean({'latitude','longitude'})
    prompt_efi=gef.clip_by_overlap(efi.tp, regions, region, threshold=0.15)
    
    anom_prct_dict=[{'anom_prct':round(float(i),2)} for i in anom_prct]
    promt_anom_dict=[{'anom':round(float(i),2)} for i in promt_anom]
    promt_aboblnrml_dict=[{'p66':float(promt_aboblnrml.isel(step=i)[1]),
    'p33':float(promt_aboblnrml.isel(step=i)[0]),} for i in range(6)]
    promt_efi_dict=gef.zone_stats_per_step(prompt_efi)
    promt_dict={f"week{i+1}": anom_prct_dict[i] | promt_anom_dict[i] | promt_aboblnrml_dict[i] | promt_efi_dict[i] for i, d in enumerate(gef.zone_stats_per_step(prompt_efi))}
    promt_unformat[region]=promt_dict

with open(f"{prefix}/prompts/system_prompt.md") as f:
    system_prompt = f.read()

user_prompt = f"""
Forecast date: {date_str}
Country: Kenya
Month: {two_days_earlier.strftime("%B")}
Zone statistics (6-week forecast):
{gef.format_prompt_data(promt_unformat)}
"""

client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])

response = client.models.generate_content(
    model="gemini-3.1-flash-lite",
    contents=user_prompt,
    config=types.GenerateContentConfig(
        system_instruction=system_prompt,
        max_output_tokens=1000,
    )
)

summary = response.text

var_ex='''\n \nLegend:\np33= Percentage of ensemble members below normal of model climate
p66= Percentage of ensemble members above normal of model climate
p50anom= Anomaly of the ensemble mean from the median of the model climate in % and mm
efi= Extreme forecast index'''

with open(f'{prefix}/prompts/digest_{date_str}.txt', 'w') as f:
    f.write(summary+var_ex)