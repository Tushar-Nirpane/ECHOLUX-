import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Settings, XCircle } from 'lucide-react';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');

interface HealthPayload {
  classifierLoaded: boolean;
  cachedTargets: number;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <p className="mb-4 border-b border-space-border pb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
      {title}
    </p>
  );
}

function SettingRow({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-space-border/40 last:border-0">
      <span className="font-mono text-xs text-slate-400">{label}</span>
      <span className={`${mono ? 'font-mono' : ''} text-xs text-slate-200`}>{value}</span>
    </div>
  );
}

export function PipelineSettingsPage() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [healthError, setHealthError] = useState(false);

  useEffect(() => {
    if (!API_BASE_URL) return;
    fetch(`${API_BASE_URL}/api/health`)
      .then((r) => r.json())
      .then((j) => setHealth(j))
      .catch(() => setHealthError(true));
  }, []);

  const isMock = !API_BASE_URL;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="grid grid-cols-1 gap-4 md:grid-cols-2"
    >
      {/* left col */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Settings size={15} className="text-slate-400" />
          <h2 className="font-mono text-sm uppercase tracking-wider text-slate-300">Pipeline Settings</h2>
        </div>

        {/* connection */}
        <div className="rounded-xl border border-space-border bg-space-panel/40 backdrop-blur-md px-5 py-4">
          <SectionHeader title="API Connection" />
          <SettingRow label="Backend URL" value={API_BASE_URL ?? 'Not configured (Mock mode)'} />
          <SettingRow
            label="Status"
            value={
              isMock ? (
                <span className="text-candidate">Mock Data Mode</span>
              ) : healthError ? (
                <span className="flex items-center gap-1 text-anomaly"><XCircle size={12} /> Unreachable</span>
              ) : health ? (
                <span className="flex items-center gap-1 text-confirmed"><CheckCircle size={12} /> Connected</span>
              ) : (
                <span className="text-slate-500">Checking…</span>
              )
            }
            mono={false}
          />
          {health && (
            <>
              <SettingRow label="Classifier loaded" value={
                <span className={health.classifierLoaded ? 'text-confirmed' : 'text-candidate'}>
                  {health.classifierLoaded ? 'Yes' : 'No — run main.py to train'}
                </span>
              } mono={false} />
              <SettingRow label="Cached targets" value={`${health.cachedTargets} targets`} />
            </>
          )}
          {!isMock && !health && !healthError && (
            <SettingRow label="Cached targets" value="—" />
          )}
          {isMock && (
            <SettingRow label="Cached targets" value="N/A (mock mode)" />
          )}
        </div>

        {/* model */}
        <div className="rounded-xl border border-space-border bg-space-panel/40 backdrop-blur-md px-5 py-4">
          <SectionHeader title="ML Model" />
          <SettingRow label="Algorithm" value="RandomForestClassifier" />
          <SettingRow label="Classes" value="Planet · Eclipse · Blend · Noise" />
          <SettingRow label="Features" value="13 (BLS + stellar + ratios)" />
          <SettingRow label="Model path" value="data/classifier_model.pkl" />
          <SettingRow label="Training trigger" value="python main.py" />
        </div>
      </div>

      {/* right col */}
      <div className="space-y-4">
        <div className="rounded-xl border border-space-border bg-space-panel/40 backdrop-blur-md px-5 py-4">
          <SectionHeader title="Kepler's Third Law Constants" />
          <SettingRow label="Period unit" value="days" />
          <SettingRow label="Semi-major axis unit" value="AU" />
          <SettingRow label="Stellar mass unit" value="M☉" />
          <SettingRow label="a³/P² ∝ M★" value="Exact (Newton)" />
          <SettingRow label="R_p formula" value="R★ · √depth · 109.2 R⊕" />
          <SettingRow label="R_p unit" value="Earth radii (R⊕)" />
        </div>

        <div className="rounded-xl border border-space-border bg-space-panel/40 backdrop-blur-md px-5 py-4">
          <SectionHeader title="Data Directories" />
          <SettingRow label="Raw cache" value="data/raw/" />
          <SettingRow label="Processed" value="data/processed/" />
          <SettingRow label="Outputs" value="data/outputs/" />
          <SettingRow label="TOI list" value="data/toi_list.csv" />
        </div>

        <div className="rounded-xl border border-space-border bg-space-panel/40 backdrop-blur-md px-5 py-4">
          <SectionHeader title="Preprocessing Defaults" />
          <SettingRow label="Sigma-clip threshold" value="4.0 σ" />
          <SettingRow label="SG filter window" value="401 pts" />
          <SettingRow label="BLS period range" value="0.5 – 15 days" />
          <SettingRow label="Max LC points (API)" value="4,000 (downsampled)" />
          <SettingRow label="Max periodogram pts" value="1,500 (downsampled)" />
        </div>
      </div>
    </motion.div>
  );
}
