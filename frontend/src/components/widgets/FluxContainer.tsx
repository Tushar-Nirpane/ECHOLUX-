import { useMemo, useState, type ReactNode } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Brush,
} from 'recharts';
import { ZoomOut, Activity } from 'lucide-react';
import type { FluxDataPoint } from '../../types/exoplanet';

interface FluxContainerProps {
  data: FluxDataPoint[];
  title?: string;
  /** Tailwind col-span/row-span classes — lets the parent bento grid place this widget. */
  className?: string;
}

type ZoomDomain = [number, number] | null;

/** A chart mouse event carries the hovered point's x-value here. Recharts'
 * public types are intentionally loose, so this narrows just what we use. */
interface ChartMouseEvent {
  activeLabel?: string | number;
}

export function FluxContainer({ data, title = 'Light Curve', className = '' }: FluxContainerProps) {
  const [showRaw, setShowRaw] = useState(true);
  const [showDetrended, setShowDetrended] = useState(true);
  const [showTrend, setShowTrend] = useState(false);
  const [refLeft, setRefLeft] = useState<number | null>(null);
  const [refRight, setRefRight] = useState<number | null>(null);
  const [zoomDomain, setZoomDomain] = useState<ZoomDomain>(null);

  // Disabling dots / animation keeps this responsive even at thousands of points.
  const lineProps = { dot: false, isAnimationActive: false, strokeWidth: 1.4 } as const;

  const xDomain = useMemo<[number | string, number | string]>(
    () => zoomDomain ?? ['dataMin', 'dataMax'],
    [zoomDomain],
  );

  const handleMouseDown = (e: ChartMouseEvent) => {
    if (e.activeLabel === undefined) return;
    setRefLeft(Number(e.activeLabel));
    setRefRight(null);
  };

  const handleMouseMove = (e: ChartMouseEvent) => {
    if (refLeft === null || e.activeLabel === undefined) return;
    setRefRight(Number(e.activeLabel));
  };

  const handleMouseUp = () => {
    if (refLeft === null || refRight === null || refLeft === refRight) {
      setRefLeft(null);
      setRefRight(null);
      return;
    }
    const [left, right] = refLeft < refRight ? [refLeft, refRight] : [refRight, refLeft];
    setZoomDomain([left, right]);
    setRefLeft(null);
    setRefRight(null);
  };

  const resetZoom = () => setZoomDomain(null);

  return (
    <div
      className={`rounded-xl border border-space-border bg-space-panel/40 backdrop-blur-md shadow-inset-panel ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-space-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-data" />
          <h3 className="font-mono text-xs uppercase tracking-wider text-slate-300">{title}</h3>
          <span className="font-mono text-[10px] text-slate-500">
            {data.length.toLocaleString()} pts · drag to zoom
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <ToggleChip active={showRaw} colorClass="text-data border-data/40" onClick={() => setShowRaw((v) => !v)}>
            Raw Flux
          </ToggleChip>
          <ToggleChip
            active={showDetrended}
            colorClass="text-transition border-transition/40"
            onClick={() => setShowDetrended((v) => !v)}
          >
            Detrended
          </ToggleChip>
          <ToggleChip active={showTrend} colorClass="text-candidate border-candidate/40" onClick={() => setShowTrend((v) => !v)}>
            SG Trend
          </ToggleChip>
          {zoomDomain && (
            <button
              type="button"
              onClick={resetZoom}
              className="flex items-center gap-1 rounded-md border border-space-border px-2 py-1 font-mono text-[10px] uppercase text-slate-400 hover:border-slate-600 hover:text-slate-200"
            >
              <ZoomOut size={11} /> Reset
            </button>
          )}
        </div>
      </div>

      <div className="px-2 py-3">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={data}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={xDomain}
              allowDataOverflow
              stroke="#475569"
              tick={{ fontSize: 11, fontFamily: 'monospace', fill: '#64748b' }}
              tickFormatter={(v: number) => `${v.toFixed(1)}d`}
            />
            <YAxis
              stroke="#475569"
              tick={{ fontSize: 11, fontFamily: 'monospace', fill: '#64748b' }}
              domain={['auto', 'auto']}
              width={56}
              tickFormatter={(v: number) => v.toFixed(3)}
            />
            <Tooltip content={<FluxTooltip />} />

            {showRaw && <Line dataKey="rawFlux" stroke="#38bdf8" name="Raw Flux" {...lineProps} />}
            {showDetrended && (
              <Line dataKey="detrendedFlux" stroke="#818cf8" name="Detrended Flux" {...lineProps} />
            )}
            {showTrend && <Line dataKey="trend" stroke="#facc15" name="SG Trend" strokeDasharray="4 2" {...lineProps} />}

            {refLeft !== null && refRight !== null && (
              <ReferenceArea x1={refLeft} x2={refRight} fill="#38bdf8" fillOpacity={0.12} stroke="#38bdf8" strokeOpacity={0.4} />
            )}

            <Brush
              dataKey="timestamp"
              height={22}
              stroke="#38bdf8"
              fill="#0f172a"
              travellerWidth={8}
              tickFormatter={(v: number) => `${v.toFixed(0)}d`}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ToggleChip({
  active,
  colorClass,
  onClick,
  children,
}: {
  active: boolean;
  colorClass: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors ${
        active ? `${colorClass} bg-white/[0.03]` : 'border-space-border text-slate-600 hover:text-slate-400'
      }`}
    >
      {children}
    </button>
  );
}

function FluxTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-space-border bg-space-panel/95 px-3 py-2 font-mono text-[11px] shadow-lg backdrop-blur-md">
      <div className="mb-1 text-slate-500">t = {Number(label).toFixed(3)}d</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2" style={{ color: p.color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: {Number(p.value).toFixed(5)}
        </div>
      ))}
    </div>
  );
}

export default FluxContainer;
