"""
EchoLux API — a thin FastAPI layer over the existing pipeline modules.

This does NOT modify main.py or anything in src/ — it imports those modules
the same way main.py does, and reuses your already-cached light curves and
trained classifier instead of re-downloading or retraining on every request.

Already in place at the backend repo root, next to main.py, so `from
src...` imports resolve correctly. Run it from this directory:

    pip install -r requirements.txt
    uvicorn api:app --reload --port 8000

Prerequisite: you need at least one cached light curve already, i.e. you've
run `python main.py` at least once so data/raw/tic_*.npz files exist. For a
trained classifier (data/classifier_model.pkl), run main.py to completion —
otherwise /api/targets/{id} still works but `classification` comes back null
and the frontend shows its "classifier not trained yet" empty state.

Endpoints
---------
    GET /api/health             -> quick status check
    GET /api/targets            -> list of cached targets
    GET /api/targets/{tic_id}   -> full analysis for one target

Field names in the JSON response match ../frontend/src/types/exoplanet.ts
exactly (camelCase translations of the snake_case pipeline dict keys) —
see that file for the authoritative shape.
"""

import glob
import os
import re
import threading
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from src.classifier import ExoplanetClassifier, extract_features
from src.data_loader import load_cached_lightcurve
from src.dip_detection import compute_phase_folded_lc, run_bls_search
from src.parameter_estimation import fit_transit_parameters
from src.preprocessing import preprocess_lightcurve

RAW_DIR = "data/raw"
MODEL_PATH = "data/classifier_model.pkl"

app = FastAPI(title="EchoLux API")

app.add_middleware(
    CORSMiddleware,
    # Wildcard is fine for local hackathon use against the Vite dev server
    # at localhost:5173 (../frontend/vite.config.ts). Tighten this to that
    # exact origin before deploying anywhere this API isn't strictly local.
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

_classifier = ExoplanetClassifier()
_model_loaded = _classifier.load(MODEL_PATH)

# In-memory cache of fully-assembled target payloads, keyed by tic_id.
# BLS search + the trapezoidal fit are the expensive steps here (a few
# seconds each, even on the capped 20000-point light curve) — caching means
# the dashboard only pays that cost once per target per process lifetime.
_cache_lock = threading.Lock()
_target_cache: dict = {}


def _safe_float(value) -> Optional[float]:
    """Native Python float, with NaN/inf mapped to None.

    Several pipeline values (np.median/np.std results, RandomForest
    importances, etc.) come back as numpy float64 — Python's stdlib `json`
    module can't serialize that type at all, and even where it's already a
    native float, NaN/Infinity serialize to the bare tokens NaN/Infinity,
    which are invalid JSON and make `JSON.parse` on the frontend throw.
    Routing everything through this avoids both failure modes.
    """
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if np.isnan(v) or np.isinf(v):
        return None
    return v


def _downsample(arr, max_points: int):
    arr = np.asarray(arr)
    if len(arr) <= max_points:
        return arr
    step = max(1, len(arr) // max_points)
    return arr[::step]


def _cache_file_for(tic_id: int) -> str:
    return os.path.join(RAW_DIR, f"tic_{tic_id}.npz")


def _parse_tic_id(raw: str) -> int:
    """Accepts "307210830", "TIC 307210830", or "TIC-307210830" alike."""
    digits = re.sub(r"[^0-9]", "", raw)
    if not digits:
        raise HTTPException(status_code=400, detail=f"Could not parse a TIC ID from '{raw}'.")
    return int(digits)


def _list_cached_tic_ids():
    ids = []
    for path in glob.glob(os.path.join(RAW_DIR, "tic_*.npz")):
        m = re.match(r"tic_(\d+)\.npz", os.path.basename(path))
        if m:
            ids.append(int(m.group(1)))
    return sorted(ids)


def _assign_label(snr: float, sec_prim_ratio: float, disposition: str) -> str:
    """Mirrors main.py's label-assignment branch exactly — used only as a
    fallback when no trained classifier is available yet."""
    if snr < 5.0:
        return "Noise"
    if disposition in ("CP", "KP", "PC"):
        return "Planet"
    if disposition == "FP":
        return "Eclipse" if sec_prim_ratio > 0.15 else "Blend"
    return "Noise"


def _analyze_target(tic_id: int, max_lc_points: int, max_periodogram_points: int) -> dict:
    cache_file = _cache_file_for(tic_id)
    if not os.path.exists(cache_file):
        raise HTTPException(
            status_code=404,
            detail=(
                f"No cached light curve for TIC {tic_id}. "
                f"Run `python main.py` first so this target is downloaded into {RAW_DIR}/."
            ),
        )

    lc_data = load_cached_lightcurve(cache_file)
    prep_data = preprocess_lightcurve(lc_data["time"], lc_data["flux"], lc_data["flux_err"])
    bls_res = run_bls_search(prep_data["time"], prep_data["flat_flux"], prep_data["flat_flux_err"])

    if bls_res is None:
        raise HTTPException(
            status_code=422,
            detail=f"BLS search failed for TIC {tic_id} (fewer than 50 valid light-curve points).",
        )

    feats = extract_features(lc_data, bls_res)

    classification = None
    pred_class = None
    if _model_loaded and _classifier.is_trained and feats is not None:
        feats_df = pd.DataFrame([feats])
        pred_class = _classifier.predict(feats_df)[0]
        probs = _classifier.predict_proba(feats_df)[0]
        class_idx = list(_classifier.model.classes_).index(pred_class)

        importances = _classifier.model.feature_importances_
        classification = {
            "label": str(pred_class),
            "confidence": _safe_float(probs[class_idx]),
            "features": [
                {
                    "name": name,
                    "value": _safe_float(feats.get(name, 0.0)),
                    "importance": _safe_float(importance),
                }
                for name, importance in zip(_classifier.feature_names, importances)
            ],
        }

    sec_prim_ratio = feats.get("sec_prim_ratio", 0.0) if feats else 0.0
    fallback_label = _assign_label(bls_res["snr"], sec_prim_ratio, lc_data.get("disposition", ""))
    # NOTE: main.py triggers the trapezoidal fit on
    # `pred_class == "Planet" or assigned_label == "Planet"` — an OR, since
    # during training it wants to plot both what the model predicted AND
    # what the SNR/catalog heuristic originally labeled, for diagnostic
    # comparison. This API instead defers entirely to the trained model
    # once one exists, only falling back to the heuristic when no model is
    # trained yet. For a live single-target lookup the model's own
    # prediction is the more meaningful signal; the heuristic here exists
    # purely so the phase-fold panel still has something to show before
    # you've trained a classifier at all.
    effective_label = pred_class or fallback_label

    fit = None
    if effective_label == "Planet":
        folded_phase, folded_flux, folded_err = compute_phase_folded_lc(
            prep_data["time"], prep_data["flat_flux"], prep_data["flat_flux_err"],
            bls_res["period"], bls_res["epoch"],
        )
        fit_res = fit_transit_parameters(
            folded_phase, folded_flux, folded_err,
            bls_res["period"], bls_res["depth"], bls_res["duration"],
        )
        if fit_res:
            fit = {
                "success": bool(fit_res["success"]),
                "epochOffsetMinutes": _safe_float(fit_res["epoch_offset_days"] * 24 * 60),
                "epochOffsetErrMinutes": _safe_float(fit_res["epoch_offset_err_days"] * 24 * 60),
                "depthPpt": _safe_float(fit_res["depth"] * 1000),
                "depthErrPpt": _safe_float(fit_res["depth_err"] * 1000),
                "durationHours": _safe_float(fit_res["duration_hours"]),
                "durationErrHours": _safe_float(fit_res["duration_err_hours"]),
                "ingressHours": _safe_float(fit_res["ingress_hours"]),
                "ingressErrHours": _safe_float(fit_res["ingress_err_hours"]),
            }

    # --- Light curve: zip time / raw_flux / flat_flux / flat_flux_err / trend ---
    t = _downsample(prep_data["time"], max_lc_points)
    raw_f = _downsample(prep_data["raw_flux"], max_lc_points)
    flat_f = _downsample(prep_data["flat_flux"], max_lc_points)
    flat_err = _downsample(prep_data["flat_flux_err"], max_lc_points)
    trend = _downsample(prep_data["trend"], max_lc_points)

    light_curve = [
        {
            "timestamp": _safe_float(t[i]),
            "rawFlux": _safe_float(raw_f[i]),
            "detrendedFlux": _safe_float(flat_f[i]),
            "trend": _safe_float(trend[i]),
            "fluxError": _safe_float(flat_err[i]),
        }
        for i in range(len(t))
    ]

    # --- Periodogram: zip results.period / results.power, downsampled for transit ---
    bls_results_obj = bls_res["results"]
    periods = _downsample(bls_results_obj.period, max_periodogram_points)
    powers = _downsample(bls_results_obj.power, max_periodogram_points)
    periodogram = [
        {"period": _safe_float(periods[i]), "power": _safe_float(powers[i])} for i in range(len(periods))
    ]

    disposition = lc_data.get("disposition")
    catalog = None
    if disposition and disposition != "unknown":
        catalog = {
            "disposition": disposition,
            "toiId": _safe_float(lc_data.get("toi_id")),
            "periodDays": _safe_float(lc_data.get("true_period")),
            "durationHours": _safe_float(lc_data.get("true_duration")),
            # NOTE: passed through as-is from the TOI table's pl_trandep column.
            # The NASA Exoplanet Archive documents this column in ppm already —
            # verify against your cached data/toi_list.csv header/units before
            # trusting this for a published figure; unlike bls.depth (which this
            # codebase explicitly treats as fractional, see classifier.py's
            # `depth*1000` -> ppt conversions), pl_trandep's unit is asserted by
            # the catalog, not derived in this pipeline, so it isn't re-scaled here.
            "depthPpm": _safe_float(lc_data.get("true_depth")),
        }

    return {
        "id": f"TIC-{tic_id}",
        "status": "LIVE",
        "metadata": {
            "ticId": f"TIC {tic_id}",
            "stellarRadiusSolar": _safe_float(lc_data["st_rad"]),
            "stellarMassSolar": _safe_float(lc_data["st_mass"]),
            "stellarTempKelvin": _safe_float(lc_data["st_teff"]),
        },
        "lightCurve": light_curve,
        "periodogram": periodogram,
        "transit": {
            "bls": {
                "periodDays": _safe_float(bls_res["period"]),
                "durationHours": _safe_float(bls_res["duration"] * 24.0),
                "depth": _safe_float(bls_res["depth"]),
                "power": _safe_float(bls_res["power"]),
                "signalToNoise": _safe_float(bls_res["snr"]),
                "significance": _safe_float(bls_res["significance"]),
                "primaryDepth": _safe_float(bls_res["primary_depth"]),
                "secondaryDepth": _safe_float(bls_res["secondary_depth"]),
                "epochBjd": _safe_float(bls_res["epoch"]),
            },
            "fit": fit,
            "catalog": catalog,
        },
        "classification": classification,
        "lastUpdated": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "classifierLoaded": _model_loaded and _classifier.is_trained,
        "cachedTargets": len(_list_cached_tic_ids()),
    }


@app.get("/api/targets")
def list_targets():
    items = []
    for tic_id in _list_cached_tic_ids():
        try:
            lc_data = load_cached_lightcurve(_cache_file_for(tic_id))
            items.append(
                {
                    "id": f"TIC-{tic_id}",
                    "ticId": f"TIC {tic_id}",
                    "toiId": _safe_float(lc_data.get("toi_id")),
                    "disposition": lc_data.get("disposition"),
                }
            )
        except Exception:
            continue  # skip any cache file that fails to load rather than failing the whole list
    return {"status": "success", "data": items}


@app.get("/api/targets/{raw_tic_id}")
def get_target(
    raw_tic_id: str,
    refresh: bool = Query(False, description="Force recomputation instead of using the in-memory cache."),
    max_lc_points: int = Query(4000, ge=200, le=20000),
    max_periodogram_points: int = Query(1500, ge=100, le=10000),
):
    tic_id = _parse_tic_id(raw_tic_id)

    with _cache_lock:
        if not refresh and tic_id in _target_cache:
            return {"status": "success", "data": _target_cache[tic_id]}

    try:
        payload = _analyze_target(tic_id, max_lc_points=max_lc_points, max_periodogram_points=max_periodogram_points)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Pipeline error for TIC {tic_id}: {exc}")

    with _cache_lock:
        _target_cache[tic_id] = payload

    return {"status": "success", "data": payload}
