import type { Metadata } from 'next';
import { IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';
import Link from 'next/link';
import { AppNav } from '@/components/app-nav';
import { getOptionalSession } from '@/lib/api';
import { ADMIN_ROLES, hasRole } from '@/lib/authz';
import { logoutAction } from '@/lib/auth';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-ibm-plex-mono',
});

export const metadata: Metadata = {
  title: 'Monitor-Pfsense',
  description: 'Painel operacional do Monitor-Pfsense',
};

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/nodes', label: 'Firewalls' },
  { href: '/alerts', label: 'Alertas' },
  { href: '/bootstrap', label: 'Instalacao' },
  { href: '/sessions', label: 'Minha conta' },
];

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getOptionalSession();
  const visibleNavItems = hasRole(session?.user.role, ADMIN_ROLES)
    ? [...navItems, { href: '/admin', label: 'Cadastro' }, { href: '/audit', label: 'Auditoria' }]
    : navItems;

  return (
    <html
      lang="pt-BR"
      className={`${spaceGrotesk.variable} ${ibmPlexMono.variable}`}
    >
      <body className="font-sans">
        <div className="min-h-screen bg-grid bg-[size:32px_32px]">
          <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
            <header className="glass-panel mb-8 rounded-xl px-6 py-3">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 shrink-0 items-center gap-4">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-cyan-400/90">
                      SystemUp NOC
                    </span>
                    <span className="text-slate-600">·</span>
                    <h1 className="font-display text-lg font-semibold tracking-tight text-slate-50">
                      Monitor-Pfsense
                    </h1>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {session ? (
                    <span className="truncate max-w-[12rem] rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100">
                      {session.user.email}
                    </span>
                  ) : null}
                  <nav className="flex items-center gap-2">
                    {session ? (
                      <AppNav items={visibleNavItems} />
                    ) : (
                      <Link
                        href="/login"
                        className="inline-flex h-10 min-w-[6rem] items-center justify-center rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm font-medium text-slate-200 transition hover:border-cyan-400/50 hover:text-white"
                      >
                        Login
                      </Link>
                    )}
                    {session ? (
                      <form action={logoutAction} className="inline">
                        <button
                          type="submit"
                          className="inline-flex h-10 min-w-[4.5rem] items-center justify-center rounded-lg border border-slate-600/80 bg-slate-950/60 px-4 text-sm font-medium text-slate-200 transition hover:border-rose-400/50 hover:text-white"
                        >
                          Sair
                        </button>
                      </form>
                    ) : null}
                  </nav>
                </div>
              </div>
            </header>

            <main className="flex-1">{children}</main>

            <footer className="mt-6 flex flex-col gap-2 border-t border-slate-800/80 px-1 pt-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <span>Monitor-Pfsense v0.1.4</span>
              <a
                href="https://www.systemup.inf.br"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-300 transition hover:text-cyan-200"
              >
                Desenvolvido por Systemup
              </a>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
