'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { AppSidebar, useSidebarCollapsed } from '@/components/app-sidebar';
import { Breadcrumbs } from '@/components/breadcrumbs';
import type { NavGroup } from '@/lib/route-policy';

export function AppShellLayout({
  navGroups,
  userEmail,
  children,
  footer,
}: {
  navGroups: NavGroup[];
  userEmail: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, toggleCollapsed, hydrated] = useSidebarCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  const closeMobileNavigation = () => {
    setMobileOpen(false);
    window.setTimeout(() => menuButtonRef.current?.focus(), 0);
  };

  return (
    <div className="app-layout min-h-screen">
      {mobileOpen ? (
        <button
          type="button"
          className="app-mobile-nav-scrim"
          aria-label="Fechar menu de navegação"
          onClick={closeMobileNavigation}
        />
      ) : null}
      <AppSidebar
        groups={navGroups}
        collapsed={collapsed}
        hydrated={hydrated}
        onToggle={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobileNavigation}
      />
      <div className="app-main-column">
        <AppHeader
          collapsed={hydrated ? collapsed : false}
          onToggleSidebar={toggleCollapsed}
          onOpenMobileNavigation={() => setMobileOpen(true)}
          mobileNavigationOpen={mobileOpen}
          menuButtonRef={menuButtonRef}
          userEmail={userEmail}
          breadcrumbs={<Breadcrumbs />}
        />
        <div className="flex min-h-0 flex-1 flex-col px-gutter pb-3 pt-2">
          <main key={pathname} className="app-page flex-1">
            {children}
          </main>
          {footer}
        </div>
      </div>
    </div>
  );
}
