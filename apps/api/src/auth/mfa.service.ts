import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { EntityStatus, Prisma, User } from '@prisma/client';
import { createHash, randomBytes, randomInt } from 'crypto';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { AuditService } from '../audit/audit.service';
import { NodeSecretCryptoService } from '../common/node-secret-crypto.service';
import { appConfig } from '../config/app-config';
import { MfaPolicyService } from '../mfa-policy/mfa-policy.service';
import { PrismaService } from '../prisma/prisma.service';

export interface MfaEnrollmentStart {
  secret: string;
  otpauth_uri: string;
  qr_data_url: string;
}

export interface MfaStatus {
  enabled: boolean;
  enrolled_at: string | null;
  recovery_codes_remaining: number;
  enforcement_required: boolean;
}

const CHALLENGE_MAX_FAILURES = 5;
const USER_MAX_FAILURES = 12;
const USER_FAILURE_WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nodeSecretCrypto: NodeSecretCryptoService,
    private readonly auditService: AuditService,
    private readonly mfaPolicyService: MfaPolicyService,
  ) {
    authenticator.options = { window: appConfig.mfa.totpWindow };
  }

  /** Imposicao "suave": papel exigido e usuario ainda sem MFA habilitado. */
  isEnforcementRequired(role: string, mfaEnabled: boolean): boolean {
    return this.mfaPolicyService.isEnforcementRequired(role, mfaEnabled);
  }

  isEnforcementBlocking(): boolean {
    return this.mfaPolicyService.isEnforcementBlocking();
  }

  async getStatus(userId: string): Promise<MfaStatus> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('user not found');
    }

    const remaining = user.mfaEnabled
      ? await this.prisma.mfaRecoveryCode.count({
          where: { userId, usedAt: null },
        })
      : 0;

    return {
      enabled: user.mfaEnabled,
      enrolled_at: user.mfaEnrolledAt?.toISOString() ?? null,
      recovery_codes_remaining: remaining,
      enforcement_required: this.isEnforcementRequired(
        user.role,
        user.mfaEnabled,
      ),
    };
  }

  /**
   * Inicia o enrollment: gera um segredo TOTP novo, guarda cifrado em repouso e
   * mantem mfa_enabled=false ate a confirmacao por codigo. Reiniciar o enrollment
   * antes de confirmar simplesmente substitui o segredo pendente.
   */
  async startEnrollment(input: {
    userId: string;
    email: string;
    ipAddress?: string;
  }): Promise<MfaEnrollmentStart> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
    });
    if (!user) {
      throw new UnauthorizedException('user not found');
    }

    if (user.mfaEnabled) {
      throw new BadRequestException('MFA already enabled; disable it first');
    }

    const secret = authenticator.generateSecret();
    const otpauthUri = authenticator.keyuri(
      input.email,
      appConfig.mfa.issuer,
      secret,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { mfaSecret: this.nodeSecretCrypto.encrypt(secret) },
    });

    const qrDataUrl = await QRCode.toDataURL(otpauthUri, { margin: 1 });

    await this.auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: 'auth.mfa.enroll_start',
      targetType: 'user',
      targetId: user.id,
      ipAddress: input.ipAddress,
    });

    return {
      secret,
      otpauth_uri: otpauthUri,
      qr_data_url: qrDataUrl,
    };
  }

  /**
   * Confirma o enrollment: valida o codigo TOTP contra o segredo pendente,
   * habilita o MFA e gera os codigos de recuperacao (retornados uma unica vez).
   */
  async confirmEnrollment(input: {
    userId: string;
    code: string;
    ipAddress?: string;
  }): Promise<{ recovery_codes: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
    });
    if (!user) {
      throw new UnauthorizedException('user not found');
    }

    if (user.mfaEnabled) {
      throw new BadRequestException('MFA already enabled');
    }

    if (!user.mfaSecret) {
      throw new BadRequestException('no pending MFA enrollment; start first');
    }

    const secret = this.nodeSecretCrypto.decrypt(user.mfaSecret);
    if (!this.verifyTotp(secret, input.code)) {
      throw new UnauthorizedException('invalid TOTP code');
    }

    const recoveryCodes = this.generateRecoveryCodes(
      appConfig.mfa.recoveryCodeCount,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({
          userId: user.id,
          codeHash: this.hashValue(this.normalizeRecoveryCode(code)),
        })),
      });
      await tx.user.update({
        where: { id: user.id },
        data: {
          mfaEnabled: true,
          mfaEnrolledAt: new Date(),
          mfaFailedAttemptCount: 0,
          mfaFailedWindowStart: null,
        },
      });
    });

    await this.auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: 'auth.mfa.enabled',
      targetType: 'user',
      targetId: user.id,
      ipAddress: input.ipAddress,
    });

    return { recovery_codes: recoveryCodes };
  }

  /** Desativa o MFA exigindo um fator valido (TOTP ou codigo de recuperacao). */
  async disable(input: {
    userId: string;
    code: string;
    ipAddress?: string;
  }): Promise<void> {
    const result = await this.prisma.$transaction(async (tx) => {
      // Serialize against challenge verification, and make recovery-code
      // consumption, disabling and outstanding challenge invalidation atomic.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.userId}::uuid FOR UPDATE`;
      const lockedUser = await tx.user.findUnique({ where: { id: input.userId } });
      if (!lockedUser) {
        throw new UnauthorizedException('user not found');
      }
      if (!lockedUser.mfaEnabled) {
        throw new BadRequestException('MFA is not enabled');
      }
      const now = new Date();
      const activeWindow = Boolean(
        lockedUser.mfaFailedWindowStart &&
        now >= lockedUser.mfaFailedWindowStart &&
        now.getTime() - lockedUser.mfaFailedWindowStart.getTime() < USER_FAILURE_WINDOW_MS,
      );
      const failures = activeWindow ? lockedUser.mfaFailedAttemptCount : 0;
      if (failures >= USER_MAX_FAILURES) {
        return { kind: 'invalid' as const, reachedLimit: false, userRole: lockedUser.role };
      }
      if (!(await this.verifyFactor(lockedUser, input.code, tx))) {
        await tx.user.update({
          where: { id: input.userId },
          data: {
            mfaFailedAttemptCount: failures + 1,
            mfaFailedWindowStart: activeWindow ? lockedUser.mfaFailedWindowStart : now,
          },
        });
        return {
          kind: 'invalid' as const,
          reachedLimit: failures + 1 === USER_MAX_FAILURES,
          userRole: lockedUser.role,
        };
      }
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: input.userId } });
      await tx.mfaLoginChallenge.deleteMany({ where: { userId: input.userId } });
      await tx.user.update({
        where: { id: input.userId },
        data: {
          mfaEnabled: false,
          mfaSecret: null,
          mfaEnrolledAt: null,
          mfaFailedAttemptCount: 0,
          mfaFailedWindowStart: null,
        },
      });
      return { kind: 'ok' as const, user: lockedUser };
    }, { timeout: 10_000 });

    if (result.kind !== 'ok') {
      if (result.reachedLimit) {
        await this.auditService.record({
          actorId: input.userId,
          actorRole: result.userRole,
          action: 'auth.mfa.attempt_limit_reached',
          targetType: 'user',
          targetId: input.userId,
          ipAddress: input.ipAddress,
        }).catch(() => this.logger.warn('could not record MFA disable attempt limit audit'));
      }
      throw new UnauthorizedException('invalid MFA code');
    }
    const user = result.user;
    await this.auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: 'auth.mfa.disabled',
      targetType: 'user',
      targetId: user.id,
      ipAddress: input.ipAddress,
    });
  }

  /** Cria o desafio transitorio de login (apos senha validada). Retorna o token. */
  async createLoginChallenge(input: {
    userId: string;
    ipAddress?: string;
    userAgent?: string;
  }, tx: Prisma.TransactionClient): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + appConfig.mfa.challengeTtlMinutes * 60 * 1000,
    );

    // Limpeza oportunista de desafios expirados/consumidos.
    await tx.mfaLoginChallenge
      .deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { userId: input.userId, consumedAt: { not: null } },
          ],
        },
      });

    await tx.mfaLoginChallenge.create({
      data: {
        userId: input.userId,
        challengeTokenHash: this.hashValue(token),
        expiresAt,
        ipAddress: input.ipAddress?.trim() || null,
        userAgent: input.userAgent?.trim() || null,
      },
    });

    return { token, expiresAt };
  }

  /**
   * Verifica o desafio de login: token valido + fator (TOTP ou recuperacao).
   * Consome o desafio (one-shot) e retorna o usuario autenticado.
   */
  async verifyLoginChallenge(input: {
    token: string;
    code: string;
    ipAddress?: string;
  }): Promise<User> {
    const challengeTokenHash = this.hashValue(input.token);
    const result = await this.prisma.$transaction(async (tx) => {
      const candidate = await tx.mfaLoginChallenge.findUnique({
        where: { challengeTokenHash },
        select: { userId: true },
      });
      if (!candidate) return { kind: 'invalid' as const };

      // One lock per user, across all simultaneously issued challenges.
      // It fences both recovery-code consumption and the failure budgets.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${candidate.userId}::uuid FOR UPDATE`;
      const challenge = await tx.mfaLoginChallenge.findUnique({
        where: { challengeTokenHash },
        include: { user: true },
      });
      const now = new Date();
      if (
        !challenge || challenge.consumedAt || challenge.expiresAt <= now ||
        !challenge.user.mfaEnabled
      ) {
        return { kind: 'invalid' as const };
      }

      const user = challenge.user;
      const activeWindow = Boolean(
        user.mfaFailedWindowStart &&
        now.getTime() - user.mfaFailedWindowStart.getTime() < USER_FAILURE_WINDOW_MS &&
        now >= user.mfaFailedWindowStart,
      );
      const userFailures = activeWindow ? user.mfaFailedAttemptCount : 0;
      if (challenge.attemptCount >= CHALLENGE_MAX_FAILURES || userFailures >= USER_MAX_FAILURES) {
        return { kind: 'invalid' as const };
      }

      const verified = await this.verifyFactor(user, input.code, tx);
      if (!verified) {
        const nextChallengeFailures = challenge.attemptCount + 1;
        const nextUserFailures = userFailures + 1;
        await tx.mfaLoginChallenge.update({
          where: { id: challenge.id },
          data: { attemptCount: nextChallengeFailures },
        });
        await tx.user.update({
          where: { id: user.id },
          data: {
            mfaFailedAttemptCount: nextUserFailures,
            mfaFailedWindowStart: activeWindow ? user.mfaFailedWindowStart : now,
          },
        });
        return {
          kind: 'invalid' as const,
          reachedLimit: nextChallengeFailures === CHALLENGE_MAX_FAILURES ||
            nextUserFailures === USER_MAX_FAILURES,
          userId: user.id,
          userRole: user.role,
        };
      }

      // The recovery code (if used), challenge consumption, and budget reset
      // commit together. A lost response cannot authorize the same token again.
      const consumed = await tx.mfaLoginChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException('MFA challenge already used');
      }
      await tx.mfaLoginChallenge.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { mfaFailedAttemptCount: 0, mfaFailedWindowStart: null },
      });
      return { kind: 'ok' as const, user };
    }, { timeout: 10_000 });

    if (result.kind !== 'ok') {
      if (result.reachedLimit && result.userId && result.userRole) {
        await this.auditService.record({
          actorId: result.userId,
          actorRole: result.userRole,
          action: 'auth.mfa.attempt_limit_reached',
          targetType: 'user',
          targetId: result.userId,
          ipAddress: input.ipAddress,
        }).catch(() => this.logger.warn('could not record MFA attempt limit audit'));
      }
      throw new UnauthorizedException('invalid or expired MFA challenge');
    }
    return result.user;
  }

  /** Verifica TOTP primeiro; se falhar, tenta consumir um codigo de recuperacao. */
  private async verifyFactor(
    user: User,
    code: string,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    if (user.mfaSecret) {
      const secret = this.nodeSecretCrypto.decrypt(user.mfaSecret);
      if (this.verifyTotp(secret, code)) {
        return true;
      }
    }

    return this.consumeRecoveryCode(user.id, code, tx);
  }

  private verifyTotp(secret: string, code: string): boolean {
    const normalized = (code ?? '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalized)) {
      return false;
    }
    try {
      return authenticator.verify({ token: normalized, secret });
    } catch {
      return false;
    }
  }

  private async consumeRecoveryCode(
    userId: string,
    code: string,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    const normalized = this.normalizeRecoveryCode(code ?? '');
    if (!normalized) {
      return false;
    }

    const codeHash = this.hashValue(normalized);
    const updated = await tx.mfaRecoveryCode.updateMany({
      where: { userId, codeHash, usedAt: null },
      data: { usedAt: new Date() },
    });

    return updated.count === 1;
  }

  private generateRecoveryCodes(count: number): string[] {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const codes: string[] = [];
    for (let i = 0; i < count; i += 1) {
      let block = '';
      for (let j = 0; j < 10; j += 1) {
        block += alphabet[randomInt(0, alphabet.length)];
      }
      codes.push(`${block.slice(0, 5)}-${block.slice(5)}`);
    }
    return codes;
  }

  private normalizeRecoveryCode(code: string): string {
    return code.replace(/[^a-z0-9]/gi, '').toUpperCase();
  }

  private hashValue(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  static isActiveUser(user: User): boolean {
    return user.status === EntityStatus.active;
  }
}
