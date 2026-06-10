const BACKUP_LATE_HOURS = 36;

export type BackupVisualStatus = 'ok' | 'late' | 'failed' | 'never';

export function deriveBackupVisualStatus(input: {
  latestBackupReceivedAt: Date | null;
  latestFailedCommandAt: Date | null;
  now?: Date;
}): BackupVisualStatus {
  const now = input.now ?? new Date();

  if (
    input.latestFailedCommandAt &&
    (!input.latestBackupReceivedAt ||
      input.latestFailedCommandAt.getTime() > input.latestBackupReceivedAt.getTime())
  ) {
    return 'failed';
  }

  if (!input.latestBackupReceivedAt) {
    return 'never';
  }

  const ageHours =
    (now.getTime() - input.latestBackupReceivedAt.getTime()) / (1000 * 60 * 60);

  if (ageHours > BACKUP_LATE_HOURS) {
    return 'late';
  }

  return 'ok';
}
