'use client';

import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import { Badge, DataTable, StatusBadge, dataTableHeadClassName, dataTableRowClassName } from '@/components/ui';
import type { StatusBadgeStatus } from '@/components/ui/status-badge';
import { toBackupStatusBadge, type BackupVisualStatus } from '@/lib/backup-status';
import { formatRelativeAge } from '@/lib/format';
import { InstallationBadge } from '@/components/nodes/installation-badge';
import { PackageVersionCell } from '@/components/nodes/package-version-cell';
import { CriticalityBadge } from '@/components/nodes/fleet-org-badges';
import { cn } from '@/lib/cn';
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
  targetPackageVersion?: string | null;
  toolbar?: ReactNode;
  selection?: {
    selectedIds: Set<string>;
    onToggle: (nodeId: string) => void;
    onToggleAll: () => void;
  };
};

function hasActiveAgent(node: InventoryNode): boolean {
  return node.node_uid_status === 'active' && Boolean(node.agent_version);
}

function RemoteAccessIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M11.5 3.5h5v5M16.5 3.5 9 11M8 4.5H5.5A2 2 0 0 0 3.5 6.5v8A2 2 0 0 0 5.5 16.5h8a2 2 0 0 0 2-2V12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NodesInventoryTable({
  nodes,
  showAlertsColumn,
  targetPackageVersion,
  toolbar,
  selection,
}: Props) {
  const allSelected =
    selection != null &&
    nodes.length > 0 &&
    nodes.every((node) => selection.selectedIds.has(node.id));

  const someSelected =
    selection != null &&
    nodes.some((node) => selection.selectedIds.has(node.id)) &&
    !allSelected;

  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  // Hostname no `title` do nome (não como segunda linha) para manter altura de linha ≤ 56px.
  return (
    <DataTable toolbar={toolbar}>
      <thead className={dataTableHeadClassName}>
        <tr>
          {selection ? (
            <th className="w-10 min-w-[2.5rem] px-3 py-2.5">
              <input
                ref={headerCheckboxRef}
                type="checkbox"
                checked={allSelected}
                onChange={selection.onToggleAll}
                aria-label="Selecionar todos os firewalls visíveis"
                className="h-4 w-4 rounded border-slate-600 bg-slate-950"
              />
            </th>
          ) : null}
          <th className="w-28 min-w-[7rem] px-3 py-2.5">Status</th>
          <th className="min-w-[12rem] px-3 py-2.5">Firewall</th>
          <th className="min-w-[8rem] px-3 py-2.5">Local</th>
          <th className="min-w-[6.5rem] px-3 py-2.5" title="Versão do pfSense OS">
            Versão pfSense
          </th>
          <th className="min-w-[6.5rem] px-3 py-2.5" title="Versão instalada do pacote SystemUp Monitor">
            Pacote
          </th>
          <th className="min-w-[5.5rem] px-3 py-2.5">Último contato</th>
          <th className="min-w-[6rem] px-3 py-2.5">Backup</th>
          {showAlertsColumn ? (
            <th className="w-16 min-w-[4rem] px-3 py-2.5">Alertas</th>
          ) : null}
          <th className="w-12 min-w-[3rem] px-3 py-2.5">Acesso</th>
        </tr>
      </thead>
      <tbody>
        {nodes.map((node) => {
          const displayName = node.display_name ?? node.hostname;
          const showInstallation = !hasActiveAgent(node);

          return (
            <tr key={node.id} className={dataTableRowClassName}>
              {selection ? (
                <td className="w-10 min-w-[2.5rem] px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selection.selectedIds.has(node.id)}
                    onChange={() => selection.onToggle(node.id)}
                    aria-label={`Selecionar ${displayName}`}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                  />
                </td>
              ) : null}
              <td className="w-28 min-w-[7rem] px-3 py-2.5">
                <StatusBadge status={node.effective_status} />
              </td>
              <td className="min-w-[12rem] px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Link
                    href={`/nodes/${node.id}`}
                    title={node.hostname}
                    className="min-w-0 truncate text-sm font-medium text-white hover:text-cyan-200"
                  >
                    {displayName}
                  </Link>
                  {node.criticality === 'critical' ? (
                    <CriticalityBadge criticality="critical" />
                  ) : null}
                </div>
                {showInstallation ? (
                  <div className="mt-1">
                    <InstallationBadge
                      nodeUidStatus={node.node_uid_status}
                      agentVersion={node.agent_version}
                    />
                  </div>
                ) : null}
              </td>
              <td className="min-w-[8rem] px-3 py-2.5">
                <p className="truncate">{node.client.name}</p>
                <p className="truncate text-xs text-slate-500">{node.site.name}</p>
              </td>
              <td className="min-w-[6.5rem] px-3 py-2.5">
                <p className="font-mono text-cyan-200">
                  {node.pfsense_version?.replace(/-RELEASE$/i, '').trim() || '—'}
                </p>
              </td>
              <td className="min-w-[6.5rem] px-3 py-2.5">
                <PackageVersionCell
                  agentVersion={node.agent_version}
                  targetPackageVersion={targetPackageVersion}
                />
              </td>
              <td className="min-w-[5.5rem] px-3 py-2.5 text-slate-400">
                <p>{formatRelativeAge(node.last_seen_at)}</p>
              </td>
              <td className="min-w-[6rem] px-3 py-2.5">
                <div className="flex flex-col gap-0.5">
                  <StatusBadge status={toBackupStatusBadge(node.backup_status)} />
                  <p className="text-xs text-slate-500">
                    {node.latest_backup_received_at
                      ? formatRelativeAge(node.latest_backup_received_at)
                      : '—'}
                  </p>
                </div>
              </td>
              {showAlertsColumn ? (
                <td className="w-16 min-w-[4rem] px-3 py-2.5">
                  {node.open_alerts > 0 ? (
                    <Link href={`/nodes/${node.id}`}>
                      <Badge variant="danger">{node.open_alerts}</Badge>
                    </Link>
                  ) : (
                    <Badge variant="neutral">0</Badge>
                  )}
                </td>
              ) : null}
              <td className="w-12 min-w-[3rem] px-3 py-2.5">
                {node.remote_access_url ? (
                  <a
                    href={node.remote_access_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir acesso remoto"
                    aria-label="Abrir acesso remoto"
                    className={cn(
                      'inline-flex h-10 w-10 items-center justify-center rounded-lg border transition',
                      'border-slate-600/80 bg-panel-soft text-slate-200 hover:border-cyan-400/50 hover:text-white',
                    )}
                  >
                    <RemoteAccessIcon className="h-4 w-4" />
                  </a>
                ) : (
                  <span className="text-xs text-slate-500">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
