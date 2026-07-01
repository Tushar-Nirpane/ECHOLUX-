import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Orbit,
  Telescope,
  Radar,
  Database,
  Settings,
  Satellite,
} from 'lucide-react';
import type { SystemStatus } from '../../types/exoplanet';

interface DashboardLayoutProps {
  children: ReactNode;
  /** Drives the System Pulse indicator color + label. */
  systemStatus: SystemStatus;
  /** e.g. "TIC 307210830" — shown in the header breadcrumb. */
  targetLabel?: string;
  /** True when data is coming from the mock generator, not ../backend/api.py. */
  isMock?: boolean;
  activeNav?: string;
  onNavChange?: (label: string) => void;
}

const NAV_ITEMS = [
  { id: 'overview', icon: Orbit, label: 'Mission Overview' },
  { id: 'targets', icon: Telescope, label: 'Target Catalog' },
  { id: 'periodogram', icon: Radar, label: 'Signal Search' },
  { id: 'archive', icon: Database, label: 'Data Archive' },
  { id: 'settings', icon: Settings, label: 'Pipeline Settings' },
];

const STATUS_STYLES: Record<SystemStatus, { dot: string; ring: string; text: string }> = {
  LIVE: { dot: 'bg-data', ring: 'bg-data', text: 'text-data' },
  PROCESSING: { dot: 'bg-transition', ring: 'bg-transition', text: 'text-transition' },
  IDLE: { dot: 'bg-slate-500', ring: 'bg-slate-500', text: 'text-slate-400' },
  ERROR: { dot: 'bg-anomaly', ring: 'bg-anomaly', text: 'text-anomaly' },
};

export function DashboardLayout({
  children,
  systemStatus,
  targetLabel,
  isMock = false,
  activeNav = 'overview',
  onNavChange,
}: DashboardLayoutProps) {
  const statusStyle = STATUS_STYLES[systemStatus];

  return (
    <div className="relative min-h-screen bg-space-bg text-slate-200 font-display overflow-hidden">
      {/* Ambient backdrop: faint grid + drifting scanline. Decorative only. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(#38bdf8 1px, transparent 1px), linear-gradient(90deg, #38bdf8 1px, transparent 1px)',
          backgroundSize: '42px 42px',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-1/2 bg-gradient-to-b from-data/[0.05] to-transparent animate-scan-line"
      />

      {/* Sidebar — 64px, icon-only */}
      <motion.aside
        initial={{ x: -16, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="fixed left-0 top-0 z-20 flex h-screen w-16 flex-col items-center border-r border-space-border bg-space-panel/80 backdrop-blur-md py-4"
      >
        <div className="mb-6 flex h-9 w-9 items-center justify-center rounded-lg border border-data/30 bg-data/10 text-data shadow-glow-sky">
          <Satellite size={18} strokeWidth={1.75} />
        </div>

        <nav className="flex flex-1 flex-col items-center gap-2">
          {NAV_ITEMS.map(({ id, icon: Icon, label }) => {
            const active = id === activeNav;
            return (
              <button
                key={id}
                type="button"
                title={label}
                aria-label={label}
                aria-current={active}
                onClick={() => onNavChange?.(id)}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${
                  active
                    ? 'border-data/40 bg-data/10 text-data shadow-glow-sky'
                    : 'border-transparent text-slate-500 hover:border-space-border hover:bg-white/5 hover:text-slate-300'
                }`}
              >
                <Icon size={18} strokeWidth={1.75} />
                <span className="pointer-events-none absolute left-14 z-30 whitespace-nowrap rounded-md border border-space-border bg-space-panel px-2 py-1 text-xs font-mono text-slate-300 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                  {label}
                </span>
              </button>
            );
          })}
        </nav>
      </motion.aside>

      {/* Header */}
      <motion.header
        initial={{ y: -12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="sticky top-0 z-10 ml-16 flex h-14 items-center justify-between border-b border-space-border bg-space-bg/80 px-6 backdrop-blur-md"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-widest text-slate-500">EchoLux //</span>
          <span className="font-mono text-sm text-slate-200">{targetLabel ?? 'No target selected'}</span>
          {isMock && (
            <span
              title="No backend connected — see frontend/.env.example"
              className="rounded-md border border-candidate/40 bg-candidate/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-candidate"
            >
              Mock Data
            </span>
          )}
        </div>

        <div className="flex items-center gap-5">
          <MissionClock />
          <SystemPulse status={systemStatus} style={statusStyle} />
        </div>
      </motion.header>

      {/* Main content — each page manages its own layout */}
      <main className="ml-16 min-h-screen p-4">{children}</main>
    </div>
  );
}

function SystemPulse({
  status,
  style,
}: {
  status: SystemStatus;
  style: { dot: string; ring: string; text: string };
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-space-border bg-space-panel/60 px-3 py-1.5">
      <span className="relative flex h-2.5 w-2.5">
        {status !== 'IDLE' && (
          <span className={`absolute inline-flex h-full w-full rounded-full ${style.ring} animate-radar-ping`} />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${style.dot} animate-pulse-glow`} />
      </span>
      <span className={`font-mono text-xs uppercase tracking-wider ${style.text}`}>{status}</span>
    </div>
  );
}

function MissionClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const utc = now.toISOString().slice(11, 19);

  return (
    <span className="hidden font-mono text-xs text-slate-500 sm:inline animate-data-flicker">
      {utc}Z
    </span>
  );
}

export default DashboardLayout;
