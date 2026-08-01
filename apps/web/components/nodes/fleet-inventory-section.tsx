'use client';

import { useEffect, useMemo, useState } from 'react';
import { FleetBatchBackupPanel } from '@/components/nodes/fleet-batch-backup-panel';
import { FleetBatchPackageUpgradePanel } from '@/components/nodes/fleet-batch-package-upgrade-panel';
import { FleetTechnicianManagementPanel } from '@/components/nodes/fleet-technician-management-panel';
import { NodesInventoryTable } from '@/components/nodes/nodes-inventory-table';
import { Card, PageSection } from '@/components/ui';
import type { StatusBadgeStatus } from '@/components/ui/status-badge';
import type { BackupVisualStatus } from '@/lib/backup-status';
import type { NodeCriticality } from '@/lib/api';

type InventoryNode = {
  id: string;
  hostname: string;
  display_name: string | null;
  client: { name: string };
  site: { name: string };
  effective_status: StatusBadgeStatus;
  node_uid_status: string;
  agent_version: string | null;
  last_seen_at: string | null;
  pfsense_version: string | null;
  open_alerts: number;
  backup_status: BackupVisualStatus;
  latest_backup_received_at: string | null;
  remote_access_url: string | null;
  criticality: NodeCriticality;
  tags: Array<{ id: string; name: string }>;
};

type Props = {
  nodes: InventoryNode[];
  showAlertsColumn: boolean;
  targetPackageVersion: string | null;
  clientId?: string;
  canRequestBackupBatch: boolean;
  canRunPackageUpgrade: boolean;
  canManageTechnicians: boolean;
  canResetTechnicianPassword: boolean;
};

export function FleetInventorySection({
  nodes,
  showAlertsColumn,
  targetPackageVersion,
  clientId,
  canRequestBackupBatch,
  canRunPackageUpgrade,
  canManageTechnicians,
  canResetTechnicianPassword,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const visibleNodeIds = useMemo(
    () => new Set(nodes.map((node) => node.id)),
    [nodes],
  );

  useEffect(() => {
    setSelectedIds((current) => {
      const pruned = [...current].filter((id) => visibleNodeIds.has(id));
      if (pruned.length === current.size) {
        return current;
      }
      return new Set(pruned);
    });
  }, [visibleNodeIds]);

  const selectedNodes = useMemo(
    () =>
      nodes
        .filter((node) => selectedIds.has(node.id))
        .map((node) => ({
          id: node.id,
          hostname: node.hostname,
          display_name: node.display_name,
          agent_version: node.agent_version,
        })),
    [nodes, selectedIds],
  );

  const selectedCount = selectedNodes.length;

  const toggleNode = (nodeId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds((current) => {
      const allVisibleSelected =
        nodes.length > 0 && nodes.every((node) => current.has(node.id));

      if (allVisibleSelected) {
        return new Set();
      }

      return new Set(nodes.map((node) => node.id));
    });
  };

  const showBatchActions =
    ((canRequestBackupBatch || canRunPackageUpgrade) && nodes.length > 0) ||
    canManageTechnicians ||
    canResetTechnicianPassword;

  const showRowSelection =
    canRunPackageUpgrade ||
    canRequestBackupBatch ||
    canManageTechnicians ||
    canResetTechnicianPassword;

  const backupUsesSelection = selectedCount > 0;
  const backupNodeIds = backupUsesSelection
    ? selectedNodes.map((node) => node.id)
    : nodes.map((node) => node.id);

  const revokeUsesSelection = selectedCount > 0;
  const revokeNodeIds = revokeUsesSelection
    ? selectedNodes.map((node) => node.id)
    : nodes.map((node) => node.id);

  return (
    <>
      <PageSection
        title="Inventário"
        description={
          canRunPackageUpgrade
            ? selectedCount > 0
              ? `${selectedCount} selecionado(s) — marque firewalls para atualização em lote do package SystemUp Monitor.`
              : 'Marque firewalls para atualização em lote do package SystemUp Monitor.'
            : 'Visão operacional com backup e alertas abertos por firewall.'
        }
      >
        <Card className="overflow-hidden p-0">
          <NodesInventoryTable
            nodes={nodes}
            showAlertsColumn={showAlertsColumn}
            targetPackageVersion={targetPackageVersion}
            selection={
              showRowSelection
                ? {
                    selectedIds,
                    onToggle: toggleNode,
                    onToggleAll: toggleAll,
                  }
                : undefined
            }
          />
        </Card>
      </PageSection>

      {showBatchActions ? (
        <PageSection
          title="Ações em lote"
          description={
            selectedCount > 0
              ? `${selectedCount} firewall(s) selecionado(s) na tabela — upgrade e backup abaixo aplicam somente a essa seleção.`
              : 'Marque firewalls na tabela acima ou use o filtro atual para backup em massa.'
          }
        >
          <div className="space-y-4">
            {canRunPackageUpgrade ? (
              <FleetBatchPackageUpgradePanel
                selectedNodes={selectedNodes}
                clientId={clientId}
                targetPackageVersion={targetPackageVersion}
                canRunPackageUpgrade={canRunPackageUpgrade}
                onClearSelection={() => setSelectedIds(new Set())}
              />
            ) : null}

            {canRequestBackupBatch ? (
              <FleetBatchBackupPanel
                nodeIds={backupNodeIds}
                mode={backupUsesSelection ? 'selection' : 'filter'}
                totalVisibleCount={nodes.length}
                clientId={clientId}
                label={
                  backupUsesSelection
                    ? `Inventário — backup (${selectedCount} selecionados)`
                    : `Inventário — backup lote (${nodes.length} nodes)`
                }
              />
            ) : null}

            {canManageTechnicians || canResetTechnicianPassword ? (
              <FleetTechnicianManagementPanel
                nodeIds={revokeNodeIds}
                mode={revokeUsesSelection ? 'selection' : 'filter'}
                totalVisibleCount={nodes.length}
                clientId={clientId}
                canManageTechnicians={canManageTechnicians}
                canResetTechnicianPassword={canResetTechnicianPassword}
              />
            ) : null}
          </div>
        </PageSection>
      ) : null}
    </>
  );
}
