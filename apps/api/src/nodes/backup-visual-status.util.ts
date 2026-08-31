import {
  parseStoredBackupPolicy,
  resolveBackupFreshnessAt,
} from './backup-policy.util';
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
  latestBackupSha256?: string | null;
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
  const freshnessAt = resolveBackupFreshnessAt({
    latestBackupReceivedAt: input.latestBackupReceivedAt,
    latestBackupSha256: input.latestBackupSha256,
    policy,
  });

  if (
    input.latestFailedCommandAt &&
    (!freshnessAt ||
      input.latestFailedCommandAt.getTime() > freshnessAt.getTime())
  ) {
    return 'failed';
  }

  if (!freshnessAt) {
    return 'never';
  }

  if (policy && !policy.enabled) {
    return 'ok';
  }

  if (policy?.schedule_mode) {
    return isBackupLateBySchedule(
      freshnessAt,
      policy,
      now,
      timeZone,
    )
      ? 'late'
      : 'ok';
  }

  const ageHours =
    (now.getTime() - freshnessAt.getTime()) / MS_PER_HOUR;

  if (ageHours > BACKUP_LATE_FALLBACK_HOURS) {
    return 'late';
  }

  return 'ok';
}
