import os
import sys
import time
import numpy as np
from astropy.timeseries import BoxLeastSquares

# Ensure src is in import path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.data_loader import load_cached_lightcurve
from src.preprocessing import preprocess_lightcurve

lc_data = load_cached_lightcurve("data/raw/tic_52368076.npz")
prep_data = preprocess_lightcurve(lc_data["time"], lc_data["flux"], lc_data["flux_err"])

t = prep_data["time"]
y = prep_data["flat_flux"]
dy = prep_data["flat_flux_err"]

mask = ~np.isnan(t) & ~np.isnan(y) & ~np.isnan(dy)
t, y, dy = t[mask], y[mask], dy[mask]

baseline = t[-1] - t[0]
print(f"Baseline: {baseline:.2f} days. Points: {len(t)}")

bls = BoxLeastSquares(t, y, dy)
durations = np.linspace(0.01, 0.3, 6)

for ff in [50.0, 100.0, 200.0, 500.0]:
    t_start = time.time()
    periods = bls.autoperiod(durations, minimum_period=0.5, maximum_period=min(15.0, baseline/2.0), frequency_factor=ff)
    n_periods = len(periods)
    t_grid = time.time() - t_start
    
    t_start = time.time()
    # run power on the grid
    power = bls.power(periods, durations)
    t_power = time.time() - t_start
    
    print(f"frequency_factor = {ff:.1f}:")
    print(f"  Grid size: {n_periods} periods (computed in {t_grid:.3f}s)")
    print(f"  Power computation took: {t_power:.3f}s")
    print(f"  Total time: {t_grid + t_power:.3f}s")
    print("-" * 30)
