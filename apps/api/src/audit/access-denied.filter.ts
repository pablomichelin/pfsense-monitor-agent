import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpStatus,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { resolveClientIp } from '../common/client-ip';
import { AuditService } from './audit.service';

type RequestWithAuth = FastifyRequest & AuthenticatedRequest;

@Catch(ForbiddenException)
export class AccessDeniedAuditFilter implements ExceptionFilter {
  constructor(private readonly auditService: AuditService) {}

  async catch(exception: ForbiddenException, host: ArgumentsHost): Promise<void> {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<RequestWithAuth>();
    const response = ctx.getResponse<FastifyReply>();

    if (request.auth?.userId) {
      const message =
        typeof exception.getResponse() === 'string'
          ? exception.getResponse()
          : (exception.getResponse() as { message?: string | string[] }).message;

      const reason = Array.isArray(message)
        ? message.join(', ')
        : String(message ?? exception.message);

      await this.auditService.recordAccessDenied({
        actorId: request.auth.userId,
        actorRole: request.auth.role as string,
        ipAddress: resolveClientIp(request),
        method: request.method,
        path: request.url,
        reason,
      });
    }

    const payload = exception.getResponse();
    response.status(HttpStatus.FORBIDDEN).send(payload);
  }
}
