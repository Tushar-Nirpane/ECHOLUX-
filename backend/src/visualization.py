import os
import numpy as np
import matplotlib.pyplot as plt
from src.dip_detection import compute_phase_folded_lc
from src.classifier import estimate_planet_radius

def plot_diagnostic_results(lc_data, prep_data, bls_results, fit_results, pred_class, pred_prob, save_path):
    """
    Generates a 4-panel diagnostic plot for exoplanet detection verification.
    """
    # Setup styling: clean, modern look
    plt.style.use('seaborn-v0_8-whitegrid' if 'seaborn-v0_8-whitegrid' in plt.style.available else 'default')
    
    # Custom color palette
    c_raw = "#7f8c8d"       # grey for raw
    c_trend = "#e74c3c"     # red for trend
    c_flat = "#2c3e50"      # dark slate for flat
    c_bls = "#2980b9"       # blue for BLS power
    c_fold = "#34495e"      # slate for phase-folded points
    c_fit = "#27ae60"       # green for fitted curve
    
    fig = plt.figure(figsize=(15, 10))
    fig.suptitle(
        f"TIC {lc_data['tic_id']} (TOI {lc_data['toi_id']:.1f}) - ML Prediction: {pred_class} ({pred_prob*100:.1f}%)",
        fontsize=16, fontweight='bold', color="#2c3e50"
    )
    
    # Grid layout
    # Left column: Raw LC, Flattened LC
    # Right column: BLS power spectrum, Phase-folded fit
    ax1 = plt.subplot2grid((2, 2), (0, 0))
    ax2 = plt.subplot2grid((2, 2), (1, 0), sharex=ax1)
    ax3 = plt.subplot2grid((2, 2), (0, 1))
    ax4 = plt.subplot2grid((2, 2), (1, 1))
    
    # ----------------------------------------------------
    # Panel 1: Raw light curve + Trend
    # ----------------------------------------------------
    # Downsample raw points if too large for faster rendering
    raw_time = lc_data["time"]
    raw_flux = lc_data["flux"]
    
    if len(raw_time) > 10000:
        step = len(raw_time) // 5000
        raw_time = raw_time[::step]
        raw_flux = raw_flux[::step]
        
    ax1.plot(raw_time, raw_flux, '.', color=c_raw, alpha=0.3, label="Raw SPOC Flux", markersize=2)
    
    # Overplot the trend from preprocessing
    prep_time = prep_data["time"]
    prep_trend = prep_data["trend"]
    if len(prep_time) > 5000:
        step = len(prep_time) // 2500
        prep_time = prep_time[::step]
        prep_trend = prep_trend[::step]
        
    ax1.plot(prep_time, prep_trend, '-', color=c_trend, linewidth=1.5, label="Flattening Trend (SG Filter)")
    ax1.set_title("1. Raw Light Curve & Systematics Filter", fontsize=12, fontweight='bold', loc='left')
    ax1.set_ylabel("Flux (e-/s)", fontsize=10)
    ax1.legend(loc="upper right", frameon=True)
    
    # ----------------------------------------------------
    # Panel 2: Detrended and Normalized light curve
    # ----------------------------------------------------
    flat_time = prep_data["time"]
    flat_flux = prep_data["flat_flux"]
    
    if len(flat_time) > 10000:
        step = len(flat_time) // 5000
        flat_time = flat_time[::step]
        flat_flux = flat_flux[::step]
        
    ax2.plot(flat_time, flat_flux, '.', color=c_flat, alpha=0.4, markersize=2, label="Cleaned & Flattened")
    
    # Highlight detected transit windows if BLS succeeded
    if bls_results:
        p_period = bls_results["period"]
        p_epoch = bls_results["epoch"]
        p_dur = bls_results["duration"]
        # Draw vertical bands around expected transit centers
        # Calculate transit times within the time range
        t_start = np.min(prep_data["time"])
        t_end = np.max(prep_data["time"])
        n_transits = int((t_end - p_epoch) / p_period) + 2
        transit_times = p_epoch + np.arange(-10, n_transits) * p_period
        
        first = True
        for t_t in transit_times:
            if t_start <= t_t <= t_end:
                ax2.axvspan(t_t - p_dur/2.0, t_t + p_dur/2.0, color="#f1c40f", alpha=0.2, 
                            label="Detected Transit Window" if first else "")
                first = False
                
    ax2.set_title("2. Detrended Light Curve (Normalized)", fontsize=12, fontweight='bold', loc='left')
    ax2.set_xlabel("Time (BJD - 2457000)", fontsize=10)
    ax2.set_ylabel("Relative Flux", fontsize=10)
    if bls_results:
        ax2.legend(loc="upper right", frameon=True)
        
    # ----------------------------------------------------
    # Panel 3: BLS Periodogram
    # ----------------------------------------------------
    if bls_results and "results" in bls_results:
        bls_res = bls_results["results"]
        ax3.plot(bls_res.period, bls_res.power, color=c_bls, linewidth=1, label="BLS Power")
        ax3.axvline(bls_results["period"], color=c_trend, linestyle="--", alpha=0.7, 
                    label=f"Peak Period: {bls_results['period']:.4f} d")
        ax3.set_title("3. Box Least Squares (BLS) Power Spectrum", fontsize=12, fontweight='bold', loc='left')
        ax3.set_xlabel("Period (days)", fontsize=10)
        ax3.set_ylabel("Power", fontsize=10)
        ax3.legend(loc="upper right", frameon=True)
    else:
        ax3.text(0.5, 0.5, "BLS search failed or bypassed", ha='center', va='center')
        ax3.set_title("3. BLS Power Spectrum (N/A)", fontsize=12, fontweight='bold', loc='left')
        
    # ----------------------------------------------------
    # Panel 4: Phase-folded light curve & fitted model
    # ----------------------------------------------------
    if bls_results:
        folded_phase, folded_flux, folded_err = compute_phase_folded_lc(
            prep_data["time"], prep_data["flat_flux"], prep_data["flat_flux_err"],
            bls_results["period"], bls_results["epoch"]
        )
        
        # Plot folded points
        ax4.plot(folded_phase, folded_flux, '.', color=c_fold, alpha=0.2, markersize=1.5, label="Folded Data")
        
        # Compute and plot binned phase curve for clarity (bin size ~100 bins)
        bins = np.linspace(-0.5, 0.5, 100)
        digitized = np.digitize(folded_phase, bins)
        bin_means = [np.median(folded_flux[digitized == i]) for i in range(1, len(bins))]
        bin_centers = 0.5 * (bins[:-1] + bins[1:])
        
        # Plot binned points
        ax4.errorbar(bin_centers, bin_means, yerr=None, fmt='o', color="#e67e22", 
                     ecolor="#e67e22", elinewidth=1, capsize=0, markersize=5, label="Binned Median (0.01 phase)")
        
        # Overplot fitted model if available
        if fit_results:
            # Recompute model on sorted phase
            sort_idx = np.argsort(folded_phase)
            ax4.plot(folded_phase[sort_idx], fit_results["fitted_flux"][sort_idx], '-', 
                     color=c_fit, linewidth=2.5, label="Trapezoidal Fit Model")
            
        ax4.set_title("4. Phase-Folded Light Curve & Fit", fontsize=12, fontweight='bold', loc='left')
        ax4.set_xlabel("Phase", fontsize=10)
        ax4.set_ylabel("Relative Flux", fontsize=10)
        ax4.set_xlim(-0.15, 0.15) # Zoom in on the transit region
        ax4.legend(loc="lower left", frameon=True)
    else:
        ax4.text(0.5, 0.5, "No detected transit signal to fold", ha='center', va='center')
        ax4.set_title("4. Phase-Folded Light Curve (N/A)", fontsize=12, fontweight='bold', loc='left')
        
    # Metadata/Text information panel overlay (inside empty areas or title)
    # We can write text on the figure bottom or in a textbox in the plot
    text_info = (
        f"Host Star Parameters (TIC Catalog):\n"
        f"  Stellar Radius (R_*): {lc_data['st_rad']:.2f} R_sun\n"
        f"  Stellar Mass (M_*): {lc_data['st_mass']:.2f} M_sun\n"
        f"  Effective Temp (T_eff): {lc_data['st_teff']:.0f} K\n\n"
        f"BLS Detections:\n"
        f"  Detected Period: {bls_results['period']:.5f} days (True: {lc_data['true_period']:.5f} d)\n"
        f"  BLS SNR: {bls_results['snr']:.2f}  |  Significance: {bls_results['significance']:.2f} sigma\n\n"
        f"Transit Parameter Fits:\n"
    )
    if fit_results and fit_results.get("success", False):
        # Convert depth to ppt (parts-per-thousand) or %
        depth_ppt = fit_results["depth"] * 1000.0
        depth_err_ppt = fit_results["depth_err"] * 1000.0
        
        # Estimate planet radius
        Rp_Re = estimate_planet_radius(lc_data['st_rad'], fit_results["depth"])
        Rp_Re_err = estimate_planet_radius(lc_data['st_rad'], fit_results["depth"] + fit_results["depth_err"]) - Rp_Re if not np.isnan(Rp_Re) else np.nan
        
        text_info += (
            f"  Fitted Epoch Offset: {fit_results['epoch_offset_days'] * 24 * 60:.2f} ± {fit_results['epoch_offset_err_days'] * 24 * 60:.2f} min\n"
            f"  Fitted Depth: {depth_ppt:.3f} ± {depth_err_ppt:.3f} ppt\n"
            f"  Fitted Duration: {fit_results['duration_hours']:.3f} ± {fit_results['duration_err_hours']:.3f} hours\n"
            f"  Fitted Ingress: {fit_results['ingress_hours']:.3f} ± {fit_results['ingress_err_hours']:.3f} hours\n"
            f"  Estimated Planet Radius: {Rp_Re:.2f} ± {Rp_Re_err:.2f} R_earth"
        )
    else:
        text_info += "  Fit failed or used fallback BLS params."
        
    # Put text info box in the plot
    props = dict(boxstyle='round,pad=0.5', facecolor='#fcfcfc', edgecolor='#bdc3c7', alpha=0.9)
    fig.text(0.51, 0.55, text_info, fontsize=9.5, fontfamily='monospace', verticalalignment='top', bbox=props)
    
    # Optimize layout and save
    plt.tight_layout()
    # Adjust top spacing for main title
    fig.subplots_adjust(top=0.91)
    
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    plt.savefig(save_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"Diagnostic plot saved to {save_path}")
