import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Crosshair } from 'lucide-react';
import type { BlsResult, FluxDataPoint, TrapezoidFit } from '../../types/exoplanet';

interface PhaseFoldedViewProps {
  lightCurve: FluxDataPoint[];
  bls: BlsResult;
  /** From parameter_estimation.py's fit_transit_parameters() — undefined when the target wasn't classified "Planet". */
  fit?: TrapezoidFit;
  title?: string;
  className?: string;
  /** Number of phase bins across the displayed window. */
  binCount?: number;
}

interface FoldedPoint {
  phaseHours: number;
  flux: number;
}

/**
 * Panel D — phase-folds the light curve around the BLS (or fit-refined)
 * epoch, bins it, and overlays the trapezoidal least-squares model from
 * parameter_estimation.py as a smooth curve. Mirrors what
 * src/visualization.py's fourth panel draws, but interactive.
 */
export function PhaseFoldedView({
  lightCurve,
  bls,
  fit,
  title = 'Phase-Folded Transit',
  className = '',
  binCount = 60,
}: PhaseFoldedViewProps) {
  const [showRaw, setShowRaw] = useState(true);

  // Fold around the fit's refined epoch when available — fit.epochOffsetMinutes
  // is a small correction (typically minutes) on top of the BLS epoch.
  const effectiveEpoch = bls.epochBjd + (fit ? fit.epochOffsetMinutes / 1440 : 0);
  const windowHours = Math.max(2, (fit?.durationHours ?? bls.durationHours) * 3);

  const { raw, binned } = useMemo(
    () => foldAndBin(lightCurve, bls.periodDays, effectiveEpoch, windowHours, binCount),
    [lightCurve, bls.periodDays, effectiveEpoch, windowHours, binCount],
  );

  const modelCurve = useMemo(
    () => (fit ? buildTrapezoidCurve(windowHours, fit) : null),
    [fit, windowHours],
  );

  return (
    <div
      className={`rounded-xl border border-space-border bg-space-panel/40 backdrop-blur-md shadow-inset-panel ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-space-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Crosshair size={14} className="text-anomaly" />
          <h3 className="font-mono text-xs uppercase tracking-wider text-slate-300">{title}</h3>
        </div>

        <div className="flex items-center gap-3">
          {fit && (
            <span className="font-mono text-[10px] text-slate-500">
              depth {fit.depthPpt.toFixed(2)}ppt · dur {fit.durationHours.toFixed(2)}h
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className={`rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors ${
              showRaw ? 'border-data/40 text-data bg-white/[0.03]' : 'border-space-border text-slate-600 hover:text-slate-400'
            }`}
          >
            Raw Points
          </button>
        </div>
      </div>

      <div className="px-2 py-3">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
            <XAxis
              type="number"
              dataKey="phaseHours"
              domain={[-windowHours, windowHours]}
              stroke="#475569"
              tick={{ fontSize: 11, fontFamily: 'monospace', fill: '#64748b' }}
              tickFormatter={(v: number) => `${v.toFixed(1)}h`}
              label={{ value: 'Hours from mid-transit', position: 'insideBottom', offset: -2, fill: '#475569', fontSize: 10 }}
            />
            <YAxis
              type="number"
              dataKey="flux"
              domain={['auto', 'auto']}
              stroke="#475569"
              tick={{ fontSize: 11, fontFamily: 'monospace', fill: '#64748b' }}
              width={56}
              tickFormatter={(v: number) => v.toFixed(4)}
            />
            <Tooltip content={<PhaseFoldTooltip />} />

            {showRaw && (
              <Scatter data={raw} dataKey="flux" fill="#38bdf8" fillOpacity={0.12} isAnimationActive={false} name="Raw" shape="circle" />
            )}
            <Scatter data={binned} dataKey="flux" fill="#818cf8" isAnimationActive={false} name="Binned" shape="circle" />
            {modelCurve && (
              <Line
                data={modelCurve}
                dataKey="flux"
                stroke="#f87171"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Trapezoidal Fit"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {!fit && (
          <p className="px-2 pt-1 font-mono text-[10px] text-slate-500">
            No trapezoidal fit — target not classified as "Planet".
          </p>
        )}
      </div>
    </div>
  );
}

function PhaseFoldTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-md border border-space-border bg-space-panel/95 px-3 py-2 font-mono text-[11px] shadow-lg backdrop-blur-md">
      <div className="text-slate-500">{Number(p.payload.phaseHours).toFixed(3)}h from mid-transit</div>
      <div style={{ color: p.color }}>flux: {Number(p.payload.flux).toFixed(5)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function foldAndBin(
  lightCurve: FluxDataPoint[],
  periodDays: number,
  epochBjd: number,
  windowHours: number,
  binCount: number,
): { raw: FoldedPoint[]; binned: FoldedPoint[] } {
  const raw: FoldedPoint[] = [];
  for (const p of lightCurve) {
    let dt = p.timestamp - epochBjd;
    dt -= periodDays * Math.round(dt / periodDays); // wrap into [-period/2, +period/2] days
    const phaseHours = dt * 24;
    if (Math.abs(phaseHours) <= windowHours) {
      raw.push({ phaseHours, flux: p.detrendedFlux });
    }
  }
  raw.sort((a, b) => a.phaseHours - b.phaseHours);

  const binWidth = (2 * windowHours) / binCount;
  const sums = new Array(binCount).fill(0);
  const counts = new Array(binCount).fill(0);
  for (const pt of raw) {
    let idx = Math.floor((pt.phaseHours + windowHours) / binWidth);
    idx = Math.min(binCount - 1, Math.max(0, idx));
    sums[idx] += pt.flux;
    counts[idx] += 1;
  }
  const binned: FoldedPoint[] = [];
  for (let i = 0; i < binCount; i++) {
    if (counts[i] > 0) {
      binned.push({ phaseHours: -windowHours + (i + 0.5) * binWidth, flux: sums[i] / counts[i] });
    }
  }

  return { raw, binned };
}

/** Symmetric trapezoid: flat bottom at 1 - depth, linear ingress/egress ramps, 1 outside total duration. */
function buildTrapezoidCurve(windowHours: number, fit: TrapezoidFit, samples = 240): FoldedPoint[] {
  const depthFrac = fit.depthPpt / 1000;
  const totalHalf = fit.durationHours / 2;
  const flatHalf = Math.max(0, totalHalf - fit.ingressHours);
  const rampWidth = Math.max(totalHalf - flatHalf, 1e-6);

  const curve: FoldedPoint[] = [];
  for (let i = 0; i <= samples; i++) {
    const phaseHours = -windowHours + (i / samples) * 2 * windowHours;
    const abs = Math.abs(phaseHours);
    let flux: number;
    if (abs >= totalHalf) flux = 1;
    else if (abs <= flatHalf) flux = 1 - depthFrac;
    else flux = 1 - depthFrac * ((totalHalf - abs) / rampWidth);
    curve.push({ phaseHours, flux });
  }
  return curve;
}

export default PhaseFoldedView;
