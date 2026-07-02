import { Prisma } from '@prisma/client';
import { parseStoredBackupPolicy } from '../nodes/backup-policy.util';

export const DEFAULT_BACKUP_RETENTION_COUNT = 30;
export const DEFAULT_BACKUP_RETENTION_MAX_BYTES = 250 * 1024 * 1024;

export type BackupRetentionPolicy = {
  count: number;
  max_bytes: number;
  source: 'global' | 'node';
};

const normalizeCount = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.min(365, Math.max(1, parsed));
};

const normalizeMaxBytes = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.min(1024 * 1024 * 1024, Math.max(1024 * 1024, parsed));
};

export function parseRetentionOverrides(
  raw: Prisma.JsonValue | null | undefined,
): { count: number | null; max_bytes: number | null } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { count: null, max_bytes: null };
  }

  const input = raw as Record<string, unknown>;
  return {
    count: normalizeCount(input.retention_count),
    max_bytes: normalizeMaxBytes(input.retention_max_bytes),
  };
}

export function resolveRetentionPolicy(
  raw: Prisma.JsonValue | null | undefined,
): BackupRetentionPolicy {
  const overrides = parseRetentionOverrides(raw);

  return {
    count: overrides.count ?? DEFAULT_BACKUP_RETENTION_COUNT,
    max_bytes:
      overrides.max_bytes ?? DEFAULT_BACKUP_RETENTION_MAX_BYTES,
    source:
      overrides.count !== null || overrides.max_bytes !== null
        ? 'node'
        : 'global',
  };
}

export function mergeRetentionPolicyJson(
  raw: Prisma.JsonValue | null | undefined,
  input: {
    retention_count?: number | null;
    retention_max_bytes?: number | null;
  },
): Prisma.InputJsonValue {
  const schedule = parseStoredBackupPolicy(raw);
  const current =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};

  if (input.retention_count === null) {
    delete current.retention_count;
  } else if (input.retention_count !== undefined) {
    current.retention_count = normalizeCount(input.retention_count);
  }

  if (input.retention_max_bytes === null) {
    delete current.retention_max_bytes;
  } else if (input.retention_max_bytes !== undefined) {
    current.retention_max_bytes = normalizeMaxBytes(input.retention_max_bytes);
  }

  if (schedule) {
    current.enabled = schedule.enabled;
    current.schedule_mode = schedule.schedule_mode;
    current.interval_hours = schedule.interval_hours;
    current.schedule_time = schedule.schedule_time;
    current.schedule_dow = schedule.schedule_dow;
    current.schedule_dom = schedule.schedule_dom;
    if (schedule.reported_at) {
      current.reported_at = schedule.reported_at;
    }
  }

  return current as Prisma.InputJsonValue;
}

export type StoredDriftState = {
  active: boolean;
  detected_at?: string;
  baseline_sha256?: string;
  baseline_backup_id?: string;
  current_sha256?: string;
  changed_sections?: string[];
  sensitive_changed_sections?: string[];
  alert_key?: string;
};

export function parseDriftState(
  raw: Prisma.JsonValue | null | undefined,
): StoredDriftState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const drift = (raw as Record<string, unknown>).drift_state;
  if (!drift || typeof drift !== 'object' || Array.isArray(drift)) {
    return null;
  }

  const input = drift as Record<string, unknown>;
  return {
    active: input.active === true,
    detected_at:
      typeof input.detected_at === 'string' ? input.detected_at : undefined,
    baseline_sha256:
      typeof input.baseline_sha256 === 'string'
        ? input.baseline_sha256
        : undefined,
    baseline_backup_id:
      typeof input.baseline_backup_id === 'string'
        ? input.baseline_backup_id
        : undefined,
    current_sha256:
      typeof input.current_sha256 === 'string'
        ? input.current_sha256
        : undefined,
    changed_sections: Array.isArray(input.changed_sections)
      ? input.changed_sections.map(String)
      : undefined,
    sensitive_changed_sections: Array.isArray(input.sensitive_changed_sections)
      ? input.sensitive_changed_sections.map(String)
      : undefined,
    alert_key:
      typeof input.alert_key === 'string' ? input.alert_key : undefined,
  };
}

export function mergeDriftStateJson(
  raw: Prisma.JsonValue | null | undefined,
  driftState: StoredDriftState | null,
): Prisma.InputJsonValue {
  const current =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};

  if (!driftState || !driftState.active) {
    delete current.drift_state;
  } else {
    current.drift_state = driftState;
  }

  return current as Prisma.InputJsonValue;
}
