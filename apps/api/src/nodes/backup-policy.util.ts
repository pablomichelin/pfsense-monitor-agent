import { Prisma } from '@prisma/client';
import {
  BACKUP_SCHEDULE_MODES,
  BackupScheduleMode,
  BackupSchedulePolicy,
} from './backup-schedule.util';

export type StoredBackupPolicy = BackupSchedulePolicy & {
  reported_at?: string;
  last_checked_at?: string;
  config_sha256?: string;
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

  const record = raw as Record<string, unknown>;
  const reportedAt = record.reported_at;
  const lastCheckedAt = record.last_checked_at;
  const configSha256 = record.config_sha256;
  return {
    ...normalized,
    ...(typeof reportedAt === 'string' ? { reported_at: reportedAt } : {}),
    ...(typeof lastCheckedAt === 'string'
      ? { last_checked_at: lastCheckedAt }
      : {}),
    ...(typeof configSha256 === 'string' && /^[a-fA-F0-9]{64}$/.test(configSha256)
      ? { config_sha256: configSha256.toLowerCase() }
      : {}),
  };
}

export function toStoredBackupPolicyJson(
  policy: BackupSchedulePolicy,
  reportedAt: Date,
  extras?: {
    last_checked_at?: string;
    config_sha256?: string;
  },
): Prisma.InputJsonValue {
  const lastCheckedAt = extras?.last_checked_at?.trim();
  const configSha256 = extras?.config_sha256?.trim().toLowerCase();
  return {
    enabled: policy.enabled,
    schedule_mode: policy.schedule_mode,
    interval_hours: policy.interval_hours,
    schedule_time: policy.schedule_time,
    schedule_dow: policy.schedule_dow,
    schedule_dom: policy.schedule_dom,
    reported_at: reportedAt.toISOString(),
    ...(lastCheckedAt ? { last_checked_at: lastCheckedAt } : {}),
    ...(configSha256 && /^[a-f0-9]{64}$/.test(configSha256)
      ? { config_sha256: configSha256 }
      : {}),
  };
}

/**
 * Se o agente confirma o mesmo SHA do último backup armazenado, a cópia
 * no controlador ainda é o XML atual — last_checked_at vale como frescura.
 */
export function resolveBackupFreshnessAt(input: {
  latestBackupReceivedAt: Date | null | undefined;
  latestBackupSha256?: string | null;
  policy: StoredBackupPolicy | null | undefined;
}): Date | null {
  const received = input.latestBackupReceivedAt ?? null;
  if (!received) {
    return null;
  }

  const storedSha = input.latestBackupSha256?.trim().toLowerCase() ?? '';
  const reportedSha = input.policy?.config_sha256?.trim().toLowerCase() ?? '';
  const checkedRaw = input.policy?.last_checked_at?.trim() ?? '';
  if (!storedSha || !reportedSha || storedSha !== reportedSha || !checkedRaw) {
    return received;
  }

  const checked = new Date(checkedRaw);
  if (Number.isNaN(checked.getTime())) {
    return received;
  }

  return checked.getTime() > received.getTime() ? checked : received;
}
