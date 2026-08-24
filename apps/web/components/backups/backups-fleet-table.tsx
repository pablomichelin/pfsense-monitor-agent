import Link from 'next/link';
import { StatusBadge } from '@/components/ui';
import type { BackupFleetNode } from '@/lib/backup-fleet-helpers';
import { toBackupStatusBadge } from '@/lib/backup-status';
import { formatBackupAge, formatDateTime } from '@/lib/format';
import { buildNodeDetailsHref } from '@/lib/node-detail-helpers';

type Props = {
  nodes: BackupFleetNode[];
};

export function BackupsFleetTable({ nodes }: Props) {
  return (
    <div className="max-h-[70vh] overflow-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 z-20 border-b border-border bg-table-head text-fg-muted shadow-sm">
          <tr>
            <th className="sticky left-0 z-30 min-w-[10rem] bg-table-head px-4 py-4">Firewall</th>
            <th className="min-w-[8rem] px-4 py-4">Local</th>
            <th className="min-w-[8rem] px-4 py-4">Status backup</th>
            <th className="min-w-[9rem] px-4 py-4">Último backup</th>
            <th className="min-w-[6rem] px-4 py-4">Idade</th>
            <th className="w-36 min-w-[8rem] px-4 py-4">Ação</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr
              key={node.id}
              className="border-b border-slate-900/80 text-slate-200 transition hover:bg-slate-950/20"
            >
              <td className="sticky left-0 z-10 min-w-[10rem] bg-surface-elevated px-4 py-4">
                <p className="font-display text-lg text-fg">
                  {node.display_name ?? node.hostname}
                </p>
                <p className="mt-1 truncate text-xs text-slate-500">{node.hostname}</p>
              </td>
              <td className="min-w-[8rem] px-4 py-4">
                <p className="truncate">{node.client.name}</p>
                <p className="truncate text-slate-500">{node.site.name}</p>
              </td>
              <td className="min-w-[8rem] px-4 py-4">
                <StatusBadge status={toBackupStatusBadge(node.backup_status)} />
              </td>
              <td className="min-w-[9rem] px-4 py-4 text-slate-300">
                {formatDateTime(node.latest_backup_received_at)}
              </td>
              <td className="min-w-[6rem] px-4 py-4 text-slate-400">
                {formatBackupAge(node.latest_backup_received_at)}
              </td>
              <td className="w-36 min-w-[8rem] px-4 py-4">
                <Link
                  href={buildNodeDetailsHref({ id: node.id, tab: 'backup' })}
                  className="inline-flex h-9 items-center rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-xs font-medium text-slate-200 transition hover:border-cyan-400/50 hover:text-fg"
                >
                  Ver backup
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
