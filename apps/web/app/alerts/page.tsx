import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdvancedSection } from '@/components/advanced-section';
import { PageHero } from '@/components/page-hero';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { Alert, Badge, Button, Card, PageSection } from '@/components/ui';
import { acknowledgeAlertAction, resolveAlertAction } from '@/lib/alerts';
import { getAlertsList, getNodesFilters, getSession } from '@/lib/api';
import { hasPermission } from '@/lib/authz';
import { handlePageApiError } from '@/lib/handle-page-api-error';
import { cn } from '@/lib/cn';
import { formInputClassName, formSelectClassName } from '@/lib/form-field-styles';
import { adminNavLinkClassName } from '@/lib/admin-nav-styles';
import { formatDateTime, formatRelativeAge } from '@/lib/format';

export const dynamic = 'force-dynamic';

const statusVariant: Record<string, 'danger' | 'warning' | 'success'> = {
  open: 'danger',
  acknowledged: 'warning',
  resolved: 'success',
};

const statusLabel: Record<string, string> = {
  open: 'Aberto',
  acknowledged: 'Reconhecido',
  resolved: 'Resolvido',
};

const severityVariant: Record<string, 'danger' | 'warning' | 'info'> = {
  critical: 'danger',
  warning: 'warning',
  info: 'info',
};

const severityLabel: Record<string, string> = {
  critical: 'Crítico',
  warning: 'Aviso',
  info: 'Info',
};

function SummaryCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: 'danger' | 'warning' | 'success';
}) {
  const dotClass =
    variant === 'danger'
      ? 'bg-signal-offline'
      : variant === 'warning'
        ? 'bg-signal-degraded'
        : 'bg-signal-online';

  return (
    <Card className="min-h-28 p-6">
      <p className="font-mono text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="font-display text-3xl font-semibold text-white">{value}</span>
        <span className={cn('status-dot shrink-0', dotClass)} aria-hidden />
      </div>
    </Card>
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
    return <span className="text-xs text-slate-500">Resolvido</span>;
  }

  if (!canManageAlerts) {
    return <span className="text-xs text-slate-500">Somente leitura</span>;
  }

  return (
    <div className="flex flex-col gap-2">
      {status === 'open' ? (
        <form action={acknowledgeAlertAction} className="flex">
          <input type="hidden" name="alert_id" value={alertId} />
          <input type="hidden" name="return_to" value={returnTo} />
          <Button type="submit" variant="secondary" size="sm" className="border-amber-500/30 bg-amber-500/10 text-amber-200 hover:border-amber-400/50">
            Reconhecer
          </Button>
        </form>
      ) : null}
      <form action={resolveAlertAction} className="flex flex-col gap-2">
        <input type="hidden" name="alert_id" value={alertId} />
        <input type="hidden" name="return_to" value={returnTo} />
        <input
          type="text"
          name="resolution_note"
          placeholder="Nota de resolução"
          className={`${formInputClassName} w-full text-xs`}
        />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400/50"
        >
          Resolver
        </Button>
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
    handlePageApiError(error);
  }

  const permissions = session.permissions ?? [];
  if (!hasPermission(permissions, 'alerts.view')) {
    redirect('/conta?access=denied');
  }

  const canAcknowledgeAlerts = hasPermission(permissions, 'alerts.acknowledge');
  const canResolveAlerts = hasPermission(permissions, 'alerts.resolve');
  const canManageAlerts = canAcknowledgeAlerts || canResolveAlerts;

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
    <div className="space-y-8">
      <PageHero
        eyebrow="Operação"
        title="Central de alertas"
        description="Lista de problemas que precisam de atenção."
        stats={[
          { label: 'Abertos', value: String(openCount), tone: openCount > 0 ? 'danger' : 'success' },
          { label: 'Reconhecidos', value: String(acknowledgedCount), tone: acknowledgedCount > 0 ? 'warning' : 'default' },
          { label: 'Críticos', value: String(criticalCount), tone: criticalCount > 0 ? 'danger' : 'default' },
        ]}
        aside={<RealtimeRefresh renderedAt={alerts.generated_at} />}
      />

      <PageSection
        title="Filtros"
        description="Refine por cliente, local, status ou busca textual."
        actions={
          <Link
            href="/alerts"
            className={adminNavLinkClassName}
          >
            Limpar filtros
          </Link>
        }
      >
        <Card className="p-6">
          <form className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-center xl:gap-4">
              <select
                name="client_id"
                defaultValue={clientId ?? ''}
                className={formSelectClassName}
              >
                <option value="">Todos os clientes</option>
                {filterOptions.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} ({client.node_count})
                  </option>
                ))}
              </select>
              <select name="site_id" defaultValue={siteId ?? ''} className={formSelectClassName}>
                <option value="">Todos</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.client_name} — {site.name}
                  </option>
                ))}
              </select>
              <select name="status" defaultValue={status ?? ''} className={formSelectClassName}>
                <option value="">Todos os status</option>
                <option value="open">Aberto</option>
                <option value="acknowledged">Reconhecido</option>
                <option value="resolved">Resolvido</option>
              </select>
              <input
                type="search"
                name="search"
                defaultValue={search ?? ''}
                placeholder="Buscar por node, cliente ou descrição"
                className={`${formInputClassName} min-w-[16rem] flex-1`}
              />
              <Button type="submit">Filtrar</Button>
            </div>
            <AdvancedSection
              title="Filtros de diagnóstico"
              description="Severidade e tipo para troubleshooting. Os filtros principais acima bastam para uso diário."
            >
              <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-center xl:gap-4">
                <select name="severity" defaultValue={severity ?? ''} className={formSelectClassName}>
                  <option value="">Todas as severidades</option>
                  <option value="critical">Crítico</option>
                  <option value="warning">Aviso</option>
                  <option value="info">Info</option>
                </select>
                <select name="type" defaultValue={type ?? ''} className={formSelectClassName}>
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
              </div>
            </AdvancedSection>
          </form>
        </Card>
      </PageSection>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard label="Abertos" value={alerts.totals.open} variant="danger" />
        <SummaryCard label="Reconhecidos" value={alerts.totals.acknowledged} variant="warning" />
        <SummaryCard label="Resolvidos" value={alerts.totals.resolved} variant="success" />
      </section>

      <PageSection
        title="Alertas"
        description={`${alerts.items.length} registro(s) com os filtros atuais.`}
      >
        {alerts.items.length === 0 ? (
          <Alert variant="info">Nenhum alerta encontrado com os filtros atuais.</Alert>
        ) : (
          <div className="space-y-4">
            {alerts.items.map((alert) => (
              <Card key={alert.id} className="p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={statusVariant[alert.status] ?? 'neutral'}>
                        {statusLabel[alert.status] ?? alert.status}
                      </Badge>
                      <Badge variant={severityVariant[alert.severity] ?? 'neutral'}>
                        {severityLabel[alert.severity] ?? alert.severity}
                      </Badge>
                      <Badge variant="neutral">{alert.type}</Badge>
                    </div>

                    <div>
                      <h3 className="font-display text-xl font-semibold text-white">{alert.title}</h3>
                      <p className="mt-2 max-w-3xl text-sm text-slate-400">{alert.description}</p>
                    </div>

                    <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <p className="font-mono text-xs uppercase tracking-wider text-slate-500">
                          Firewall
                        </p>
                        <Link
                          href={`/nodes/${alert.node.id}`}
                          className="mt-2 block text-cyan-300 hover:text-cyan-200"
                        >
                          {alert.node.display_name ?? alert.node.hostname}
                        </Link>
                        <p className="mt-1 text-slate-500">{alert.node.node_uid}</p>
                      </div>
                      <div>
                        <p className="font-mono text-xs uppercase tracking-wider text-slate-500">
                          Cliente / Local
                        </p>
                        <p className="mt-2">{alert.client.name}</p>
                        <p className="text-slate-500">{alert.site.name}</p>
                      </div>
                      <div>
                        <p className="font-mono text-xs uppercase tracking-wider text-slate-500">
                          Tempo
                        </p>
                        <p className="mt-2">Aberto {formatRelativeAge(alert.opened_at)}</p>
                        <p className="text-slate-500">{formatDateTime(alert.opened_at)}</p>
                      </div>
                      <div>
                        <p className="font-mono text-xs uppercase tracking-wider text-slate-500">
                          Contexto
                        </p>
                        <p className="mt-2">MGMT {alert.node.management_ip ?? '—'}</p>
                        <p className="text-slate-500">pfSense {alert.node.pfsense_version ?? '—'}</p>
                      </div>
                    </div>

                    {alert.acknowledged_at ? (
                      <p className="text-xs text-slate-500">
                        Reconhecido em {formatDateTime(alert.acknowledged_at)} por{' '}
                        {alert.acknowledged_by ?? 'n/a'}.
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
              </Card>
            ))}
          </div>
        )}
      </PageSection>
    </div>
  );
}
