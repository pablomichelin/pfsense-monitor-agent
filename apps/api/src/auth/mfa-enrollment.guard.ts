import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { PrismaService } from '../prisma/prisma.service';
import { MfaService } from './mfa.service';

@Injectable()
export class MfaEnrollmentGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mfaService: MfaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.mfaService.isEnforcementBlocking()) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.auth?.userId;
    if (!userId) {
      throw new ForbiddenException('mfa enrollment required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, mfaEnabled: true },
    });

    if (!user) {
      throw new ForbiddenException('mfa enrollment required');
    }

    if (this.mfaService.isEnforcementRequired(user.role, user.mfaEnabled)) {
      throw new ForbiddenException('mfa enrollment required');
    }

    return true;
  }
}
