import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { resolveClientIp } from '../common/client-ip';
import { RawBodyRequest } from '../common/raw-body-request.type';

import { AccessPolicyService } from './access-policy.service';
import { AuthService } from './auth.service';
import { getAccessActor } from './access-actor.util';
import { LoginDto } from './dto/login.dto';
import { MfaCodeDto, MfaLoginDto } from './dto/mfa.dto';
import { MfaService } from './mfa.service';
import { PermissionsService } from './permissions.service';
import { SessionAuthGuard } from './session-auth.guard';
import { appConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';

const readHeader = (value?: string | string[]): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

const parseCookies = (headerValue?: string | string[]): Record<string, string> => {
  const raw = readHeader(headerValue);
  if (!raw) {
    return {};
  }

  return raw.split(';').reduce<Record<string, string>>((acc, part) => {
    const [name, ...rest] = part.trim().split('=');
    if (!name || rest.length === 0) {
      return acc;
    }

    acc[name] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
};

@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly permissionsService: PermissionsService,
    private readonly mfaService: MfaService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Req() request: RawBodyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const result = await this.authService.login({
      email: body.email,
      password: body.password,
      ipAddress: resolveClientIp(request),
      userAgent,
    });

    // C-MFA: usuario com MFA ativo recebe um desafio (sem cookie de sessao).
    if (result.kind === 'mfa_challenge') {
      return {
        ok: true,
        mfa_required: true,
        mfa_token: result.mfaToken,
        mfa_expires_at: result.expiresAt.toISOString(),
        email: result.email,
      };
    }

    reply.header('Set-Cookie', [
      this.authService.buildSessionCookie(result.sessionToken, result.expiresAt),
      this.authService.buildCsrfCookie(result.csrfToken, result.expiresAt),
    ]);

    return {
      ok: true,
      mfa_required: false,
      mfa_enrollment_required: result.mfaEnrollmentRequired,
      mfa_enforcement_blocking:
        result.mfaEnrollmentRequired && this.mfaService.isEnforcementBlocking(),
      expires_at: result.expiresAt.toISOString(),
      user: result.user,
      session_cookie_name: appConfig.auth.sessionCookieName,
      csrf_cookie_name: appConfig.auth.csrfCookieName,
    };
  }

  @Post('login/mfa')
  async loginMfa(
    @Body() body: MfaLoginDto,
    @Req() request: RawBodyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const result = await this.authService.completeMfaLogin({
      mfaToken: body.mfa_token,
      code: body.code,
      ipAddress: resolveClientIp(request),
      userAgent,
    });

    reply.header('Set-Cookie', [
      this.authService.buildSessionCookie(result.sessionToken, result.expiresAt),
      this.authService.buildCsrfCookie(result.csrfToken, result.expiresAt),
    ]);

    return {
      ok: true,
      mfa_required: false,
      mfa_enrollment_required: result.mfaEnrollmentRequired,
      mfa_enforcement_blocking:
        result.mfaEnrollmentRequired && this.mfaService.isEnforcementBlocking(),
      expires_at: result.expiresAt.toISOString(),
      user: result.user,
      session_cookie_name: appConfig.auth.sessionCookieName,
      csrf_cookie_name: appConfig.auth.csrfCookieName,
    };
  }

  @UseGuards(SessionAuthGuard)
  @Get('mfa/status')
  getMfaStatus(@Req() request: AuthenticatedRequest) {
    return this.mfaService.getStatus(request.auth!.userId);
  }

  @UseGuards(SessionAuthGuard)
  @Post('mfa/enroll/start')
  startMfaEnrollment(
    @Req() request: AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.mfaService.startEnrollment({
      userId: request.auth!.userId,
      email: request.auth!.email,
      ipAddress: resolveClientIp(request),
    });
  }

  @UseGuards(SessionAuthGuard)
  @Post('mfa/enroll/verify')
  verifyMfaEnrollment(
    @Body() body: MfaCodeDto,
    @Req() request: AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.mfaService.confirmEnrollment({
      userId: request.auth!.userId,
      code: body.code,
      ipAddress: resolveClientIp(request),
    });
  }

  @UseGuards(SessionAuthGuard)
  @Post('mfa/disable')
  async disableMfa(
    @Body() body: MfaCodeDto,
    @Req() request: AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    await this.mfaService.disable({
      userId: request.auth!.userId,
      code: body.code,
      ipAddress: resolveClientIp(request),
    });
    return { ok: true };
  }

  @UseGuards(SessionAuthGuard)
  @Get('me')
  async getSession(@Req() request: AuthenticatedRequest) {
    const role = request.auth?.role as string;
    const userId = request.auth!.userId;
    const permissions = await this.permissionsService.getPermissionsForRole(role);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, role: true },
    });
    const actor = getAccessActor(request);
    const hasGlobalClientScope = this.accessPolicy.hasGlobalClientScope(actor);
    const mfaEnrollmentRequired = user
      ? this.mfaService.isEnforcementRequired(user.role, user.mfaEnabled)
      : false;
    const mfaEnforcementBlocking =
      mfaEnrollmentRequired && this.mfaService.isEnforcementBlocking();

    return {
      authenticated: true,
      session: {
        id: request.auth?.sessionId,
      },
      user: {
        id: request.auth?.userId,
        email: request.auth?.email,
        role: request.auth?.role,
      },
      permissions,
      has_global_client_scope: hasGlobalClientScope,
      mfa_enrollment_required: mfaEnrollmentRequired,
      mfa_enforcement_blocking: mfaEnforcementBlocking,
    };
  }

  @UseGuards(SessionAuthGuard)
  @Get('sessions')
  listSessions(@Req() request: AuthenticatedRequest) {
    return this.authService.listSessions({
      userId: request.auth!.userId,
      sessionId: request.auth!.sessionId,
    });
  }

  @UseGuards(SessionAuthGuard)
  @Post('sessions/:id/revoke')
  revokeSession(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp: string | undefined,
  ) {
    return this.authService.revokeSession(id, {
      userId: request.auth!.userId,
      sessionId: request.auth!.sessionId,
      ipAddress: resolveClientIp(request),
    });
  }

  @UseGuards(SessionAuthGuard)
  @Post('logout')
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    const cookies = parseCookies(request.headers.cookie);
    await this.authService.logout(
      cookies[appConfig.auth.sessionCookieName],
      resolveClientIp(request),
    );

    reply.header('Set-Cookie', [
      this.authService.buildClearedSessionCookie(),
      this.authService.buildClearedCsrfCookie(),
    ]);

    return {
      ok: true,
    };
  }
}
