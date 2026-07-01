import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClassificationLabel,
  ExoplanetTarget,
  FluxDataPoint,
  MLClassification,
  PeriodogramPoint,
} from '../types/exoplanet';

/** Set in .env (copy .env.example) once ../backend/api.py is running. */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');

interface ApiEnvelope<T> {
  status: 'success' | 'error';
  data: T | null;
  message?: string;
}

/**
 * useExoplanetData
 * -----------------
 * When VITE_API_BASE_URL is set (see ../backend/api.py), this calls the
 * real `GET /api/targets/{id}` endpoint and returns its data as-is — a
 * real failure here surfaces as a real error, it never silently falls
 * back to fake data. That fallback would be actively dangerous in front
 * of judges: it would mean a crashed backend shows up as confident-looking
 * fake classification results instead of an obvious error.
 *
 * When VITE_API_BASE_URL is unset, this generates realistic mock data
 * instead — deterministic per target ID — so the UI is fully workable
 * before the backend is wired up. `isMock` tells consumers which mode
 * they're in; MissionControlPage uses it to show an on-screen badge so
 * it's never ambiguous which one you're looking at.
 *
 * Pass `simulateError` to force the error branch for UI testing (mock
 * mode only).
 */
export function useExoplanetData(targetId: string, simulateError = false) {
  const [data, setData] = useState<ExoplanetTarget | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const requestId = useRef(0);
  const isMock = !API_BASE_URL;

  const fetchTarget = useCallback(() => {
    const thisRequest = ++requestId.current;
    setIsLoading(true);
    setIsError(false);
    setError(null);

    if (API_BASE_URL) {
      fetch(`${API_BASE_URL}/api/targets/${encodeURIComponent(targetId)}`)
        .then(async (res) => {
          const json: ApiEnvelope<ExoplanetTarget> = await res.json().catch(() => {
            throw new Error(`Backend returned non-JSON response (HTTP ${res.status})`);
          });
          if (!res.ok || json.status === 'error') {
            throw new Error(json.message ?? `Backend error (HTTP ${res.status})`);
          }
          if (!json.data) throw new Error('Backend returned an empty payload.');
          return json.data;
        })
        .then((target) => {
          if (thisRequest !== requestId.current) return;
          setData(target);
          setIsLoading(false);
        })
        .catch((err: unknown) => {
          if (thisRequest !== requestId.current) return;
          setIsError(true);
          setError(
            err instanceof Error
              ? err
              : new Error(`Could not reach the EchoLux API at ${API_BASE_URL}`),
          );
          setIsLoading(false);
        });
      return;
    }

    // Mock mode — stands in for BLS-search + classifier-inference latency.
    const delay = 900 + Math.random() * 700;
    window.setTimeout(() => {
      if (thisRequest !== requestId.current) return; // a refetch superseded this one

      if (simulateError) {
        setIsError(true);
        setError(new Error(`Pipeline error: no cached light curve for ${targetId}`));
        setIsLoading(false);
        return;
      }

      try {
        setData(generateMockTarget(targetId));
        setIsLoading(false);
      } catch (err) {
        setIsError(true);
        setError(err instanceof Error ? err : new Error('Unknown pipeline error'));
        setIsLoading(false);
      }
    }, delay);
  }, [targetId, simulateError]);

  useEffect(() => {
    fetchTarget();
  }, [fetchTarget]);

  return { data, isLoading, isError, error, isMock, refetch: fetchTarget };
}

// ---------------------------------------------------------------------------
// Mock data generation — mirrors src/preprocessing.py, dip_detection.py,
// classifier.py, and parameter_estimation.py closely enough to develop the
// UI against, without running the real (slow, network-bound) pipeline.
// ---------------------------------------------------------------------------

/** Deterministic PRNG so a given targetId always produces the same "mission". */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

function generateLightCurve(
  rand: () => number,
  periodDays: number,
  durationHours: number,
  depthFrac: number,
): FluxDataPoint[] {
  // preprocess_lightcurve caps at MAX_PREPROCESS_POINTS=15000; this mock uses
  // a coarser cadence so it stays light in the browser during development.
  const sectorSpanDays = 27.4;
  const cadenceMinutes = 30;
  const totalPoints = Math.floor((sectorSpanDays * 24 * 60) / cadenceMinutes);
  const durationDays = durationHours / 24;

  const points: FluxDataPoint[] = [];
  for (let i = 0; i < totalPoints; i++) {
    const t = (i * cadenceMinutes) / 60 / 24;

    // Stands in for the Savitzky-Golay trend that preprocess_lightcurve fits
    // and divides out — slow instrumental drift + stellar variability.
    const trend =
      1 + 0.0009 * Math.sin((2 * Math.PI * t) / 13.7) + 0.0004 * Math.sin((2 * Math.PI * t) / 2.3);

    const phase = ((t % periodDays) + periodDays) % periodDays;
    const distanceFromMid = Math.min(phase, periodDays - phase);
    const inTransit = distanceFromMid < durationDays / 2;
    const transitDip = inTransit ? depthFrac : 0;

    const photonNoise = (rand() - 0.5) * 0.00045;

    const detrendedFlux = 1 - transitDip + photonNoise; // flat_flux equivalent
    const rawFlux = detrendedFlux * trend; // raw_flux equivalent (pre-flattening)

    points.push({
      timestamp: Math.round(t * 1000) / 1000,
      rawFlux: Math.round(rawFlux * 1e6) / 1e6,
      detrendedFlux: Math.round(detrendedFlux * 1e6) / 1e6,
      trend: Math.round(trend * 1e6) / 1e6,
      fluxError: 0.00022,
    });
  }
  return points;
}

function generatePeriodogram(rand: () => number, truePeriod: number): PeriodogramPoint[] {
  const points: PeriodogramPoint[] = [];
  const minPeriod = 0.5;
  const maxPeriod = 15;
  const steps = 600; // real BLS grids run far denser; downsampled here for the chart

  for (let i = 0; i < steps; i++) {
    const period = minPeriod + ((maxPeriod - minPeriod) * i) / (steps - 1);
    let power = 0.05 + rand() * 0.04;

    const harmonics = [1, 0.5, 2, 1 / 3];
    const weights = [1, 0.38, 0.22, 0.15];
    harmonics.forEach((h, idx) => {
      const center = truePeriod * h;
      const width = 0.04 + center * 0.01;
      const dist = Math.abs(period - center);
      power += weights[idx] * Math.exp(-(dist * dist) / (2 * width * width));
    });

    points.push({ period: Math.round(period * 1000) / 1000, power: Math.round(power * 1000) / 1000 });
  }
  return points;
}

/**
 * Mirrors main.py's label-assignment branch:
 *   snr < 5            -> Noise
 *   CP/KP/PC + ok       -> Planet
 *   FP, sec/prim > 0.15 -> Eclipse
 *   FP, otherwise       -> Blend
 */
function assignLabel(snr: number, secPrimRatio: number, disposition: string): ClassificationLabel {
  if (snr < 5.0) return 'Noise';
  if (disposition === 'CP' || disposition === 'KP' || disposition === 'PC') return 'Planet';
  if (disposition === 'FP') return secPrimRatio > 0.15 ? 'Eclipse' : 'Blend';
  return 'Noise';
}

// Global feature_importances_ as they'd come off a typical trained
// RandomForestClassifier for this feature set — used to weight the bars in
// MLClassificationCard. Same shape model.feature_importances_ would produce.
// All 13 keys here are confirmed (via executing the real extract_features()
// against synthetic data) to be exactly what the real classifier trains on.
const FEATURE_IMPORTANCES: Record<string, number> = {
  sec_prim_ratio: 0.18,
  bls_significance: 0.15,
  bls_snr: 0.14,
  bls_duration: 0.1,
  dur_ratio: 0.09,
  depth_to_noise: 0.08,
  bls_depth: 0.07,
  flux_std: 0.06,
  estimated_radius_earth: 0.05,
  bls_period: 0.03,
  st_teff: 0.02,
  st_rad: 0.015,
  st_mass: 0.015,
};

function generateClassification(
  rand: () => number,
  features: Record<string, number>,
  disposition: string,
): MLClassification {
  const label = assignLabel(features.bls_snr, features.sec_prim_ratio, disposition);
  const confidence = Math.min(0.99, 0.7 + (features.bls_snr / 40) * 0.25 + rand() * 0.04);

  return {
    label,
    confidence: Math.round(confidence * 1000) / 1000,
    features: Object.entries(FEATURE_IMPORTANCES).map(([name, importance]) => ({
      name,
      value: Math.round((features[name] ?? 0) * 1000) / 1000,
      importance,
    })),
  };
}

export function generateMockTarget(targetId: string): ExoplanetTarget {
  const seed = hashSeed(targetId || 'TIC-0000');
  const rand = mulberry32(seed);

  const dispositions = ['CP', 'KP', 'PC', 'FP'];
  const disposition = dispositions[Math.floor(rand() * dispositions.length)];

  const periodDays = Math.round((1.5 + rand() * 11) * 1000) / 1000;
  const durationHours = Math.round((1.5 + rand() * 4) * 10) / 10;
  const depthFrac = Math.round((0.0003 + rand() * 0.0022) * 1e6) / 1e6;
  const snr = Math.round((3 + rand() * 17) * 10) / 10;
  const significance = Math.round((snr * 0.8 + rand() * 2) * 100) / 100;

  const stRad = Math.round((0.6 + rand() * 2.5) * 100) / 100;
  const stMass = Math.round((0.5 + rand() * 1.8) * 100) / 100;
  const stTeff = Math.round(4200 + rand() * 4000);

  const primaryDepth = depthFrac;
  const secondaryDepth = Math.round(rand() * 0.4 * depthFrac * 1e6) / 1e6;
  const secPrimRatio = primaryDepth > 1e-6 ? Math.round((secondaryDepth / primaryDepth) * 1000) / 1000 : 0;

  // estimate_planet_radius(): R_p[R_earth] = st_rad * sqrt(depth) * 109.2
  const estimatedRadiusEarth = Math.round(stRad * Math.sqrt(depthFrac) * 109.2 * 100) / 100;
  const durRatio = Math.round((0.7 + rand() * 0.6) * 1000) / 1000;
  const fluxStd = 0.0006 + rand() * 0.0004;
  const depthToNoise = Math.round((depthFrac / fluxStd) * 100) / 100;

  const features = {
    bls_period: periodDays,
    bls_depth: depthFrac,
    bls_duration: durationHours,
    bls_snr: snr,
    bls_significance: significance,
    st_rad: stRad,
    st_mass: stMass,
    st_teff: stTeff,
    estimated_radius_earth: estimatedRadiusEarth,
    dur_ratio: durRatio,
    sec_prim_ratio: secPrimRatio,
    flux_std: Math.round(fluxStd * 1e6) / 1e6,
    depth_to_noise: depthToNoise,
  };

  const classification = generateClassification(rand, features, disposition);
  const ticId = `TIC ${100000000 + Math.floor(rand() * 899999999)}`;

  const target: ExoplanetTarget = {
    id: targetId,
    status: rand() > 0.75 ? 'PROCESSING' : 'LIVE',
    metadata: {
      ticId,
      stellarRadiusSolar: stRad,
      stellarMassSolar: stMass,
      stellarTempKelvin: stTeff,
    },
    lightCurve: generateLightCurve(rand, periodDays, durationHours, depthFrac),
    periodogram: generatePeriodogram(rand, periodDays),
    transit: {
      bls: {
        periodDays,
        durationHours,
        depth: depthFrac,
        power: Math.round((0.4 + rand() * 0.5) * 1000) / 1000,
        signalToNoise: snr,
        significance,
        primaryDepth,
        secondaryDepth,
        epochBjd: Math.round((1791 + rand() * 27) * 1000) / 1000,
      },
      catalog: {
        disposition,
        toiId: Math.round((1000 + rand() * 5000) * 10) / 10,
        periodDays: Math.round(periodDays * (0.99 + rand() * 0.02) * 1000) / 1000,
        durationHours: Math.round(durationHours * (0.97 + rand() * 0.06) * 10) / 10,
        depthPpm: Math.round(depthFrac * 1e6 * (0.95 + rand() * 0.1)),
      },
    },
    classification,
    lastUpdated: new Date().toISOString(),
  };

  // Trapezoidal fit only runs for "Planet" predictions, mirroring main.py.
  if (classification.label === 'Planet') {
    const depthPpt = depthFrac * 1000 * (0.97 + rand() * 0.06);
    target.transit.fit = {
      success: true,
      epochOffsetMinutes: Math.round((rand() - 0.5) * 12 * 100) / 100,
      epochOffsetErrMinutes: Math.round(rand() * 2 * 100) / 100,
      depthPpt: Math.round(depthPpt * 1000) / 1000,
      depthErrPpt: Math.round(depthPpt * 0.06 * 1000) / 1000,
      durationHours: Math.round(durationHours * (0.98 + rand() * 0.04) * 1000) / 1000,
      durationErrHours: Math.round(durationHours * 0.05 * 1000) / 1000,
      ingressHours: Math.round(durationHours * 0.12 * 1000) / 1000,
      ingressErrHours: Math.round(durationHours * 0.015 * 1000) / 1000,
    };
  }

  return target;
}
