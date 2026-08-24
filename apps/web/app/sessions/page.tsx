import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PageHero } from '@/components/page-hero';
import { Alert, Badge, Button, DataTable, PageSection, dataTableHeadClassName, dataTableRowClassName } from '@/components/ui';
import { ApiError, getAuthSessions, getSession } from '@/lib/api';
import { revokeSessionAction } from '@/lib/auth';
import { formatRelativeAge } from '@/lib/format';

export const dynamic = 'force-dynamic';

function sessionState(session: {
  current: boolean;
  revoked_at: string | null;
  expires_at: string;
}): { label: string; variant: 'info' | 'neutral' | 'warning' | 'success' } {
  if (session.current) {
    return { label: 'Atual', variant: 'info' };
  }

  if (session.revoked_at) {
    return { label: 'Revogada', variant: 'neutral' };
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return { label: 'Expirada', variant: 'warning' };
  }

  return { label: 'Ativa', variant: 'success' };
}

export default async function SessionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const status = typeof params.status === 'string' ? params.status : undefined;
  const message = typeof params.message === 'string' ? params.message : undefined;
  const view = typeof params.view === 'string' && ['active', 'history', 'all'].includes(params.view)
    ? params.view
    : 'active';
  const query = typeof params.q === 'string' ? params.q.trim().toLowerCase() : '';
  const page = typeof params.page === 'string' && /^\d+$/.test(params.page) ? Math.max(1, Number(params.page)) : 1;
  const perPage = typeof params.per_page === 'string' && ['10', '25', '50'].includes(params.per_page)
    ? Number(params.per_page)
    : 25;

  let session;
  let sessions;

  try {
    [session, sessions] = await Promise.all([getSession(), getAuthSessions()]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }

    throw error;
  }
  const activeCount = sessions.items.filter((item) => !item.revoked_at).length;
  const filteredSessions = sessions.items
    .filter((item) => {
      const state = sessionState(item);
      if (view === 'active' && state.label !== 'Atual' && state.label !== 'Ativa') return false;
      if (view === 'history' && state.label !== 'Revogada' && state.label !== 'Expirada') return false;
      if (!query) return true;
      return `${item.ip_address ?? ''} ${item.user_agent ?? ''}`.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      return new Date(b.last_seen_at ?? b.created_at).getTime() - new Date(a.last_seen_at ?? a.created_at).getTime();
    });
  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const visibleSessions = filteredSessions.slice((currentPage - 1) * perPage, currentPage * perPage);
  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams();
    next.set('view', view);
    if (query) next.set('q', query);
    next.set('per_page', String(perPage));
    next.set('page', String(nextPage));
    return `/sessions?${next.toString()}`;
  };

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Conta"
        title="Sessões"
        description={`Sessões ativas de ${session.user.email}. Revogue outras sessões sem encerrar a atual.`}
        stats={[
          { label: 'Ativas', value: String(activeCount), tone: activeCount > 0 ? 'success' : 'default' },
          { label: 'Total', value: String(sessions.items.length) },
        ]}
      />

      {status && message ? (
        <Alert variant={status === 'ok' ? 'success' : 'error'}>{message}</Alert>
      ) : null}

      <PageSection
        title="Sessões registradas"
        description="Revogue sessões em outros dispositivos. A sessão atual deve ser encerrada com Sair."
      >
        <div className="mb-3 flex flex-col gap-3 rounded-xl border border-border bg-surface-soft p-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap gap-2" aria-label="Filtrar sessões por estado">
            {[
              ['active', 'Ativas'],
              ['history', 'Expiradas/revogadas'],
              ['all', 'Todas'],
            ].map(([value, label]) => (
              <Link key={value} href={`/sessions?view=${value}&per_page=${perPage}`} aria-current={view === value ? 'page' : undefined} className={view === value ? 'rounded-lg border border-primary bg-primary/15 px-3 py-2 text-sm text-primary' : 'rounded-lg border border-border px-3 py-2 text-sm text-fg-muted hover:text-fg'}>{label}</Link>
            ))}
          </div>
          <form className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="view" value={view} />
            <label className="text-xs text-fg-muted">Buscar por IP ou agente<input name="q" defaultValue={query} className="mt-1 block h-10 min-w-[16rem] rounded-lg border border-border bg-surface px-3 text-sm text-fg" /></label>
            <label className="text-xs text-fg-muted">Por página<select name="per_page" defaultValue={String(perPage)} className="mt-1 block h-10 rounded-lg border border-border bg-surface px-3 text-sm text-fg"><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label>
            <Button type="submit" size="sm">Aplicar</Button>
          </form>
        </div>
        <DataTable
          empty={visibleSessions.length === 0}
          emptyMessage="Nenhuma sessão registrada."
        >
          <thead className={dataTableHeadClassName}>
            <tr>
              <th className="px-4 py-4 font-medium">Status</th>
              <th className="px-4 py-4 font-medium">Última atividade</th>
              <th className="px-4 py-4 font-medium">Criação</th>
              <th className="px-4 py-4 font-medium">Expiração</th>
              <th className="px-4 py-4 font-medium">IP</th>
              <th className="px-4 py-4 font-medium">Agente</th>
              <th className="px-4 py-4 text-right font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {visibleSessions.map((item) => {
              const state = sessionState(item);
              return (
                <tr key={item.id} className={dataTableRowClassName}>
                  <td className="px-4 py-4">
                    <Badge variant={state.variant}>{state.label}</Badge>
                  </td>
                  <td className="px-4 py-4 text-slate-300">
                    {formatRelativeAge(item.last_seen_at ?? item.created_at)}
                  </td>
                  <td className="px-4 py-4 text-slate-400">
                    {new Date(item.created_at).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="px-4 py-4 text-slate-400">
                    {new Date(item.expires_at).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="px-4 py-4 font-mono text-slate-300">{item.ip_address ?? '—'}</td>
                  <td
                    className="max-w-[10rem] truncate px-4 py-4 text-slate-400"
                    title={item.user_agent ?? undefined}
                  >
                    {item.user_agent ?? '—'}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {item.current ? (
                      <span className="text-xs text-cyan-400">Use Sair para encerrar</span>
                    ) : item.revoked_at ? (
                      <span className="text-xs text-slate-500">Encerrada</span>
                    ) : (
                      <form action={revokeSessionAction} className="inline">
                        <input type="hidden" name="session_id" value={item.id} />
                        <Button type="submit" variant="danger-outline" size="sm">
                          Revogar
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
        <div className="mt-3 flex items-center justify-between gap-3 text-sm text-fg-muted">
          <span>{filteredSessions.length} sessão(ões) · página {currentPage} de {totalPages}</span>
          <div className="flex gap-2">
            {currentPage > 1 ? <Link href={pageHref(currentPage - 1)} className="rounded-lg border border-border px-3 py-2 hover:text-fg">Anterior</Link> : null}
            {currentPage < totalPages ? <Link href={pageHref(currentPage + 1)} className="rounded-lg border border-border px-3 py-2 hover:text-fg">Próxima</Link> : null}
          </div>
        </div>
      </PageSection>
    </div>
  );
}
