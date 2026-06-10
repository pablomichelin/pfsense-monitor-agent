/**
 * @deprecated Substituído por AppSidebar + AppShellLayout (Fase 1).
 * Mantido para referência; getActiveHref exportado via lib/nav-utils.
 */
'use client';

import { usePathname } from 'next/navigation';
import { getActiveHref } from '@/lib/nav-utils';
import type { NavGroup } from '@/lib/route-policy';

export { getActiveHref };

type AppNavItem = {
  href: string;
  label: string;
};

function NavLink({
  item,
  isActive,
}: {
  item: AppNavItem;
  isActive: boolean;
}) {
  return (
    <a
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      className={`inline-flex h-10 min-w-[5.5rem] shrink-0 items-center justify-center rounded-lg border px-4 text-sm font-medium transition ${
        isActive
          ? 'border-cyan-400/50 bg-cyan-400/15 text-white'
          : 'border-slate-600/80 bg-panel-soft text-slate-200 hover:border-cyan-400/50 hover:text-white'
      }`}
    >
      {item.label}
    </a>
  );
}

/** @deprecated Use AppSidebar */
export function AppNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const flatItems = groups.flatMap((group) => group.items);
  const activeHref = getActiveHref(pathname, flatItems);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {groups.map((group, index) => (
        <div key={group.id} className="flex flex-wrap items-center gap-2">
          {index > 0 ? (
            <span
              className="hidden h-6 w-px bg-slate-700/80 sm:block"
              aria-hidden
            />
          ) : null}
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:inline">
            {group.label}
          </span>
          {group.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              isActive={item.href === activeHref}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
