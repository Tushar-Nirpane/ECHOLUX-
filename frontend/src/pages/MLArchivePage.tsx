import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BadgeCheck, CircleAlert, CircleHelp, CircleSlash, Database, HelpCircle } from 'lucide-react';
import { useTargetList } from '../hooks/useTargetList';
import type { ClassificationLabel } from '../types/exoplanet';

interface MLArchivePageProps {
  onSelectTarget: (targetId: string) => void;
}

const LABEL_META: Record<ClassificationLabel, {
  icon: typeof BadgeCheck;
  text: string;
  bg: string;
  border: string;
  glow: string;
  hex: string;
}> = {
  Planet: {
    icon: BadgeCheck,
    text: 'text-confirmed',
    bg: 'bg-confirmed/10',
    border: 'border-confirmed/30',
    glow: 'shadow-glow-emerald',
    hex: '#22c55e',
  },
  Eclipse: {
    icon: CircleAlert,
    text: 'text-anomaly',
    bg: 'bg-anomaly/10',
    border: 'border-anomaly/30',
    glow: 'shadow-glow-red',
    hex: '#f87171',
  },
  Blend: {
    icon: CircleHelp,
    text: 'text-candidate',
    bg: 'bg-candidate/10',
    border: 'border-candidate/30',
    glow: 'shadow-glow-amber',
    hex: '#facc15',
  },
  Noise: {
    icon: CircleSlash,
    text: 'text-slate-400',
    bg: 'bg-slate-500/10',
    border: 'border-slate-600',
    glow: '',
    hex: '#64748b',
  },
};

/** Distinct from LABEL_META['Noise'] — this is "we don't know", not "the model said noise". */
const UNCLASSIFIED_META = {
  icon: HelpCircle,
  text: 'text-slate-500',
  bg: 'bg-slate-800/30',
  border: 'border-slate-700 border-dashed',
  glow: '',
  hex: '#475569',
};

const FILTERS: Array<ClassificationLabel | 'ALL' | 'UNCLASSIFIED'> = ['ALL', 'Planet', 'Eclipse', 'Blend', 'Noise', 'UNCLASSIFIED'];

function MiniGauge({ confidence, color }: { confidence: number; color: string }) {
  const size = 72;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative flex h-[72px] w-[72px] items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - confidence)}
          style={{ filter: `drop-shadow(0 0 4px ${color}60)` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-mono text-sm font-semibold text-slate-100">{Math.round(confidence * 100)}%</span>
      </div>
    </div>
  );
}

export function MLArchivePage({ onSelectTarget }: MLArchivePageProps) {
  const { data, isLoading, isError } = useTargetList();
  const [activeFilter, setActiveFilter] = useState<ClassificationLabel | 'ALL' | 'UNCLASSIFIED'>('ALL');

  const filtered = useMemo(() => {
    if (activeFilter === 'ALL') return data;
    if (activeFilter === 'UNCLASSIFIED') return data.filter((t) => !t.lastClassification);
    return data.filter((t) => t.lastClassification === activeFilter);
  }, [data, activeFilter]);

  const unclassifiedCount = useMemo(() => data.filter((t) => !t.lastClassification).length, [data]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-4"
    >
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Database size={15} className="text-transition" />
          <h2 className="font-mono text-sm uppercase tracking-wider text-slate-300">ML Classification Archive</h2>
        </div>
        <div className="ml-auto flex gap-1.5">
          {FILTERS.map((f) => {
            const meta = f === 'ALL' ? null : f === 'UNCLASSIFIED' ? UNCLASSIFIED_META : LABEL_META[f];
            return (
              <button
                key={f}
                type="button"
                onClick={() => setActiveFilter(f)}
                className={`rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase transition-colors ${
                  activeFilter === f
                    ? meta ? `${meta.text} ${meta.bg} ${meta.border}` : 'border-data/40 bg-data/10 text-data'
                    : 'border-space-border text-slate-500 hover:text-slate-300'
                }`}
              >
                {f === 'UNCLASSIFIED' ? 'Unclassified' : f}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-data border-t-transparent" />
        </div>
      )}
      {isError && (
        <p className="py-16 text-center font-mono text-xs text-anomaly">Failed to load archive.</p>
      )}

      {!isLoading && !isError && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {(['Planet', 'Eclipse', 'Blend', 'Noise'] as ClassificationLabel[]).map((label) => {
              const count = data.filter((t) => t.lastClassification === label).length;
              const meta = LABEL_META[label];
              const Icon = meta.icon;
              return (
                <div key={label} className={`rounded-xl border ${meta.border} ${meta.bg} px-4 py-3 backdrop-blur-md`}>
                  <div className="flex items-center gap-2">
                    <Icon size={13} className={meta.text} />
                    <span className={`font-mono text-[10px] uppercase ${meta.text}`}>{label}</span>
                  </div>
                  <p className={`mt-1 font-mono text-2xl font-semibold ${meta.text}`}>{count}</p>
                </div>
              );
            })}
            {/* Kept separate from the loop above deliberately — "no classification
                data" (e.g. /api/targets doesn't return it yet) is a different fact
                from "the model looked and found noise", and must never render
                identically to the real Noise bucket. */}
            <div className={`rounded-xl border ${UNCLASSIFIED_META.border} ${UNCLASSIFIED_META.bg} px-4 py-3 backdrop-blur-md`}>
              <div className="flex items-center gap-2">
                <HelpCircle size={13} className={UNCLASSIFIED_META.text} />
                <span className={`font-mono text-[10px] uppercase ${UNCLASSIFIED_META.text}`}>Unclassified</span>
              </div>
              <p className={`mt-1 font-mono text-2xl font-semibold ${UNCLASSIFIED_META.text}`}>{unclassifiedCount}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filtered.map((target, i) => {
              const hasClassification = !!target.lastClassification;
              const meta = hasClassification ? LABEL_META[target.lastClassification!] : UNCLASSIFIED_META;
              const Icon = meta.icon;
              return (
                <motion.div
                  key={target.id}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className={`rounded-xl border ${meta.border} bg-space-panel/40 backdrop-blur-md p-4 flex flex-col gap-3 ${meta.glow}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono text-[10px] text-slate-500">TIC ID</p>
                      <p className="font-mono text-xs text-data">{target.ticId}</p>
                    </div>
                    <span className={`flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${meta.text} ${meta.bg} ${meta.border}`}>
                      <Icon size={9} /> {hasClassification ? target.lastClassification : 'No Data'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {hasClassification ? (
                      <MiniGauge confidence={target.confidence ?? 0} color={meta.hex} />
                    ) : (
                      <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full border border-dashed border-slate-700">
                        <span className="font-mono text-[9px] text-slate-600">N/A</span>
                      </div>
                    )}
                    <div className="space-y-1.5 flex-1">
                      <DataRow label="Disp." value={target.disposition ?? '—'} />
                      <DataRow label="R★" value={target.stellarRadiusSolar !== undefined ? `${target.stellarRadiusSolar.toFixed(2)} R☉` : '—'} />
                      <DataRow label="Sec/Pri" value={target.secPrimRatio?.toFixed(3) ?? '—'} />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectTarget(target.id)}
                    className={`w-full rounded-md border py-1.5 font-mono text-[10px] uppercase transition-colors ${meta.border} ${meta.bg} ${meta.text} hover:brightness-125`}
                  >
                    View Analysis →
                  </button>
                </motion.div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <p className="py-12 text-center font-mono text-xs text-slate-600">
              No targets in this category.
            </p>
          )}
        </>
      )}
    </motion.div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="font-mono text-[9px] text-slate-500">{label}</span>
      <span className="font-mono text-[10px] text-slate-300">{value}</span>
    </div>
  );
}
