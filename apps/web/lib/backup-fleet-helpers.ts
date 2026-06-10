import type { BackupVisualStatus } from '@/lib/backup-status';

export type BackupFleetNode = {
  id: string;
  hostname: string;
  display_name: string | null;
  client: { name: string };
  site: { name: string };
  backup_status: BackupVisualStatus;
  latest_backup_received_at: string | null;
};

export type BackupFleetSummary = {
  ok: number;
  late: number;
  failed: number;
  never: number;
  total: number;
};

const BACKUP_STATUS_PRIORITY: Record<BackupVisualStatus, number> = {
  failed: 0,
  never: 1,
  late: 2,
  ok: 3,
};

const VALID_BACKUP_STATUSES: BackupVisualStatus[] = ['ok', 'late', 'failed', 'never'];

export function computeBackupFleetSummary(nodes: BackupFleetNode[]): BackupFleetSummary {
  return nodes.reduce(
    (acc, node) => {
      acc[node.backup_status] += 1;
      acc.total += 1;
      return acc;
    },
    { ok: 0, late: 0, failed: 0, never: 0, total: 0 },
  );
}

export function filterByBackupStatus(
  nodes: BackupFleetNode[],
  backupStatus?: string,
): BackupFleetNode[] {
  if (!backupStatus || !VALID_BACKUP_STATUSES.includes(backupStatus as BackupVisualStatus)) {
    return nodes;
  }

  return nodes.filter((node) => node.backup_status === backupStatus);
}

function backupTimestamp(value: string | null): number {
  if (!value) {
    return 0;
  }

  return new Date(value).getTime();
}

export function sortBackupFleetNodes(
  nodes: BackupFleetNode[],
  sortBy: 'name' | 'backup_priority' | 'backup_age',
  sortOrder: 'asc' | 'desc',
): BackupFleetNode[] {
  const sorted = [...nodes].sort((left, right) => {
    if (sortBy === 'name') {
      const leftName = (left.display_name ?? left.hostname).toLowerCase();
      const rightName = (right.display_name ?? right.hostname).toLowerCase();
      return leftName.localeCompare(rightName, 'pt-BR');
    }

    if (sortBy === 'backup_priority') {
      const priorityDiff =
        BACKUP_STATUS_PRIORITY[left.backup_status] -
        BACKUP_STATUS_PRIORITY[right.backup_status];

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return (
        backupTimestamp(left.latest_backup_received_at) -
        backupTimestamp(right.latest_backup_received_at)
      );
    }

    return (
      backupTimestamp(left.latest_backup_received_at) -
      backupTimestamp(right.latest_backup_received_at)
    );
  });

  if (sortOrder === 'desc') {
    sorted.reverse();
  }

  return sorted;
}
