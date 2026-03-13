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
  { href: '/bootstrap', label: 'Bootstrap' },
  { href: '/sessions', label: 'Sessoes' },
];

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getOptionalSession();
  const visibleNavItems = hasRole(session?.user.role, ADMIN_ROLES)
    ? [...navItems, { href: '/admin', label: 'Admin' }, { href: '/audit', label: 'Auditoria' }]
    : navItems;

  return (
    <html
      lang="pt-BR"
      className={`${spaceGrotesk.variable} ${ibmPlexMono.variable}`}
    >
      <body className="font-sans">
        <div className="min-h-screen bg-grid bg-[size:32px_32px]">
          <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
            <header className="glass-panel mb-6 rounded-3xl px-5 py-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
                    SystemUp NOC
                  </p>
                  <h1 className="font-display text-2xl font-semibold text-slate-50">
                    Monitor-Pfsense
                  </h1>
                  <p className="text-sm text-slate-400">
                    Leitura operacional centralizada dos firewalls pfSense.
                  </p>
                </div>

                <div className="flex flex-col gap-3 lg:items-end">
                  {session ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-700/80 bg-slate-950/50 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-400">
                        {session.user.role}
                      </span>
                      <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-100">
                        {session.user.email}
                      </span>
                    </div>
                  ) : null}

                  <nav className="flex flex-wrap gap-2">
                    {session
                    ? <AppNav items={visibleNavItems} />
                    : (
                        <Link
                          href="/login"
                          className="rounded-full border border-slate-700/80 bg-panel-soft px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-400/60 hover:text-white"
                        >
                          Login
                        </Link>
                      )}
                  {session ? (
                    <form action={logoutAction}>
                      <button
                        type="submit"
                        className="rounded-full border border-slate-700/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-200 transition hover:border-rose-400/60 hover:text-white"
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
              <span>Monitor-Pfsense v0.1.0</span>
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
