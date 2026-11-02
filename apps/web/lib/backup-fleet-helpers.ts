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

// Contract for GET /api/v1/nodes/backup-fleet. Summary covers the selected
// client/site/search scope before backup_status; total is the filtered count.
export type BackupFleetResponse = {
  items: BackupFleetNode[];
  summary: BackupFleetSummary;
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  generated_at: string;
};

// Legacy helper retained for existing callers/tests; the backups page uses backup-fleet.
// The nodes endpoint is cursor-paginated. A fleet-wide summary must consume
// every page before filtering and sorting, otherwise the oldest alphabetical
// slice can hide the most urgent backups.
export async function collectBackupFleetPages<T extends { id: string }>(
  loadPage: (cursor?: string) => Promise<{
    items: T[];
    total: number;
    generated_at: string;
    next_cursor: string | null;
  }>,
): Promise<{ items: T[]; generated_at: string }> {
  const items: T[] = [];
  const seenCursors = new Set<string>();
  const seenNodeIds = new Set<string>();
  let cursor: string | undefined;
  let generatedAt = '';

  for (;;) {
    const page = await loadPage(cursor);
    generatedAt = page.generated_at;
    // Mudanças concorrentes entre páginas podem repetir um firewall. Não
    // duplicar seus contadores, mesmo sem snapshot transacional entre requests.
    for (const item of page.items) {
      if (seenNodeIds.has(item.id)) continue;
      seenNodeIds.add(item.id);
      items.push(item);
    }

    if (!page.next_cursor) return { items, generated_at: generatedAt };
    if (page.items.length === 0 || seenCursors.has(page.next_cursor)) {
      throw new Error('A paginação do inventário não avançou. Recarregue a página de backups.');
    }

    seenCursors.add(page.next_cursor);
    cursor = page.next_cursor;
  }
}

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
