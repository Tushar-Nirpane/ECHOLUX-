import os
import sys
import time

# Ensure src is in import path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.data_loader import load_cached_lightcurve
from src.preprocessing import preprocess_lightcurve
from src.dip_detection import run_bls_search

print("1. Loading cached light curve...", flush=True)
t0 = time.time()
file_path = "data/raw/tic_52368076.npz"
lc_data = load_cached_lightcurve(file_path)
t1 = time.time()
print(f"Loaded TIC {lc_data['tic_id']} with {len(lc_data['time'])} data points in {t1-t0:.2f}s.", flush=True)

print("2. Preprocessing light curve...", flush=True)
t0 = time.time()
prep_data = preprocess_lightcurve(lc_data["time"], lc_data["flux"], lc_data["flux_err"])
t1 = time.time()
print(f"Preprocessed: {len(prep_data['time'])} points remaining. Done in {t1-t0:.2f}s.", flush=True)

print("3. Running BLS search...", flush=True)
t0 = time.time()
bls_res = run_bls_search(prep_data["time"], prep_data["flat_flux"], prep_data["flat_flux_err"])
t1 = time.time()
if bls_res is None:
    print(f"BLS search returned None in {t1-t0:.2f}s.", flush=True)
else:
    print(f"BLS Success in {t1-t0:.2f}s: Period = {bls_res['period']:.4f}, SNR = {bls_res['snr']:.2f}", flush=True)
