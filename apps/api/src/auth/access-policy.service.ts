import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { appConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { AccessActor } from './access-actor.type';
import { PermissionsService } from './permissions.service';
import { isClientRole, isSuperadminRole } from './role-codes';

@Injectable()
export class AccessPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  isScopeEnforced(): boolean {
    return appConfig.rbac.scopeEnabled;
  }

  hasGlobalClientScope(actor: AccessActor): boolean {
    if (!this.isScopeEnforced()) {
      return true;
    }

    return isSuperadminRole(actor.role);
  }

  async getAllowedClientIds(actor: AccessActor): Promise<string[] | null> {
    if (this.hasGlobalClientScope(actor)) {
      return null;
    }

    if (isClientRole(actor.role)) {
      const user = await this.prisma.user.findUnique({
        where: { id: actor.userId },
        select: {
          clientId: true,
          client: {
            select: {
              status: true,
            },
          },
        },
      });

      if (!user?.clientId || user.client?.status !== 'active') {
        return [];
      }

      return [user.clientId];
    }

    const scopes = await this.prisma.userClientScope.findMany({
      where: {
        userId: actor.userId,
        client: {
          status: 'active',
        },
      },
      select: {
        clientId: true,
      },
    });

    return scopes.map((scope) => scope.clientId);
  }

  /**
   * PERM-001: `clients.create` autoriza a rota na API, mas criar cliente top-level
   * exige superadmin, RBAC scope desligado ou permissao `inventory.global`.
   */
  async assertCanCreateClient(actor: AccessActor): Promise<void> {
    if (this.hasGlobalClientScope(actor)) {
      return;
    }

    if (await this.permissionsService.hasPermission(actor.role, 'inventory.global')) {
      return;
    }

    throw new ForbiddenException('creating clients requires inventory.global permission');
  }

  async assertClientAccess(actor: AccessActor, clientId: string): Promise<void> {
    const allowedClientIds = await this.getAllowedClientIds(actor);
    if (allowedClientIds === null) {
      return;
    }

    if (!allowedClientIds.includes(clientId)) {
      throw new ForbiddenException('client out of scope');
    }
  }

  async resolveNodeClientId(nodeId: string): Promise<string | null> {
    const node = await this.prisma.node.findUnique({
      where: {
        id: nodeId,
      },
      select: {
        site: {
          select: {
            clientId: true,
          },
        },
      },
    });

    return node?.site.clientId ?? null;
  }

  async assertNodeAccess(actor: AccessActor, nodeId: string): Promise<string> {
    const clientId = await this.resolveNodeClientId(nodeId);
    if (!clientId) {
      throw new NotFoundException('node not found');
    }

    await this.assertClientAccess(actor, clientId);
    return clientId;
  }

  async assertSiteAccess(actor: AccessActor, siteId: string): Promise<string> {
    const site = await this.prisma.site.findUnique({
      where: {
        id: siteId,
      },
      select: {
        clientId: true,
      },
    });

    if (!site) {
      throw new NotFoundException('site not found');
    }

    await this.assertClientAccess(actor, site.clientId);
    return site.clientId;
  }

  async mergeNodeWhere(
    actor: AccessActor,
    baseWhere: Prisma.NodeWhereInput = {},
  ): Promise<Prisma.NodeWhereInput> {
    const allowedClientIds = await this.getAllowedClientIds(actor);
    if (allowedClientIds === null) {
      return baseWhere;
    }

    if (allowedClientIds.length === 0) {
      return {
        AND: [baseWhere, { id: { in: [] } }],
      };
    }

    const scopeWhere: Prisma.NodeWhereInput = {
      site: {
        clientId: {
          in: allowedClientIds,
        },
      },
    };

    return Object.keys(baseWhere).length === 0
      ? scopeWhere
      : {
          AND: [baseWhere, scopeWhere],
        };
  }

  async mergeAlertWhere(
    actor: AccessActor,
    baseWhere: Prisma.AlertWhereInput = {},
  ): Promise<Prisma.AlertWhereInput> {
    const allowedClientIds = await this.getAllowedClientIds(actor);
    if (allowedClientIds === null) {
      return baseWhere;
    }

    if (allowedClientIds.length === 0) {
      return {
        AND: [baseWhere, { id: { in: [] } }],
      };
    }

    const scopeWhere: Prisma.AlertWhereInput = {
      node: {
        site: {
          clientId: {
            in: allowedClientIds,
          },
        },
      },
    };

    return Object.keys(baseWhere).length === 0
      ? scopeWhere
      : {
          AND: [baseWhere, scopeWhere],
        };
  }

  async filterClientIds(actor: AccessActor, clientIds: string[]): Promise<string[]> {
    const allowedClientIds = await this.getAllowedClientIds(actor);
    if (allowedClientIds === null) {
      return clientIds;
    }

    const allowedSet = new Set(allowedClientIds);
    return clientIds.filter((clientId) => allowedSet.has(clientId));
  }

  async assertRequestedClientFilter(
    actor: AccessActor,
    clientId?: string,
  ): Promise<void> {
    if (!clientId) {
      return;
    }

    await this.assertClientAccess(actor, clientId);
  }
}
