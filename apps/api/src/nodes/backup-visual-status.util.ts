import { parseStoredBackupPolicy } from './backup-policy.util';
import {
  BACKUP_LATE_FALLBACK_HOURS,
  BackupSchedulePolicy,
  isBackupLateBySchedule,
} from './backup-schedule.util';
import { Prisma } from '@prisma/client';

export type BackupVisualStatus = 'ok' | 'late' | 'failed' | 'never';

const MS_PER_HOUR = 60 * 60 * 1000;

export function deriveBackupVisualStatus(input: {
  latestBackupReceivedAt: Date | null;
  latestFailedCommandAt: Date | null;
  backupPolicyJson?: Prisma.JsonValue | null;
  backupPolicy?: BackupSchedulePolicy | null;
  timeZone?: string | null;
  now?: Date;
}): BackupVisualStatus {
  const now = input.now ?? new Date();
  const policy =
    input.backupPolicy ??
    parseStoredBackupPolicy(input.backupPolicyJson ?? null);
  const timeZone = input.timeZone?.trim() || 'UTC';

  if (
    input.latestFailedCommandAt &&
    (!input.latestBackupReceivedAt ||
      input.latestFailedCommandAt.getTime() >
        input.latestBackupReceivedAt.getTime())
  ) {
    return 'failed';
  }

  if (!input.latestBackupReceivedAt) {
    return 'never';
  }

  if (policy && !policy.enabled) {
    return 'ok';
  }

  if (policy?.schedule_mode) {
    return isBackupLateBySchedule(
      input.latestBackupReceivedAt,
      policy,
      now,
      timeZone,
    )
      ? 'late'
      : 'ok';
  }

  const ageHours =
    (now.getTime() - input.latestBackupReceivedAt.getTime()) / MS_PER_HOUR;

  if (ageHours > BACKUP_LATE_FALLBACK_HOURS) {
    return 'late';
  }

  return 'ok';
}
