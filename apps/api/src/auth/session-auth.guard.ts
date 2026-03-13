import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { appConfig } from '../config/app-config';
import { AuthenticatedRequest } from '../common/authenticated-request.type';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & {
      method: string;
    }>();
    const cookies = parseCookies(request.headers.cookie);
    const sessionToken = cookies[appConfig.auth.sessionCookieName];

    if (!sessionToken) {
      throw new UnauthorizedException('authentication required');
    }

    const csrfToken = readHeader(request.headers['x-csrf-token']);
    const session = await this.authService.validateSession(sessionToken, csrfToken, {
      requireCsrf: UNSAFE_METHODS.has(request.method.toUpperCase()),
    });

    request.auth = {
      sessionId: session.sessionId,
      userId: session.userId,
      email: session.email,
      role: session.role,
      csrfTokenHash: session.csrfTokenHash,
    };

    return true;
  }
}
