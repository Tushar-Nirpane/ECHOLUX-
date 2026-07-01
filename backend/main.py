import os
import sys
import argparse
import pandas as pd
import numpy as np
from src.data_loader import fetch_toi_table, get_representative_targets, download_and_cache_lightcurves, load_cached_lightcurve
from src.preprocessing import preprocess_lightcurve
from src.dip_detection import run_bls_search, compute_phase_folded_lc
from src.classifier import extract_features, ExoplanetClassifier
from src.parameter_estimation import fit_transit_parameters
from src.visualization import plot_diagnostic_results

def log(msg):
    print(msg, flush=True)

def run_pipeline(n_targets=40, force_download=False, sector=None):
    """
    Runs the complete exoplanet detection and classification pipeline.
    """
    log("="*60)
    log("   TESS EXOPLANET DETECTION & CLASSIFICATION PIPELINE   ")
    log("="*60)

    # 1. Download and load TOI Table
    toi_csv = "data/toi_list.csv"
    toi_df = fetch_toi_table(toi_csv, force_download=force_download)

    # 2. Select representative targets
    log(f"\nStep 2: Selecting {n_targets} representative targets from the catalog...")
    n_per_class = max(5, n_targets // 2)
    selected_targets = get_representative_targets(toi_df, n_per_class=n_per_class)

    if len(selected_targets) == 0:
        log("Error: No valid targets selected.")
        return

    log(f"Selected {len(selected_targets)} targets for processing.")
    log(selected_targets[['toi', 'tid', 'tfopwg_disp', 'pl_orbper', 'pl_trandep']].head(10).to_string())

    # 3. Download and cache light curves
    log("\n" + "-"*40)
    log("Step 3: Downloading / loading cached TESS Light Curves")
    log("-"*40)
    raw_dir = "data/raw"
    cached_files = download_and_cache_lightcurves(selected_targets, output_dir=raw_dir, sector=sector)
    log(f"Successfully loaded/downloaded {len(cached_files)} light curves.")

    if len(cached_files) == 0:
        log("Error: No light curves available. Check internet connection or target IDs.")
        return

    # 4. Preprocessing & BLS Dip Detection
    log("\n" + "-"*40)
    log("Step 4: Preprocessing and BLS Dip Detection")
    log("-"*40)

    features_list = []
    labels_list   = []
    results_cache = {}

    for f_path in cached_files:
        lc_data = load_cached_lightcurve(f_path)
        tic_id  = lc_data["tic_id"]
        disp    = lc_data["disposition"]

        log(f"\nProcessing TIC {tic_id} (Catalog Disp: {disp})...")

        prep_data = preprocess_lightcurve(lc_data["time"], lc_data["flux"], lc_data["flux_err"])
        bls_res   = run_bls_search(prep_data["time"], prep_data["flat_flux"], prep_data["flat_flux_err"])

        if bls_res is None:
            log(f"  BLS search failed for TIC {tic_id} — skipping.")
            continue

        # Assign training label from BLS SNR and catalog disposition
        if bls_res["snr"] < 5.0:
            assigned_label = "Noise"
        elif disp in ["CP", "KP", "PC"]:
            # Distinguish EB-type FP by secondary eclipse depth
            sec_ratio = bls_res["secondary_depth"] / bls_res["primary_depth"] if bls_res["primary_depth"] > 1e-6 else 0.0
            assigned_label = "Planet"
        elif disp == "FP":
            sec_ratio = bls_res["secondary_depth"] / bls_res["primary_depth"] if bls_res["primary_depth"] > 1e-6 else 0.0
            assigned_label = "Eclipse" if sec_ratio > 0.15 else "Blend"
        else:
            assigned_label = "Noise"

        log(f"  BLS Period: {bls_res['period']:.4f} d | Depth: {bls_res['depth']*1000:.2f} ppt | "
            f"Duration: {bls_res['duration']*24:.2f} h | SNR: {bls_res['snr']:.1f} | Label: {assigned_label}")

        feats = extract_features(lc_data, bls_res)
        if feats is not None:
            features_list.append(feats)
            labels_list.append(assigned_label)
            results_cache[tic_id] = {
                "lc_data":        lc_data,
                "prep_data":      prep_data,
                "bls_res":        bls_res,
                "assigned_label": assigned_label,
            }

    # 5. Train Classifier
    log("\n" + "-"*40)
    log("Step 5: Training AI Classification Model")
    log("-"*40)

    X = pd.DataFrame(features_list)
    y = np.array(labels_list)

    os.makedirs("data/processed", exist_ok=True)
    X.to_csv("data/processed/features.csv", index=False)
    log(f"Feature dataset: {X.shape[0]} samples × {X.shape[1]} features → data/processed/features.csv")

    unique_labels, label_counts = np.unique(y, return_counts=True)
    log("Class distribution:")
    for lbl, cnt in zip(unique_labels, label_counts):
        log(f"  {lbl}: {cnt}")

    classifier = ExoplanetClassifier()
    if len(unique_labels) < 2:
        log("Warning: < 2 classes, adding synthetic Noise examples to enable training...")
        dummy_X   = X.copy()
        dummy_y   = list(y)
        for i in range(5):
            noise_row = X.iloc[0].copy()
            noise_row["bls_snr"]              = 1.0 + np.random.rand()
            noise_row["bls_depth"]            = 0.0001
            noise_row["estimated_radius_earth"] = 0.05
            dummy_X = pd.concat([dummy_X, pd.DataFrame([noise_row])], ignore_index=True)
            dummy_y.append("Noise")
        classifier.train(dummy_X, np.array(dummy_y))
    else:
        classifier.train(X, y)

    classifier.save("data/classifier_model.pkl")

    # 6. Classify + Fit + Plot
    log("\n" + "-"*40)
    log("Step 6: Transit Fitting & Diagnostic Visualization")
    log("-"*40)
    os.makedirs("data/outputs", exist_ok=True)

    summary_results = []

    for tic_id, cache in results_cache.items():
        lc_data        = cache["lc_data"]
        prep_data      = cache["prep_data"]
        bls_res        = cache["bls_res"]
        assigned_label = cache["assigned_label"]

        feats_df  = pd.DataFrame([extract_features(lc_data, bls_res)])
        pred_class = classifier.predict(feats_df)[0]
        probs      = classifier.predict_proba(feats_df)[0]
        class_idx  = list(classifier.model.classes_).index(pred_class)
        pred_prob  = probs[class_idx]

        log(f"\nTIC {tic_id}:")
        log(f"  True/BLS Label: {assigned_label}  |  AI Prediction: {pred_class} ({pred_prob*100:.1f}%)")

        # Transit fitting (run for all labelled Planets)
        fit_res = None
        if pred_class == "Planet" or assigned_label == "Planet":
            folded_phase, folded_flux, folded_err = compute_phase_folded_lc(
                prep_data["time"], prep_data["flat_flux"], prep_data["flat_flux_err"],
                bls_res["period"], bls_res["epoch"]
            )
            fit_res = fit_transit_parameters(
                folded_phase, folded_flux, folded_err,
                bls_res["period"], bls_res["depth"], bls_res["duration"]
            )
            if fit_res and fit_res.get("success"):
                log(f"  Fit  Period   : {bls_res['period']:.5f} days")
                log(f"  Fit  Depth    : {fit_res['depth']*1000:.3f} ± {fit_res['depth_err']*1000:.3f} ppt")
                log(f"  Fit  Duration : {fit_res['duration_hours']:.3f} ± {fit_res['duration_err_hours']:.3f} hours")
            else:
                log("  Fit failed — using BLS parameters.")

        # Diagnostic plot
        plot_path = f"data/outputs/tic_{tic_id}_diagnostic.png"
        plot_diagnostic_results(lc_data, prep_data, bls_res, fit_res, pred_class, pred_prob, plot_path)

        # Summary row
        if fit_res and fit_res.get("success"):
            depth_str    = f"{fit_res['depth']*1000:.2f} ± {fit_res['depth_err']*1000:.2f}"
            duration_str = f"{fit_res['duration_hours']:.2f} ± {fit_res['duration_err_hours']:.2f}"
        else:
            depth_str    = f"{bls_res['depth']*1000:.2f}"
            duration_str = f"{bls_res['duration']*24:.2f}"

        summary_results.append({
            "TIC_ID":         tic_id,
            "True_Label":     assigned_label,
            "AI_Prediction":  pred_class,
            "Confidence_pct": f"{pred_prob*100:.1f}",
            "Period_days":    f"{bls_res['period']:.5f}",
            "Depth_ppt":      depth_str,
            "Duration_hours": duration_str,
            "BLS_SNR":        f"{bls_res['snr']:.2f}",
            "Significance":   f"{bls_res['significance']:.2f}",
        })

    summary_df = pd.DataFrame(summary_results)
    summary_df.to_csv("data/outputs/pipeline_summary.csv", index=False)

    log("\n" + "="*60)
    log("PIPELINE COMPLETE")
    log("="*60)
    log("\nSummary of Results:")
    log(summary_df.to_string(index=False))
    log(f"\nDiagnostic plots : data/outputs/tic_*_diagnostic.png")
    log(f"Summary CSV      : data/outputs/pipeline_summary.csv")
    log(f"Feature dataset  : data/processed/features.csv")
    log(f"Trained model    : data/classifier_model.pkl")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TESS Exoplanet Detection & Classification Pipeline")
    parser.add_argument("--targets",  type=int, default=15,  help="Number of targets to download and process")
    parser.add_argument("--force",    action="store_true",   help="Force catalog re-download")
    parser.add_argument("--sector",   type=int, default=None, help="TESS Sector filter (optional)")
    args = parser.parse_args()

    run_pipeline(n_targets=args.targets, force_download=args.force, sector=args.sector)
