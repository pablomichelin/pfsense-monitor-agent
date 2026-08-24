'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  applyResolvedTheme,
  persistThemeMode,
  readStoredMode,
  resolveTheme,
  type ResolvedTheme,
  type ThemeMode,
} from '@/lib/theme';

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  hydrated: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredMode();
    setModeState(stored);
    applyResolvedTheme(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || mode !== 'system') {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      applyResolvedTheme('system');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [hydrated, mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    persistThemeMode(next);
    applyResolvedTheme(next);
  }, []);

  const resolved = hydrated ? resolveTheme(mode) : 'dark';

  const value = useMemo(
    () => ({ mode, resolved, setMode, hydrated }),
    [hydrated, mode, resolved, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme deve ser usado dentro de ThemeProvider');
  }
  return context;
}
