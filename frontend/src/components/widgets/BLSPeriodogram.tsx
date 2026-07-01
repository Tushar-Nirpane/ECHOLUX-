import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Radar } from 'lucide-react';
import type { PeriodogramPoint } from '../../types/exoplanet';

interface BLSPeriodogramProps {
  data: PeriodogramPoint[];
  /** Best-fit period from the BLS search, in days — drawn as a reference line. */
  bestPeriod?: number;
  title?: string;
  className?: string;
}

export function BLSPeriodogram({
  data,
  bestPeriod,
  title = 'BLS Periodogram',
  className = '',
}: BLSPeriodogramProps) {
  const peakPower = useMemo(
    () => (data.length > 0 ? Math.max(...data.map((d) => d.power)) : null),
    [data],
  );

  return (
    <div
      className={`rounded-xl border border-space-border bg-space-panel/40 backdrop-blur-md shadow-inset-panel ${className}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-space-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Radar size={14} className="text-confirmed" />
          <h3 className="font-mono text-xs uppercase tracking-wider text-slate-300">{title}</h3>
        </div>
        {bestPeriod !== undefined && (
          <span className="rounded-md border border-confirmed/30 bg-confirmed/10 px-2 py-0.5 font-mono text-[10px] text-confirmed">
            P = {bestPeriod.toFixed(3)}d
          </span>
        )}
      </div>

      <div className="px-2 py-3">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="blsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="period"
              type="number"
              domain={['dataMin', 'dataMax']}
              stroke="#475569"
              tick={{ fontSize: 11, fontFamily: 'monospace', fill: '#64748b' }}
              tickFormatter={(v: number) => `${v.toFixed(1)}d`}
              label={{ value: 'Trial Period (days)', position: 'insideBottom', offset: -2, fill: '#475569', fontSize: 10 }}
            />
            <YAxis
              stroke="#475569"
              tick={{ fontSize: 11, fontFamily: 'monospace', fill: '#64748b' }}
              width={48}
              tickFormatter={(v: number) => v.toFixed(2)}
            />
            <Tooltip content={<PeriodogramTooltip />} />

            <Area
              type="monotone"
              dataKey="power"
              stroke="#22c55e"
              strokeWidth={1.3}
              fill="url(#blsFill)"
              dot={false}
              isAnimationActive={false}
              name="BLS Power"
            />

            {bestPeriod !== undefined && (
              <ReferenceLine
                x={bestPeriod}
                stroke="#facc15"
                strokeDasharray="4 4"
                label={{ value: 'Best Period', position: 'top', fill: '#facc15', fontSize: 10 }}
              />
            )}
            {peakPower !== null && <ReferenceLine y={peakPower} stroke="#1e293b" strokeDasharray="2 4" />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PeriodogramTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-space-border bg-space-panel/95 px-3 py-2 font-mono text-[11px] shadow-lg backdrop-blur-md">
      <div className="text-slate-500">period = {Number(label).toFixed(3)}d</div>
      <div className="flex items-center gap-2 text-confirmed">
        <span className="h-1.5 w-1.5 rounded-full bg-confirmed" />
        power: {Number(payload[0].value).toFixed(4)}
      </div>
    </div>
  );
}

export default BLSPeriodogram;
