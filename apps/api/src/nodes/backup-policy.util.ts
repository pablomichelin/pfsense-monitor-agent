import { Prisma } from '@prisma/client';
import {
  BACKUP_SCHEDULE_MODES,
  BackupScheduleMode,
  BackupSchedulePolicy,
} from './backup-schedule.util';

export type StoredBackupPolicy = BackupSchedulePolicy & {
  reported_at?: string;
};

const SCHEDULE_MODE_SET = new Set<string>(BACKUP_SCHEDULE_MODES);

const normalizeScheduleMode = (value: unknown): BackupScheduleMode => {
  const normalized = String(value ?? 'hours').trim().toLowerCase();
  return SCHEDULE_MODE_SET.has(normalized)
    ? (normalized as BackupScheduleMode)
    : 'hours';
};

const normalizeIntervalHours = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? '24'), 10);
  if (!Number.isFinite(parsed)) {
    return 24;
  }
  return Math.min(168, Math.max(1, parsed));
};

const normalizeScheduleTime = (value: unknown): string => {
  const candidate = String(value ?? '03:00').trim();
  return /^(\d{2}):(\d{2})$/.test(candidate) ? candidate : '03:00';
};

const normalizeScheduleDow = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? '1'), 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 6) {
    return 1;
  }
  return parsed;
};

const normalizeScheduleDom = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? '1'), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 28) {
    return 1;
  }
  return parsed;
};

const normalizeEnabled = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['0', 'false', 'no', 'off', ''].includes(normalized)) {
    return false;
  }
  return true;
};

export function normalizeBackupSchedulePolicy(
  raw: unknown,
): BackupSchedulePolicy | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const input = raw as Record<string, unknown>;

  return {
    enabled: normalizeEnabled(input.enabled),
    schedule_mode: normalizeScheduleMode(input.schedule_mode),
    interval_hours: normalizeIntervalHours(input.interval_hours),
    schedule_time: normalizeScheduleTime(input.schedule_time),
    schedule_dow: normalizeScheduleDow(input.schedule_dow),
    schedule_dom: normalizeScheduleDom(input.schedule_dom),
  };
}

export function parseStoredBackupPolicy(
  raw: Prisma.JsonValue | null | undefined,
): StoredBackupPolicy | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const normalized = normalizeBackupSchedulePolicy(raw);
  if (!normalized) {
    return null;
  }

  const reportedAt = (raw as Record<string, unknown>).reported_at;
  return {
    ...normalized,
    ...(typeof reportedAt === 'string' ? { reported_at: reportedAt } : {}),
  };
}

export function toStoredBackupPolicyJson(
  policy: BackupSchedulePolicy,
  reportedAt: Date,
): Prisma.InputJsonValue {
  return {
    enabled: policy.enabled,
    schedule_mode: policy.schedule_mode,
    interval_hours: policy.interval_hours,
    schedule_time: policy.schedule_time,
    schedule_dow: policy.schedule_dow,
    schedule_dom: policy.schedule_dom,
    reported_at: reportedAt.toISOString(),
  };
}
