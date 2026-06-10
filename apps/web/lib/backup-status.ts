import type { StatusBadgeStatus } from '@/components/ui/status-badge';

export type BackupVisualStatus = 'ok' | 'late' | 'failed' | 'never';

const backupStatusMap: Record<BackupVisualStatus, StatusBadgeStatus> = {
  ok: 'backup-ok',
  late: 'backup-late',
  failed: 'backup-failed',
  never: 'backup-never',
};

export function toBackupStatusBadge(status: BackupVisualStatus): StatusBadgeStatus {
  return backupStatusMap[status];
}
