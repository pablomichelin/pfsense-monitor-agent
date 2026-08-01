'use client';

import { useEffect, useMemo, useState } from 'react';
import { FleetBatchBackupPanel } from '@/components/nodes/fleet-batch-backup-panel';
import { FleetBatchPackageUpgradePanel } from '@/components/nodes/fleet-batch-package-upgrade-panel';
import { FleetTechnicianManagementPanel } from '@/components/nodes/fleet-technician-management-panel';
import { NodesInventoryTable } from '@/components/nodes/nodes-inventory-table';
import { Button, PageSection } from '@/components/ui';
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
  const [showFilterBackup, setShowFilterBackup] = useState(false);

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

  useEffect(() => {
    if (selectedIds.size > 0) {
      setShowFilterBackup(false);
    }
  }, [selectedIds.size]);

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

  const showRowSelection =
    canRunPackageUpgrade ||
    canRequestBackupBatch ||
    canManageTechnicians ||
    canResetTechnicianPassword;

  const allVisibleNodeIds = useMemo(() => nodes.map((node) => node.id), [nodes]);
  const selectedNodeIds = selectedNodes.map((node) => node.id);
  const technicianNodeIds = selectedNodeIds;

  const filterBackupPanel =
    canRequestBackupBatch && nodes.length > 0 && showFilterBackup ? (
      <FleetBatchBackupPanel
        nodeIds={allVisibleNodeIds}
        mode="filter"
        totalVisibleCount={nodes.length}
        clientId={clientId}
        label={`Inventário — backup lote (${nodes.length} nodes)`}
      />
    ) : null;

  const filterBackupEntry =
    canRequestBackupBatch && nodes.length > 0 ? (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setShowFilterBackup((open) => !open)}
        >
          {showFilterBackup
            ? 'Ocultar backup por filtro'
            : `Usar filtro atual (${nodes.length} firewalls)`}
        </Button>
      </div>
    ) : null;

  return (
    <>
      {selectedCount > 0 ? (
        <div className="sticky top-0 z-20 space-y-3 rounded-xl border border-slate-700/70 bg-panel/95 p-3 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-white">
              {selectedCount} selecionado(s)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {filterBackupEntry}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
              >
                Limpar seleção
              </Button>
            </div>
          </div>

          <div className="space-y-3">
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
                nodeIds={selectedNodeIds}
                mode="selection"
                totalVisibleCount={nodes.length}
                clientId={clientId}
                label={`Inventário — backup (${selectedCount} selecionados)`}
              />
            ) : null}

            {filterBackupPanel}

            {canManageTechnicians || canResetTechnicianPassword ? (
              <FleetTechnicianManagementPanel
                nodeIds={technicianNodeIds}
                mode="selection"
                totalVisibleCount={nodes.length}
                clientId={clientId}
                canManageTechnicians={canManageTechnicians}
                canResetTechnicianPassword={canResetTechnicianPassword}
              />
            ) : null}
          </div>
        </div>
      ) : canRequestBackupBatch && nodes.length > 0 ? (
        <div className="space-y-3">
          {filterBackupEntry}
          {filterBackupPanel}
        </div>
      ) : null}

      <PageSection title="Inventário">
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
      </PageSection>
    </>
  );
}
