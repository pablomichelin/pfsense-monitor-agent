'use client';

import { UserMenu } from '@/components/user-menu';

export function AppHeader({
  collapsed,
  onToggleSidebar,
  onOpenMobileNavigation,
  mobileNavigationOpen,
  menuButtonRef,
  userEmail,
  breadcrumbs,
}: {
  collapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobileNavigation: () => void;
  mobileNavigationOpen: boolean;
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
  userEmail: string;
  breadcrumbs: React.ReactNode;
}) {
  return (
    <header className="app-header-bar glass-panel relative z-40 flex items-center gap-4 border-b border-border px-4">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="app-desktop-sidebar-toggle inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-fg-muted transition hover:border-primary/40 hover:text-fg"
        aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
          <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
      </button>

      <button
        ref={menuButtonRef}
        type="button"
        onClick={onOpenMobileNavigation}
        className="app-mobile-sidebar-toggle inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-fg-muted transition hover:border-primary/40 hover:text-fg"
        aria-label="Abrir menu de navegação"
        aria-controls="app-primary-navigation"
        aria-expanded={mobileNavigationOpen}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
          <path fillRule="evenodd" d="M2 5a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm0 5a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm0 5a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
      </button>

      <div className="min-w-0 flex-1">{breadcrumbs}</div>

      <div className="flex shrink-0 items-center">
        <UserMenu userEmail={userEmail} />
      </div>
    </header>
  );
}
