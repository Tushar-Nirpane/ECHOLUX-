import numpy as np
import lightkurve as lk
import warnings

# Suppress lightkurve warnings
warnings.filterwarnings('ignore', category=RuntimeWarning)
warnings.filterwarnings('ignore', category=UserWarning)

def preprocess_lightcurve(time, flux, flux_err, window_length=101, sigma=5.0):
    """
    Cleans and detrends a light curve:
    1. Removes NaNs
    2. Performs sigma clipping to remove cosmic rays and extreme outliers
    3. Fits and removes long-term trends using a Savitzky-Golay filter (flattening)
    4. Normalizes the flux centered at 1.0 (relative flux)
    
    Parameters:
    - time, flux, flux_err: Raw light curve arrays
    - window_length: Window length (in data points) for the flattening filter. Must be odd.
    - sigma: Number of standard deviations to use for outlier rejection.
    
    Returns:
    - Dict containing cleaned time, raw flux, detrended flux, detrended flux error, and the trend.
    """
    # Double check window_length is odd
    if window_length % 2 == 0:
        window_length += 1
        
    # Construct a lightkurve LightCurve object
    lc = lk.LightCurve(time=time, flux=flux, flux_err=flux_err)
    
    # 1. Remove NaNs
    lc = lc.remove_nans()
    
    # Downsample if too large to speed up processing
    MAX_PREPROCESS_POINTS = 15000
    if len(lc) > MAX_PREPROCESS_POINTS:
        step = len(lc) // MAX_PREPROCESS_POINTS
        lc = lc[::step]
        
    if len(lc) < 200:
        # Too few points to process reliably
        return {
            "time": lc.time.value,
            "raw_flux": lc.flux.value,
            "flat_flux": lc.flux.value / np.nanmedian(lc.flux.value),
            "flat_flux_err": lc.flux_err.value / np.nanmedian(lc.flux.value),
            "trend": np.ones_like(lc.flux.value) * np.nanmedian(lc.flux.value)
        }
        
    try:
        # 2. Sigma clipping
        # We perform an initial clipping of extreme outliers
        lc_clean = lc.remove_outliers(sigma_upper=sigma, sigma_lower=sigma)
        
        # Ensure we have enough points left
        if len(lc_clean) < 100:
            lc_clean = lc
            
        # 3. Detrending / Flattening
        # We flatten the light curve to remove stellar variability and instrument systematics.
        # lightkurve uses Savitzky-Golay (SG) filtering by default.
        # If the window_length is too large for the data size, scale it down.
        if window_length >= len(lc_clean):
            window_length = (len(lc_clean) // 2) * 2 - 1
            if window_length < 5:
                window_length = 5
                
        lc_flat, trend = lc_clean.flatten(window_length=window_length, return_trend=True)
        
        return {
            "time": lc_flat.time.value,
            "raw_flux": lc_clean.flux.value,
            "flat_flux": lc_flat.flux.value,
            "flat_flux_err": lc_flat.flux_err.value,
            "trend": trend.flux.value
        }
        
    except Exception as e:
        print(f"Error during preprocessing: {e}. Falling back to median normalization.")
        median_val = np.nanmedian(lc.flux.value)
        return {
            "time": lc.time.value,
            "raw_flux": lc.flux.value,
            "flat_flux": lc.flux.value / median_val,
            "flat_flux_err": lc.flux_err.value / median_val,
            "trend": np.ones_like(lc.flux.value) * median_val
        }
