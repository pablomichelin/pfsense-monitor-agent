import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { DeleteNodeButton } from '@/components/delete-node-button';
import { PageHero } from '@/components/page-hero';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { NodeDetailAlertsTab } from '@/components/nodes/node-detail-alerts-tab';
import { NodeDetailBackupTab } from '@/components/nodes/node-detail-backup-tab';
import { NodeDetailConfigTab } from '@/components/nodes/node-detail-config-tab';
import { NodeDetailMetricsTab } from '@/components/nodes/node-detail-metrics-tab';
import { NodeDetailOverviewTab } from '@/components/nodes/node-detail-overview-tab';
import { NodeDetailTabs } from '@/components/nodes/node-detail-tabs';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  ApiError,
  getNodeBootstrapCommand,
  getNodeConfigBackups,
  getNodeDetails,
  getPfsenseUpgradeStatus,
  getSession,
} from '@/lib/api';
import { isClientRole } from '@/lib/client-profile';
import { hasPermission } from '@/lib/authz';
import { handlePageApiError } from '@/lib/handle-page-api-error';
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
    const canRunUpgrade = hasPermission(permissions, 'pfsense.upgrade.run');
    const canViewBootstrap = hasPermission(permissions, 'bootstrap.view');

    const upgradeStatus = await getPfsenseUpgradeStatus(id);

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
            { label: 'pfSense', value: node.pfsense_version ?? '—' },
            { label: 'Agente', value: node.agent_version ?? '—' },
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
              <NodeDetailOverviewTab
                node={node}
                canManageNode={canManageNode}
                canRunUpgrade={canRunUpgrade}
                upgradeStatus={upgradeStatus}
              />
            }
            metrics={<NodeDetailMetricsTab node={node} />}
            alerts={<NodeDetailAlertsTab node={node} />}
            backup={
              <NodeDetailBackupTab
                nodeId={node.id}
                nodeEffectiveStatus={node.effective_status}
                canRequest={canRequestBackup}
                canDownload={canDownloadBackup}
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
