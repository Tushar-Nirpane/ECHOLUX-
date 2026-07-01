import { useState } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { motion } from 'framer-motion';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { FluxContainer } from './components/widgets/FluxContainer';
import { BLSPeriodogram } from './components/widgets/BLSPeriodogram';
import { PhaseFoldedView } from './components/widgets/PhaseFoldedView';
import { MLClassificationCard } from './components/widgets/MLClassificationCard';
import { TargetCatalogPage } from './pages/TargetCatalogPage';
import { SignalSearchPage } from './pages/SignalSearchPage';
import { MLArchivePage } from './pages/MLArchivePage';
import { PipelineSettingsPage } from './pages/PipelineSettingsPage';
import { useExoplanetData } from './hooks/useExoplanetData';
import { useTargetList } from './hooks/useTargetList';

export function MissionControlPage() {
  const [activeNav, setActiveNav] = useState('overview');
  const [targetId, setTargetId] = useState('TIC-307210830');
  const { data, isLoading, isError, error, isMock, refetch } = useExoplanetData(targetId);
  const { data: targetList, isLoading: isTargetListLoading } = useTargetList();

  /** Select a target from any sub-page and jump straight to overview. */
  const handleSelectTarget = (id: string) => {
    setTargetId(id);
    setActiveNav('overview');
  };

  /**
   * In mock mode any TIC-like string produces valid deterministic data, so a
   * random ID is fine. Against the real backend, a target only resolves if
   * its light curve is already cached in data/raw/ — a random 9-digit guess
   * would 404 almost every time. So once real data is loaded, pick from the
   * actual cached catalog instead of gambling on a made-up ID.
   */
  const handleLoadNext = () => {
    if (isMock) {
      handleSelectTarget(`TIC-${Math.floor(100000000 + Math.random() * 899999999)}`);
      return;
    }
    if (targetList.length === 0) return; // button is disabled in this state, see below
    const others = targetList.filter((t) => t.id !== targetId);
    const pool = others.length > 0 ? others : targetList;
    const next = pool[Math.floor(Math.random() * pool.length)];
    handleSelectTarget(next.id);
  };

  const renderContent = () => {
    switch (activeNav) {
      case 'overview':
        return (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {isLoading && <LoadingState />}
            {isError && <ErrorState message={error?.message} onRetry={refetch} />}
            {data && !isLoading && !isError && (
              <>
                <FluxContainer data={data.lightCurve} className="md:col-span-2" />
                <TargetSummaryCard
                  target={data}
                  onLoadNext={handleLoadNext}
                  loadNextDisabled={!isMock && (isTargetListLoading || targetList.length === 0)}
                />
                <BLSPeriodogram
                  data={data.periodogram}
                  bestPeriod={data.transit.bls.periodDays}
                  className="md:col-span-1"
                />
                <PhaseFoldedView
                  lightCurve={data.lightCurve}
                  bls={data.transit.bls}
                  fit={data.transit.fit}
                  className="md:col-span-1"
                />
                <MLClassificationCard
                  classification={data.classification}
                  className="md:col-span-1"
                />
              </>
            )}
          </div>
        );

      case 'targets':
        return <TargetCatalogPage onSelectTarget={handleSelectTarget} />;

      case 'periodogram':
        return (
          <SignalSearchPage
            currentTarget={data}
            onRunComplete={() => setActiveNav('overview')}
          />
        );

      case 'archive':
        return <MLArchivePage onSelectTarget={handleSelectTarget} />;

      case 'settings':
        return <PipelineSettingsPage />;

      default:
        return null;
    }
  };

  return (
    <DashboardLayout
      systemStatus={data?.status ?? (isError ? 'ERROR' : 'PROCESSING')}
      targetLabel={data?.metadata.ticId ?? targetId}
      isMock={isMock}
      activeNav={activeNav}
      onNavChange={setActiveNav}
    >
      <motion.div
        key={activeNav}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        {renderContent()}
      </motion.div>
    </DashboardLayout>
  );
}

function LoadingState() {
  return (
    <>
      {[
        'md:col-span-2 h-[300px]',
        'md:col-span-1 h-[300px]',
        'md:col-span-1 h-[260px]',
        'md:col-span-1 h-[260px]',
        'md:col-span-1 h-[260px]',
      ].map((cls, i) => (
        <div key={i} className={`animate-pulse rounded-xl border border-space-border bg-space-panel/40 ${cls}`} />
      ))}
    </>
  );
}

function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="col-span-1 flex flex-col items-center justify-center gap-3 rounded-xl border border-anomaly/30 bg-anomaly/5 px-6 py-12 text-center md:col-span-3">
      <TriangleAlert className="text-anomaly" size={28} />
      <p className="font-mono text-sm text-anomaly">PIPELINE ERROR</p>
      <p className="max-w-md font-mono text-xs text-slate-500">{message ?? 'Unable to reach the analysis pipeline.'}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 flex items-center gap-2 rounded-md border border-anomaly/40 px-3 py-1.5 font-mono text-xs text-anomaly hover:bg-anomaly/10"
      >
        <RefreshCw size={13} /> Retry
      </button>
    </div>
  );
}

function TargetSummaryCard({
  target,
  onLoadNext,
  loadNextDisabled = false,
}: {
  target: NonNullable<ReturnType<typeof useExoplanetData>['data']>;
  onLoadNext: () => void;
  loadNextDisabled?: boolean;
}) {
  const { metadata, transit } = target;
  const rows: [string, string][] = [
    ['Disposition', transit.catalog?.disposition ?? '—'],
    ['Stellar Radius', `${metadata.stellarRadiusSolar.toFixed(2)} R☉`],
    ['Stellar Mass', `${metadata.stellarMassSolar.toFixed(2)} M☉`],
    ['Eff. Temp', `${metadata.stellarTempKelvin.toFixed(0)} K`],
    ['BLS Period', `${transit.bls.periodDays.toFixed(3)} d`],
    ['BLS Duration', `${transit.bls.durationHours.toFixed(1)} hr`],
    ['BLS Depth', `${(transit.bls.depth * 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })} ppm`],
    ['BLS SNR', `${transit.bls.signalToNoise.toFixed(1)}`],
    ['Significance', `${transit.bls.significance.toFixed(1)}σ`],
  ];

  return (
    <div className="rounded-xl border border-space-border bg-space-panel/40 backdrop-blur-md shadow-inset-panel md:col-span-1">
      <div className="border-b border-space-border px-4 py-3">
        <h3 className="font-mono text-xs uppercase tracking-wider text-slate-300">Target Summary</h3>
      </div>
      <dl className="grid grid-cols-2 gap-y-2 px-4 py-3 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-right font-mono text-slate-200">{value}</dd>
          </div>
        ))}
      </dl>
      {transit.fit?.success && (
        <div className="border-t border-space-border px-4 py-3 text-xs">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">Trapezoidal Fit</p>
          <div className="flex justify-between font-mono text-[11px] text-slate-300">
            <span>{transit.fit.depthPpt.toFixed(2)} ± {transit.fit.depthErrPpt?.toFixed(2)} ppt</span>
            <span>{transit.fit.durationHours.toFixed(2)} hr</span>
          </div>
        </div>
      )}
      <div className="border-t border-space-border px-4 py-3">
        <button
          type="button"
          onClick={onLoadNext}
          disabled={loadNextDisabled}
          className={`w-full rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors ${
            loadNextDisabled
              ? 'cursor-not-allowed border-space-border text-slate-600'
              : 'border-data/30 bg-data/10 text-data hover:bg-data/20'
          }`}
        >
          {loadNextDisabled ? 'Loading catalog…' : 'Load Next Target →'}
        </button>
      </div>
    </div>
  );
}

export default MissionControlPage;
