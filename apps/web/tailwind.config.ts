import type { Config } from 'tailwindcss';

const channel = (token: string) => `rgb(var(${token}) / <alpha-value>)`;

const palette = (name: string) => ({
  50: channel(`--${name}-50`),
  100: channel(`--${name}-100`),
  200: channel(`--${name}-200`),
  300: channel(`--${name}-300`),
  400: channel(`--${name}-400`),
  500: channel(`--${name}-500`),
  600: channel(`--${name}-600`),
  700: channel(`--${name}-700`),
  800: channel(`--${name}-800`),
  900: channel(`--${name}-900`),
  950: channel(`--${name}-950`),
});

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      maxWidth: {
        app: 'var(--app-max-w)',
      },
      spacing: {
        section: 'var(--section-gap)',
        card: 'var(--card-padding)',
        gutter: 'var(--app-gutter)',
      },
      borderRadius: {
        card: 'var(--card-radius)',
      },
      colors: {
        slate: palette('slate'),
        cyan: palette('cyan'),
        emerald: palette('emerald'),
        amber: palette('amber'),
        rose: palette('rose'),
        canvas: channel('--color-canvas'),
        fg: {
          DEFAULT: channel('--color-fg'),
          muted: channel('--color-fg-muted'),
          subtle: channel('--color-fg-subtle'),
        },
        surface: {
          DEFAULT: channel('--color-surface'),
          soft: channel('--color-surface-soft'),
          elevated: channel('--color-surface-elevated'),
        },
        border: {
          DEFAULT: channel('--color-border'),
          strong: channel('--color-border-strong'),
        },
        primary: {
          DEFAULT: channel('--color-primary'),
          hover: channel('--color-primary-hover'),
        },
        'on-primary': channel('--color-on-primary'),
        focus: channel('--color-focus-ring'),
        'table-head': channel('--color-table-head'),
        'table-row': channel('--color-table-row'),
        'table-hover': channel('--color-table-hover'),
        sidebar: channel('--color-sidebar'),
        header: channel('--color-header'),
        'nav-hover': channel('--color-nav-hover'),
        success: {
          DEFAULT: channel('--color-success'),
          fg: channel('--color-success-fg'),
          muted: 'var(--color-success-bg)',
          border: 'var(--color-success-border)',
        },
        warning: {
          DEFAULT: channel('--color-warning'),
          fg: channel('--color-warning-fg'),
          muted: 'var(--color-warning-bg)',
          border: 'var(--color-warning-border)',
        },
        danger: {
          DEFAULT: channel('--color-danger'),
          fg: channel('--color-danger-fg'),
          muted: 'var(--color-danger-bg)',
          border: 'var(--color-danger-border)',
        },
        info: {
          DEFAULT: channel('--color-info'),
          fg: channel('--color-info-fg'),
          muted: 'var(--color-info-bg)',
          border: 'var(--color-info-border)',
        },
        neutral: {
          DEFAULT: channel('--color-neutral'),
          fg: channel('--color-neutral-fg'),
          muted: 'var(--color-neutral-bg)',
          border: 'var(--color-neutral-border)',
        },
        panel: {
          DEFAULT: channel('--panel-card'),
          bg: channel('--panel-bg'),
          card: channel('--panel-card'),
          line: channel('--panel-line'),
          soft: channel('--panel-soft'),
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
        panel: 'var(--shadow-surface)',
      },
      backgroundImage: {
        grid: 'var(--bg-grid)',
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
