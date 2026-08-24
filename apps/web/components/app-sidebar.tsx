'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { getActiveHref } from '@/lib/nav-utils';
import type { NavGroup } from '@/lib/route-policy';

const STORAGE_KEY = 'sidebar-collapsed';
const COLLAPSE_BREAKPOINT = 1366;

const navIcons: Record<string, React.ReactNode> = {
  '/dashboard': (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0" aria-hidden>
      <path d="M3 4a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm8-1a1 1 0 00-1 1v5a1 1 0 001 1h4a1 1 0 001-1V4a1 1 0 00-1-1h-4zM3 13a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3zm8-1a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1v-4a1 1 0 00-1-1h-4z" />
    </svg>
  ),
  '/nodes': (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0" aria-hidden>
      <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.707 8.121a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
    </svg>
  ),
  '/alerts': (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0" aria-hidden>
      <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
    </svg>
  ),
  '/bootstrap': (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0" aria-hidden>
      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  ),
  '/admin': (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0" aria-hidden>
      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
    </svg>
  ),
  '/admin/clientes': (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0" aria-hidden>
      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15s1 0 1-1-1-4-5-4-5 3-5 4 0 1 1 1h8z" />
    </svg>
  ),
  '/admin/usuarios': (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0" aria-hidden>
      <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
    </svg>
  ),
  '/admin/permissoes': (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0" aria-hidden>
      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
    </svg>
  ),
  '/admin/tecnicos': (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0" aria-hidden>
      <path d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" />
    </svg>
  ),
  '/audit': (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0" aria-hidden>
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
    </svg>
  ),
  '/sessions': (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0" aria-hidden>
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  ),
};

function SidebarLink({
  href,
  label,
  isActive,
  collapsed,
  onNavigate,
}: {
  href: string;
  label: string;
  isActive: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const icon = navIcons[href] ?? navIcons['/dashboard'];

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm font-medium transition',
        isActive
          ? 'border-l-primary bg-primary/10 text-fg'
          : 'border-l-transparent text-fg-muted hover:border-l-primary/30 hover:bg-nav-hover hover:text-fg',
        collapsed && 'justify-center px-2',
      )}
    >
      {icon}
      {!collapsed ? <span className="truncate">{label}</span> : null}
    </Link>
  );
}

export function useSidebarCollapsed(): [boolean, () => void, boolean] {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      setCollapsed(stored === 'true');
    } else {
      setCollapsed(window.innerWidth <= COLLAPSE_BREAKPOINT);
    }
    setHydrated(true);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  return [collapsed, toggle, hydrated];
}

export function AppSidebar({
  groups,
  collapsed,
  hydrated,
  onToggle,
  mobileOpen,
  onCloseMobile,
}: {
  groups: NavGroup[];
  collapsed: boolean;
  hydrated: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const flatItems = groups.flatMap((group) => group.items);
  const activeHref = getActiveHref(pathname, flatItems);
  const isCollapsed = hydrated ? collapsed : false;
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const firstFocusable = sidebarRef.current?.querySelector<HTMLElement>('button, a[href], summary');
    firstFocusable?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseMobile();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], summary') ?? []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen, onCloseMobile]);

  return (
    <aside
      ref={sidebarRef}
      id="app-primary-navigation"
      aria-label="Navegação principal"
      aria-modal={mobileOpen || undefined}
      role={mobileOpen ? 'dialog' : undefined}
      className={cn(
        'app-sidebar glass-panel flex flex-col border-r border-border',
        isCollapsed && 'app-sidebar--collapsed',
        mobileOpen && 'app-sidebar--mobile-open',
      )}
    >
      <div className={cn('flex items-center border-b border-border px-3 py-3', isCollapsed ? 'justify-center' : 'gap-2')}>
        {!isCollapsed ? (
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-wider text-primary">
              SystemUp NOC
            </p>
            <p className="truncate font-display text-sm font-semibold text-fg">
              Monitor-Pfsense
            </p>
          </div>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-wider text-primary" title="Monitor-Pfsense">
            MP
          </span>
        )}
      </div>

      <nav aria-label="Navegação principal" className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-2">
        {groups.filter((group) => group.id !== 'account').map((group) => {
          const groupHasActiveRoute = group.items.some((item) => item.href === activeHref);
          const links = group.items.map((item, index) => (
            <SidebarLink
              key={`${group.id}-${item.href}-${item.label}-${index}`}
              href={item.href}
              label={item.label}
              isActive={item.href === activeHref}
              collapsed={isCollapsed}
              onNavigate={mobileOpen ? onCloseMobile : undefined}
            />
          ));

          if (group.id === 'administration' && !isCollapsed) {
            return (
              <details key={group.id} className="group space-y-1" open={groupHasActiveRoute}>
                <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-fg-subtle hover:bg-nav-hover hover:text-fg">
                  {group.label}
                  <span className="transition group-open:rotate-180" aria-hidden>⌄</span>
                </summary>
                <div className="space-y-1 pt-1">{links}</div>
              </details>
            );
          }

          return (
            <div key={group.id} className="space-y-1">
              {!isCollapsed ? (
                <p className="px-3 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">{group.label}</p>
              ) : (
                <div className="mx-auto my-2 h-px w-6 bg-border" aria-hidden />
              )}
              {links}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={onToggle}
          title={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg-muted transition hover:bg-nav-hover hover:text-fg',
            isCollapsed && 'justify-center px-2',
          )}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0" aria-hidden>
            {isCollapsed ? (
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            ) : (
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            )}
          </svg>
          {!isCollapsed ? <span>Recolher</span> : null}
        </button>

      </div>
    </aside>
  );
}
