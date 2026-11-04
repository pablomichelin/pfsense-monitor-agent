'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FleetBatchBackupPanel } from '@/components/nodes/fleet-batch-backup-panel';
import { FleetBatchPackageUpgradePanel } from '@/components/nodes/fleet-batch-package-upgrade-panel';
import { FleetTechnicianManagementPanel } from '@/components/nodes/fleet-technician-management-panel';
import { FleetPfTablesPanel } from '@/components/nodes/fleet-pf-tables-panel';
import { NodesInventoryTable } from '@/components/nodes/nodes-inventory-table';
import { Button, PageSection } from '@/components/ui';
import type { StatusBadgeStatus } from '@/components/ui/status-badge';
import type { BackupVisualStatus } from '@/lib/backup-status';
import type { NodeCriticality } from '@/lib/api';
import { deleteNodesBatchAction } from '@/lib/admin';
import type { InventorySortBy, InventorySortOrder } from '@/lib/nodes-inventory-sort';

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
  sortBy: InventorySortBy;
  sortOrder: InventorySortOrder;
  queryParams: Record<string, string | undefined>;
  canRequestBackupBatch: boolean;
  canRunPackageUpgrade: boolean;
  canManagePfTables: boolean;
  canManageTechnicians: boolean;
  canManageTechnicianRegistry?: boolean;
  canResetTechnicianPassword: boolean;
  canDeleteHosts: boolean;
};

export function FleetInventorySection({
  nodes,
  showAlertsColumn,
  targetPackageVersion,
  clientId,
  sortBy,
  sortOrder,
  queryParams,
  canRequestBackupBatch,
  canRunPackageUpgrade,
  canManagePfTables,
  canManageTechnicians,
  canManageTechnicianRegistry = false,
  canResetTechnicianPassword,
  canDeleteHosts,
}: Props) {
  const [actionsOpen, setActionsOpen] = useState(true);
  const [activeAction, setActiveAction] = useState('unblock');
  const actionTabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFilterBackup, setShowFilterBackup] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [needsTechnicianConfirm, setNeedsTechnicianConfirm] = useState(false);

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
    setActionsOpen(true);
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
    setActionsOpen(true);
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
    canManagePfTables ||
    canManageTechnicians ||
    canResetTechnicianPassword ||
    canDeleteHosts;

  const allVisibleNodeIds = useMemo(() => nodes.map((node) => node.id), [nodes]);
  const selectedNodeIds = selectedNodes.map((node) => node.id);
  const technicianNodeIds = selectedNodeIds;

  const handleDeleteConfirm = async () => {
    if (selectedNodeIds.length === 0) {
      return;
    }
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const result = await deleteNodesBatchAction(selectedNodeIds, needsTechnicianConfirm);
      if (result && !result.ok) {
        setDeleteError(result.error);
        setNeedsTechnicianConfirm(Boolean(result.requiresTechnicianConfirm));
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const filterBackupPanel =
    canRequestBackupBatch && nodes.length > 0 && showFilterBackup ? (
      <FleetBatchBackupPanel
        nodeIds={allVisibleNodeIds}
        mode="filter"
        totalVisibleCount={nodes.length}
        clientId={clientId}
        label={`Página atual — backup lote (${nodes.length} nodes)`}
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
            ? 'Ocultar backup da página'
            : `Backup da página atual (${nodes.length} firewalls)`}
        </Button>
      </div>
    ) : null;

  const actionTabs = [
    { id: 'unblock', label: 'Desbloquear IPs', description: 'Liberar endereços bloqueados', allowed: canManagePfTables },
    { id: 'upgrade', label: 'Atualizar pacote', description: 'Instalar a versão publicada', allowed: canRunPackageUpgrade },
    { id: 'backup', label: 'Backups', description: 'Solicitar cópia da configuração', allowed: canRequestBackupBatch },
    { id: 'technicians', label: 'Técnicos', description: 'Gerenciar contas e acessos', allowed: canManageTechnicians || canResetTechnicianPassword },
  ].filter((tab) => tab.allowed);
  const currentAction = actionTabs.some((tab) => tab.id === activeAction) ? activeAction : actionTabs[0]?.id;

  return (
    <>
      {selectedCount > 0 ? (
        <section aria-label="Ações dos firewalls selecionados" className="rounded-lg border border-border bg-surface-soft p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-base text-fg">{selectedCount} firewall(s) selecionado(s)</h2>
              <details className="mt-1 max-w-2xl break-words text-sm text-fg-muted"><summary className="cursor-pointer">Ver equipamentos selecionados</summary>
                {selectedNodes.map((node) => node.display_name || node.hostname).join(', ')}
              </details>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())}>Limpar seleção</Button>
              {actionTabs.length > 0 ? <Button type="button" size="sm" aria-expanded={actionsOpen} aria-controls="fleet-action-workspace" onClick={() => setActionsOpen((open) => !open)}>{actionsOpen ? 'Recolher ações' : 'Abrir ações'}</Button> : null}
              {canDeleteHosts ? (
                <Button type="button" variant="danger-outline" size="sm" onClick={() => {
                  setDeleteError(null);
                  setNeedsTechnicianConfirm(false);
                  setDeleteOpen(true);
                }}>Excluir hosts ({selectedCount})</Button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
      {canRequestBackupBatch && nodes.length > 0 ? <div className="space-y-3 border-t border-border pt-4">
        {filterBackupEntry}
        {filterBackupPanel}
      </div> : null}

      <ConfirmDialog
        open={deleteOpen}
        title={needsTechnicianConfirm ? 'Técnico vinculado' : 'Excluir hosts'}
        confirmLabel={needsTechnicianConfirm ? 'Excluir mesmo assim' : 'Excluir'}
        tone={needsTechnicianConfirm ? 'warning' : 'danger'}
        loading={deleteLoading}
        onCancel={() => {
          if (!deleteLoading) {
            setDeleteOpen(false);
            setNeedsTechnicianConfirm(false);
            setDeleteError(null);
          }
        }}
        onConfirm={handleDeleteConfirm}
        description={
          <>
            <p>
              Esta ação remove permanentemente {selectedCount} host(s) do cadastro,
              incluindo credenciais, heartbeats e alertas.
            </p>
            {deleteError ? <p className="mt-4 text-sm text-rose-200">{deleteError}</p> : null}
          </>
        }
      />

      <div className={selectedCount > 0 && actionsOpen && actionTabs.length > 0 ? 'grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] xl:items-start' : 'min-w-0'}>
        <div className="order-2 min-w-0 xl:order-1">
      <PageSection title="Inventário">
        <NodesInventoryTable
          nodes={nodes}
          showAlertsColumn={showAlertsColumn}
          targetPackageVersion={targetPackageVersion}
          sortBy={sortBy}
          sortOrder={sortOrder}
          queryParams={queryParams}
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
        </div>
        {selectedCount > 0 && actionTabs.length > 0 ? <aside id="fleet-action-workspace" aria-label="Operar nos firewalls selecionados" hidden={!actionsOpen} className="order-1 min-w-0 space-y-3 rounded-lg border border-border bg-surface p-3 xl:order-2 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
          <p className="text-sm font-medium text-fg">Ações · {selectedCount} selecionado(s)</p>
          {actionTabs.length > 0 ? <div role="tablist" aria-label="Escolha a ação nos firewalls" className="grid grid-cols-2 gap-1">
            {actionTabs.map((tab, index) => <button
              key={tab.id}
              ref={(element) => { actionTabRefs.current[tab.id] = element; }}
              id={`fleet-action-tab-${tab.id}`}
              type="button"
              role="tab" title={tab.description}
              aria-selected={currentAction === tab.id}
              aria-controls={`fleet-action-panel-${tab.id}`}
              tabIndex={currentAction === tab.id ? 0 : -1}
              onClick={() => setActiveAction(tab.id)}
              onKeyDown={(event) => {
                const moves: Record<string, number> = { ArrowRight: (index + 1) % actionTabs.length, ArrowLeft: (index + actionTabs.length - 1) % actionTabs.length, Home: 0, End: actionTabs.length - 1 };
                const next = moves[event.key];
                if (next === undefined) return;
                event.preventDefault();
                setActiveAction(actionTabs[next].id);
                actionTabRefs.current[actionTabs[next].id]?.focus();
              }}
              className={`min-w-0 rounded-t-lg border-b-2 px-2 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${currentAction === tab.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-fg-muted hover:bg-nav-hover hover:text-fg'}`}
            >
              <span className="block text-sm font-semibold">{tab.label}</span>
              <span className="sr-only">{tab.description}</span>
            </button>)}
          </div> : null}

          {canManagePfTables ? <div role="tabpanel" id="fleet-action-panel-unblock" aria-labelledby="fleet-action-tab-unblock" hidden={currentAction !== 'unblock'}>
            <FleetPfTablesPanel selectedNodes={selectedNodes} />
          </div> : null}
          {canRunPackageUpgrade ? <div role="tabpanel" id="fleet-action-panel-upgrade" aria-labelledby="fleet-action-tab-upgrade" hidden={currentAction !== 'upgrade'}>
            <FleetBatchPackageUpgradePanel
              selectedNodes={selectedNodes}
              clientId={clientId}
              targetPackageVersion={targetPackageVersion}
              canRunPackageUpgrade={canRunPackageUpgrade}
              onClearSelection={() => setSelectedIds(new Set())}
            />
          </div> : null}
          {canRequestBackupBatch ? <div role="tabpanel" id="fleet-action-panel-backup" aria-labelledby="fleet-action-tab-backup" hidden={currentAction !== 'backup'}>
            <FleetBatchBackupPanel
              nodeIds={selectedNodeIds}
              mode="selection"
              totalVisibleCount={nodes.length}
              clientId={clientId}
              label={`Inventário — backup (${selectedCount} selecionados)`}
            />
          </div> : null}
          {canManageTechnicians || canResetTechnicianPassword ? <div role="tabpanel" id="fleet-action-panel-technicians" aria-labelledby="fleet-action-tab-technicians" hidden={currentAction !== 'technicians'}>
            <FleetTechnicianManagementPanel
              nodeIds={technicianNodeIds}
              mode="selection"
              totalVisibleCount={nodes.length}
              clientId={clientId}
              canManageTechnicians={canManageTechnicians}
              canManageRegistry={canManageTechnicianRegistry}
              canResetTechnicianPassword={canResetTechnicianPassword}
            />
          </div> : null}
        </aside> : null}
      </div>
    </>
  );
}
