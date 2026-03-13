import { redirect } from 'next/navigation';
import { PageHero } from '@/components/page-hero';
import { ApiError, getAuditLogs, getSession } from '@/lib/api';
import { ADMIN_ROLES, hasRole } from '@/lib/authz';
import { formatRelativeAge } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const action = typeof params.action === 'string' ? params.action : undefined;
  const targetType = typeof params.target_type === 'string' ? params.target_type : undefined;
  const targetId = typeof params.target_id === 'string' ? params.target_id : undefined;

  let session;
  let audit;

  try {
    [session, audit] = await Promise.all([
      getSession(),
      getAuditLogs({
        action,
        target_type: targetType,
        target_id: targetId,
        limit: 50,
      }),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }

    throw error;
  }

  if (!hasRole(session.user.role, ADMIN_ROLES)) {
    redirect('/dashboard');
  }
  const actionCount = new Set(audit.items.map((item) => item.action)).size;
  const targetTypeCount = new Set(audit.items.map((item) => item.target_type)).size;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Governanca"
        title="Auditoria humana"
        description="Trilhas recentes de autenticacao, administracao, alertas e operacao sensivel do controlador."
        stats={[
          { label: 'Eventos', value: String(audit.items.length) },
          { label: 'Acoes', value: String(actionCount) },
          { label: 'Targets', value: String(targetTypeCount) },
        ]}
      />

      <section className="glass-panel rounded-[2rem] p-5">
        <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input
            type="text"
            name="action"
            defaultValue={action ?? ''}
            placeholder="Filtro por prefixo de acao"
            className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <input
            type="text"
            name="target_type"
            defaultValue={targetType ?? ''}
            placeholder="target_type"
            className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <input
            type="text"
            name="target_id"
            defaultValue={targetId ?? ''}
            placeholder="target_id"
            className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 md:col-span-2"
          />
          <button
            type="submit"
            className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
          >
            Filtrar
          </button>
        </form>
      </section>

      <section className="glass-panel rounded-[2rem] p-5">
        <div className="space-y-4">
          {audit.items.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-panel-soft/50 px-4 py-6 text-sm text-slate-400">
              Nenhum evento encontrado para o recorte atual.
            </div>
          ) : (
            audit.items.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-800 bg-panel-soft/50 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">
                        {item.action}
                      </span>
                      <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs text-slate-300">
                        {item.target_type}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300">
                      Ator: {item.actor_email ?? item.actor_id ?? 'nao identificado'}
                    </p>
                    <p className="text-sm text-slate-400">
                      Alvo: {item.target_id ?? 'sem target_id'}
                    </p>
                    <p className="text-sm text-slate-400">IP: {item.ip_address ?? 'nao informado'}</p>
                    {item.metadata_json ? (
                      <pre className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-slate-300">
                        {JSON.stringify(item.metadata_json, null, 2)}
                      </pre>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-sm text-slate-400">
                    <p>{new Date(item.created_at).toLocaleString('pt-BR')}</p>
                    <p>{formatRelativeAge(item.created_at)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
