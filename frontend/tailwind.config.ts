import type { Config } from 'tailwindcss';

/**
 * EchoLux — "Deep Space Command Center" theme extension.
 * Drop this into your existing tailwind.config.ts (or merge the `extend`
 * block into your current config).
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Base void — matches Tailwind's slate-950 (#020617) exactly,
        // named here so intent stays explicit wherever it's used.
        space: {
          bg: '#020617',
          panel: '#0f172a', // raised glass-panel surface (slate-900)
          border: '#1e293b', // hairline borders (slate-800)
        },
        // Telemetry / raw data ink
        data: {
          DEFAULT: '#38bdf8', // sky-400
          dim: '#0ea5e9',
        },
        // State changes, processing, motion accents
        transition: {
          DEFAULT: '#818cf8', // indigo-400
        },
        // Status semantics used across badges, gauges, the System Pulse
        confirmed: { DEFAULT: '#22c55e' }, // emerald-500 — confirmed planet / nominal
        candidate: { DEFAULT: '#facc15' }, // amber-400 — planet candidate / caution
        anomaly: { DEFAULT: '#f87171' }, // red-400 — false positive / error
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Roboto Mono"', 'ui-monospace', 'monospace'],
        display: ['"Inter"', 'ui-sans-serif', 'system-ui'],
      },
      boxShadow: {
        'glow-sky': '0 0 14px 1px rgba(56, 189, 248, 0.35)',
        'glow-indigo': '0 0 14px 1px rgba(129, 140, 248, 0.35)',
        'glow-emerald': '0 0 14px 1px rgba(34, 197, 94, 0.35)',
        'glow-amber': '0 0 14px 1px rgba(250, 204, 21, 0.35)',
        'glow-red': '0 0 14px 1px rgba(248, 113, 113, 0.35)',
        'inset-panel': 'inset 0 1px 0 0 rgba(148, 163, 184, 0.06)',
      },
      keyframes: {
        // System Pulse heartbeat — used on the header status dot
        'pulse-glow': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 0 0 rgba(56, 189, 248, 0.55)' },
          '50%': { opacity: '0.65', boxShadow: '0 0 0 6px rgba(56, 189, 248, 0)' },
        },
        // Expanding sonar ring — layered behind the status dot
        'radar-ping': {
          '0%': { transform: 'scale(1)', opacity: '0.6' },
          '100%': { transform: 'scale(2.6)', opacity: '0' },
        },
        // Ambient scanline drifting through the background grid
        'scan-line': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        // Rare telemetry "dropout" flicker for live data labels
        'data-flicker': {
          '0%, 100%': { opacity: '1' },
          '92%': { opacity: '1' },
          '93%': { opacity: '0.35' },
          '94%': { opacity: '1' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'radar-ping': 'radar-ping 1.8s cubic-bezier(0,0,0.2,1) infinite',
        'scan-line': 'scan-line 7s linear infinite',
        'data-flicker': 'data-flicker 5s ease-in-out infinite',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};

export default config;
