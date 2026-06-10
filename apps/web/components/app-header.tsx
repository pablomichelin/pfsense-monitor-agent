'use client';

import { Button } from '@/components/ui/button';
import { logoutAction } from '@/lib/auth';
import { cn } from '@/lib/cn';

export function AppHeader({
  collapsed,
  onToggleSidebar,
  userEmail,
  breadcrumbs,
}: {
  collapsed: boolean;
  onToggleSidebar: () => void;
  userEmail: string;
  breadcrumbs: React.ReactNode;
}) {
  return (
    <header className="app-header-bar glass-panel flex items-center gap-4 border-b border-slate-800/80 px-4">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-600/60 text-slate-300 transition hover:border-cyan-400/40 hover:text-white"
        aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
          <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
      </button>

      <div className="min-w-0 flex-1">{breadcrumbs}</div>

      <div className="flex shrink-0 items-center gap-3">
        <span
          className={cn(
            'hidden max-w-[14rem] truncate rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100 sm:inline',
          )}
          title={userEmail}
        >
          {userEmail}
        </span>
        <form action={logoutAction} className="inline">
          <Button type="submit" variant="secondary" size="sm">
            Sair
          </Button>
        </form>
      </div>
    </header>
  );
}
