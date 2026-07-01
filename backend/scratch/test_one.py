import os
import sys
import numpy as np

# Ensure src is in import path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.data_loader import load_cached_lightcurve
from src.preprocessing import preprocess_lightcurve
from src.dip_detection import run_bls_search

print("Loading cached light curve...")
file_path = "data/raw/tic_52368076.npz"
lc_data = load_cached_lightcurve(file_path)
print(f"Loaded TIC {lc_data['tic_id']} with {len(lc_data['time'])} data points.")

print("Preprocessing light curve...")
prep_data = preprocess_lightcurve(lc_data["time"], lc_data["flux"], lc_data["flux_err"])
print(f"Preprocessed: {len(prep_data['time'])} points remaining.")

print("Running BLS search...")
bls_res = run_bls_search(prep_data["time"], prep_data["flat_flux"], prep_data["flat_flux_err"])
if bls_res is None:
    print("BLS search returned None.")
else:
    print(f"BLS Success: Period = {bls_res['period']:.4f}, SNR = {bls_res['snr']:.2f}")
