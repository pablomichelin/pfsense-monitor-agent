import Link from 'next/link';
import { Badge, StatusBadge } from '@/components/ui';
import type { StatusBadgeStatus } from '@/components/ui/status-badge';
import { toBackupStatusBadge, type BackupVisualStatus } from '@/lib/backup-status';
import { formatRelativeAge } from '@/lib/format';
import { InstallationBadge } from '@/components/nodes/installation-badge';

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
};

type Props = {
  nodes: InventoryNode[];
  showAlertsColumn: boolean;
};

export function NodesInventoryTable({ nodes, showAlertsColumn }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
          <tr>
            <th className="w-32 min-w-[8rem] px-4 py-4">Status</th>
            <th className="min-w-[10rem] px-4 py-4">Firewall</th>
            <th className="min-w-[8rem] px-4 py-4">Local</th>
            <th className="min-w-[8rem] px-4 py-4">Versão</th>
            <th className="min-w-[6rem] px-4 py-4">Último contato</th>
            <th className="min-w-[8rem] px-4 py-4">Backup</th>
            {showAlertsColumn ? (
              <th className="w-24 min-w-[5.5rem] px-4 py-4">Alertas</th>
            ) : null}
            <th className="w-32 min-w-[7.5rem] px-4 py-4">Instalação</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr
              key={node.id}
              className="border-b border-slate-900/80 text-slate-200 transition hover:bg-slate-950/20"
            >
              <td className="w-32 min-w-[8rem] px-4 py-4">
                <StatusBadge status={node.effective_status} />
              </td>
              <td className="min-w-[10rem] px-4 py-4">
                <Link
                  href={`/nodes/${node.id}`}
                  className="font-display text-lg text-white hover:text-cyan-200"
                >
                  <span className="block truncate">{node.display_name ?? node.hostname}</span>
                </Link>
                <p className="mt-1 truncate text-xs text-slate-500">{node.hostname}</p>
              </td>
              <td className="min-w-[8rem] px-4 py-4">
                <p className="truncate">{node.client.name}</p>
                <p className="truncate text-slate-500">{node.site.name}</p>
              </td>
              <td className="min-w-[8rem] px-4 py-4">
                <p className="font-mono text-cyan-200">{node.pfsense_version ?? '—'}</p>
                <p className="text-slate-500">
                  Agente {node.agent_version ?? 'não instalado'}
                </p>
              </td>
              <td className="min-w-[6rem] px-4 py-4 text-slate-400">
                <p>{formatRelativeAge(node.last_seen_at)}</p>
              </td>
              <td className="min-w-[8rem] px-4 py-4">
                <div className="flex flex-col gap-1.5">
                  <StatusBadge status={toBackupStatusBadge(node.backup_status)} />
                  {node.latest_backup_received_at ? (
                    <p className="text-xs text-slate-500">
                      {formatRelativeAge(node.latest_backup_received_at)}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">—</p>
                  )}
                </div>
              </td>
              {showAlertsColumn ? (
                <td className="w-24 min-w-[5.5rem] px-4 py-4">
                  {node.open_alerts > 0 ? (
                    <Link href={`/nodes/${node.id}`}>
                      <Badge variant="danger">{node.open_alerts}</Badge>
                    </Link>
                  ) : (
                    <Badge variant="neutral">0</Badge>
                  )}
                </td>
              ) : null}
              <td className="w-32 min-w-[7.5rem] px-4 py-4">
                <div className="flex flex-col gap-2">
                  <InstallationBadge
                    nodeUidStatus={node.node_uid_status}
                    agentVersion={node.agent_version}
                  />
                  <Link
                    href={`/nodes/${node.id}`}
                    className="text-xs text-cyan-300 transition hover:text-cyan-200"
                  >
                    Abrir
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
