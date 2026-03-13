import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHero } from '@/components/page-hero';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { acknowledgeAlertAction, resolveAlertAction } from '@/lib/alerts';
import { ApiError, getAlertsList, getNodesFilters, getSession } from '@/lib/api';
import { ALERT_WRITE_ROLES, hasRole } from '@/lib/authz';
import { formatDateTime, formatRelativeAge } from '@/lib/format';

export const dynamic = 'force-dynamic';

const statusTone: Record<string, string> = {
  open: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  acknowledged: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  resolved: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
};

const severityTone: Record<string, string> = {
  critical: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  info: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
};

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="glass-panel rounded-3xl p-5">
      <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
        {label}
      </p>
      <div className="mt-3 flex items-end justify-between">
        <span className="font-display text-4xl font-semibold text-white">
          {value}
        </span>
        <span className={`rounded-full border px-3 py-1 font-mono text-xs ${tone}`}>
          {label.toLowerCase()}
        </span>
      </div>
    </div>
  );
}

function ActionForms({
  alertId,
  status,
  returnTo,
  canManageAlerts,
}: {
  alertId: string;
  status: string;
  returnTo: string;
  canManageAlerts: boolean;
}) {
  if (status === 'resolved') {
    return <span className="text-xs text-slate-500">resolvido</span>;
  }

  if (!canManageAlerts) {
    return <span className="text-xs text-slate-500">somente leitura</span>;
  }

  return (
    <div className="flex flex-col gap-2">
      {status === 'open' ? (
        <form action={acknowledgeAlertAction} className="flex">
          <input type="hidden" name="alert_id" value={alertId} />
          <input type="hidden" name="return_to" value={returnTo} />
          <button
            type="submit"
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 transition hover:border-amber-400/50"
          >
            Acknowledge
          </button>
        </form>
      ) : null}
      <form action={resolveAlertAction} className="flex flex-col gap-2">
        <input type="hidden" name="alert_id" value={alertId} />
        <input type="hidden" name="return_to" value={returnTo} />
        <input
          type="text"
          name="resolution_note"
          placeholder="Nota de resolucao"
          className="rounded-xl border border-slate-700 bg-panel-soft px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-500"
        />
        <button
          type="submit"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 transition hover:border-emerald-400/50"
        >
          Resolver
        </button>
      </form>
    </div>
  );
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const clientId = typeof params.client_id === 'string' ? params.client_id : undefined;
  const siteId = typeof params.site_id === 'string' ? params.site_id : undefined;
  const nodeId = typeof params.node_id === 'string' ? params.node_id : undefined;
  const status = typeof params.status === 'string' ? params.status : undefined;
  const severity = typeof params.severity === 'string' ? params.severity : undefined;
  const type = typeof params.type === 'string' ? params.type : undefined;
  const search = typeof params.search === 'string' ? params.search : undefined;

  let alerts;
  let filterOptions;
  let session;

  try {
    [session, alerts, filterOptions] = await Promise.all([
      getSession(),
      getAlertsList({
        client_id: clientId,
        site_id: siteId,
        node_id: nodeId,
        status,
        severity,
        type,
        search,
      }),
      getNodesFilters(),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }

    throw error;
  }

  const canManageAlerts = hasRole(session.user.role, ALERT_WRITE_ROLES);

  const sites = clientId
    ? filterOptions.sites.filter((site) => site.client_id === clientId)
    : filterOptions.sites;

  const returnToParams = new URLSearchParams();
  for (const [key, value] of Object.entries({
    client_id: clientId,
    site_id: siteId,
    node_id: nodeId,
    status,
    severity,
    type,
    search,
  })) {
    if (value) {
      returnToParams.set(key, value);
    }
  }
  const returnTo = returnToParams.toString()
    ? `/alerts?${returnToParams.toString()}`
    : '/alerts';
  const openCount = alerts.items.filter((item) => item.status === 'open').length;
  const acknowledgedCount = alerts.items.filter((item) => item.status === 'acknowledged').length;
  const criticalCount = alerts.items.filter((item) => item.severity === 'critical').length;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Operacao"
        title="Central de alertas"
        description="Lista de problemas que precisam de atencao."
        stats={[
          { label: 'Abertos', value: String(openCount), tone: openCount > 0 ? 'danger' : 'success' },
          { label: 'Reconhecidos', value: String(acknowledgedCount), tone: acknowledgedCount > 0 ? 'warning' : 'default' },
          { label: 'Criticos', value: String(criticalCount), tone: criticalCount > 0 ? 'danger' : 'default' },
        ]}
        aside={<RealtimeRefresh renderedAt={alerts.generated_at} />}
      />

      <section className="glass-panel rounded-[2rem] p-5">
        <form className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-center">
              <select
                name="client_id"
                defaultValue={clientId ?? ''}
                className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-200 outline-none"
              >
                <option value="">Todos os clientes</option>
                {filterOptions.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} ({client.node_count})
                  </option>
                ))}
              </select>
              <select
                name="site_id"
                defaultValue={siteId ?? ''}
                className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-200 outline-none"
              >
                <option value="">Todos os sites</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.client_name} / {site.name}
                  </option>
                ))}
              </select>
              <select
                name="status"
                defaultValue={status ?? ''}
                className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-200 outline-none"
              >
                <option value="">Todos os status</option>
                <option value="open">Open</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="resolved">Resolved</option>
              </select>
              <select
                name="severity"
                defaultValue={severity ?? ''}
                className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-200 outline-none"
              >
                <option value="">Todas as severidades</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
              <select
                name="type"
                defaultValue={type ?? ''}
                className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-200 outline-none"
              >
                <option value="">Todos os tipos</option>
                <option value="heartbeat_missing">heartbeat_missing</option>
                <option value="service_down">service_down</option>
                <option value="gateway_down">gateway_down</option>
                <option value="version_change">version_change</option>
                <option value="agent_error">agent_error</option>
                <option value="node_uid_conflict">node_uid_conflict</option>
                <option value="clock_skew">clock_skew</option>
                <option value="auth_failure_repeated">auth_failure_repeated</option>
              </select>
              <input
                type="search"
                name="search"
                defaultValue={search ?? ''}
                placeholder="Buscar por node, cliente ou descricao"
                className="min-w-[18rem] flex-1 rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
              <button
                type="submit"
                className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
              >
                Filtrar
              </button>
              <Link
                href="/alerts"
                className="rounded-2xl border border-slate-700 px-5 py-3 text-center text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                Limpar
              </Link>
        </form>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="Open" value={alerts.totals.open} tone={statusTone.open} />
        <SummaryCard
          label="Acknowledged"
          value={alerts.totals.acknowledged}
          tone={statusTone.acknowledged}
        />
        <SummaryCard label="Resolved" value={alerts.totals.resolved} tone={statusTone.resolved} />
        <SummaryCard label="Critical" value={alerts.totals.critical} tone={severityTone.critical} />
        <SummaryCard label="Warning" value={alerts.totals.warning} tone={severityTone.warning} />
        <SummaryCard label="Info" value={alerts.totals.info} tone={severityTone.info} />
      </section>

      <section className="space-y-4">
        {alerts.items.length === 0 ? (
          <div className="glass-panel rounded-[2rem] px-5 py-8 text-sm text-slate-400">
            Nenhum alerta encontrado com os filtros atuais.
          </div>
        ) : (
          alerts.items.map((alert) => (
            <div key={alert.id} className="glass-panel rounded-[2rem] p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full border px-3 py-1 font-mono text-xs ${statusTone[alert.status]}`}>
                      {alert.status}
                    </span>
                    <span className={`rounded-full border px-3 py-1 font-mono text-xs ${severityTone[alert.severity]}`}>
                      {alert.severity}
                    </span>
                    <span className="rounded-full border border-slate-700 bg-panel-soft px-3 py-1 font-mono text-xs text-slate-300">
                      {alert.type}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-display text-2xl text-white">{alert.title}</h3>
                    <p className="mt-2 max-w-3xl text-sm text-slate-400">{alert.description}</p>
                  </div>

                  <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                        Firewall
                      </p>
                      <Link href={`/nodes/${alert.node.id}`} className="mt-2 block text-cyan-300 hover:text-cyan-200">
                        {alert.node.display_name ?? alert.node.hostname}
                      </Link>
                      <p className="mt-1 text-slate-500">{alert.node.node_uid}</p>
                    </div>
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                        Cliente / Site
                      </p>
                      <p className="mt-2">{alert.client.name}</p>
                      <p className="text-slate-500">{alert.site.name}</p>
                    </div>
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                        Tempo
                      </p>
                      <p className="mt-2">Aberto {formatRelativeAge(alert.opened_at)}</p>
                      <p className="text-slate-500">{formatDateTime(alert.opened_at)}</p>
                    </div>
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                        Contexto
                      </p>
                      <p className="mt-2">MGMT {alert.node.management_ip ?? '-'}</p>
                      <p className="text-slate-500">pfSense {alert.node.pfsense_version ?? '-'}</p>
                    </div>
                  </div>

                  {alert.acknowledged_at ? (
                    <p className="text-xs text-slate-500">
                      Reconhecido em {formatDateTime(alert.acknowledged_at)} por {alert.acknowledged_by ?? 'n/a'}.
                    </p>
                  ) : null}
                  {alert.resolved_at ? (
                    <p className="text-xs text-slate-500">
                      Resolvido em {formatDateTime(alert.resolved_at)}.
                      {alert.resolution_note ? ` Nota: ${alert.resolution_note}` : ''}
                    </p>
                  ) : null}
                </div>

                <div className="xl:w-48">
                  <ActionForms
                    alertId={alert.id}
                    status={alert.status}
                    returnTo={returnTo}
                    canManageAlerts={canManageAlerts}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
