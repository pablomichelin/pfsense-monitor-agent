import { ExecutionContext, ForbiddenException, Injectable, NotFoundException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionsService } from '../auth/permissions.service';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { PrismaService } from '../prisma/prisma.service';
import { getCommandPermission, isKnownCommandType } from './command-registry';

const COMMAND_PERMISSION_SOURCE = 'command_permission_source';
type PermissionSource = 'body' | 'stored-command';
export const RequireCommandPermission = (source: PermissionSource) =>
  SetMetadata(COMMAND_PERMISSION_SOURCE, source);

/** Extends default-deny with explicitly marked, type-specific command routes. */
@Injectable()
export class CommandPermissionsGuard extends PermissionsGuard {
  constructor(
    private readonly commandReflector: Reflector,
    private readonly commandPermissions: PermissionsService,
    private readonly prisma: PrismaService,
  ) {
    super(commandReflector, commandPermissions);
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const source = this.commandReflector.get<PermissionSource>(COMMAND_PERMISSION_SOURCE, context.getHandler());
    if (!source) return super.canActivate(context);

    const request = context.switchToHttp().getRequest<AuthenticatedRequest & {
      params: { nodeId?: string; commandId?: string };
      body?: { command_type?: unknown };
    }>();
    if (!request.auth?.role) throw new ForbiddenException('insufficient permission');
    const params = request.params;
    let type: unknown;
    if (source === 'stored-command') {
      const command = await this.prisma.nodeCommand.findFirst({
        where: { id: params.commandId, nodeId: params.nodeId },
        select: { type: true },
      });
      if (!command) throw new NotFoundException('command not found');
      type = command.type;
    } else if (source === 'body') {
      type = request.body?.command_type;
    }
    if (typeof type !== 'string' || !isKnownCommandType(type)) {
      throw new ForbiddenException('invalid command permission');
    }
    await this.commandPermissions.assertPermission(request.auth.role, getCommandPermission(type));
    return true;
  }
}
