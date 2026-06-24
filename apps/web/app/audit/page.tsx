import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuditEventRow } from '@/components/audit-event-row';
import { PageHero } from '@/components/page-hero';
import { Alert, Button, Card, PageSection } from '@/components/ui';
import {
  AUDIT_ACTION_GROUPS,
  AUDIT_LIMIT_OPTIONS,
  AUDIT_PERIOD_OPTIONS,
  AUDIT_RESULT_OPTIONS,
  AUDIT_TARGET_TYPE_OPTIONS,
  resolveAuditPeriodBounds,
} from '@/lib/audit-labels';
import { ApiError, getAuditLogs, getSession } from '@/lib/api';
import { hasPermission } from '@/lib/authz';
import { adminNavLinkClassName } from '@/lib/admin-nav-styles';

export const dynamic = 'force-dynamic';

const inputClassName =
  'h-11 min-w-[11rem] rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500';
const selectClassName =
  'h-11 min-w-[11rem] rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-200 outline-none';

function parseLimit(value: string | undefined): number {
  const parsed = Number(value);
  return AUDIT_LIMIT_OPTIONS.includes(parsed as (typeof AUDIT_LIMIT_OPTIONS)[number])
    ? parsed
    : 50;
}

function buildAuditQueryString(
  values: Record<string, string | undefined>,
  extra?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  const merged = { ...values, ...extra };

  for (const [key, value] of Object.entries(merged)) {
    if (value?.trim()) {
      params.set(key, value.trim());
    }
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const action = typeof params.action === 'string' ? params.action : undefined;
  const targetType = typeof params.target_type === 'string' ? params.target_type : undefined;
  const targetId = typeof params.target_id === 'string' ? params.target_id : undefined;
  const result = typeof params.result === 'string' ? params.result : undefined;
  const actorEmail = typeof params.actor_email === 'string' ? params.actor_email : undefined;
  const period = typeof params.period === 'string' ? params.period : undefined;
  const fromParam = typeof params.from === 'string' ? params.from : undefined;
  const toParam = typeof params.to === 'string' ? params.to : undefined;
  const limit = parseLimit(typeof params.limit === 'string' ? params.limit : undefined);
  const offset = Math.max(0, Number(typeof params.offset === 'string' ? params.offset : '0') || 0);

  let from: string | undefined;
  let to: string | undefined;

  if (period === '24h' || period === '7d' || period === '30d') {
    const presetBounds = resolveAuditPeriodBounds(period);
    from = presetBounds.from;
    to = presetBounds.to;
  } else if (fromParam || toParam) {
    from = fromParam;
    to = toParam;
  }

  let session;
  let audit;

  try {
    [session, audit] = await Promise.all([
      getSession(),
      getAuditLogs({
        action,
        target_type: targetType,
        target_id: targetId,
        result,
        from,
        to,
        actor_email: actorEmail,
        limit,
        offset,
      }),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }

    throw error;
  }

  if (!hasPermission(session.permissions ?? [], 'audit.view')) {
    redirect('/dashboard');
  }

  const filterState = {
    action,
    target_type: targetType,
    target_id: targetId,
    result,
    actor_email: actorEmail,
    period,
    from: fromParam,
    to: toParam,
    limit: String(limit),
    offset: offset > 0 ? String(offset) : undefined,
  };

  const currentQuery = buildAuditQueryString(filterState);
  const nextOffset = offset + audit.items.length;
  const hasMore = audit.items.length === limit;
  const loadMoreHref = hasMore
    ? `/audit${buildAuditQueryString(filterState, { offset: String(nextOffset) })}`
    : undefined;

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Governança"
        title="Auditoria"
        description="Histórico de ações administrativas e operacionais. Use os filtros para localizar eventos por período, ator ou recurso."
        stats={[
          { label: 'Eventos exibidos', value: String(audit.items.length) },
          { label: 'Limite', value: String(limit) },
        ]}
      />

      <PageSection
        title="Filtros"
        description="Refine por período, ação, ator, tipo de recurso ou resultado."
        actions={
          <Link
            href="/audit"
            className={adminNavLinkClassName}
          >
            Limpar filtros
          </Link>
        }
      >
        <Card className="p-6">
          <form className="flex flex-col gap-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-300">Período</span>
                <select
                  name="period"
                  defaultValue={period ?? ''}
                  className={`${selectClassName} w-full`}
                >
                  {AUDIT_PERIOD_OPTIONS.map((option) => (
                    <option key={option.value || 'all'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-300">Ação</span>
                <select
                  name="action"
                  defaultValue={action ?? ''}
                  className={`${selectClassName} w-full`}
                >
                  {AUDIT_ACTION_GROUPS.map((option) => (
                    <option key={option.value || 'all'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-300">Ator (e-mail)</span>
                <input
                  type="search"
                  name="actor_email"
                  defaultValue={actorEmail ?? ''}
                  placeholder="Buscar por e-mail"
                  className={`${inputClassName} w-full`}
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-300">Tipo de recurso</span>
                <select
                  name="target_type"
                  defaultValue={targetType ?? ''}
                  className={`${selectClassName} w-full`}
                >
                  {AUDIT_TARGET_TYPE_OPTIONS.map((option) => (
                    <option key={option.value || 'all'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-300">ID do recurso</span>
                <input
                  type="text"
                  name="target_id"
                  defaultValue={targetId ?? ''}
                  placeholder="UUID ou identificador"
                  className={`${inputClassName} w-full font-mono text-xs`}
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-300">Resultado</span>
                <select
                  name="result"
                  defaultValue={result ?? ''}
                  className={`${selectClassName} w-full`}
                >
                  {AUDIT_RESULT_OPTIONS.map((option) => (
                    <option key={option.value || 'all'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-300">De</span>
                <input
                  type="date"
                  name="from"
                  defaultValue={fromParam ?? ''}
                  className={`${inputClassName} w-full`}
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-300">Até</span>
                <input
                  type="date"
                  name="to"
                  defaultValue={toParam ?? ''}
                  className={`${inputClassName} w-full`}
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-300">Quantidade</span>
                <select
                  name="limit"
                  defaultValue={String(limit)}
                  className={`${selectClassName} w-full`}
                >
                  {AUDIT_LIMIT_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value} eventos
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="text-xs text-slate-500">
              Para período personalizado, selecione &quot;Personalizado&quot; e informe as datas De/Até.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit">Aplicar filtros</Button>
              {offset > 0 ? (
                <Link
                  href={`/audit${buildAuditQueryString({ ...filterState, offset: undefined })}`}
                  className="inline-flex h-11 min-h-11 items-center justify-center rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm font-medium text-slate-200 transition hover:border-cyan-400/50 hover:text-white"
                >
                  Voltar ao início
                </Link>
              ) : null}
            </div>
          </form>
        </Card>
      </PageSection>

      <PageSection
        title="Eventos"
        description="Lista em ordem cronológica decrescente. Detalhes técnicos (payload) sob demanda."
      >
        <Card className="p-4 sm:p-5">
          {audit.items.length === 0 ? (
            <Alert variant="info">
              Nenhum evento encontrado para os filtros atuais. Tente ampliar o período ou remover
              critérios.
            </Alert>
          ) : (
            <div className="space-y-2">
              {audit.items.map((item) => (
                <AuditEventRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </Card>

        {hasMore && loadMoreHref ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href={loadMoreHref}
              className="inline-flex h-11 min-h-11 items-center justify-center rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm font-medium text-slate-200 transition hover:border-cyan-400/50 hover:text-white"
            >
              Próxima página
            </Link>
            <p className="text-xs text-slate-500">
              Exibindo até {limit} eventos por página. Há mais registros compatíveis com os filtros.
            </p>
          </div>
        ) : null}

        {offset > 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            Exibindo eventos a partir do deslocamento {offset}.
            {currentQuery ? ` Filtros ativos preservados.` : ''}
          </p>
        ) : null}
      </PageSection>
    </div>
  );
}
