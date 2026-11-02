import Link from 'next/link';
import { parsePage } from '@/lib/pagination';
import { redirect } from 'next/navigation';
import { AdvancedSection } from '@/components/advanced-section';
import { PageHero } from '@/components/page-hero';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { Alert, Badge, Button, Card, PageSection } from '@/components/ui';
import { acknowledgeAlertAction, resolveAlertAction } from '@/lib/alerts';
import { getAlertsList, getNodesFilters, getSession } from '@/lib/api';
import { hasPermission } from '@/lib/authz';
import { handlePageApiError } from '@/lib/handle-page-api-error';
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

function ActionForms({
  alertId,
  status,
  returnTo,
  canAcknowledgeAlerts,
  canResolveAlerts,
}: {
  alertId: string;
  status: string;
  returnTo: string;
  canAcknowledgeAlerts: boolean;
  canResolveAlerts: boolean;
}) {
  if (status === 'resolved') {
    return <span className="text-xs text-slate-500">Resolvido</span>;
  }

  if (!(canAcknowledgeAlerts && status === 'open') && !canResolveAlerts) {
    return <span className="text-xs text-slate-500">Somente leitura</span>;
  }

  return (
    <div className="flex flex-col gap-2">
      {canAcknowledgeAlerts && status === 'open' ? (
        <form action={acknowledgeAlertAction} className="flex">
          <input type="hidden" name="alert_id" value={alertId} />
          <input type="hidden" name="return_to" value={returnTo} />
          <Button type="submit" variant="secondary" size="sm" className="border-amber-500/30 bg-amber-500/10 text-amber-200 hover:border-amber-400/50">
            Reconhecer
          </Button>
        </form>
      ) : null}
      {canResolveAlerts ? <form action={resolveAlertAction} className="flex flex-col gap-2">
        <input type="hidden" name="alert_id" value={alertId} />
        <input type="hidden" name="return_to" value={returnTo} />
        <input
          type="text"
          name="resolution_note"
          aria-label="Nota de resolução do alerta"
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
      </form> : null}
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
  const page = Math.min(parsePage(params.page), 1000000);
  const perPage = typeof params.per_page === 'string' && ['10', '25', '50'].includes(params.per_page) ? Number(params.per_page) : 25;

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
        page, limit: perPage, sort_by: 'attention',
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
  returnToParams.set('per_page', String(perPage));
  returnToParams.set('page', String(alerts.page));
  const returnTo = returnToParams.toString()
    ? `/alerts?${returnToParams.toString()}`
    : '/alerts';
  const openCount = alerts.totals.open;
  const acknowledgedCount = alerts.totals.acknowledged;
  const criticalCount = alerts.totals.critical;
  const totalPages = alerts.total_pages;
  const currentPage = alerts.page;
  const visibleAlerts = alerts.items;
  const alertPageHref = (nextPage: number) => {
    const next = new URLSearchParams(returnToParams);
    next.set('per_page', String(perPage));
    next.set('page', String(nextPage));
    return `/alerts?${next.toString()}`;
  };
  const quickAlertHref = (nextStatus?: string, nextSeverity?: string) => {
    const next = new URLSearchParams(returnToParams);
    next.delete('page');
    next.delete('status');
    next.delete('severity');
    if (nextStatus) next.set('status', nextStatus);
    if (nextSeverity) next.set('severity', nextSeverity);
    return `/alerts?${next.toString()}`;
  };

  return (
    <div className="space-y-section">
      <PageHero
        eyebrow="Operação"
        title="Central de alertas"
        description="Lista de problemas que precisam de atenção."
        stats={[
          { label: 'Abertos', value: String(openCount), tone: openCount > 0 ? 'danger' : 'success' },
          { label: 'Reconhecidos', value: String(acknowledgedCount), tone: acknowledgedCount > 0 ? 'warning' : 'default' },
          { label: 'Críticos', value: String(criticalCount), tone: criticalCount > 0 ? 'danger' : 'default' },
          { label: 'Resolvidos', value: String(alerts.totals.resolved), tone: 'success' },
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
        <div className="mb-3 flex flex-wrap gap-2" aria-label="Filtros rápidos de alertas">
          <Link href={quickAlertHref('open')} aria-current={status === 'open' && !severity ? 'page' : undefined} className="rounded-lg border border-danger-border bg-danger-muted px-3 py-2 text-sm text-danger-fg">Abertos</Link>
          <Link href={quickAlertHref('open', 'critical')} aria-current={status === 'open' && severity === 'critical' ? 'page' : undefined} className="rounded-lg border border-danger-border px-3 py-2 text-sm text-danger-fg">Críticos</Link>
          <Link href={quickAlertHref('acknowledged')} aria-current={status === 'acknowledged' ? 'page' : undefined} className="rounded-lg border border-warning-border bg-warning-muted px-3 py-2 text-sm text-warning-fg">Reconhecidos</Link>
          <Link href={quickAlertHref()} aria-current={!status && !severity ? 'page' : undefined} className="rounded-lg border border-border px-3 py-2 text-sm text-fg-muted">Todos</Link>
        </div>
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
              <select name="per_page" defaultValue={String(perPage)} className={formSelectClassName} aria-label="Alertas por página"><option value="10">10 por página</option><option value="25">25 por página</option><option value="50">50 por página</option></select>
            </div>
            <AdvancedSection
              title="Filtros de diagnóstico"
              description="Severidade e tipo para troubleshooting. Os filtros principais acima bastam para uso diário."
              defaultOpen={Boolean(severity || type)}
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
                  <option value="certificate_expiring">certificate_expiring</option>
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

      <PageSection
        title="Alertas"
        description={`${alerts.total} registro(s) com os filtros atuais, críticos e mais antigos primeiro.`}
      >
        {alerts.items.length === 0 ? (
          <Alert variant="info">Nenhum alerta encontrado com os filtros atuais.</Alert>
        ) : (
          <div className="space-y-2">
            {visibleAlerts.map((alert) => (
              <Card key={alert.id} className="p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
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
                      <h3 className="font-display text-base font-semibold text-fg">{alert.title}</h3>
                      <p className="mt-1 max-w-3xl text-sm text-fg-muted">{alert.description}</p>
                      <p className="mt-2 text-xs text-fg-muted">
                        <Link href={`/nodes/${alert.node.id}`} className="font-medium text-primary hover:underline">{alert.node.display_name ?? alert.node.hostname}</Link>
                        {' · '}{alert.client.name} / {alert.site.name}{' · '}Aberto {formatRelativeAge(alert.opened_at)}
                      </p>
                    </div>

                    <details className="rounded-lg border border-border bg-surface-soft px-3 py-2">
                      <summary className="cursor-pointer text-sm font-medium text-fg">Detalhes técnicos e histórico do alerta</summary>
                    <div className="grid gap-3 text-sm text-fg-muted md:grid-cols-2 xl:grid-cols-4">
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
                    </details>
                  </div>

                  <div className="xl:w-48">
                    <ActionForms
                      alertId={alert.id}
                      status={alert.status}
                      returnTo={returnTo}
                      canAcknowledgeAlerts={canAcknowledgeAlerts}
                      canResolveAlerts={canResolveAlerts}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-fg-muted">
          <span>Página {currentPage} de {totalPages}</span>
          <div className="flex gap-2">
            {currentPage > 1 ? <Link href={alertPageHref(currentPage - 1)} className="rounded-lg border border-border px-3 py-2 hover:text-fg">Anterior</Link> : null}
            {currentPage < totalPages ? <Link href={alertPageHref(currentPage + 1)} className="rounded-lg border border-border px-3 py-2 hover:text-fg">Próxima</Link> : null}
          </div>
        </div>
      </PageSection>
    </div>
  );
}
