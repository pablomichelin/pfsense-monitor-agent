import type { Metadata } from 'next';
import { IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';
import Link from 'next/link';
import { AppShellLayout } from '@/components/app-shell-layout';
import { getOptionalSession } from '@/lib/api';
import { buildNavGroups } from '@/lib/route-policy';
import packageJson from '../package.json';
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

function AppFooter() {
  return (
    <footer className="mt-6 flex flex-col gap-2 border-t border-slate-800/80 px-1 pt-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
      <span>Monitor-Pfsense v{packageJson.version}</span>
      <a
        href="https://www.systemup.inf.br"
        target="_blank"
        rel="noreferrer"
        className="text-cyan-300 transition hover:text-cyan-200"
      >
        Desenvolvido por Systemup
      </a>
    </footer>
  );
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getOptionalSession();
  const navGroups = buildNavGroups(session?.permissions ?? []);

  return (
    <html
      lang="pt-BR"
      className={`${spaceGrotesk.variable} ${ibmPlexMono.variable}`}
    >
      <body className="font-sans">
        <div className="min-h-screen overflow-x-hidden bg-grid bg-[size:32px_32px]">
          {session ? (
            <AppShellLayout
              navGroups={navGroups}
              userEmail={session.user.email}
              footer={<AppFooter />}
            >
              {children}
            </AppShellLayout>
          ) : (
            <div className="app-shell">
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
                  <Link
                    href="/login"
                    className="inline-flex h-10 min-w-[6rem] items-center justify-center rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm font-medium text-slate-200 transition hover:border-cyan-400/50 hover:text-white"
                  >
                    Login
                  </Link>
                </div>
              </header>
              <main className="app-page flex-1">{children}</main>
              <AppFooter />
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
