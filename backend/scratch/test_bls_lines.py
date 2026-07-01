import os
import sys
import time
import numpy as np
from astropy.timeseries import BoxLeastSquares

# Ensure src is in import path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.data_loader import load_cached_lightcurve
from src.preprocessing import preprocess_lightcurve

print("Loading cached light curve...", flush=True)
lc_data = load_cached_lightcurve("data/raw/tic_52368076.npz")
prep_data = preprocess_lightcurve(lc_data["time"], lc_data["flux"], lc_data["flux_err"])

t = prep_data["time"]
y = prep_data["flat_flux"]
dy = prep_data["flat_flux_err"]

mask = ~np.isnan(t) & ~np.isnan(y) & ~np.isnan(dy)
t, y, dy = t[mask], y[mask], dy[mask]

print(f"Baseline: {t[-1] - t[0]:.2f} days. Points: {len(t)}", flush=True)

print("Initializing BoxLeastSquares...", flush=True)
bls = BoxLeastSquares(t, y, dy)
min_period = 0.5
max_period = 15.0
min_duration = 0.01
max_duration = 0.3
durations = np.linspace(min_duration, max_duration, 6)

t0 = time.time()
effective_max_period = min(max_period, (t[-1] - t[0]) / 2.0)
if effective_max_period <= min_period:
    effective_max_period = min_period * 2.0

print("Calling autoperiod with ff=1.0...", flush=True)
t_start = time.time()
periods = bls.autoperiod(durations, minimum_period=min_period, maximum_period=effective_max_period)
print(f"autoperiod ff=1.0 returned {len(periods)} periods in {time.time() - t_start:.3f}s", flush=True)

MAX_PERIODS = 60000
if len(periods) > MAX_PERIODS:
    ff = len(periods) / MAX_PERIODS
    print(f"Scaling ff to {ff:.3f}...", flush=True)
    t_start = time.time()
    periods = bls.autoperiod(
        durations,
        minimum_period=min_period,
        maximum_period=effective_max_period,
        frequency_factor=ff
    )
    print(f"autoperiod ff={ff:.3f} returned {len(periods)} periods in {time.time() - t_start:.3f}s", flush=True)

print("Calling bls.power...", flush=True)
t_start = time.time()
results = bls.power(periods, durations)
print(f"bls.power finished in {time.time() - t_start:.3f}s", flush=True)
