import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { PermissionKey } from './permission-keys';
import { PERMISSIONS_METADATA_KEY } from './permissions.decorator';
import { PermissionsService } from './permissions.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<PermissionKey[]>(
      PERMISSIONS_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.auth?.role;

    if (!role) {
      throw new ForbiddenException('insufficient permission');
    }

    for (const permission of requiredPermissions) {
      if (!(await this.permissionsService.hasPermission(role, permission))) {
        throw new ForbiddenException('insufficient permission');
      }
    }

    return true;
  }
}
