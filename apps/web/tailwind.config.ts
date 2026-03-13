import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        panel: {
          bg: '#08111f',
          card: '#0c1728',
          line: '#1b2a41',
          soft: '#132138',
        },
        signal: {
          online: '#22c55e',
          degraded: '#f59e0b',
          offline: '#ef4444',
          maintenance: '#38bdf8',
          unknown: '#94a3b8',
        },
      },
      boxShadow: {
        panel: '0 24px 80px rgba(0, 0, 0, 0.45)',
      },
      backgroundImage: {
        grid:
          'linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)',
      },
      fontFamily: {
        display: ['var(--font-space-grotesk)'],
        mono: ['var(--font-ibm-plex-mono)'],
      },
    },
  },
  plugins: [],
};

export default config;
