'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type AppNavItem = {
  href: string;
  label: string;
};

export function AppNav({
  items,
}: {
  items: AppNavItem[];
}) {
  const pathname = usePathname();

  return (
    <>
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={`rounded-full border px-4 py-2 text-sm transition ${
              isActive
                ? 'border-cyan-300/60 bg-cyan-400/15 text-white shadow-[0_0_0_1px_rgba(103,232,249,0.1)]'
                : 'border-slate-700/80 bg-panel-soft text-slate-200 hover:border-cyan-400/60 hover:text-white'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
