'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Crumb = {
  label: string;
  href?: string;
};

const EXACT_CRUMBS: Record<string, Crumb[]> = {
  '/dashboard': [
    { label: 'Operação', href: '/dashboard' },
    { label: 'Dashboard' },
  ],
  '/nodes': [
    { label: 'Operação', href: '/dashboard' },
    { label: 'Firewalls' },
  ],
  '/backups': [
    { label: 'Operação', href: '/dashboard' },
    { label: 'Backups' },
  ],
  '/alerts': [
    { label: 'Operação', href: '/dashboard' },
    { label: 'Alertas' },
  ],
  '/bootstrap': [
    { label: 'Operação', href: '/dashboard' },
    { label: 'Instalação' },
  ],
  '/admin': [
    { label: 'Administração', href: '/admin' },
    { label: 'Cadastro' },
  ],
  '/admin/clientes': [
    { label: 'Administração', href: '/admin' },
    { label: 'Clientes' },
  ],
  '/admin/usuarios': [
    { label: 'Administração', href: '/admin' },
    { label: 'Usuários' },
  ],
  '/admin/permissoes': [
    { label: 'Administração', href: '/admin' },
    { label: 'Permissões' },
  ],
  '/audit': [
    { label: 'Governança', href: '/audit' },
    { label: 'Auditoria' },
  ],
  '/conta': [
    { label: 'Conta', href: '/conta' },
    { label: 'Minha conta' },
  ],
  '/sessions': [
    { label: 'Conta', href: '/conta' },
    { label: 'Sessões' },
  ],
};

function resolveBreadcrumbs(pathname: string): Crumb[] {
  if (EXACT_CRUMBS[pathname]) {
    return EXACT_CRUMBS[pathname];
  }

  if (/^\/nodes\/[^/]+$/.test(pathname)) {
    return [
      { label: 'Operação', href: '/dashboard' },
      { label: 'Firewalls', href: '/nodes' },
      { label: 'Detalhe do firewall' },
    ];
  }

  return [];
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const crumbs = resolveBreadcrumbs(pathname);

  if (crumbs.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;

          return (
            <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? (
                <span className="text-slate-500" aria-hidden>
                  ›
                </span>
              ) : null}
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="truncate text-slate-400 transition hover:text-cyan-300"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className={isLast ? 'truncate font-medium text-slate-200' : 'truncate text-slate-400'}>
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
