import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { EntityStatus, User } from '@prisma/client';
import { createHash, randomBytes, randomInt } from 'crypto';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { AuditService } from '../audit/audit.service';
import { NodeSecretCryptoService } from '../common/node-secret-crypto.service';
import { appConfig } from '../config/app-config';
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

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nodeSecretCrypto: NodeSecretCryptoService,
    private readonly auditService: AuditService,
  ) {
    authenticator.options = { window: appConfig.mfa.totpWindow };
  }

  /** Imposicao "suave": papel exigido e usuario ainda sem MFA habilitado. */
  isEnforcementRequired(role: string, mfaEnabled: boolean): boolean {
    return appConfig.mfa.enforcedRoles.includes(role) && !mfaEnabled;
  }

  isEnforcementBlocking(): boolean {
    return appConfig.mfa.enforcementBlocking;
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
        data: { mfaEnabled: true, mfaEnrolledAt: new Date() },
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
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
    });
    if (!user) {
      throw new UnauthorizedException('user not found');
    }

    if (!user.mfaEnabled) {
      throw new BadRequestException('MFA is not enabled');
    }

    const ok = await this.verifyFactor(user, input.code);
    if (!ok) {
      throw new UnauthorizedException('invalid MFA code');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.user.update({
        where: { id: user.id },
        data: { mfaEnabled: false, mfaSecret: null, mfaEnrolledAt: null },
      });
    });

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
  }): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + appConfig.mfa.challengeTtlMinutes * 60 * 1000,
    );

    // Limpeza oportunista de desafios expirados/consumidos.
    await this.prisma.mfaLoginChallenge
      .deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { userId: input.userId, consumedAt: { not: null } },
          ],
        },
      })
      .catch(() => undefined);

    await this.prisma.mfaLoginChallenge.create({
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
    const challenge = await this.prisma.mfaLoginChallenge.findUnique({
      where: { challengeTokenHash: this.hashValue(input.token) },
      include: { user: true },
    });

    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('invalid or expired MFA challenge');
    }

    const user = challenge.user;
    if (!user.mfaEnabled) {
      throw new UnauthorizedException('MFA challenge no longer valid');
    }

    const ok = await this.verifyFactor(user, input.code);
    if (!ok) {
      throw new UnauthorizedException('invalid MFA code');
    }

    // Consome o desafio com CAS (so consome se ainda nao consumido).
    const consumed = await this.prisma.mfaLoginChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException('MFA challenge already used');
    }

    return user;
  }

  /** Verifica TOTP primeiro; se falhar, tenta consumir um codigo de recuperacao. */
  private async verifyFactor(user: User, code: string): Promise<boolean> {
    if (user.mfaSecret) {
      const secret = this.nodeSecretCrypto.decrypt(user.mfaSecret);
      if (this.verifyTotp(secret, code)) {
        return true;
      }
    }

    return this.consumeRecoveryCode(user.id, code);
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
  ): Promise<boolean> {
    const normalized = this.normalizeRecoveryCode(code ?? '');
    if (!normalized) {
      return false;
    }

    const codeHash = this.hashValue(normalized);
    const updated = await this.prisma.mfaRecoveryCode.updateMany({
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
