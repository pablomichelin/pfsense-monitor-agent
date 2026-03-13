import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { EntityStatus, UserRole } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { appConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from './password-hash';

export interface AuthenticatedSession {
  sessionId: string;
  userId: string;
  email: string;
  role: UserRole;
  csrfTokenHash: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async login(input: {
    email: string;
    password: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
    sessionToken: string;
    csrfToken: string;
    expiresAt: Date;
    user: {
      id: string;
      email: string;
      display_name: string;
      role: UserRole;
    };
  }> {
    const configuredEmail = appConfig.auth.bootstrapEmail;
    const configuredPassword = appConfig.auth.bootstrapPassword;

    if (!configuredEmail || !configuredPassword) {
      throw new ServiceUnavailableException('bootstrap auth credentials are not configured');
    }

    const normalizedEmail = input.email.trim().toLowerCase();
    const expectedEmail = configuredEmail.toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    let user = existingUser;
    let authenticated = false;

    if (existingUser?.passwordHash && verifyPassword(input.password, existingUser.passwordHash)) {
      authenticated = true;
    } else {
      const emailMatches = this.safeEqual(normalizedEmail, expectedEmail);
      const passwordMatches = this.safeEqual(input.password, configuredPassword);

      if (emailMatches && passwordMatches) {
        user = await this.prisma.user.upsert({
          where: {
            email: expectedEmail,
          },
          create: {
            email: expectedEmail,
            displayName: appConfig.auth.bootstrapDisplayName,
            passwordHash: hashPassword(configuredPassword),
            role: UserRole.superadmin,
            status: EntityStatus.active,
          },
          update: {
            displayName: appConfig.auth.bootstrapDisplayName,
            passwordHash: hashPassword(configuredPassword),
            role: UserRole.superadmin,
            status: EntityStatus.active,
          },
        });
        authenticated = true;
      }
    }

    if (!authenticated || !user) {
      this.logger.warn(
        `failed human login email=${normalizedEmail} ip=${input.ipAddress ?? 'unknown'}`,
      );
      throw new UnauthorizedException('invalid credentials');
    }

    if (user.status !== EntityStatus.active) {
      throw new ForbiddenException('user is inactive');
    }

    return this.createSession({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }

  async validateSession(
    sessionToken: string,
    csrfToken?: string,
    options?: {
      requireCsrf?: boolean;
      touch?: boolean;
    },
  ): Promise<AuthenticatedSession> {
    const sessionTokenHash = this.hashValue(sessionToken);
    const session = await this.prisma.userSession.findUnique({
      where: {
        sessionTokenHash,
      },
      include: {
        user: true,
      },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('invalid session');
    }

    if (session.user.status !== EntityStatus.active) {
      throw new ForbiddenException('user is inactive');
    }

    if (options?.requireCsrf) {
      if (!csrfToken) {
        throw new UnauthorizedException('csrf token is required');
      }

      const csrfTokenHash = this.hashValue(csrfToken);
      if (!this.safeEqual(csrfTokenHash, session.csrfTokenHash)) {
        throw new UnauthorizedException('invalid csrf token');
      }
    }

    if (options?.touch !== false) {
      await this.prisma.userSession.update({
        where: {
          id: session.id,
        },
        data: {
          lastSeenAt: new Date(),
        },
      });
    }

    return {
      sessionId: session.id,
      userId: session.user.id,
      email: session.user.email,
      role: session.user.role,
      csrfTokenHash: session.csrfTokenHash,
    };
  }

  async logout(sessionToken: string | undefined, actorIp?: string): Promise<void> {
    if (!sessionToken) {
      return;
    }

    const sessionTokenHash = this.hashValue(sessionToken);
    const session = await this.prisma.userSession.findUnique({
      where: {
        sessionTokenHash,
      },
      include: {
        user: true,
      },
    });

    if (!session || session.revokedAt) {
      return;
    }

    await this.prisma.userSession.update({
      where: {
        id: session.id,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    await this.writeAuditLog({
      actorId: session.user.id,
      action: 'auth.logout',
      targetType: 'user',
      targetId: session.user.id,
      ipAddress: actorIp,
      metadataJson: {
        email: session.user.email,
      },
    });
  }

  async listSessions(
    actor: {
      userId: string;
      sessionId: string;
    },
  ): Promise<{
    items: Array<{
      id: string;
      current: boolean;
      created_at: string;
      last_seen_at: string | null;
      expires_at: string;
      revoked_at: string | null;
      ip_address: string | null;
      user_agent: string | null;
    }>;
  }> {
    const sessions = await this.prisma.userSession.findMany({
      where: {
        userId: actor.userId,
      },
      orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
    });

    return {
      items: sessions.map((session) => ({
        id: session.id,
        current: session.id === actor.sessionId,
        created_at: session.createdAt.toISOString(),
        last_seen_at: session.lastSeenAt?.toISOString() ?? null,
        expires_at: session.expiresAt.toISOString(),
        revoked_at: session.revokedAt?.toISOString() ?? null,
        ip_address: session.ipAddress,
        user_agent: session.userAgent,
      })),
    };
  }

  async revokeSession(
    targetSessionId: string,
    actor: {
      userId: string;
      sessionId: string;
      ipAddress?: string;
    },
  ): Promise<{
    ok: true;
    session_id: string;
    revoked_at: string;
  }> {
    if (targetSessionId === actor.sessionId) {
      throw new ForbiddenException('current session must use logout');
    }

    const session = await this.prisma.userSession.findFirst({
      where: {
        id: targetSessionId,
        userId: actor.userId,
      },
    });

    if (!session) {
      throw new UnauthorizedException('session not found');
    }

    if (session.revokedAt) {
      return {
        ok: true,
        session_id: session.id,
        revoked_at: session.revokedAt.toISOString(),
      };
    }

    const revokedAt = new Date();

    await this.prisma.userSession.update({
      where: {
        id: session.id,
      },
      data: {
        revokedAt,
      },
    });

    await this.writeAuditLog({
      actorId: actor.userId,
      action: 'auth.session.revoke',
      targetType: 'user_session',
      targetId: session.id,
      ipAddress: actor.ipAddress,
      metadataJson: {
        session_id: session.id,
      },
    });

    return {
      ok: true,
      session_id: session.id,
      revoked_at: revokedAt.toISOString(),
    };
  }

  buildSessionCookie(value: string, expiresAt: Date): string {
    return this.serializeCookie(appConfig.auth.sessionCookieName, value, {
      expiresAt,
      httpOnly: true,
    });
  }

  buildCsrfCookie(value: string, expiresAt: Date): string {
    return this.serializeCookie(appConfig.auth.csrfCookieName, value, {
      expiresAt,
      httpOnly: false,
    });
  }

  buildClearedSessionCookie(): string {
    return this.serializeCookie(appConfig.auth.sessionCookieName, '', {
      expiresAt: new Date(0),
      httpOnly: true,
    });
  }

  buildClearedCsrfCookie(): string {
    return this.serializeCookie(appConfig.auth.csrfCookieName, '', {
      expiresAt: new Date(0),
      httpOnly: false,
    });
  }

  async createUserPasswordHash(password: string): Promise<string> {
    return hashPassword(password);
  }

  private serializeCookie(
    name: string,
    value: string,
    options: {
      expiresAt: Date;
      httpOnly: boolean;
    },
  ): string {
    const attributes = [
      `${name}=${encodeURIComponent(value)}`,
      'Path=/',
      `Expires=${options.expiresAt.toUTCString()}`,
      `Max-Age=${Math.max(
        0,
        Math.floor((options.expiresAt.getTime() - Date.now()) / 1000),
      )}`,
      'SameSite=Lax',
    ];

    if (options.httpOnly) {
      attributes.push('HttpOnly');
    }

    if (appConfig.auth.cookieSecure) {
      attributes.push('Secure');
    }

    return attributes.join('; ');
  }

  private async createSession(input: {
    user: {
      id: string;
      email: string;
      displayName: string | null;
      role: UserRole;
    };
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
    sessionToken: string;
    csrfToken: string;
    expiresAt: Date;
    user: {
      id: string;
      email: string;
      display_name: string;
      role: UserRole;
    };
  }> {
    const sessionToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    const expiresAt = new Date(
      Date.now() + appConfig.auth.sessionTtlHours * 60 * 60 * 1000,
    );

    await this.prisma.userSession.create({
      data: {
        userId: input.user.id,
        sessionTokenHash: this.hashValue(sessionToken),
        csrfTokenHash: this.hashValue(csrfToken),
        expiresAt,
        lastSeenAt: new Date(),
        ipAddress: input.ipAddress?.trim() || null,
        userAgent: input.userAgent?.trim() || null,
      },
    });

    await this.writeAuditLog({
      actorId: input.user.id,
      action: 'auth.login',
      targetType: 'user',
      targetId: input.user.id,
      ipAddress: input.ipAddress,
      metadataJson: {
        email: input.user.email,
        role: input.user.role,
      },
    });

    return {
      sessionToken,
      csrfToken,
      expiresAt,
      user: {
        id: input.user.id,
        email: input.user.email,
        display_name: input.user.displayName ?? input.user.email,
        role: input.user.role,
      },
    };
  }

  private hashValue(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  private async writeAuditLog(input: {
    actorId?: string;
    action: string;
    targetType: string;
    targetId?: string;
    ipAddress?: string;
    metadataJson?: Record<string, string>;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorType: 'user_session',
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        ipAddress: input.ipAddress,
        metadataJson: input.metadataJson,
      },
    });
  }
}
