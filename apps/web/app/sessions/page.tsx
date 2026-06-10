import { redirect } from 'next/navigation';
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
        <DataTable
          empty={sessions.items.length === 0}
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
            {sessions.items.map((item) => {
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
      </PageSection>
    </div>
  );
}
