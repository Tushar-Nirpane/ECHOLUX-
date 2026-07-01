import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BadgeCheck, CircleAlert, CircleHelp, CircleSlash, BrainCircuit } from 'lucide-react';
import type { ClassificationLabel, MLClassification } from '../../types/exoplanet';

interface MLClassificationCardProps {
  /** Undefined when data/classifier_model.pkl hasn't been trained yet — renders an empty state. */
  classification?: MLClassification;
  title?: string;
  className?: string;
  /** How many features to show, ranked by the model's feature_importances_. */
  maxFeatures?: number;
}

const LABEL_META: Record<
  ClassificationLabel,
  { hex: string; text: string; bg: string; border: string; icon: typeof BadgeCheck; copy: string }
> = {
  Planet: {
    hex: '#22c55e',
    text: 'text-confirmed',
    bg: 'bg-confirmed/10',
    border: 'border-confirmed/30',
    icon: BadgeCheck,
    copy: 'Planet',
  },
  Eclipse: {
    hex: '#f87171',
    text: 'text-anomaly',
    bg: 'bg-anomaly/10',
    border: 'border-anomaly/30',
    icon: CircleAlert,
    copy: 'Eclipsing Binary',
  },
  Blend: {
    hex: '#facc15',
    text: 'text-candidate',
    bg: 'bg-candidate/10',
    border: 'border-candidate/30',
    icon: CircleHelp,
    copy: 'Blend (Ambiguous)',
  },
  Noise: {
    hex: '#64748b',
    text: 'text-slate-400',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/30',
    icon: CircleSlash,
    copy: 'Noise',
  },
};

export function MLClassificationCard({
  classification,
  title = 'Vetting Classifier',
  className = '',
  maxFeatures = 6,
}: MLClassificationCardProps) {
  const topFeatures = useMemo(
    () =>
      classification
        ? [...classification.features].sort((a, b) => b.importance - a.importance).slice(0, maxFeatures)
        : [],
    [classification, maxFeatures],
  );

  if (!classification) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-space-border bg-space-panel/40 px-4 py-10 text-center backdrop-blur-md shadow-inset-panel ${className}`}
      >
        <BrainCircuit className="text-slate-600" size={24} />
        <p className="font-mono text-xs text-slate-500">Classifier not trained yet</p>
        <p className="max-w-xs font-mono text-[10px] text-slate-600">
          Run <code>python main.py</code> to train data/classifier_model.pkl, then refresh.
        </p>
      </div>
    );
  }

  const meta = LABEL_META[classification.label];
  const Icon = meta.icon;

  return (
    <div
      className={`rounded-xl border border-space-border bg-space-panel/40 backdrop-blur-md shadow-inset-panel ${className}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-space-border px-4 py-3">
        <h3 className="font-mono text-xs uppercase tracking-wider text-slate-300">{title}</h3>
        <span className={`flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] ${meta.text} ${meta.bg} ${meta.border}`}>
          <Icon size={11} /> {meta.copy}
        </span>
      </div>

      <div className="flex flex-col items-center gap-4 px-4 py-5 sm:flex-row sm:items-start">
        <ConfidenceGauge confidence={classification.confidence} color={meta.hex} />

        <div className="flex-1 space-y-2.5">
          {topFeatures.map((feature) => (
            <FeatureBar key={feature.name} name={feature.name} value={feature.value} importance={feature.importance} color={meta.hex} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ConfidenceGauge({ confidence, color }: { confidence: number; color: string }) {
  const size = 116;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - confidence);

  return (
    <div className="relative flex h-[116px] w-[116px] shrink-0 items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1e293b" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 6px ${color}80)` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-mono text-xl font-semibold text-slate-100">{Math.round(confidence * 100)}%</span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500">confidence</span>
      </div>
    </div>
  );
}

function FeatureBar({
  name,
  value,
  importance,
  color,
}: {
  name: string;
  value: number;
  importance: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="truncate font-mono text-[10px] text-slate-400">{name}</span>
        <span className="font-mono text-[11px] text-slate-300">{value.toFixed(3)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-space-border">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          // RandomForest importances across ~13 features rarely exceed ~0.25,
          // so a flat ×100 scale reads as near-empty bars. ×3 stretches the
          // typical 0–0.3 range to fill the bar without clipping in practice.
          animate={{ width: `${Math.min(100, importance * 100 * 3)}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

export default MLClassificationCard;
