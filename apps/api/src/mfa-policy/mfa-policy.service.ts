import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { EntityStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { SUPERADMIN_ROLE } from '../auth/role-codes';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMfaPolicyDto } from './dto/mfa-policy.dto';
import {
  assessBlockingReadiness,
  describeMfaMode,
  isRoleEnforced,
  MFA_POLICY_SETTINGS_ID,
  normalizeEnforcedRoles,
  parseMfaEnvOverride,
  resolveEffectiveMfaPolicy,
  StoredMfaPolicy,
  validatePolicyUpdate,
} from './mfa-policy.util';

export type MfaPolicyRoleStatus = {
  code: string;
  label: string;
  enforced: boolean;
  active_users: number;
  users_missing_mfa: number;
};

export type MfaPolicyComplianceUser = {
  id: string;
  email: string;
  role: string;
  mfa_enabled: boolean;
  recovery_codes_remaining: number;
};

@Injectable()
export class MfaPolicyService implements OnModuleInit {
  private effectivePolicy = {
    enforcedRoles: [] as string[],
    enforcementBlocking: false,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refreshEffectivePolicy();
  }

  getEffectivePolicySync(): StoredMfaPolicy {
    return {
      enforcedRoles: [...this.effectivePolicy.enforcedRoles],
      enforcementBlocking: this.effectivePolicy.enforcementBlocking,
    };
  }

  isEnforcementRequired(role: string, mfaEnabled: boolean): boolean {
    return isRoleEnforced(role, this.effectivePolicy) && !mfaEnabled;
  }

  isEnforcementBlocking(): boolean {
    return this.effectivePolicy.enforcementBlocking;
  }

  async refreshEffectivePolicy(): Promise<void> {
    const stored = await this.getStoredPolicy();
    this.effectivePolicy = resolveEffectiveMfaPolicy(stored, parseMfaEnvOverride());
  }

  async getStoredPolicy(): Promise<StoredMfaPolicy & { updated_at: string }> {
    const row = await this.prisma.mfaPolicySettings.upsert({
      where: { id: MFA_POLICY_SETTINGS_ID },
      create: {
        id: MFA_POLICY_SETTINGS_ID,
        enforcedRoles: [],
        enforcementBlocking: false,
      },
      update: {},
    });

    return {
      enforcedRoles: [...row.enforcedRoles],
      enforcementBlocking: row.enforcementBlocking,
      updated_at: row.updatedAt.toISOString(),
    };
  }

  async getPolicyView(): Promise<{
    effective: {
      enforced_roles: string[];
      enforcement_blocking: boolean;
      mode: 'off' | 'soft' | 'blocking';
    };
    stored: {
      enforced_roles: string[];
      enforcement_blocking: boolean;
      updated_at: string;
    };
    env_override: {
      enforced_roles: boolean;
      enforcement_blocking: boolean;
      enforced_roles_value: string[] | null;
      enforcement_blocking_value: boolean | null;
    };
    editable: boolean;
    roles: Array<{
      code: string;
      label: string;
      enforced: boolean;
      active_users: number;
      users_missing_mfa: number;
    }>;
    compliance: {
      enforced_roles: string[];
      users_missing_mfa: MfaPolicyComplianceUser[];
      total_missing_mfa: number;
    };
    blocking_readiness: {
      ready: boolean;
      reason: string | null;
      qualified_superadmins: number;
    };
  }> {
    const env = parseMfaEnvOverride();
    const stored = await this.getStoredPolicy();
    const effective = resolveEffectiveMfaPolicy(stored, env);
    const editable = !env.enforcedRolesDefined && !env.enforcementBlockingDefined;

    const [roles, activeUsers, recoveryCounts, superadminReadiness] = await Promise.all([
      this.prisma.role.findMany({
        select: { code: true, label: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { status: EntityStatus.active },
        select: {
          id: true,
          email: true,
          role: true,
          mfaEnabled: true,
        },
        orderBy: [{ role: 'asc' }, { email: 'asc' }],
      }),
      this.prisma.mfaRecoveryCode.groupBy({
        by: ['userId'],
        where: { usedAt: null },
        _count: { _all: true },
      }),
      this.loadSuperadminReadiness(),
    ]);

    const recoveryByUserId = new Map(
      recoveryCounts.map((entry) => [entry.userId, entry._count._all]),
    );

    const roleStats = new Map<string, { active: number; missing: number }>();
    for (const role of roles) {
      roleStats.set(role.code, { active: 0, missing: 0 });
    }

    const usersMissingMfa: MfaPolicyComplianceUser[] = [];
    for (const user of activeUsers) {
      const stats = roleStats.get(user.role) ?? { active: 0, missing: 0 };
      stats.active += 1;
      const enforced = isRoleEnforced(user.role, effective);
      const recoveryRemaining = user.mfaEnabled
        ? recoveryByUserId.get(user.id) ?? 0
        : 0;

      if (enforced && !user.mfaEnabled) {
        stats.missing += 1;
        usersMissingMfa.push({
          id: user.id,
          email: user.email,
          role: user.role,
          mfa_enabled: user.mfaEnabled,
          recovery_codes_remaining: recoveryRemaining,
        });
      }

      roleStats.set(user.role, stats);
    }

    const roleStatuses: MfaPolicyRoleStatus[] = roles.map((role) => {
      const stats = roleStats.get(role.code) ?? { active: 0, missing: 0 };
      return {
        code: role.code,
        label: role.label,
        enforced: isRoleEnforced(role.code, effective),
        active_users: stats.active,
        users_missing_mfa: stats.missing,
      };
    });

    return {
      effective: {
        enforced_roles: effective.enforcedRoles,
        enforcement_blocking: effective.enforcementBlocking,
        mode: describeMfaMode(effective),
      },
      stored: {
        enforced_roles: stored.enforcedRoles,
        enforcement_blocking: stored.enforcementBlocking,
        updated_at: stored.updated_at,
      },
      env_override: {
        enforced_roles: env.enforcedRolesDefined,
        enforcement_blocking: env.enforcementBlockingDefined,
        enforced_roles_value: env.enforcedRolesDefined ? env.enforcedRoles : null,
        enforcement_blocking_value: env.enforcementBlockingDefined
          ? env.enforcementBlocking
          : null,
      },
      editable,
      roles: roleStatuses,
      compliance: {
        enforced_roles: [...effective.enforcedRoles],
        users_missing_mfa: usersMissingMfa,
        total_missing_mfa: usersMissingMfa.length,
      },
      blocking_readiness: {
        ready: superadminReadiness.ready,
        reason: superadminReadiness.reason,
        qualified_superadmins: superadminReadiness.qualifiedCount,
      },
    };
  }

  async updatePolicy(
    body: UpdateMfaPolicyDto,
    actor: { userId?: string; role?: string },
    ipAddress?: string,
  ): Promise<Awaited<ReturnType<MfaPolicyService['getPolicyView']>>> {
    const env = parseMfaEnvOverride();
    if (env.enforcedRolesDefined || env.enforcementBlockingDefined) {
      throw new ConflictException(
        'MFA policy is locked by environment override; adjust MFA_ENFORCED_ROLES / MFA_ENFORCEMENT_BLOCKING or remove them to use the panel.',
      );
    }

    if (body.enforced_roles === undefined && body.enforcement_blocking === undefined) {
      throw new BadRequestException('no policy fields provided');
    }

    const stored = await this.getStoredPolicy();
    const roles = await this.prisma.role.findMany({ select: { code: true } });
    const allowedRoleCodes = roles.map((role) => role.code);
    const superadminReadiness = await this.loadSuperadminReadiness();

    const nextEnforcedRoles =
      body.enforced_roles !== undefined
        ? normalizeEnforcedRoles(body.enforced_roles, allowedRoleCodes)
        : stored.enforcedRoles;
    const nextBlocking =
      body.enforcement_blocking !== undefined
        ? body.enforcement_blocking
        : stored.enforcementBlocking;

    const validation = validatePolicyUpdate({
      nextEnforcedRoles,
      nextBlocking,
      allowedRoleCodes,
      activeSuperadmins: superadminReadiness.activeSuperadmins,
    });
    if (!validation.ok) {
      throw new BadRequestException(validation.error);
    }

    await this.prisma.mfaPolicySettings.update({
      where: { id: MFA_POLICY_SETTINGS_ID },
      data: {
        enforcedRoles: nextEnforcedRoles,
        enforcementBlocking: nextBlocking,
      },
    });

    await this.refreshEffectivePolicy();

    await this.auditService.record({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'security.mfa_policy.update',
      targetType: 'mfa_policy',
      targetId: MFA_POLICY_SETTINGS_ID,
      ipAddress,
      metadataJson: {
        enforced_roles: nextEnforcedRoles,
        enforcement_blocking: nextBlocking,
        mode: describeMfaMode(this.effectivePolicy),
      },
    });

    return this.getPolicyView();
  }

  private async loadSuperadminReadiness(): Promise<{
    ready: boolean;
    reason: string | null;
    qualifiedCount: number;
    activeSuperadmins: Array<{
      mfaEnabled: boolean;
      recoveryCodesRemaining: number;
    }>;
  }> {
    const superadmins = await this.prisma.user.findMany({
      where: {
        role: SUPERADMIN_ROLE,
        status: EntityStatus.active,
      },
      select: {
        id: true,
        mfaEnabled: true,
      },
    });

    const recoveryCounts = await this.prisma.mfaRecoveryCode.groupBy({
      by: ['userId'],
      where: {
        usedAt: null,
        userId: { in: superadmins.map((user) => user.id) },
      },
      _count: { _all: true },
    });
    const recoveryByUserId = new Map(
      recoveryCounts.map((entry) => [entry.userId, entry._count._all]),
    );

    const activeSuperadmins = superadmins.map((user) => ({
      mfaEnabled: user.mfaEnabled,
      recoveryCodesRemaining: user.mfaEnabled
        ? recoveryByUserId.get(user.id) ?? 0
        : 0,
    }));

    const readiness = assessBlockingReadiness({ activeSuperadmins });
    return {
      ...readiness,
      activeSuperadmins,
    };
  }
}
