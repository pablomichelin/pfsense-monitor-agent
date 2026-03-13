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
import { RawBodyRequest } from '../common/raw-body-request.type';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SessionAuthGuard } from './session-auth.guard';
import { appConfig } from '../config/app-config';

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
  constructor(private readonly authService: AuthService) {}

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
      ipAddress: cfConnectingIp ?? request.ip,
      userAgent,
    });

    reply.header('Set-Cookie', [
      this.authService.buildSessionCookie(result.sessionToken, result.expiresAt),
      this.authService.buildCsrfCookie(result.csrfToken, result.expiresAt),
    ]);

    return {
      ok: true,
      expires_at: result.expiresAt.toISOString(),
      user: result.user,
      session_cookie_name: appConfig.auth.sessionCookieName,
      csrf_cookie_name: appConfig.auth.csrfCookieName,
    };
  }

  @UseGuards(SessionAuthGuard)
  @Get('me')
  getSession(@Req() request: AuthenticatedRequest) {
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
      ipAddress: cfConnectingIp ?? request.ip,
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
      cfConnectingIp ?? request.ip,
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
