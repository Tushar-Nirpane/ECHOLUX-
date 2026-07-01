import numpy as np
from scipy.optimize import curve_fit

def trapezoid_transit_model(phases, t0, depth, duration, ingress):
    """
    Analytical trapezoidal transit model for relative flux.
    
    Parameters:
    - phases: array of phase values (centered at 0, ranging from -0.5 to 0.5)
    - t0: offset of the transit center from 0
    - depth: transit depth (fractional dip, e.g. 0.01 for 1% dip)
    - duration: total transit width (T_14) in phase units (fraction of orbit)
    - ingress: ingress/egress width (T_12) in phase units (fraction of orbit)
    """
    # Enforce physical constraints on parameters within the function
    depth = np.clip(depth, 0.0, 0.9)
    duration = np.clip(duration, 1e-4, 0.9)
    ingress = np.clip(ingress, 1e-5, duration / 2.0)
    
    dx = np.abs(phases - t0)
    flux = np.ones_like(phases)
    
    # 1. Full transit region (bottom of the trapezoid)
    full_mask = dx < (duration / 2.0 - ingress)
    flux[full_mask] = 1.0 - depth
    
    # 2. Ingress and Egress slopes
    slope_mask = (dx >= (duration / 2.0 - ingress)) & (dx <= duration / 2.0)
    if np.any(slope_mask):
        fraction = (duration / 2.0 - dx[slope_mask]) / ingress
        flux[slope_mask] = 1.0 - depth * fraction
        
    return flux

def fit_transit_parameters(phase, flux, flux_err, bls_period, bls_depth, bls_duration):
    """
    Fits the trapezoidal transit model to the phase-folded light curve.
    
    Parameters:
    - phase, flux, flux_err: Sorted phase-folded light curve arrays (phase in [-0.5, 0.5])
    - bls_period: Period from BLS (days), used to convert parameters back to physical units
    - bls_depth: Initial depth from BLS
    - bls_duration: Initial duration from BLS (days)
    
    Returns:
    - Dict with optimal parameters (depth, duration in hours, epoch, ingress),
      their standard uncertainties (estimated from the covariance matrix), and the fitted flux array.
    """
    # Exclude NaNs
    mask = ~np.isnan(phase) & ~np.isnan(flux) & ~np.isnan(flux_err)
    p = phase[mask]
    y = flux[mask]
    dy = flux_err[mask]
    
    if len(p) < 20:
        return None
        
    # Initial guess in phase units
    # bls_duration is in days, convert to phase: bls_duration / bls_period
    init_duration_phase = bls_duration / bls_period
    init_depth = bls_depth
    init_t0 = 0.0
    init_ingress_phase = 0.1 * init_duration_phase # Assume ingress is 10% of duration
    
    p0 = [init_t0, init_depth, init_duration_phase, init_ingress_phase]
    
    # Bounds: [t0, depth, duration, ingress]
    bounds = (
        [-init_duration_phase, 0.0, 1e-4, 1e-5],
        [init_duration_phase, 0.9, 0.9, 0.45]
    )
    
    try:
        # Fit the model using non-linear least squares
        popt, pcov = curve_fit(
            trapezoid_transit_model,
            p,
            y,
            p0=p0,
            bounds=bounds,
            sigma=dy,
            absolute_sigma=True,
            maxfev=2000
        )
        
        # Extract optimal parameters
        fit_t0_phase, fit_depth, fit_duration_phase, fit_ingress_phase = popt
        
        # Calculate standard uncertainties (standard errors) from covariance matrix
        # standard error = sqrt(diag(pcov))
        perr = np.sqrt(np.diag(pcov))
        t0_err_phase, depth_err, duration_err_phase, ingress_err_phase = perr
        
        # Convert phase units back to physical units
        # Epoch, duration, and ingress in days
        fit_t0_days = fit_t0_phase * bls_period
        fit_duration_days = fit_duration_phase * bls_period
        fit_ingress_days = fit_ingress_phase * bls_period
        
        # Standard errors in physical units
        t0_err_days = t0_err_phase * bls_period
        duration_err_days = duration_err_phase * bls_period
        ingress_err_days = ingress_err_phase * bls_period
        
        # Duration and ingress in hours for reporting
        fit_duration_hours = fit_duration_days * 24.0
        duration_err_hours = duration_err_days * 24.0
        
        fit_ingress_hours = fit_ingress_days * 24.0
        ingress_err_hours = ingress_err_days * 24.0
        
        # Generate the fitted curve flux on the input phase array
        fitted_flux = trapezoid_transit_model(phase, fit_t0_phase, fit_depth, fit_duration_phase, fit_ingress_phase)
        
        return {
            "epoch_offset_days": fit_t0_days,
            "epoch_offset_err_days": t0_err_days,
            "depth": fit_depth,
            "depth_err": depth_err,
            "duration_hours": fit_duration_hours,
            "duration_err_hours": duration_err_hours,
            "ingress_hours": fit_ingress_hours,
            "ingress_err_hours": ingress_err_hours,
            "fitted_flux": fitted_flux,
            "success": True
        }
        
    except Exception as e:
        print(f"Least-squares fit failed: {e}. Falling back to BLS parameters.")
        # Fallback to BLS estimates with nan errors
        fitted_flux = trapezoid_transit_model(phase, 0.0, bls_depth, bls_duration / bls_period, 0.1 * bls_duration / bls_period)
        return {
            "epoch_offset_days": 0.0,
            "epoch_offset_err_days": np.nan,
            "depth": bls_depth,
            "depth_err": np.nan,
            "duration_hours": bls_duration * 24.0,
            "duration_err_hours": np.nan,
            "ingress_hours": bls_duration * 2.4, # 10%
            "ingress_err_hours": np.nan,
            "fitted_flux": fitted_flux,
            "success": False
        }
