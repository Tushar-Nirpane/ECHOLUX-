import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, ChevronRight, Loader, Radar, Settings2 } from 'lucide-react';
import type { ExoplanetTarget } from '../types/exoplanet';

interface SignalSearchPageProps {
  /** The currently-loaded target's data (passed from overview state). */
  currentTarget?: ExoplanetTarget;
  /** Called after a "run" completes — navigates caller back to overview. */
  onRunComplete: () => void;
}

type PipelineStep = 'idle' | 'preprocessing' | 'bls' | 'classification' | 'done';

const STEPS: { key: PipelineStep; label: string }[] = [
  { key: 'preprocessing', label: 'Preprocessing' },
  { key: 'bls',           label: 'BLS Search' },
  { key: 'classification', label: 'ML Classification' },
];

const STEP_DELAYS: Record<string, number> = {
  preprocessing: 1100,
  bls: 2800,
  classification: 1400,
};

function StepRow({ step, current }: { step: { key: PipelineStep; label: string }; current: PipelineStep }) {
  const steps = STEPS.map((s) => s.key);
  const stepIdx = steps.indexOf(step.key);
  const curIdx  = steps.indexOf(current as PipelineStep);

  const isDone    = curIdx > stepIdx || current === 'done';
  const isRunning = current === step.key;

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
      isDone    ? 'border-confirmed/30 bg-confirmed/5'
      : isRunning ? 'border-data/30 bg-data/5'
      : 'border-space-border bg-transparent'
    }`}>
      <div className="w-5 shrink-0">
        {isDone    ? <CheckCircle size={16} className="text-confirmed" />
         : isRunning ? <Loader size={16} className="text-data animate-spin" />
         : <div className="h-4 w-4 rounded-full border border-slate-600" />}
      </div>
      <span className={`font-mono text-xs ${
        isDone ? 'text-confirmed' : isRunning ? 'text-data' : 'text-slate-500'
      }`}>
        {step.label}
      </span>
      {isRunning && <span className="ml-auto font-mono text-[10px] text-slate-500 animate-pulse">running…</span>}
      {isDone    && <span className="ml-auto font-mono text-[10px] text-confirmed">complete</span>}
    </div>
  );
}

export function SignalSearchPage({ currentTarget, onRunComplete }: SignalSearchPageProps) {
  const [sigmaClip, setSigmaClip] = useState('4.0');
  const [sgWindow, setSgWindow]   = useState('401');
  const [blsMin, setBlsMin]       = useState('0.5');
  const [blsMax, setBlsMax]       = useState('15.0');
  const [gridOpt, setGridOpt]     = useState(true);
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>('idle');

  const isRunning = pipelineStep !== 'idle' && pipelineStep !== 'done';

  const runPipeline = async () => {
    if (isRunning) return;
    setPipelineStep('preprocessing');
    await new Promise((r) => setTimeout(r, STEP_DELAYS.preprocessing));
    setPipelineStep('bls');
    await new Promise((r) => setTimeout(r, STEP_DELAYS.bls));
    setPipelineStep('classification');
    await new Promise((r) => setTimeout(r, STEP_DELAYS.classification));
    setPipelineStep('done');
    // navigate back to overview after 800ms so user can see Done state
    setTimeout(onRunComplete, 800);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="grid grid-cols-1 gap-4 md:grid-cols-2"
    >
      {/* left — config */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 size={15} className="text-transition" />
          <h2 className="font-mono text-sm uppercase tracking-wider text-slate-300">Pipeline Configuration</h2>
          <span
            title="These controls demonstrate the pipeline stages. Wiring them to trigger a real backend re-run with these exact parameters is a planned backend addition."
            className="rounded-md border border-candidate/40 bg-candidate/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-candidate"
          >
            Simulated
          </span>
        </div>

        <div className="rounded-xl border border-space-border bg-space-panel/40 backdrop-blur-md divide-y divide-space-border">
          <div className="px-5 py-4">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-slate-500">Preprocessing</p>
            <div className="space-y-3">
              <ConfigRow label="Sigma-clip threshold" unit="σ">
                <input
                  type="number" step="0.5" min="1" max="10"
                  value={sigmaClip} onChange={(e) => setSigmaClip(e.target.value)}
                  className="w-24 rounded border border-space-border bg-space-bg/60 px-2 py-1 font-mono text-xs text-slate-200 focus:border-data/50 focus:outline-none text-right"
                />
              </ConfigRow>
              <ConfigRow label="SG filter window" unit="pts">
                <input
                  type="number" step="2" min="51" max="1001"
                  value={sgWindow} onChange={(e) => setSgWindow(e.target.value)}
                  className="w-24 rounded border border-space-border bg-space-bg/60 px-2 py-1 font-mono text-xs text-slate-200 focus:border-data/50 focus:outline-none text-right"
                />
              </ConfigRow>
            </div>
          </div>

          <div className="px-5 py-4">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-slate-500">BLS Period Search</p>
            <div className="space-y-3">
              <ConfigRow label="Period min" unit="days">
                <input
                  type="number" step="0.1" min="0.1" max="5"
                  value={blsMin} onChange={(e) => setBlsMin(e.target.value)}
                  className="w-24 rounded border border-space-border bg-space-bg/60 px-2 py-1 font-mono text-xs text-slate-200 focus:border-data/50 focus:outline-none text-right"
                />
              </ConfigRow>
              <ConfigRow label="Period max" unit="days">
                <input
                  type="number" step="0.5" min="1" max="30"
                  value={blsMax} onChange={(e) => setBlsMax(e.target.value)}
                  className="w-24 rounded border border-space-border bg-space-bg/60 px-2 py-1 font-mono text-xs text-slate-200 focus:border-data/50 focus:outline-none text-right"
                />
              </ConfigRow>
              <ConfigRow label="Grid optimisation">
                <button
                  type="button"
                  onClick={() => setGridOpt((v) => !v)}
                  className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${gridOpt ? 'bg-data' : 'bg-slate-700'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${gridOpt ? 'translate-x-4' : ''}`} />
                </button>
              </ConfigRow>
            </div>
          </div>
        </div>

        {/* stat cards — current target values */}
        {currentTarget && (
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="BLS Period" value={`${currentTarget.transit.bls.periodDays.toFixed(3)} d`} color="text-data" />
            <StatCard label="SNR"        value={currentTarget.transit.bls.signalToNoise.toFixed(1)}      color="text-transition" />
            <StatCard
              label="R_p (R⊕)"
              value={currentTarget.classification ? currentTarget.classification.features.find((f) => f.name === 'estimated_radius_earth')?.value.toFixed(2) ?? '—' : '—'}
              color="text-confirmed"
            />
            <StatCard label="Depth"      value={`${(currentTarget.transit.bls.depth * 1e6).toFixed(0)} ppm`} color="text-candidate" />
          </div>
        )}
      </div>

      {/* right — pipeline execution */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Radar size={15} className="text-data" />
          <h2 className="font-mono text-sm uppercase tracking-wider text-slate-300">Execution State</h2>
        </div>

        <div className="rounded-xl border border-space-border bg-space-panel/40 backdrop-blur-md p-5 space-y-3">
          {STEPS.map((s) => (
            <StepRow key={s.key} step={s} current={pipelineStep} />
          ))}
        </div>

        <AnimatePresence>
          {pipelineStep === 'done' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 rounded-xl border border-confirmed/30 bg-confirmed/5 px-5 py-4"
            >
              <CheckCircle className="text-confirmed" size={18} />
              <span className="font-mono text-xs text-confirmed">Analysis complete — returning to overview…</span>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={runPipeline}
          disabled={isRunning}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border py-3.5 font-mono text-sm uppercase tracking-wider transition-colors ${
            isRunning
              ? 'border-space-border cursor-not-allowed text-slate-600'
              : 'border-data/40 bg-data/10 text-data hover:bg-data/20 shadow-glow-sky'
          }`}
        >
          {isRunning ? <Loader size={15} className="animate-spin" /> : <ChevronRight size={15} />}
          {isRunning ? 'Running…' : 'Run Analysis'}
        </button>
      </div>
    </motion.div>
  );
}

function ConfigRow({ label, unit, children }: { label: string; unit?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-mono text-xs text-slate-400 whitespace-nowrap">
        {label}{unit && <span className="ml-1 text-slate-600">({unit})</span>}
      </span>
      {children}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border border-space-border bg-space-panel/40 px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}
