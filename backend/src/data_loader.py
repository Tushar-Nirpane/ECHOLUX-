import os
import urllib.request
import urllib.parse
import pandas as pd
import numpy as np
import lightkurve as lk
import warnings

# Suppress lightkurve warnings
warnings.filterwarnings('ignore', category=RuntimeWarning)
warnings.filterwarnings('ignore', category=UserWarning)

def fetch_toi_table(output_csv_path="data/toi_list.csv", force_download=False):
    """
    Downloads the TESS Objects of Interest (TOI) list from the NASA Exoplanet Archive.
    """
    if os.path.exists(output_csv_path) and not force_download:
        print(f"Loading TOI catalog from cache: {output_csv_path}")
        return pd.read_csv(output_csv_path)

    os.makedirs(os.path.dirname(output_csv_path), exist_ok=True)
    print("Downloading TOI catalog from NASA Exoplanet Archive...")
    
    # TAP query to select relevant fields from the 'toi' table
    query = (
        "select toi, tid, tfopwg_disp, toi_created, ra, dec, st_pmra, st_pmdec, "
        "pl_tranmid, pl_orbper, pl_trandurh, pl_trandep, pl_rade, "
        "st_teff, st_rad, st_logg "
        "from toi"
    )
    url = f"https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query={urllib.parse.quote_plus(query)}&format=csv"
    
    try:
        urllib.request.urlretrieve(url, output_csv_path)
        df = pd.read_csv(output_csv_path)
        print(f"Successfully downloaded {len(df)} TOI targets to {output_csv_path}")
        return df
    except Exception as e:
        print(f"Error downloading TOI catalog: {e}")
        # Return fallback empty dataframe or raise
        raise e

def get_representative_targets(toi_df, n_per_class=25):
    """
    Selects a representative subset of targets for each class:
    - Confirmed Planets (CP / KP)
    - Planet Candidates (PC)
    - False Positives (FP)
    - Quiet/Control Stars (non-TOI, will query separately)
    """
    # Clean the disposition column
    toi_df = toi_df.copy()
    toi_df['class'] = 'unknown'
    
    toi_df.loc[toi_df['tfopwg_disp'].isin(['CP', 'KP']), 'class'] = 'Planet'
    toi_df.loc[toi_df['tfopwg_disp'] == 'PC', 'class'] = 'Candidate'
    toi_df.loc[toi_df['tfopwg_disp'] == 'FP', 'class'] = 'FalsePositive'
    
    # Filter targets that have reasonable periods and depths
    valid_toi = toi_df[
        toi_df['class'].isin(['Planet', 'Candidate', 'FalsePositive']) &
        toi_df['pl_orbper'].notna() &
        toi_df['pl_trandep'].notna() &
        (toi_df['pl_orbper'] > 0.5) &
        (toi_df['pl_orbper'] < 20)
    ]
    
    selected = []
    for cls in ['Planet', 'Candidate', 'FalsePositive']:
        cls_targets = valid_toi[valid_toi['class'] == cls]
        # Take a random sample or top rows
        sample_size = min(len(cls_targets), n_per_class)
        if sample_size > 0:
            selected.append(cls_targets.sample(n=sample_size, random_state=42))
            
    if selected:
        selected_df = pd.concat(selected)
        return selected_df
    return pd.DataFrame()

def _safe_float(value, fallback=np.nan):
    """Convert a value to float, returning fallback on None or error."""
    try:
        if value is None:
            return fallback
        v = float(value)
        return v if not np.isnan(v) else fallback
    except (TypeError, ValueError):
        return fallback

def download_and_cache_lightcurves(targets_df, output_dir="data/raw", sector=None):
    """
    Downloads high-cadence SPOC light curves for targets in targets_df using lightkurve
    and caches them as compact .npz files.
    """
    os.makedirs(output_dir, exist_ok=True)
    cached_files = []
    
    for idx, row in targets_df.iterrows():
        tic_id = int(row['tid'])
        toi_id = row['toi']
        disposition = row.get('tfopwg_disp', 'unknown')
        target_name = f"TIC {tic_id}"
        cache_file = os.path.join(output_dir, f"tic_{tic_id}.npz")
        
        if os.path.exists(cache_file):
            print(f"Target {target_name} is already cached.")
            cached_files.append(cache_file)
            continue
            
        print(f"Searching light curves for {target_name} (TOI {toi_id}, Disp: {disposition})...")
        try:
            # Search for SPOC 2-minute cadence data
            search_args = {"mission": "TESS", "author": "SPOC"}
            if sector is not None:
                search_args["sector"] = sector
                
            search_result = lk.search_lightcurve(target_name, **search_args)
            if len(search_result) == 0:
                print(f"No SPOC light curves found for {target_name}")
                continue
                
            # Fetch the first available or a high quality one
            lc_collection = search_result.download_all()
            if lc_collection is None or len(lc_collection) == 0:
                print(f"Failed to download light curves for {target_name}")
                continue
                
            # Stitch if there are multiple sectors, or just take the first one
            if len(lc_collection) > 1:
                lc = lc_collection.stitch()
            else:
                lc = lc_collection[0]
                
            # Clean lightkurve Nan fluxes
            lc = lc.remove_nans()
            
            # Save raw time, flux, flux_err and metadata
            time = lc.time.value
            flux = lc.flux.value
            flux_err = lc.flux_err.value
            
            # Fetch stellar parameters from metadata or row (safely handle None)
            st_rad  = _safe_float(row.get('st_rad'))
            st_mass = _safe_float(row.get('st_mass'))
            st_teff = _safe_float(row.get('st_teff'))

            # If nan in row, try to extract from lightkurve header
            if np.isnan(st_rad) and hasattr(lc, 'meta'):
                st_rad = _safe_float(lc.meta.get('RADIUS'))
            if np.isnan(st_teff) and hasattr(lc, 'meta'):
                st_teff = _safe_float(lc.meta.get('TEFF'))

            np.savez(
                cache_file,
                time=time,
                flux=flux,
                flux_err=flux_err,
                tic_id=tic_id,
                toi_id=toi_id,
                disposition=str(disposition),
                period=_safe_float(row.get('pl_orbper')),
                duration=_safe_float(row.get('pl_trandurh')),
                depth=_safe_float(row.get('pl_trandep')),
                st_rad=st_rad,
                st_mass=st_mass,
                st_teff=st_teff
            )
            print(f"Saved {target_name} light curve to {cache_file} ({len(time)} points)")
            cached_files.append(cache_file)
            
        except Exception as e:
            print(f"Error fetching {target_name}: {e}")
            continue
            
    return cached_files

def load_cached_lightcurve(file_path):
    """
    Loads a light curve from a cached .npz file.
    Returns a dictionary of data.
    """
    with np.load(file_path, allow_pickle=True) as data:
        return {
            "time": data["time"],
            "flux": data["flux"],
            "flux_err": data["flux_err"],
            "tic_id": int(data["tic_id"]),
            "toi_id": float(data["toi_id"]),
            "disposition": str(data["disposition"]),
            "true_period": float(data["period"]),
            "true_duration": float(data["duration"]),
            "true_depth": float(data["depth"]),
            "st_rad": float(data["st_rad"]),
            "st_mass": float(data["st_mass"]),
            "st_teff": float(data["st_teff"])
        }
