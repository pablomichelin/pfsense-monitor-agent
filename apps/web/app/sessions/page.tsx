import { redirect } from 'next/navigation';
import { PageHero } from '@/components/page-hero';
import { ApiError, getAuthSessions, getSession } from '@/lib/api';
import { revokeSessionAction } from '@/lib/auth';
import { formatRelativeAge } from '@/lib/format';

export const dynamic = 'force-dynamic';

function Banner({
  status,
  message,
}: {
  status?: string;
  message?: string;
}) {
  if (!status || !message) {
    return null;
  }

  const tone =
    status === 'ok'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : 'border-rose-500/30 bg-rose-500/10 text-rose-200';

  return <div className={`rounded-2xl border px-4 py-3 text-sm ${tone}`}>{message}</div>;
}

function sessionState(session: {
  current: boolean;
  revoked_at: string | null;
  expires_at: string;
}): { label: string; tone: string } {
  if (session.current) {
    return {
      label: 'Atual',
      tone: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
    };
  }

  if (session.revoked_at) {
    return {
      label: 'Revogada',
      tone: 'border-slate-700 bg-slate-900/60 text-slate-300',
    };
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return {
      label: 'Expirada',
      tone: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    };
  }

  return {
    label: 'Ativa',
    tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  };
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
  const revokedCount = sessions.items.filter((item) => item.revoked_at).length;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Acesso humano"
        title="Sessoes da conta"
        description={`Revogue navegadores ou terminais antigos sem derrubar a sessao atual de ${session.user.email}.`}
        stats={[
          { label: 'Total', value: String(sessions.items.length) },
          { label: 'Ativas', value: String(activeCount), tone: activeCount > 0 ? 'success' : 'default' },
          { label: 'Revogadas', value: String(revokedCount), tone: revokedCount > 0 ? 'warning' : 'default' },
        ]}
      />

      <Banner status={status} message={message} />

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="glass-panel rounded-3xl p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
            Total
          </p>
          <div className="mt-3 font-display text-4xl text-white">{sessions.items.length}</div>
        </div>
        <div className="glass-panel rounded-3xl p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
            Ativas
          </p>
          <div className="mt-3 font-display text-4xl text-white">
            {activeCount}
          </div>
        </div>
        <div className="glass-panel rounded-3xl p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
            Revogadas
          </p>
          <div className="mt-3 font-display text-4xl text-white">
            {revokedCount}
          </div>
        </div>
      </section>

      <section className="glass-panel rounded-[2rem] p-5">
        <div className="space-y-4">
          {sessions.items.map((item) => {
            const state = sessionState(item);

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-800 bg-panel-soft/50 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-xs ${state.tone}`}>
                        {state.label}
                      </span>
                      <span className="font-mono text-xs text-slate-500">{item.id}</span>
                    </div>
                    <p className="text-sm text-slate-300">
                      Ultima atividade: {formatRelativeAge(item.last_seen_at ?? item.created_at)}
                    </p>
                    <p className="text-sm text-slate-400">
                      Criada em {new Date(item.created_at).toLocaleString('pt-BR')}
                    </p>
                    <p className="text-sm text-slate-400">
                      Expira em {new Date(item.expires_at).toLocaleString('pt-BR')}
                    </p>
                    <p className="text-sm text-slate-400">
                      IP: <span className="text-slate-200">{item.ip_address ?? 'nao informado'}</span>
                    </p>
                    <p className="text-sm text-slate-400">
                      Agent:{' '}
                      <span className="break-all text-slate-200">
                        {item.user_agent ?? 'nao informado'}
                      </span>
                    </p>
                    {item.revoked_at ? (
                      <p className="text-sm text-slate-400">
                        Revogada em {new Date(item.revoked_at).toLocaleString('pt-BR')}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    {item.current ? (
                      <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
                        Use o botao "Sair" para encerrar esta sessao.
                      </div>
                    ) : item.revoked_at ? (
                      <div className="rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
                        Sessao encerrada.
                      </div>
                    ) : (
                      <form action={revokeSessionAction}>
                        <input type="hidden" name="session_id" value={item.id} />
                        <button
                          type="submit"
                          className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 transition hover:border-rose-400/50 hover:text-rose-100"
                        >
                          Revogar sessao
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
