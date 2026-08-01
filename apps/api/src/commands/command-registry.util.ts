import { NodeCommandStatus } from '@prisma/client';
import type { PermissionKey } from '../auth/permission-keys';

export const ACTIVE_COMMAND_STATUSES = [
  'pending',
  'picked_up',
  'running',
] as const;

export const TERMINAL_COMMAND_STATUSES = [
  'succeeded',
  'failed',
  'expired',
  'cancelled',
] as const;

export type CommandAuditPrefix =
  | 'backup.config'
  | 'pfsense.upgrade'
  | 'package.upgrade'
  | 'service.restart'
  | 'node.reboot'
  | 'technician.create'
  | 'technician.password_reset'
  | 'technician.disable'
  | 'technician.delete'
  | 'commands.batch';

export interface CommandTypeDefinition {
  permission: PermissionKey;
  minAgentVersion: string;
  expireMinutes: number;
  maxRetries: number;
  retryBackoffMs: number[];
  maxConcurrentPerNode: number;
  maxConcurrentGlobal: number;
  auditPrefix: CommandAuditPrefix;
  validatePayload: (payload: unknown) => Record<string, unknown> | undefined;
}

export function computeRetryBackoffMs(
  definition: CommandTypeDefinition,
  retryCount: number,
): number {
  const schedule = definition.retryBackoffMs;
  if (schedule.length === 0) {
    return 0;
  }

  const index = Math.min(Math.max(retryCount, 1), schedule.length) - 1;
  return schedule[index] ?? schedule[schedule.length - 1] ?? 0;
}

export function shouldDeferForConcurrency(input: {
  activeGlobalCount: number;
  maxConcurrentGlobal: number;
}): boolean {
  if (input.maxConcurrentGlobal <= 0) {
    return false;
  }

  return input.activeGlobalCount >= input.maxConcurrentGlobal;
}

export function isActiveCommandStatus(status: NodeCommandStatus): boolean {
  return (ACTIVE_COMMAND_STATUSES as readonly string[]).includes(status);
}

export function canRetryCommand(input: {
  status: NodeCommandStatus;
  retryCount: number;
  maxRetries: number;
}): boolean {
  return (
    input.status === NodeCommandStatus.failed &&
    input.maxRetries > 0 &&
    input.retryCount < input.maxRetries
  );
}

export function normalizeCommandHistoryLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) {
    return 25;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), 100);
}

export function buildStandardCommandResult(input: {
  status: NodeCommandStatus;
  errorMessage?: string | null;
  resultJson?: Record<string, unknown> | null;
  retryCount?: number;
}): Record<string, unknown> {
  return {
    status: input.status,
    ...(input.errorMessage ? { error_message: input.errorMessage } : {}),
    ...(input.resultJson ?? {}),
    ...(input.retryCount != null ? { retry_count: input.retryCount } : {}),
  };
}
