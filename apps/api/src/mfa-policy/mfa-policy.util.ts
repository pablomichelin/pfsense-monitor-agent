import { SYSTEM_ROLE_CODES } from '../auth/role-codes';

export const MFA_POLICY_SETTINGS_ID = 'default';

export type MfaEnvOverride = {
  enforcedRolesDefined: boolean;
  enforcedRoles: string[];
  enforcementBlockingDefined: boolean;
  enforcementBlocking: boolean;
};

export type StoredMfaPolicy = {
  enforcedRoles: string[];
  enforcementBlocking: boolean;
};

export type EffectiveMfaPolicy = StoredMfaPolicy;

export type SuperadminMfaReadinessInput = {
  mfaEnabled: boolean;
  recoveryCodesRemaining: number;
};

export function parseMfaEnvOverride(
  env: NodeJS.ProcessEnv = process.env,
): MfaEnvOverride {
  const enforcedRaw = env.MFA_ENFORCED_ROLES;
  const blockingRaw = env.MFA_ENFORCEMENT_BLOCKING;

  return {
    enforcedRolesDefined: enforcedRaw !== undefined,
    enforcedRoles: enforcedRaw
      ? enforcedRaw
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      : [],
    enforcementBlockingDefined: blockingRaw !== undefined,
    enforcementBlocking: blockingRaw === 'true',
  };
}

export function resolveEffectiveMfaPolicy(
  stored: StoredMfaPolicy,
  env: MfaEnvOverride,
): EffectiveMfaPolicy {
  return {
    enforcedRoles: env.enforcedRolesDefined
      ? [...env.enforcedRoles]
      : [...stored.enforcedRoles],
    enforcementBlocking: env.enforcementBlockingDefined
      ? env.enforcementBlocking
      : stored.enforcementBlocking,
  };
}

export function normalizeEnforcedRoles(
  roles: string[],
  allowedRoleCodes: readonly string[],
): string[] {
  const allowed = new Set(allowedRoleCodes);
  const normalized: string[] = [];

  for (const role of roles) {
    const trimmed = role.trim();
    if (!trimmed || !allowed.has(trimmed)) {
      continue;
    }
    if (!normalized.includes(trimmed)) {
      normalized.push(trimmed);
    }
  }

  return normalized.sort();
}

export function isRoleEnforced(
  role: string,
  policy: EffectiveMfaPolicy,
): boolean {
  return policy.enforcedRoles.includes(role);
}

export function assessBlockingReadiness(input: {
  activeSuperadmins: SuperadminMfaReadinessInput[];
}): { ready: boolean; reason: string | null; qualifiedCount: number } {
  const qualified = input.activeSuperadmins.filter(
    (user) => user.mfaEnabled && user.recoveryCodesRemaining > 0,
  );

  if (qualified.length === 0) {
    return {
      ready: false,
      qualifiedCount: 0,
      reason:
        'Ative o MFA e mantenha ao menos um codigo de recuperacao disponivel em um superadmin ativo antes de ligar o modo blocking.',
    };
  }

  return {
    ready: true,
    qualifiedCount: qualified.length,
    reason: null,
  };
}

export function validatePolicyUpdate(input: {
  nextEnforcedRoles: string[];
  nextBlocking: boolean;
  allowedRoleCodes: readonly string[];
  activeSuperadmins: SuperadminMfaReadinessInput[];
}): { ok: true } | { ok: false; error: string } {
  const normalizedRoles = normalizeEnforcedRoles(
    input.nextEnforcedRoles,
    input.allowedRoleCodes,
  );

  if (normalizedRoles.length !== input.nextEnforcedRoles.length) {
    return {
      ok: false,
      error: 'Um ou mais perfis informados sao invalidos para enforcement MFA.',
    };
  }

  if (input.nextBlocking) {
    const readiness = assessBlockingReadiness({
      activeSuperadmins: input.activeSuperadmins,
    });
    if (!readiness.ready) {
      return { ok: false, error: readiness.reason ?? 'Blocking indisponivel.' };
    }
  }

  return { ok: true };
}

export function describeMfaMode(policy: EffectiveMfaPolicy): 'off' | 'soft' | 'blocking' {
  if (policy.enforcedRoles.length === 0) {
    return 'off';
  }

  return policy.enforcementBlocking ? 'blocking' : 'soft';
}

export function defaultAllowedRoleCodes(): readonly string[] {
  return SYSTEM_ROLE_CODES;
}
