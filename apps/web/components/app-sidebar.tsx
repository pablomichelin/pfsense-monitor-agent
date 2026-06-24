'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { logoutAction } from '@/lib/auth';
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
}: {
  href: string;
  label: string;
  isActive: boolean;
  collapsed: boolean;
}) {
  const icon = navIcons[href] ?? navIcons['/dashboard'];

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm font-medium transition',
        isActive
          ? 'border-l-cyan-400 bg-cyan-400/10 text-white'
          : 'border-l-transparent text-slate-300 hover:border-l-cyan-400/30 hover:bg-slate-800/50 hover:text-white',
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
}: {
  groups: NavGroup[];
  collapsed: boolean;
  hydrated: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const flatItems = groups.flatMap((group) => group.items);
  const activeHref = getActiveHref(pathname, flatItems);
  const isCollapsed = hydrated ? collapsed : false;

  return (
    <aside
      className={cn(
        'app-sidebar glass-panel flex flex-col border-r border-slate-800/80',
        isCollapsed && 'app-sidebar--collapsed',
      )}
    >
      <div className={cn('flex items-center border-b border-slate-800/80 px-3 py-3', isCollapsed ? 'justify-center' : 'gap-2')}>
        {!isCollapsed ? (
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-wider text-cyan-400/90">
              SystemUp NOC
            </p>
            <p className="truncate font-display text-sm font-semibold text-slate-50">
              Monitor-Pfsense
            </p>
          </div>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-wider text-cyan-400/90" title="Monitor-Pfsense">
            MP
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-2">
        {groups.map((group) => (
          <div key={group.id} className="space-y-1">
            {!isCollapsed ? (
              <p className="px-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                {group.label}
              </p>
            ) : (
              <div className="mx-auto my-2 h-px w-6 bg-slate-700/80" aria-hidden />
            )}
            {group.items.map((item, index) => (
              <SidebarLink
                key={`${group.id}-${item.href}-${item.label}-${index}`}
                href={item.href}
                label={item.label}
                isActive={item.href === activeHref}
                collapsed={isCollapsed}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="space-y-2 border-t border-slate-800/80 p-2">
        <button
          type="button"
          onClick={onToggle}
          title={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-800/50 hover:text-slate-200',
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

        <form action={logoutAction} className="w-full">
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className={cn('w-full', isCollapsed && 'px-2')}
            title={isCollapsed ? 'Sair' : undefined}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden>
              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
            </svg>
            {!isCollapsed ? 'Sair' : null}
          </Button>
        </form>
      </div>
    </aside>
  );
}
