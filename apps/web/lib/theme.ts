export const THEME_STORAGE_KEY = 'mp-theme-preference';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? getSystemTheme() : mode;
}

export function readStoredMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : 'dark';
  } catch {
    return 'dark';
  }
}

export function persistThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // private mode / quota — preferência visual apenas
  }
}

export function applyResolvedTheme(mode: ThemeMode): ResolvedTheme {
  const theme = resolveTheme(mode);
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
  return theme;
}

/** Script mínimo no <head>, antes da pintura. Não toca sessão nem cookies. */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var m=localStorage.getItem(k);if(m!=="light"&&m!=="dark"&&m!=="system")m="dark";var t=m==="system"?(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):m;var r=document.documentElement;r.setAttribute("data-theme",t);r.style.colorScheme=t;}catch(e){var d=document.documentElement;d.setAttribute("data-theme","dark");d.style.colorScheme="dark";}})();`;
