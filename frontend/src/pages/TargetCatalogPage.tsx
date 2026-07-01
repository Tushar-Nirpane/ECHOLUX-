import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Play, Search, Telescope } from 'lucide-react';
import { useTargetList, type CatalogTarget } from '../hooks/useTargetList';
import type { ClassificationLabel } from '../types/exoplanet';

interface TargetCatalogPageProps {
  onSelectTarget: (targetId: string) => void;
}

const DISPOSITION_STYLE: Record<string, string> = {
  CP: 'text-confirmed border-confirmed/40 bg-confirmed/10',
  KP: 'text-confirmed border-confirmed/40 bg-confirmed/10',
  PC: 'text-data border-data/40 bg-data/10',
  FP: 'text-anomaly border-anomaly/40 bg-anomaly/10',
};

const LABEL_STYLE: Record<ClassificationLabel, string> = {
  Planet:  'text-confirmed border-confirmed/40 bg-confirmed/10',
  Eclipse: 'text-anomaly border-anomaly/40 bg-anomaly/10',
  Blend:   'text-candidate border-candidate/40 bg-candidate/10',
  Noise:   'text-slate-400 border-slate-600 bg-slate-500/10',
};

type SortKey = keyof Pick<CatalogTarget, 'ticId' | 'stellarRadiusSolar' | 'stellarTempKelvin' | 'confidence'>;

export function TargetCatalogPage({ onSelectTarget }: TargetCatalogPageProps) {
  const { data, isLoading, isError } = useTargetList();
  const [query, setQuery] = useState('');
  const [dispFilter, setDispFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('ticId');
  const [sortAsc, setSortAsc] = useState(true);

  const handleSortClick = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  };

  const filtered = useMemo(() => {
    return [...data]
      .filter((t) => {
        const q = query.toLowerCase();
        const matchQ = !q || t.ticId.toLowerCase().includes(q) || String(t.toiId ?? '').includes(q);
        const matchD = dispFilter === 'ALL' || t.disposition === dispFilter;
        return matchQ && matchD;
      })
      .sort((a, b) => {
        const av = a[sortKey] ?? '';
        const bv = b[sortKey] ?? '';
        return (av < bv ? -1 : av > bv ? 1 : 0) * (sortAsc ? 1 : -1);
      });
  }, [data, query, dispFilter, sortKey, sortAsc]);

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? sortAsc ? <ChevronUp size={10} /> : <ChevronDown size={10} />
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-4"
    >
      {/* header */}
      <div className="flex items-center gap-2">
        <Telescope size={15} className="text-data" />
        <h2 className="font-mono text-sm uppercase tracking-wider text-slate-300">Target Catalog</h2>
        <span className="font-mono text-[11px] text-slate-500">
          — {data.length} TIC entries
        </span>
      </div>

      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-space-border bg-space-panel/40 px-4 py-3 backdrop-blur-md">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={13} />
          <input
            type="text"
            placeholder="Search TIC ID or TOI number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-space-border bg-space-bg/60 py-2 pl-8 pr-3 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-data/50 focus:outline-none"
          />
        </div>
        <div className="flex gap-1.5">
          {['ALL', 'CP', 'KP', 'PC', 'FP'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDispFilter(d)}
              className={`rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase transition-colors ${
                dispFilter === d
                  ? 'border-data/40 bg-data/10 text-data'
                  : 'border-space-border text-slate-500 hover:text-slate-300 hover:border-slate-600'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-[10px] text-slate-500">
          {filtered.length}/{data.length} targets
        </span>
      </div>

      {/* table */}
      <div className="rounded-xl border border-space-border bg-space-panel/40 backdrop-blur-md overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-data border-t-transparent" />
          </div>
        )}
        {isError && (
          <p className="py-16 text-center font-mono text-xs text-anomaly">
            Failed to load target catalog.
          </p>
        )}
        {!isLoading && !isError && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-space-border bg-space-panel/60">
                  {(
                    [
                      ['TIC ID', 'ticId'],
                      ['TOI', null],
                      ['Disp.', null],
                      ['ML Label', null],
                      ['R★ (R☉)', 'stellarRadiusSolar'],
                      ['Teff (K)', 'stellarTempKelvin'],
                      ['Confidence', 'confidence'],
                      ['', null],
                    ] as [string, SortKey | null][]
                  ).map(([label, key]) => (
                    <th
                      key={label || 'action'}
                      onClick={() => key && handleSortClick(key)}
                      className={`px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-slate-500 whitespace-nowrap ${
                        key ? 'cursor-pointer select-none hover:text-slate-300' : ''
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {label}
                        {key && <SortIcon col={key} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-space-border/40">
                {filtered.map((t, i) => (
                  <motion.tr
                    key={t.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:bg-white/[0.025] transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-[11px] text-data">{t.ticId}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{t.toiId?.toFixed(2) ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${DISPOSITION_STYLE[t.disposition ?? ''] ?? 'text-slate-500 border-slate-700'}`}>
                        {t.disposition ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {t.lastClassification && (
                        <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${LABEL_STYLE[t.lastClassification]}`}>
                          {t.lastClassification}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-300">{t.stellarRadiusSolar?.toFixed(2) ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-300">{t.stellarTempKelvin?.toLocaleString() ?? '—'}</td>
                    <td className="px-4 py-3">
                      {t.confidence !== undefined && (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-space-border">
                            <div className="h-full rounded-full bg-data" style={{ width: `${t.confidence * 100}%` }} />
                          </div>
                          <span className="font-mono text-[10px] text-slate-400">{Math.round(t.confidence * 100)}%</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onSelectTarget(t.id)}
                        className="flex items-center gap-1.5 rounded-md border border-data/30 bg-data/10 px-2.5 py-1 font-mono text-[10px] text-data hover:bg-data/20 transition-colors whitespace-nowrap"
                      >
                        <Play size={9} /> Analyze
                      </button>
                    </td>
                  </motion.tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center font-mono text-xs text-slate-600">
                      No targets match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}
