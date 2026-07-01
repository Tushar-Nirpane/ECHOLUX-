import numpy as np
from astropy.timeseries import BoxLeastSquares
import warnings

def run_bls_search(time, flux, flux_err, min_period=0.5, max_period=15.0, min_duration=0.01, max_duration=0.3):
    """
    Runs a Box Least Squares (BLS) search on the light curve to identify periodic dips.
    
    Parameters:
    - time, flux, flux_err: Cleaned and flattened light curve arrays
    - min_period, max_period: Period range to search (in days)
    - min_duration, max_duration: Transit duration range to search (in days)
    
    Returns:
    - Dict containing best fit parameters, the BLS results object, and the model instance.
    """
    # Exclude any NaNs
    mask = ~np.isnan(time) & ~np.isnan(flux) & ~np.isnan(flux_err)
    t = time[mask]
    y = flux[mask]
    dy = flux_err[mask]
    
    if len(t) < 50:
        return None

    # Downsample very large light curves to prevent BLS from hanging.
    # 20000 points is more than sufficient for period recovery.
    MAX_POINTS = 20000
    if len(t) > MAX_POINTS:
        step = len(t) // MAX_POINTS
        t  = t[::step]
        y  = y[::step]
        dy = dy[::step]
        
    try:
        # Cap max_period to the data baseline (no more than half the data span)
        data_baseline = t[-1] - t[0]
        effective_max_period = min(max_period, data_baseline / 2.0)
        if effective_max_period <= min_period:
            effective_max_period = min_period * 2.0

        # Define duration grid — use 6 entries for speed
        durations = np.linspace(min_duration, max_duration, 6)

        # Initialize BLS
        bls = BoxLeastSquares(t, y, dy)

        # Determine period grid size dynamically to avoid performance degradation on long baselines
        baseline = t[-1] - t[0]
        df_default = min_duration / (baseline ** 2)
        min_freq = 1.0 / effective_max_period
        max_freq = 1.0 / min_period
        default_nf = 1 + int(np.round((max_freq - min_freq) / df_default))

        MAX_PERIODS = 60000
        if default_nf > MAX_PERIODS:
            ff = default_nf / MAX_PERIODS
        else:
            ff = 1.0

        periods = bls.autoperiod(
            durations,
            minimum_period=min_period,
            maximum_period=effective_max_period,
            frequency_factor=ff
        )

        # Search the period grid
        results = bls.power(periods, durations)
        
        # Find the index of the highest power peak
        best_idx = np.argmax(results.power)
        
        # Extract parameters for the best-fit model
        best_period = float(results.period[best_idx])
        best_transit_time = float(results.transit_time[best_idx])
        best_depth = float(results.depth[best_idx])
        best_duration = float(results.duration[best_idx])
        best_power = float(results.power[best_idx])
        
        # In astropy's BoxLeastSquares, depth_snr is calculated as the depth divided by its uncertainty
        # If it doesn't exist, we fall back to a simple SNR estimate.
        if hasattr(results, "depth_snr"):
            best_snr = float(results.depth_snr[best_idx])
        else:
            # Fallback estimation of SNR
            # depth / std of out-of-transit flux
            best_snr = best_depth / np.std(y)
            
        # Let's compute a secondary eclipse search
        # We can fold the light curve on the best period and look for a secondary dip
        # at phase ~0.5 to help classify eclipsing binaries.
        phase = ((t - best_transit_time) / best_period) % 1.0
        
        # Split into primary transit phase and secondary eclipse phase
        # Primary is centered at phase 0.0 (or phase 1.0)
        # Secondary is centered at phase 0.5
        in_primary = (phase < (best_duration / best_period / 2.0)) | (phase > (1.0 - best_duration / best_period / 2.0))
        in_secondary = (phase > (0.5 - best_duration / best_period / 2.0)) & (phase < (0.5 + best_duration / best_period / 2.0))
        
        primary_depth = 1.0 - np.median(y[in_primary]) if np.sum(in_primary) > 0 else 0.0
        secondary_depth = 1.0 - np.median(y[in_secondary]) if np.sum(in_secondary) > 0 else 0.0
        
        # Signal detection statistics
        mean_power = np.mean(results.power)
        std_power = np.std(results.power)
        significance = (best_power - mean_power) / std_power if std_power > 0 else 0.0
        
        return {
            "period": best_period,
            "epoch": best_transit_time,
            "depth": best_depth,
            "duration": best_duration,
            "power": best_power,
            "snr": best_snr,
            "significance": significance,
            "primary_depth": primary_depth,
            "secondary_depth": secondary_depth,
            "results": results,
            "bls_model": bls
        }
    except Exception as e:
        print(f"Error running BLS search: {e}")
        return None

def compute_phase_folded_lc(time, flux, flux_err, period, epoch):
    """
    Folds the light curve at the given period and epoch.
    Phases are normalized to be between -0.5 and 0.5, with the transit centered at 0.0.
    """
    # Calculate phases
    phase = ((time - epoch) / period) % 1.0
    # Center at 0.0
    phase = np.where(phase > 0.5, phase - 1.0, phase)
    
    # Sort by phase
    sort_idx = np.argsort(phase)
    return phase[sort_idx], flux[sort_idx], flux_err[sort_idx]
