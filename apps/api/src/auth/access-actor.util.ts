import { UnauthorizedException } from '@nestjs/common';

import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { AccessActor } from './access-actor.type';

export function getAccessActor(request: AuthenticatedRequest): AccessActor {
  if (!request.auth?.userId || !request.auth.role) {
    throw new UnauthorizedException('authentication required');
  }

  return {
    userId: request.auth.userId,
    role: request.auth.role as string,
  };
}
