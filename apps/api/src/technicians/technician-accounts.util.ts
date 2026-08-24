import { randomBytes } from 'crypto';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** Perfis de privilégio allowlistados — MVP usa admin completo (doc 146). */
export const PRIVILEGE_PROFILE_ALLOWLIST = ['admin_full'] as const;

const TECHNICIAN_PASSWORD_MIN_LENGTH = 10;
const TECHNICIAN_PASSWORD_MAX_LENGTH = 64;
const TECHNICIAN_PASSWORD_CHARS =
  'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';

export type PrivilegeProfile = (typeof PRIVILEGE_PROFILE_ALLOWLIST)[number];

/**
 * Contas locais do pfSense que o controlador JAMAIS cadastra, altera senha,
 * desativa ou exclui. `admin` é exclusivo do appliance; `root` fica bloqueado
 * por precaução. Defesa em profundidade: cadastro, enqueue de comando e agente.
 */
export const RESERVED_PFSENSE_USERNAMES = ['admin', 'root'] as const;

export const PFSENSE_USERNAME_PATTERN = /^[a-z][a-z0-9._-]{2,31}$/;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LocalUserSnapshotEntry = {
  name: string;
  uid?: number;
  disabled?: boolean;
  is_admin?: boolean;
};

export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isReservedPfsenseUsername(username: string): boolean {
  return (RESERVED_PFSENSE_USERNAMES as readonly string[]).includes(
    username.trim().toLowerCase(),
  );
}

export function validatePfsenseUsername(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new BadRequestException('pfsense_username is required');
  }

  const username = raw.trim().toLowerCase();
  if (!PFSENSE_USERNAME_PATTERN.test(username)) {
    throw new BadRequestException(
      'pfsense_username must match /^[a-z][a-z0-9._-]{2,31}$/',
    );
  }

  if (isReservedPfsenseUsername(username)) {
    throw new ForbiddenException(
      `pfsense_username "${username}" is reserved and cannot be managed`,
    );
  }

  return username;
}

export function validatePrivilegeProfile(raw: unknown): PrivilegeProfile {
  const profile =
    raw == null || raw === '' ? 'admin_full' : String(raw).trim();

  if (!(PRIVILEGE_PROFILE_ALLOWLIST as readonly string[]).includes(profile)) {
    throw new BadRequestException(`privilege_profile "${profile}" is not in allowlist`);
  }

  return profile as PrivilegeProfile;
}

export function parseLocalUsersSnapshot(raw: unknown): LocalUserSnapshotEntry[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }

  const entries: LocalUserSnapshotEntry[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name) {
      continue;
    }
    entries.push({
      name,
      uid: typeof record.uid === 'number' ? record.uid : undefined,
      disabled: record.disabled === true,
      is_admin: record.is_admin === true,
    });
  }

  return entries;
}

export function countActiveAdminAccounts(
  snapshot: LocalUserSnapshotEntry[] | null | undefined,
): number {
  if (!snapshot?.length) {
    return 0;
  }

  return snapshot.filter((entry) => !entry.disabled && entry.is_admin).length;
}

export function wouldViolateLastAdminGuardrail(
  snapshot: LocalUserSnapshotEntry[] | null | undefined,
  targetUsername: string,
): boolean {
  if (!snapshot?.length) {
    return false;
  }

  const normalizedTarget = targetUsername.trim().toLowerCase();
  const target = snapshot.find(
    (entry) => entry.name.trim().toLowerCase() === normalizedTarget,
  );

  if (!target || target.disabled || !target.is_admin) {
    return false;
  }

  return countActiveAdminAccounts(snapshot) <= 1;
}

export function userExistsInSnapshot(
  snapshot: LocalUserSnapshotEntry[] | null | undefined,
  targetUsername: string,
): boolean {
  // Fail-closed: sem snapshot nao ha como confirmar presenca do usuario no
  // firewall. Contas desabilitadas CONTAM como existentes — exclusao/disable
  // precisam enxergar o usuario mesmo desativado (senao delete falha com
  // "user not found on firewall"). Para "ja ativo" use userAlreadyActiveInSnapshot.
  if (!snapshot?.length) {
    return false;
  }

  const normalizedTarget = targetUsername.trim().toLowerCase();
  return snapshot.some(
    (entry) => entry.name.trim().toLowerCase() === normalizedTarget,
  );
}

function assertObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new BadRequestException(`invalid ${label} payload`);
  }

  return payload as Record<string, unknown>;
}

export function validateLocalUserCreatePayload(
  payload: unknown,
): Record<string, unknown> {
  const raw = assertObjectPayload(payload, 'local_user_create');

  const technicianId = raw.technician_id;
  if (typeof technicianId !== 'string' || !isValidUuid(technicianId.trim())) {
    throw new BadRequestException('local_user_create requires technician_id (UUID)');
  }

  const result: Record<string, unknown> = {
    technician_id: technicianId.trim(),
    pfsense_username: validatePfsenseUsername(raw.pfsense_username),
    privilege_profile: validatePrivilegeProfile(raw.privilege_profile),
  };

  if (typeof raw.full_name === 'string' && raw.full_name.trim()) {
    result.full_name = raw.full_name.trim();
  }

  if (typeof raw.account_id === 'string' && isValidUuid(raw.account_id.trim())) {
    result.account_id = raw.account_id.trim();
  }

  if (typeof raw.password !== 'string' || raw.password.length === 0) {
    throw new BadRequestException('local_user_create requires password');
  }
  result.password = validateTechnicianPassword(raw.password);

  return result;
}

export function validateLocalUserSetPasswordPayload(
  payload: unknown,
): Record<string, unknown> {
  const raw = assertObjectPayload(payload, 'local_user_set_password');

  const result: Record<string, unknown> = {
    pfsense_username: validatePfsenseUsername(raw.pfsense_username),
  };

  if (typeof raw.technician_id === 'string' && isValidUuid(raw.technician_id.trim())) {
    result.technician_id = raw.technician_id.trim();
  }

  if (typeof raw.account_id === 'string' && isValidUuid(raw.account_id.trim())) {
    result.account_id = raw.account_id.trim();
  }

  if (typeof raw.password !== 'string' || raw.password.length === 0) {
    throw new BadRequestException('local_user_set_password requires password');
  }
  result.password = validateTechnicianPassword(raw.password);

  return result;
}

export function validateLocalUserDisablePayload(
  payload: unknown,
): Record<string, unknown> {
  const raw = assertObjectPayload(payload, 'local_user_disable');

  return {
    pfsense_username: validatePfsenseUsername(raw.pfsense_username),
  };
}

export function validateLocalUserDeletePayload(
  payload: unknown,
): Record<string, unknown> {
  const raw = assertObjectPayload(payload, 'local_user_delete');

  return {
    pfsense_username: validatePfsenseUsername(raw.pfsense_username),
  };
}

export function generateTechnicianPassword(length = 16): string {
  const bytes = randomBytes(length);
  let password = '';
  for (let index = 0; index < length; index += 1) {
    password += TECHNICIAN_PASSWORD_CHARS[bytes[index]! % TECHNICIAN_PASSWORD_CHARS.length];
  }
  return password;
}

export function validateTechnicianPassword(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new BadRequestException('password is required');
  }

  const password = raw.trim();
  if (
    password.length < TECHNICIAN_PASSWORD_MIN_LENGTH ||
    password.length > TECHNICIAN_PASSWORD_MAX_LENGTH
  ) {
    throw new BadRequestException(
      `password must be ${TECHNICIAN_PASSWORD_MIN_LENGTH}-${TECHNICIAN_PASSWORD_MAX_LENGTH} characters`,
    );
  }

  return password;
}

export function resolveTechnicianPassword(raw: unknown): string {
  if (raw == null || raw === '') {
    return generateTechnicianPassword();
  }

  return validateTechnicianPassword(raw);
}

export function scrubPasswordFromPayload(
  payload: Prisma.JsonValue | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload as Prisma.InputJsonValue;
  }

  const record = { ...(payload as Record<string, unknown>) };
  if ('password' in record) {
    delete record.password;
  }

  return record as Prisma.InputJsonValue;
}

/**
 * Histórico de comandos (firewalls.view): nunca devolver senha, inclusive a
 * aninhada em follow_up_technician_provision do config_backup_now.
 */
export function scrubSensitiveCommandPayload(
  payload: Prisma.JsonValue | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  const withoutTopLevel = scrubPasswordFromPayload(payload);
  if (
    !withoutTopLevel ||
    typeof withoutTopLevel !== 'object' ||
    Array.isArray(withoutTopLevel)
  ) {
    return withoutTopLevel;
  }

  const record = { ...(withoutTopLevel as Record<string, unknown>) };
  const followUp = record.follow_up_technician_provision;
  if (followUp && typeof followUp === 'object' && !Array.isArray(followUp)) {
    const nested = { ...(followUp as Record<string, unknown>) };
    if ('password' in nested) {
      delete nested.password;
    }
    record.follow_up_technician_provision = nested;
  }

  return record as Prisma.InputJsonValue;
}

export type FollowUpTechnicianProvision = {
  action: 'local_user_create' | 'local_user_set_password';
  technician_id: string;
  account_id: string;
  pfsense_username: string;
  password: string;
  full_name?: string;
  privilege_profile?: string;
  requested_by_user_id: string;
};

export function buildFollowUpTechnicianProvisionPayload(
  input: FollowUpTechnicianProvision,
): Record<string, unknown> {
  return {
    follow_up_technician_provision: {
      action: input.action,
      technician_id: input.technician_id,
      account_id: input.account_id,
      pfsense_username: input.pfsense_username,
      password: input.password,
      ...(input.full_name ? { full_name: input.full_name } : {}),
      ...(input.privilege_profile ? { privilege_profile: input.privilege_profile } : {}),
      requested_by_user_id: input.requested_by_user_id,
    },
  };
}

export function parseFollowUpTechnicianProvision(
  payload: Prisma.JsonValue | null,
): FollowUpTechnicianProvision | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const raw = (payload as Record<string, unknown>).follow_up_technician_provision;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const action = record.action;
  if (action !== 'local_user_create' && action !== 'local_user_set_password') {
    return null;
  }

  const technicianId = typeof record.technician_id === 'string' ? record.technician_id.trim() : '';
  const accountId = typeof record.account_id === 'string' ? record.account_id.trim() : '';
  const pfsenseUsername =
    typeof record.pfsense_username === 'string' ? record.pfsense_username.trim() : '';
  const password = typeof record.password === 'string' ? record.password : '';
  const requestedByUserId =
    typeof record.requested_by_user_id === 'string' ? record.requested_by_user_id.trim() : '';

  if (!technicianId || !accountId || !pfsenseUsername || !password || !requestedByUserId) {
    return null;
  }

  return {
    action,
    technician_id: technicianId,
    account_id: accountId,
    pfsense_username: pfsenseUsername,
    password,
    ...(typeof record.full_name === 'string' && record.full_name.trim()
      ? { full_name: record.full_name.trim() }
      : {}),
    ...(typeof record.privilege_profile === 'string' && record.privilege_profile.trim()
      ? { privilege_profile: record.privilege_profile.trim() }
      : {}),
    requested_by_user_id: requestedByUserId,
  };
}

export function scrubFollowUpFromBackupPayload(
  payload: Prisma.JsonValue | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload as Prisma.InputJsonValue;
  }

  const record = { ...(payload as Record<string, unknown>) };
  if ('follow_up_technician_provision' in record) {
    delete record.follow_up_technician_provision;
  }

  return record as Prisma.InputJsonValue;
}

/**
 * Guardrail de backup recente (doc 144 secao 7 item 9 / doc 154): avalia se o
 * node tem um backup de config.xml dentro da janela configurada. Pura —
 * recebe a data do backup mais recente ja resolvida pelo chamador (que tem
 * acesso ao Prisma), para poder ser reutilizada tanto em checagens
 * individuais quanto em lote sem duplicar a logica de comparacao de datas.
 */
export function evaluateRecentBackupSkipReason(
  latestBackupAt: Date | null | undefined,
  maxAgeHours: number,
): string | null {
  if (!latestBackupAt) {
    return 'no recent config backup found';
  }

  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  if (Date.now() - latestBackupAt.getTime() > maxAgeMs) {
    return 'no recent config backup found';
  }

  return null;
}

export function userAlreadyActiveInSnapshot(
  snapshot: LocalUserSnapshotEntry[] | null | undefined,
  targetUsername: string,
): boolean {
  if (!snapshot?.length) {
    return false;
  }

  const normalizedTarget = targetUsername.trim().toLowerCase();
  return snapshot.some(
    (entry) => entry.name.trim().toLowerCase() === normalizedTarget && !entry.disabled,
  );
}
