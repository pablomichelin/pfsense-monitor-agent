import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { DeleteNodeButton } from '@/components/delete-node-button';
import { PageHero } from '@/components/page-hero';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { NodeCommandHistoryPanel } from '@/components/nodes/node-command-history-panel';
import { NodeOperationalActionsSection } from '@/components/nodes/node-operational-actions-section';
import { NodeDetailAlertsTab } from '@/components/nodes/node-detail-alerts-tab';
import { NodeDetailBackupTab } from '@/components/nodes/node-detail-backup-tab';
import { NodeDetailConfigTab } from '@/components/nodes/node-detail-config-tab';
import { NodeDetailMetricsTab } from '@/components/nodes/node-detail-metrics-tab';
import { NodeDetailOverviewTab } from '@/components/nodes/node-detail-overview-tab';
import { NodeDetailTabs } from '@/components/nodes/node-detail-tabs';
import { NodeTechnicianAccountsPanel } from '@/components/nodes/node-technician-accounts-panel';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  ApiError,
  getNodeBootstrapCommand,
  getNodeConfigBackups,
  getNodeCommandHistory,
  getNodeDetails,
  getNodeCapabilities,
  getOperationalActionsStatus,
  getPfsenseApiStatus,
  getNodeMetricsHistory,
  getNodeTechnicianAccounts,
  getPackageUpgradeStatus,
  getPfsenseUpgradeStatus,
  getSession,
  listFleetTags,
} from '@/lib/api';
import { isClientRole } from '@/lib/client-profile';
import { hasPermission } from '@/lib/authz';
import { handlePageApiError } from '@/lib/handle-page-api-error';
import { normalizeMetricsHistoryPeriod } from '@/lib/metrics-history';
import { formatRelativeAge } from '@/lib/format';
import {
  buildAuditHref,
  normalizeConfigBackupInstallMode,
  normalizeHeartbeatMode,
  normalizeNodeDetailTab,
  operationalStatusLabel,
  statusHeroTone,
  toOperationalStatusBadge,
  type NodeDetailTabId,
} from '@/lib/node-detail-helpers';

export const dynamic = 'force-dynamic';

function NodeDetailTabsFallback() {
  return (
    <div className="rounded-xl border border-slate-800 bg-panel-soft/40 px-4 py-8 text-center text-sm text-slate-500">
      Carregando abas…
    </div>
  );
}

export default async function NodeDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const created =
    typeof resolvedSearchParams.created === 'string' && resolvedSearchParams.created === '1';
  const rekeyed =
    typeof resolvedSearchParams.rekey === 'string' && resolvedSearchParams.rekey === '1';
  const rekeyError =
    typeof resolvedSearchParams.rekey_error === 'string'
      ? resolvedSearchParams.rekey_error
      : undefined;
  const maintenanceState =
    typeof resolvedSearchParams.maintenance === 'string'
      ? resolvedSearchParams.maintenance
      : undefined;
  const maintenanceError =
    typeof resolvedSearchParams.maintenance_error === 'string'
      ? resolvedSearchParams.maintenance_error
      : undefined;
  const updated =
    typeof resolvedSearchParams.updated === 'string' && resolvedSearchParams.updated === '1';
  const updateError =
    typeof resolvedSearchParams.update_error === 'string'
      ? resolvedSearchParams.update_error
      : undefined;
  const releaseBaseUrl =
    typeof resolvedSearchParams.release_base_url === 'string'
      ? resolvedSearchParams.release_base_url.trim()
      : undefined;
  const controllerUrl =
    typeof resolvedSearchParams.controller_url === 'string'
      ? resolvedSearchParams.controller_url.trim()
      : undefined;
  const heartbeatMode = normalizeHeartbeatMode(resolvedSearchParams.heartbeat_mode);
  const configBackupInstallMode = normalizeConfigBackupInstallMode(
    resolvedSearchParams.config_backup_enabled,
  );
  const initialTab = normalizeNodeDetailTab(resolvedSearchParams.tab);
  const metricsPeriod = normalizeMetricsHistoryPeriod(
    typeof resolvedSearchParams.metrics_period === 'string'
      ? resolvedSearchParams.metrics_period
      : undefined,
  );

  try {
    const [response, session, configBackups] = await Promise.all([
      getNodeDetails(id),
      getSession(),
      getNodeConfigBackups(id),
    ]);
    const { node } = response;
    const permissions = session.permissions ?? [];
    const isClientProfile = isClientRole(session.user.role);
    const canManageNode = hasPermission(permissions, 'firewalls.update');
    const canRequestBackup = hasPermission(permissions, 'backups.run');
    const canDownloadBackup = hasPermission(permissions, 'backups.download');
    const canManageBackup = hasPermission(permissions, 'backups.manage');
    const canRunUpgrade = hasPermission(permissions, 'pfsense.upgrade.run');
    const canRunPackageUpgrade = hasPermission(permissions, 'package.upgrade.run');
    const canRestartService = hasPermission(permissions, 'service.restart.run');
    const canRebootNode = hasPermission(permissions, 'node.reboot.run');
    const canViewBootstrap = hasPermission(permissions, 'bootstrap.view');
    const canViewPfsenseApi = hasPermission(permissions, 'pfsense.api.view');
    const canManagePfsenseCredentials = hasPermission(permissions, 'pfsense.credentials.manage');
    const canViewPfsenseAliases = hasPermission(permissions, 'pfsense.alias.view');
    const canManageFleetMetadata = canManageNode;
    const canViewTechnicians = hasPermission(permissions, 'technicians.view');
    const canManageTechnicians = hasPermission(permissions, 'technicians.manage');

    const [upgradeStatus, packageUpgradeStatus, fleetTags, metricsHistory, commandHistory, operationalStatus, nodeCapabilities, pfsenseApiStatus, technicianAccounts] =
      await Promise.all([
      getPfsenseUpgradeStatus(id),
      getPackageUpgradeStatus(id),
      canManageFleetMetadata
        ? listFleetTags({ client_id: node.client.id }).catch(() => ({ items: [], generated_at: '' }))
        : Promise.resolve({ items: [], generated_at: '' }),
      getNodeMetricsHistory(id, metricsPeriod).catch(() => ({
        enabled: false,
        generated_at: new Date().toISOString(),
        node_id: id,
        period: metricsPeriod,
        granularity: metricsPeriod === '30d' ? ('daily' as const) : ('hourly' as const),
        from: '',
        to: '',
        points: [],
        summary: {
          sample_count: 0,
          cpu_avg: null,
          memory_avg: null,
          disk_avg: null,
          latency_avg: null,
          availability_pct: null,
        },
      })),
      getNodeCommandHistory(id).catch(() => ({
        generated_at: new Date().toISOString(),
        node_id: id,
        items: [],
      })),
      getOperationalActionsStatus(id).catch(() => ({
        enabled: false,
        service_restart_enabled: false,
        node_reboot_enabled: false,
        min_agent_version: '0.4.8',
        agent_version: node.agent_version,
        agent_version_supported: false,
        hostname: node.hostname,
        maintenance_mode: node.maintenance_mode,
        ha_role: node.ha_role,
        ha_detected_from_agent: false,
        last_seen_at: node.last_seen_at,
        allowed_services: [],
        reboot_default_delay_seconds: 60,
        active_service_restart: null,
        active_reboot: null,
      })),
      canViewPfsenseApi
        ? getNodeCapabilities(id).catch(() => ({ capability: null, credential: null }))
        : Promise.resolve({ capability: null, credential: null }),
      canViewPfsenseAliases
        ? getPfsenseApiStatus(id).catch(() => ({
            enabled: false,
            alias_read_enabled: false,
            alias_apply_enabled: false,
            require_recent_backup_hours: 24,
          }))
        : Promise.resolve({
            enabled: false,
            alias_read_enabled: false,
            alias_apply_enabled: false,
            require_recent_backup_hours: 24,
          }),
      canViewTechnicians
        ? getNodeTechnicianAccounts(id).catch(() => ({
            generated_at: new Date().toISOString(),
            node_id: id,
            hostname: node.hostname,
            items: [],
          }))
        : Promise.resolve({
            generated_at: new Date().toISOString(),
            node_id: id,
            hostname: node.hostname,
            items: [],
          }),
    ]);

    let bootstrap = null;
    if (canViewBootstrap) {
      bootstrap = await getNodeBootstrapCommand(
        id,
        releaseBaseUrl,
        controllerUrl,
        heartbeatMode,
        configBackupInstallMode === 'default' ? undefined : configBackupInstallMode,
      );
    }

    const identityLabel = `${node.client.name} — ${node.site.name} — ${node.node_uid}`;
    const nodeAuditHref = buildAuditHref({
      targetType: 'node',
      targetId: node.id,
    });

    const tabs: { id: NodeDetailTabId; label: string }[] = [
      { id: 'overview', label: 'Visão geral' },
      { id: 'metrics', label: 'Métricas' },
      ...(isClientProfile ? [] : [{ id: 'alerts' as NodeDetailTabId, label: 'Alertas' }]),
      { id: 'backup', label: 'Backup' },
      ...(canManageNode || bootstrap
        ? [{ id: 'config' as NodeDetailTabId, label: 'Configuração' }]
        : []),
    ];

    const statusBadge = toOperationalStatusBadge(node.effective_status);

    return (
      <div className="space-y-6">
        {created ? (
          <Alert variant="success">
            Firewall criado com sucesso. Use a aba Configuração para instalar o agente.
          </Alert>
        ) : null}
        {rekeyed ? (
          <Alert variant="warning">
            Secret do agente rotacionado. Reinstale ou reconfigure o agente com o novo bootstrap.
          </Alert>
        ) : null}
        {rekeyError ? (
          <Alert variant="error">Falha ao rotacionar secret: {rekeyError}</Alert>
        ) : null}
        {maintenanceState ? (
          <Alert variant="info">
            Maintenance mode {maintenanceState === 'enabled' ? 'ativado' : 'desativado'} com sucesso.
          </Alert>
        ) : null}
        {maintenanceError ? (
          <Alert variant="error">Falha ao atualizar maintenance mode: {maintenanceError}</Alert>
        ) : null}
        {updated ? (
          <Alert variant="info">Metadados do firewall atualizados com sucesso.</Alert>
        ) : null}
        {updateError ? (
          <Alert variant="error">Falha ao atualizar firewall: {updateError}</Alert>
        ) : null}

        <PageHero
          eyebrow="Firewall"
          title={node.display_name ?? node.hostname}
          description={identityLabel}
          stats={[
            {
              label: 'Status',
              value: operationalStatusLabel(node.effective_status),
              tone: statusHeroTone(node.effective_status),
            },
            { label: 'Último contato', value: formatRelativeAge(node.last_seen_at) },
            { label: 'Versão pfSense', value: node.pfsense_version ?? '—' },
            { label: 'Pacote', value: node.agent_version ?? '—' },
          ]}
          aside={
            <div className="space-y-3">
              <div className="flex justify-end">
                <StatusBadge status={statusBadge} />
              </div>
              <div className="flex justify-end">
                <RealtimeRefresh
                  scope="node"
                  nodeId={node.id}
                  renderedAt={response.generated_at}
                />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Link href="/nodes">
                  <Button type="button" variant="secondary" size="sm">
                    Voltar para firewalls
                  </Button>
                </Link>
                {canManageNode ? (
                  <DeleteNodeButton
                    nodeId={node.id}
                    nodeUid={node.node_uid}
                    displayName={node.display_name}
                    hostname={node.hostname}
                  />
                ) : null}
              </div>
            </div>
          }
        />

        <Suspense fallback={<NodeDetailTabsFallback />}>
          <NodeDetailTabs
            tabs={tabs}
            initialTab={initialTab}
            overview={
              <>
                <NodeDetailOverviewTab
                  node={node}
                  canManageNode={canManageNode}
                  canRunUpgrade={canRunUpgrade}
                  canRunPackageUpgrade={canRunPackageUpgrade}
                  upgradeStatus={upgradeStatus}
                  packageUpgradeStatus={packageUpgradeStatus}
                  nodeCapabilities={nodeCapabilities}
                  pfsenseApiStatus={pfsenseApiStatus}
                  canManagePfsenseCredentials={canManagePfsenseCredentials}
                  canViewPfsenseAliases={canViewPfsenseAliases}
                  canViewPfsenseApi={canViewPfsenseApi}
                />
                {(canRestartService || canRebootNode) && operationalStatus.enabled ? (
                  <NodeOperationalActionsSection
                    nodeId={node.id}
                    hostname={node.hostname}
                    canRestartService={canRestartService}
                    canReboot={canRebootNode}
                    initialStatus={operationalStatus}
                  />
                ) : null}
                <NodeCommandHistoryPanel
                  nodeId={node.id}
                  initialHistory={commandHistory}
                  canCancelBackup={canRequestBackup}
                  canCancelPfsenseUpgrade={canRunUpgrade}
                  canCancelPackageUpgrade={canRunPackageUpgrade}
                  canCancelServiceRestart={canRestartService}
                  canCancelNodeReboot={canRebootNode}
                />
                {canViewTechnicians ? (
                  <NodeTechnicianAccountsPanel
                    items={technicianAccounts.items}
                    canManageTechnicians={canManageTechnicians}
                  />
                ) : null}
              </>
            }
            metrics={
              <NodeDetailMetricsTab
                node={node}
                metricsHistory={metricsHistory}
                metricsPeriod={metricsPeriod}
              />
            }
            alerts={<NodeDetailAlertsTab node={node} />}
            backup={
              <NodeDetailBackupTab
                nodeId={node.id}
                nodeEffectiveStatus={node.effective_status}
                canRequest={canRequestBackup}
                canDownload={canDownloadBackup}
                canManage={canManageBackup}
                initialBackups={configBackups}
                auditHref={isClientProfile ? undefined : nodeAuditHref}
              />
            }
            config={
              <NodeDetailConfigTab
                node={node}
                canManageNode={canManageNode}
                bootstrap={bootstrap}
                heartbeatMode={heartbeatMode}
                configBackupInstallMode={configBackupInstallMode}
                releaseBaseUrl={releaseBaseUrl}
                controllerUrl={controllerUrl}
                availableTags={fleetTags.items}
                canManageFleetMetadata={canManageFleetMetadata}
              />
            }
          />
        </Suspense>
      </div>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }

    handlePageApiError(error);
  }
}
