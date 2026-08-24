'use client';

import { useRef } from 'react';
import { cn } from '@/lib/cn';
import { THEME_MODES, type ThemeMode } from '@/lib/theme';
import { useTheme } from '@/components/theme-provider';

const MODE_LABEL: Record<ThemeMode, string> = {
  light: 'Claro',
  dark: 'Escuro',
  system: 'Sistema',
};

const MODE_HINT: Record<ThemeMode, string> = {
  light: 'Tema claro',
  dark: 'Tema escuro',
  system: 'Seguir o tema do sistema',
};

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
      <path d="M10 3.5a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 3.5zm0 10.5a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 14zm6.5-4a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5a.75.75 0 01.75.75zM6.5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 016.5 10zm8.364-4.364a.75.75 0 010 1.06l-1.06 1.061a.75.75 0 11-1.061-1.06l1.06-1.061a.75.75 0 011.061 0zM7.197 12.803a.75.75 0 010 1.06l-1.06 1.061a.75.75 0 11-1.061-1.06l1.06-1.061a.75.75 0 011.061 0zm7.667 1.06a.75.75 0 01-1.06 0l-1.061-1.06a.75.75 0 011.06-1.061l1.061 1.06a.75.75 0 010 1.061zM7.197 7.197a.75.75 0 01-1.06 0L5.075 6.136a.75.75 0 011.061-1.06l1.06 1.06a.75.75 0 010 1.061zM10 7.25a2.75 2.75 0 100 5.5 2.75 2.75 0 000-5.5z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
      <path
        fillRule="evenodd"
        d="M3 5a2 2 0 012-2h10a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm12 9a1 1 0 100 2H5a1 1 0 100-2h10z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const MODE_ICON: Record<ThemeMode, React.ReactNode> = {
  light: <SunIcon />,
  dark: <MoonIcon />,
  system: <SystemIcon />,
};

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode, hydrated } = useTheme();
  const groupRef = useRef<HTMLDivElement>(null);
  const selectedMode = hydrated ? mode : 'dark';

  const focusMode = (next: ThemeMode) => {
    const index = THEME_MODES.indexOf(next);
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[index]?.focus();
    setMode(next);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = THEME_MODES.indexOf(selectedMode);
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      focusMode(THEME_MODES[(currentIndex + 1) % THEME_MODES.length]);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusMode(THEME_MODES[(currentIndex - 1 + THEME_MODES.length) % THEME_MODES.length]);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusMode(THEME_MODES[0]);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusMode(THEME_MODES[THEME_MODES.length - 1]);
    }
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Tema da interface"
      onKeyDown={onKeyDown}
      className="inline-flex h-9 items-center rounded-lg border border-border bg-surface-soft p-0.5"
    >
      {THEME_MODES.map((item) => {
        const selected = selectedMode === item;
        return (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={MODE_HINT[item]}
            title={MODE_HINT[item]}
            tabIndex={selected ? 0 : -1}
            onClick={() => setMode(item)}
            className={cn(
              'inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium transition',
              selected
                ? 'bg-primary/15 text-primary'
                : 'text-fg-muted hover:bg-nav-hover hover:text-fg',
              compact ? 'min-w-8' : 'sm:px-2.5',
            )}
          >
            {MODE_ICON[item]}
            <span className={compact ? 'sr-only' : 'hidden sm:inline'}>{MODE_LABEL[item]}</span>
          </button>
        );
      })}
    </div>
  );
}
