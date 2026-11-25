import { BackupVisualStatus } from './backup-visual-status.util';

export type BackupFleetItem = {
  id: string;
  hostname: string;
  display_name: string | null;
  client: { id: string; name: string; code: string };
  site: { id: string; name: string; code: string };
  backup_status: BackupVisualStatus;
  latest_backup_received_at: string | null;
};

const priority: Record<BackupVisualStatus, number> = { failed: 0, never: 1, late: 2, ok: 3 };

export function compareBackupFleetItems(
  a: BackupFleetItem, b: BackupFleetItem,
  sortBy: 'name' | 'backup_priority' | 'backup_age', sortOrder: 'asc' | 'desc',
): number {
  const timestamp = (value: string | null) => value ? new Date(value).getTime() : 0;
  const byReceivedAt = timestamp(a.latest_backup_received_at) - timestamp(b.latest_backup_received_at);
  // Never-sent backups stay first in ascending order and last in descending order.
  const byBackupPresence = Number(a.latest_backup_received_at !== null) - Number(b.latest_backup_received_at !== null);
  const result = sortBy === 'name'
    ? (a.display_name ?? a.hostname).toLowerCase().localeCompare((b.display_name ?? b.hostname).toLowerCase(), 'pt-BR')
    : sortBy === 'backup_priority'
      ? priority[a.backup_status] - priority[b.backup_status] || byReceivedAt
      : byBackupPresence || -byReceivedAt;
  return result * (sortOrder === 'desc' ? -1 : 1) || a.id.localeCompare(b.id);
}

export function bootstrapBucket(node: { node_uid_status: string; agent_version: string | null }): 'blocked' | 'active' | 'pending' {
  if (node.node_uid_status !== 'active') return 'blocked';
  return node.agent_version ? 'active' : 'pending';
}
