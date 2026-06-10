'use client';

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
  const [collapsed, toggleCollapsed, hydrated] = useSidebarCollapsed();

  return (
    <div className="app-layout min-h-screen">
      <AppSidebar
        groups={navGroups}
        collapsed={collapsed}
        hydrated={hydrated}
        onToggle={toggleCollapsed}
      />
      <div className="app-main-column">
        <AppHeader
          collapsed={hydrated ? collapsed : false}
          onToggleSidebar={toggleCollapsed}
          userEmail={userEmail}
          breadcrumbs={<Breadcrumbs />}
        />
        <div className="flex min-h-0 flex-1 flex-col px-gutter pb-6 pt-4">
          <main className="app-page flex-1">{children}</main>
          {footer}
        </div>
      </div>
    </div>
  );
}
