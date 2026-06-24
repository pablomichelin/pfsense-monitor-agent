import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { PermissionKey } from './permission-keys';
import {
  ALLOW_SESSION_ONLY_METADATA_KEY,
  PERMISSIONS_METADATA_KEY,
} from './permissions.decorator';
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

    // C-PG: default-deny. Uma rota protegida pelo PermissionsGuard so passa se
    // (a) declarar @RequirePermissions com a permissao satisfeita, ou
    // (b) declarar explicitamente @AllowSessionOnly (rotas de "Minha conta"/logout).
    // Rotas sem nenhuma das duas marcacoes sao bloqueadas — impede que uma rota
    // nova adicionada sob este guard fique acessivel so com sessao por esquecimento.
    if (!requiredPermissions || requiredPermissions.length === 0) {
      const allowSessionOnly = this.reflector.getAllAndOverride<boolean>(
        ALLOW_SESSION_ONLY_METADATA_KEY,
        [context.getHandler(), context.getClass()],
      );

      if (allowSessionOnly) {
        return true;
      }

      throw new ForbiddenException('insufficient permission');
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
