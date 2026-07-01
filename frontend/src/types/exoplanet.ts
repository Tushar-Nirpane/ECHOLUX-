/**
 * EchoLux — domain types for the TESS analysis pipeline.
 *
 * These mirror the real field names produced by the Python pipeline
 * (src/data_loader.py, preprocessing.py, dip_detection.py, classifier.py,
 * parameter_estimation.py) — not a generic guess. The API layer's job is
 * to translate snake_case Python dict keys into this shape; see
 * ../backend/api.py for that mapping.
 */

export type SystemStatus = 'LIVE' | 'PROCESSING' | 'IDLE' | 'ERROR';

/**
 * The four classes the RandomForestClassifier in src/classifier.py predicts.
 * Only "Planet" is a positive detection — Eclipse/Blend are astrophysical
 * false positives, Noise means no credible signal.
 */
export type ClassificationLabel = 'Planet' | 'Eclipse' | 'Blend' | 'Noise';

/** TFOPWG catalog disposition, where the target came from the TOI list. */
export type CatalogDisposition = 'CP' | 'KP' | 'PC' | 'FP' | string;

/**
 * Single light-curve sample, aligned across all four arrays returned by
 * preprocess_lightcurve(): time, raw_flux, flat_flux, flat_flux_err, trend.
 */
export interface FluxDataPoint {
  /** time — BTJD (BJD - 2457000), the numeric x-axis. */
  timestamp: number;
  /** raw_flux — sigma-clipped flux, before detrending. */
  rawFlux: number;
  /** flat_flux — Savitzky-Golay flattened, transit-preserving, centered at 1.0. */
  detrendedFlux: number;
  /** trend — the SG filter's fitted long-term trend, divided out of raw_flux to get flat_flux. */
  trend: number;
  /** flat_flux_err */
  fluxError?: number;
}

/** Single sample of a Box Least Squares periodogram (results.period / results.power). */
export interface PeriodogramPoint {
  /** Trial orbital period, in days. */
  period: number;
  /** BLS power at that trial period. */
  power: number;
}

/**
 * One feature consumed by the RandomForestClassifier, paired with this
 * target's actual value and the model's global feature_importances_ for
 * that column (RandomForest importances are per-model, not per-prediction —
 * every target shares the same importance for a given feature name).
 */
export interface MLFeature {
  /** Raw column name from extract_features(), e.g. "bls_snr", "sec_prim_ratio". */
  name: string;
  value: number;
  /** model.feature_importances_ for this column, 0–1. */
  importance: number;
}

/** Output of ExoplanetClassifier.predict() / predict_proba() for a target. */
export interface MLClassification {
  label: ClassificationLabel;
  /** predict_proba() value for the predicted class, 0–1. */
  confidence: number;
  features: MLFeature[];
}

/** Raw Box Least Squares result — always present once run_bls_search() succeeds. */
export interface BlsResult {
  periodDays: number;
  /** bls_duration, converted to hours (extract_features multiplies by 24). */
  durationHours: number;
  /** Fractional transit depth (e.g. 0.0084 for an 0.84% dip). */
  depth: number;
  /** BLS power at the best-fit period. */
  power: number;
  signalToNoise: number;
  /** (peak power − mean power) / std power, in sigma. */
  significance: number;
  primaryDepth: number;
  secondaryDepth: number;
  /** epoch — mid-transit time of the best-fit model, BTJD. */
  epochBjd: number;
}

/**
 * Trapezoidal least-squares fit from fit_transit_parameters(). Only computed
 * for targets the classifier (or BLS SNR) flags as "Planet" — undefined
 * otherwise, mirroring main.py's `if pred_class == "Planet" ...` branch.
 */
export interface TrapezoidFit {
  success: boolean;
  epochOffsetMinutes: number;
  epochOffsetErrMinutes?: number;
  /** Fitted depth, parts-per-thousand. */
  depthPpt: number;
  depthErrPpt?: number;
  durationHours: number;
  durationErrHours?: number;
  ingressHours: number;
  ingressErrHours?: number;
}

/** Catalog "truth" values from the TOI table, when this target is a cataloged TOI. */
export interface CatalogTruth {
  disposition: CatalogDisposition;
  toiId: number;
  periodDays: number;
  durationHours: number;
  depthPpm: number;
}

export interface TransitParameters {
  bls: BlsResult;
  fit?: TrapezoidFit;
  catalog?: CatalogTruth;
}

/** Stellar/catalog metadata. ra/dec/Tmag are fetched by data_loader's TOI
 *  query but not currently persisted into the .npz cache — optional here
 *  until src/data_loader.py's np.savez() call is extended to keep them. */
export interface TargetMetadata {
  /** e.g. "TIC 307210830" */
  ticId: string;
  raDeg?: number;
  decDeg?: number;
  tessMag?: number;
  stellarRadiusSolar: number;
  stellarMassSolar: number;
  stellarTempKelvin: number;
}

/** Full payload returned for a single target. */
export interface ExoplanetTarget {
  id: string;
  status: SystemStatus;
  metadata: TargetMetadata;
  lightCurve: FluxDataPoint[];
  periodogram: PeriodogramPoint[];
  transit: TransitParameters;
  /** Undefined when data/classifier_model.pkl hasn't been trained yet. */
  classification?: MLClassification;
  /** ISO-8601 timestamp of when this response was generated. */
  lastUpdated: string;
}

/** Lightweight entry for the target-catalog list view (GET /api/targets). */
export interface TargetSummary {
  id: string;
  ticId: string;
  toiId?: number;
  disposition?: CatalogDisposition;
}

/** Generic envelope used by /api/targets and /api/targets/{id}. */
export interface ApiResponse<T> {
  status: 'success' | 'error';
  data: T | null;
  message?: string;
}
