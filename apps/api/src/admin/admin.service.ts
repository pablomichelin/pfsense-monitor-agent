import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgentTokenStatus,
  EntityStatus,
  NodeCredentialStatus,
  NodeStatus,
  NodeUidStatus,
  Prisma,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { appConfig } from '../config/app-config';
import { AccessActor } from '../auth/access-actor.type';
import { AccessPolicyService } from '../auth/access-policy.service';
import { NodeSecretCryptoService } from '../common/node-secret-crypto.service';
import { PackageReleaseService } from '../common/package-release.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { PermissionsService } from '../auth/permissions.service';
import {
  CLIENT_ROLE,
  DEFAULT_USER_ROLE,
  isClientRole,
  isSuperadminRole,
  isSystemRoleCode,
  SUPERADMIN_ROLE,
} from '../auth/role-codes';
import { PERMISSION_KEYS } from '../auth/permission-keys';
import { CreateRoleDto } from './dto/create-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import { NodesService } from '../nodes/nodes.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { CreateNodeDto } from './dto/create-node.dto';
import { CreateSiteDto } from './dto/create-site.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateAgentTokenDto } from './dto/create-agent-token.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { SetUserClientScopesDto } from './dto/set-user-client-scopes.dto';

const toSlug = (value: string): string =>
  value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

const normalizeCode = (value: string): string => toSlug(value).toUpperCase();

const normalizeOptional = (value?: string): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

type BootstrapHeartbeatMode = 'normal' | 'light';

const normalizeBootstrapHeartbeatMode = (
  rawValue?: string | null,
): BootstrapHeartbeatMode => (rawValue?.trim().toLowerCase() === 'light' ? 'light' : 'normal');

const normalizeConfigBackupEnabled = (
  rawValue?: string | null,
): 'yes' | 'no' | null => {
  const normalized = rawValue?.trim().toLowerCase();
  if (normalized === 'yes' || normalized === '1' || normalized === 'true' || normalized === 'on') {
    return 'yes';
  }
  if (normalized === 'no' || normalized === '0' || normalized === 'false' || normalized === 'off') {
    return 'no';
  }
  return null;
};

/** Lê config/package-release.env em runtime para o comando de bootstrap refletir sempre a versão atual (após git pull). */
function readPackageReleaseFromFile(): {
  version: string;
  sha256: string;
  repoRawBase: string;
} | null {
  const paths = [
    '/app/config/package-release.env', // caminho do volume no container (compose)
    join(process.cwd(), 'config', 'package-release.env'),
    join(__dirname, '..', '..', '..', 'config', 'package-release.env'),
  ];
  for (const filePath of paths) {
    if (!existsSync(filePath)) continue;
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const out: Record<string, string> = {};
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        out[key] = value;
      }
      const version = out['PACKAGE_RELEASE_VERSION']?.trim();
      const sha256 = out['PACKAGE_RELEASE_SHA256']?.trim();
      const repoRawBase = out['PACKAGE_RELEASE_REPO_RAW_BASE']?.trim();
      if (version && sha256 && repoRawBase) {
        return { version, sha256, repoRawBase };
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\"'\"'`)}'`;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nodeSecretCrypto: NodeSecretCryptoService,
    private readonly authService: AuthService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly nodesService: NodesService,
    private readonly auditService: AuditService,
    private readonly permissionsService: PermissionsService,
    private readonly packageReleaseService: PackageReleaseService,
  ) {}

  private invalidateNodesFiltersCache(): void {
    this.nodesService.invalidateFiltersCache();
  }

  private ensureNonEmptySlug(value: string, fallback: string): string {
    const normalized = toSlug(value);
    return normalized || fallback;
  }

  private async withClientScope(
    scopeActor: AccessActor | undefined,
    clientId: string,
  ): Promise<void> {
    if (!scopeActor) {
      return;
    }

    await this.accessPolicy.assertClientAccess(scopeActor, clientId);
  }

  private async withNodeScope(
    scopeActor: AccessActor | undefined,
    nodeId: string,
  ): Promise<void> {
    if (!scopeActor) {
      return;
    }

    await this.accessPolicy.assertNodeAccess(scopeActor, nodeId);
  }

  private async withSiteScope(
    scopeActor: AccessActor | undefined,
    siteId: string,
  ): Promise<void> {
    if (!scopeActor) {
      return;
    }

    await this.accessPolicy.assertSiteAccess(scopeActor, siteId);
  }

  private async buildUniqueClientCode(nameOrCode: string): Promise<string> {
    const base = normalizeCode(nameOrCode || 'CLIENTE');

    for (let attempt = 0; attempt < 1000; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const existing = await this.prisma.client.findUnique({
        where: {
          code: candidate,
        },
        select: {
          id: true,
        },
      });

      if (!existing) {
        return candidate;
      }
    }

    throw new ConflictException('unable to generate a unique client code');
  }

  private async buildUniqueSiteCode(clientId: string, nameOrCode: string): Promise<string> {
    const base = normalizeCode(nameOrCode || 'SITE');

    for (let attempt = 0; attempt < 1000; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const existing = await this.prisma.site.findFirst({
        where: {
          clientId,
          code: candidate,
        },
        select: {
          id: true,
        },
      });

      if (!existing) {
        return candidate;
      }
    }

    throw new ConflictException('unable to generate a unique site code');
  }

  private async buildUniqueNodeUid(seed: string): Promise<string> {
    const base = this.ensureNonEmptySlug(seed, 'firewall');

    for (let attempt = 0; attempt < 1000; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const existing = await this.prisma.node.findUnique({
        where: {
          nodeUid: candidate,
        },
        select: {
          id: true,
        },
      });

      if (!existing) {
        return candidate;
      }
    }

    throw new ConflictException('unable to generate a unique node_uid');
  }

  async listPermissionsMatrix(): Promise<{
    generated_at: string;
    roles: Array<{ code: string; label: string; is_system: boolean }>;
    permissions: Array<{
      id: string;
      description: string | null;
    }>;
    role_permissions: Record<string, string[]>;
  }> {
    const [roles, permissions, rolePermissions] = await Promise.all([
      this.prisma.role.findMany({
        where: { status: EntityStatus.active },
        orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
        select: {
          code: true,
          label: true,
          isSystem: true,
        },
      }),
      this.prisma.permission.findMany({
        orderBy: { id: 'asc' },
        select: {
          id: true,
          description: true,
        },
      }),
      this.prisma.rolePermission.findMany({
        orderBy: [{ role: 'asc' }, { permissionId: 'asc' }],
        select: {
          role: true,
          permissionId: true,
        },
      }),
    ]);

    const matrix = Object.fromEntries(
      roles.map((role) => [role.code, [] as string[]]),
    ) as Record<string, string[]>;

    for (const row of rolePermissions) {
      matrix[row.role]?.push(row.permissionId);
    }

    return {
      generated_at: new Date().toISOString(),
      roles: roles.map((role) => ({
        code: role.code,
        label: role.label,
        is_system: role.isSystem,
      })),
      permissions,
      role_permissions: matrix,
    };
  }

  async listRoles(): Promise<{
    items: Array<{
      code: string;
      label: string;
      is_system: boolean;
      status: EntityStatus;
    }>;
  }> {
    const roles = await this.prisma.role.findMany({
      where: { status: EntityStatus.active },
      orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
      select: {
        code: true,
        label: true,
        isSystem: true,
        status: true,
      },
    });

    return {
      items: roles.map((role) => ({
        code: role.code,
        label: role.label,
        is_system: role.isSystem,
        status: role.status,
      })),
    };
  }

  async createRole(
    dto: CreateRoleDto,
    actorId?: string,
    ipAddress?: string,
  ): Promise<{ role: { code: string; label: string; is_system: boolean } }> {
    const code = dto.code.trim().toLowerCase();
    if (isSystemRoleCode(code)) {
      throw new ConflictException('role code reserved for system profile');
    }

    const existing = await this.prisma.role.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictException('role already exists');
    }

    const role = await this.prisma.role.create({
      data: {
        code,
        label: dto.label.trim(),
        isSystem: false,
        status: EntityStatus.active,
      },
      select: {
        code: true,
        label: true,
        isSystem: true,
      },
    });

    await this.auditService.record({
      actorId,
      ipAddress,
      action: 'role.create',
      targetType: 'role',
      targetId: role.code,
      metadataJson: {
        label: role.label,
      },
    });

    return {
      role: {
        code: role.code,
        label: role.label,
        is_system: role.isSystem,
      },
    };
  }

  async deleteRole(
    code: string,
    actorId?: string,
    ipAddress?: string,
  ): Promise<{ deleted: true; code: string }> {
    const role = await this.prisma.role.findUnique({
      where: { code },
      select: {
        code: true,
        isSystem: true,
        _count: { select: { users: true } },
      },
    });

    if (!role) {
      throw new NotFoundException('role not found');
    }

    if (role.isSystem) {
      throw new BadRequestException('system roles cannot be deleted');
    }

    if (role._count.users > 0) {
      throw new ConflictException('role is assigned to users');
    }

    await this.prisma.role.delete({ where: { code } });
    this.permissionsService.invalidateRoleCache(code);

    await this.auditService.record({
      actorId,
      ipAddress,
      action: 'role.delete',
      targetType: 'role',
      targetId: code,
    });

    return { deleted: true, code };
  }

  async setRolePermissions(
    code: string,
    dto: SetRolePermissionsDto,
    actorId?: string,
    ipAddress?: string,
  ): Promise<{ role: string; permission_ids: string[] }> {
    if (isSuperadminRole(code)) {
      throw new BadRequestException('superadmin permissions are immutable');
    }

    const role = await this.prisma.role.findUnique({
      where: { code },
      select: { code: true, status: true },
    });

    if (!role || role.status !== EntityStatus.active) {
      throw new NotFoundException('role not found');
    }

    const permissionIds = [...new Set(dto.permission_ids.map((id) => id.trim()))];
    const known = await this.prisma.permission.findMany({
      where: { id: { in: permissionIds } },
      select: { id: true },
    });

    if (known.length !== permissionIds.length) {
      throw new BadRequestException('unknown permission id');
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { role: code } }),
      this.prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          role: code,
          permissionId,
        })),
      }),
    ]);

    this.permissionsService.invalidateRoleCache(code);

    await this.auditService.record({
      actorId,
      ipAddress,
      action: 'role.permissions.update',
      targetType: 'role',
      targetId: code,
      metadataJson: {
        permission_count: permissionIds.length,
      },
    });

    return {
      role: code,
      permission_ids: permissionIds.sort(),
    };
  }

  private async assertAssignableRole(code: string): Promise<void> {
    const role = await this.prisma.role.findUnique({
      where: { code },
      select: { status: true },
    });

    if (!role || role.status !== EntityStatus.active) {
      throw new BadRequestException('invalid role');
    }
  }

  async listUsers(query?: ListUsersQueryDto): Promise<{
    items: Array<{
      id: string;
      email: string;
      display_name: string | null;
      role: string;
      status: EntityStatus;
      client_ids: string[];
      client_id: string | null;
      created_at: string;
      updated_at: string;
    }>;
  }> {
    const statusFilter =
      query?.status === 'inactive' ? EntityStatus.inactive : EntityStatus.active;
    const users = await this.prisma.user.findMany({
      where: { status: statusFilter },
      orderBy: [
        { role: 'asc' },
        { email: 'asc' },
      ],
      include: {
        clientScopes: {
          select: {
            clientId: true,
          },
        },
      },
    });

    return {
      items: users.map((user) => ({
        id: user.id,
        email: user.email,
        display_name: user.displayName,
        role: user.role,
        status: user.status,
        client_id: user.clientId,
        client_ids:
          user.role === CLIENT_ROLE && user.clientId
            ? [user.clientId]
            : user.clientScopes.map((scope) => scope.clientId),
        created_at: user.createdAt.toISOString(),
        updated_at: user.updatedAt.toISOString(),
      })),
    };
  }

  async listUserClientScopes(userId: string): Promise<{
    user_id: string;
    client_ids: string[];
    clients: Array<{
      id: string;
      name: string;
      code: string;
    }>;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('user not found');
    }

    const scopes = await this.prisma.userClientScope.findMany({
      where: { userId },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: {
        client: {
          name: 'asc',
        },
      },
    });

    return {
      user_id: userId,
      client_ids: scopes.map((scope) => scope.clientId),
      clients: scopes.map((scope) => scope.client),
    };
  }

  async setUserClientScopes(
    userId: string,
    dto: SetUserClientScopesDto,
    grantedByUserId?: string,
    actorIp?: string,
  ): Promise<{
    user_id: string;
    client_ids: string[];
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true },
    });
    if (!user) {
      throw new NotFoundException('user not found');
    }
    if (user.role === SUPERADMIN_ROLE) {
      throw new BadRequestException('superadmin does not use client scopes');
    }

    await this.replaceUserClientScopes(userId, dto.client_ids, grantedByUserId);

    await this.writeAuditLog({
      actorId: grantedByUserId,
      action: 'admin.user_client_scopes.update',
      targetType: 'user',
      targetId: userId,
      ipAddress: actorIp,
      metadataJson: {
        email: user.email,
        client_ids: dto.client_ids,
      },
    });

    return {
      user_id: userId,
      client_ids: dto.client_ids,
    };
  }

  private async resolveUserClientBinding(
    role: string,
    input: { clientId?: string; clientIds?: string[] },
  ): Promise<{ boundClientId: string | null; scopeClientIds: string[] }> {
    if (role === CLIENT_ROLE) {
      const boundId = input.clientId ?? input.clientIds?.[0];
      if (!boundId) {
        throw new BadRequestException('client_id is required for client role');
      }

      if (input.clientIds && input.clientIds.length > 1) {
        throw new BadRequestException('client role accepts exactly one client');
      }

      if (
        input.clientId &&
        input.clientIds &&
        input.clientIds.length > 0 &&
        input.clientId !== input.clientIds[0]
      ) {
        throw new BadRequestException('client_id and client_ids conflict for client role');
      }

      const client = await this.prisma.client.findFirst({
        where: {
          id: boundId,
          status: EntityStatus.active,
        },
        select: {
          id: true,
        },
      });
      if (!client) {
        throw new BadRequestException('client_id is invalid or inactive');
      }

      return {
        boundClientId: boundId,
        scopeClientIds: [boundId],
      };
    }

    if (role === SUPERADMIN_ROLE) {
      return {
        boundClientId: null,
        scopeClientIds: input.clientIds ?? [],
      };
    }

    return {
      boundClientId: null,
      scopeClientIds: input.clientIds ?? [],
    };
  }

  private async replaceUserClientScopes(
    userId: string,
    clientIds: string[],
    grantedByUserId?: string,
  ): Promise<void> {
    if (clientIds.length > 0) {
      const clients = await this.prisma.client.findMany({
        where: {
          id: {
            in: clientIds,
          },
          status: EntityStatus.active,
        },
        select: {
          id: true,
        },
      });
      if (clients.length !== clientIds.length) {
        throw new BadRequestException('one or more client_ids are invalid or inactive');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userClientScope.deleteMany({
        where: { userId },
      });

      if (clientIds.length > 0) {
        await tx.userClientScope.createMany({
          data: clientIds.map((clientId) => ({
            userId,
            clientId,
            grantedByUserId: grantedByUserId ?? null,
          })),
        });
      }
    });
  }

  async listAuditLogs(
    scopeActor: AccessActor,
    query: ListAuditLogsQueryDto,
  ): Promise<{
    generated_at: string;
    items: Array<{
      id: string;
      actor_type: string;
      actor_id: string | null;
      actor_role: string | null;
      actor_email: string | null;
      action: string;
      target_type: string;
      target_id: string | null;
      target_display_name: string | null;
      client_id: string | null;
      result: string;
      ip_address: string | null;
      metadata_json: Prisma.JsonValue | null;
      created_at: string;
    }>;
  }> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const where: Prisma.AuditLogWhereInput = {};

    if (query.action) {
      where.action = {
        startsWith: query.action,
      };
    }

    if (query.target_type) {
      where.targetType = {
        equals: query.target_type,
      };
    }

    if (query.target_id) {
      where.targetId = {
        equals: query.target_id,
      };
    }

    if (query.result) {
      where.result = {
        equals: query.result,
      };
    }

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt.gte = new Date(query.from);
      }
      if (query.to) {
        const toDate = new Date(query.to);
        if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) {
          toDate.setHours(23, 59, 59, 999);
        }
        where.createdAt.lte = toDate;
      }
    }

    if (query.actor_email?.trim()) {
      const matchingUsers = await this.prisma.user.findMany({
        where: {
          email: {
            contains: query.actor_email.trim(),
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
        },
        take: 50,
      });

      const actorIds = matchingUsers.map((user) => user.id);
      if (actorIds.length === 0) {
        return {
          generated_at: new Date().toISOString(),
          items: [],
        };
      }

      where.actorId = {
        in: actorIds,
      };
    }

    const allowedClientIds = await this.accessPolicy.getAllowedClientIds(scopeActor);
    const requiresScopeFilter = allowedClientIds !== null;

    if (!requiresScopeFilter) {
      const logs = await this.prisma.auditLog.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip: offset,
      });

      return {
        generated_at: new Date().toISOString(),
        items: await this.buildAuditLogItems(logs),
      };
    }

    const batchSize = Math.max(limit * 4, 50);
    const scopedItems: Awaited<ReturnType<AdminService['buildAuditLogItems']>> = [];
    let dbSkip = 0;
    let skipped = 0;

    while (scopedItems.length < limit) {
      const logs = await this.prisma.auditLog.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: batchSize,
        skip: dbSkip,
      });

      if (logs.length === 0) {
        break;
      }

      dbSkip += logs.length;
      const items = await this.buildAuditLogItems(logs);
      const nodeClientById = await this.buildNodeClientMap(
        items
          .filter((item) => item.target_type === 'node' && item.target_id)
          .map((item) => item.target_id as string),
      );
      const filteredItems = await this.filterAuditItemsForScope(
        scopeActor,
        items,
        nodeClientById,
      );

      for (const item of filteredItems) {
        if (skipped < offset) {
          skipped += 1;
          continue;
        }

        scopedItems.push(item);
        if (scopedItems.length >= limit) {
          break;
        }
      }

      if (logs.length < batchSize) {
        break;
      }
    }

    return {
      generated_at: new Date().toISOString(),
      items: scopedItems,
    };
  }

  private async buildNodeClientMap(nodeIds: string[]): Promise<Map<string, string>> {
    if (nodeIds.length === 0) {
      return new Map();
    }

    const uniqueNodeIds = Array.from(new Set(nodeIds));
    const nodes = await this.prisma.node.findMany({
      where: {
        id: {
          in: uniqueNodeIds,
        },
      },
      select: {
        id: true,
        site: {
          select: {
            clientId: true,
          },
        },
      },
    });

    return new Map(nodes.map((node) => [node.id, node.site.clientId]));
  }

  private async buildAuditLogItems(
    logs: Array<{
      id: string;
      actorType: string;
      actorId: string | null;
      actorRole: string | null;
      action: string;
      targetType: string;
      targetId: string | null;
      clientId: string | null;
      result: string;
      ipAddress: string | null;
      metadataJson: Prisma.JsonValue | null;
      createdAt: Date;
    }>,
  ): Promise<
    Array<{
      id: string;
      actor_type: string;
      actor_id: string | null;
      actor_role: string | null;
      actor_email: string | null;
      action: string;
      target_type: string;
      target_id: string | null;
      target_display_name: string | null;
      client_id: string | null;
      result: string;
      ip_address: string | null;
      metadata_json: Prisma.JsonValue | null;
      created_at: string;
    }>
  > {
    if (logs.length === 0) {
      return [];
    }

    const actorIds = Array.from(
      new Set(logs.map((log) => log.actorId).filter((value): value is string => Boolean(value))),
    );

    const nodeIds = Array.from(
      new Set(
        logs
          .filter((l) => l.targetType === 'node' && l.targetId != null)
          .map((l) => l.targetId as string),
      ),
    );
    const clientIds = Array.from(
      new Set(
        logs
          .filter((l) => l.targetType === 'client' && l.targetId != null)
          .map((l) => l.targetId as string),
      ),
    );
    const targetUserIds = Array.from(
      new Set(
        logs
          .filter((l) => l.targetType === 'user' && l.targetId != null)
          .map((l) => l.targetId as string),
      ),
    );
    const allUserIds = Array.from(new Set([...actorIds, ...targetUserIds]));

    const [users, nodes, clients] = await Promise.all([
      allUserIds.length > 0
        ? this.prisma.user.findMany({
            where: { id: { in: allUserIds } },
            select: { id: true, email: true },
          })
        : [],
      nodeIds.length > 0
        ? this.prisma.node.findMany({
            where: { id: { in: nodeIds } },
            select: { id: true, displayName: true, hostname: true },
          })
        : [],
      clientIds.length > 0
        ? this.prisma.client.findMany({
            where: { id: { in: clientIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);

    const actorEmailById = new Map(users.map((u) => [u.id, u.email]));
    const nodeDisplayById = new Map(
      nodes.map((n) => [n.id, n.displayName?.trim() || n.hostname]),
    );
    const clientDisplayById = new Map(clients.map((c) => [c.id, c.name]));

    const getTargetDisplayName = (targetType: string, targetId: string | null): string | null => {
      if (!targetId) return null;
      if (targetType === 'node') return nodeDisplayById.get(targetId) ?? null;
      if (targetType === 'client') return clientDisplayById.get(targetId) ?? null;
      if (targetType === 'user') return actorEmailById.get(targetId) ?? null;
      return null;
    };

    return logs.map((log) => ({
      id: log.id,
      actor_type: log.actorType,
      actor_id: log.actorId,
      actor_role: log.actorRole,
      actor_email: log.actorId ? actorEmailById.get(log.actorId) ?? null : null,
      action: log.action,
      target_type: log.targetType,
      target_id: log.targetId,
      target_display_name: getTargetDisplayName(log.targetType, log.targetId),
      client_id: log.clientId,
      result: log.result,
      ip_address: log.ipAddress,
      metadata_json: log.metadataJson,
      created_at: log.createdAt.toISOString(),
    }));
  }

  private async filterAuditItemsForScope<
    T extends {
      actor_id: string | null;
      action: string;
      target_type: string;
      target_id: string | null;
      client_id: string | null;
      metadata_json: Prisma.JsonValue | null;
    },
  >(
    actor: AccessActor,
    items: T[],
    nodeClientById: Map<string, string>,
  ): Promise<T[]> {
    const allowedClientIds = await this.accessPolicy.getAllowedClientIds(actor);
    if (allowedClientIds === null) {
      return items;
    }

    const allowedSet = new Set(allowedClientIds);

    return items.filter((item) => {
      if (item.actor_id === actor.userId && item.action.startsWith('auth.')) {
        return true;
      }

      if (item.client_id && allowedSet.has(item.client_id)) {
        return true;
      }

      if (item.target_type === 'client' && item.target_id) {
        return allowedSet.has(item.target_id);
      }

      if (item.target_type === 'node' && item.target_id) {
        const clientId = nodeClientById.get(item.target_id);
        return clientId ? allowedSet.has(clientId) : false;
      }

      const metadata = item.metadata_json;
      if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
        const record = metadata as Record<string, unknown>;
        if (typeof record.client_id === 'string' && allowedSet.has(record.client_id)) {
          return true;
        }
        if (typeof record.node_id === 'string') {
          const clientId = nodeClientById.get(record.node_id);
          if (clientId && allowedSet.has(clientId)) {
            return true;
          }
        }
      }

      return false;
    });
  }

  async createUser(dto: CreateUserDto, actorId?: string, actorIp?: string): Promise<{
    user: {
      id: string;
      email: string;
      display_name: string | null;
      role: string;
      status: EntityStatus;
      created_at: string;
    };
  }> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });
    if (existing) {
      throw new ConflictException('user email already exists');
    }

    const role = dto.role ?? DEFAULT_USER_ROLE;
    await this.assertAssignableRole(role);
    const binding = await this.resolveUserClientBinding(role, {
      clientId: dto.client_id,
      clientIds: dto.client_ids,
    });

    const user = await this.prisma.user.create({
      data: {
        email,
        displayName: normalizeOptional(dto.display_name),
        passwordHash: await this.authService.createUserPasswordHash(dto.password),
        role,
        status: dto.status ?? EntityStatus.active,
        clientId: binding.boundClientId,
      },
    });

    if (user.role !== SUPERADMIN_ROLE && binding.scopeClientIds.length > 0) {
      await this.replaceUserClientScopes(user.id, binding.scopeClientIds, actorId);
    }

    await this.writeAuditLog({
      actorId,
      action: 'admin.user.create',
      targetType: 'user',
      targetId: user.id,
      ipAddress: actorIp,
      metadataJson: {
        email: user.email,
        role: user.role,
        status: user.status,
        client_id: user.clientId,
        client_ids: binding.scopeClientIds,
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        display_name: user.displayName,
        role: user.role,
        status: user.status,
        created_at: user.createdAt.toISOString(),
      },
    };
  }

  async updateUser(
    userId: string,
    dto: UpdateUserDto,
    actorId?: string,
    actorIp?: string,
  ): Promise<{
    user: {
      id: string;
      email: string;
      display_name: string | null;
      role: string;
      status: EntityStatus;
      updated_at: string;
    };
  }> {
    const existing = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });
    if (!existing) {
      throw new NotFoundException('user not found');
    }

    const nextRole = dto.role ?? existing.role;
    if (dto.role) {
      await this.assertAssignableRole(nextRole);
    }
    const nextStatus = dto.status ?? existing.status;
    const willRemainActiveSuperadmin =
      nextRole === SUPERADMIN_ROLE && nextStatus === EntityStatus.active;

    if (actorId && actorId === userId && !willRemainActiveSuperadmin) {
      throw new ForbiddenException(
        'current session cannot remove its own active superadmin access',
      );
    }

    if (
      existing.role === SUPERADMIN_ROLE &&
      existing.status === EntityStatus.active &&
      !willRemainActiveSuperadmin
    ) {
      const activeSuperadminCount = await this.prisma.user.count({
        where: {
          role: SUPERADMIN_ROLE,
          status: EntityStatus.active,
        },
      });

      if (activeSuperadminCount <= 1) {
        throw new ForbiddenException('cannot remove the last active superadmin');
      }
    }

    const nextEmail = dto.email?.trim().toLowerCase();
    if (nextEmail && nextEmail !== existing.email) {
      const emailInUse = await this.prisma.user.findUnique({
        where: {
          email: nextEmail,
        },
        select: {
          id: true,
        },
      });
      if (emailInUse) {
        throw new ConflictException('user email already exists');
      }
    }

    let binding: { boundClientId: string | null; scopeClientIds: string[] } | null = null;
    if (nextRole === CLIENT_ROLE) {
      binding = await this.resolveUserClientBinding(nextRole, {
        clientId: dto.client_id ?? existing.clientId ?? undefined,
        clientIds: dto.client_ids,
      });
    } else if (dto.client_id !== undefined || dto.client_ids !== undefined) {
      binding = await this.resolveUserClientBinding(nextRole, {
        clientId: dto.client_id ?? undefined,
        clientIds: dto.client_ids,
      });
    }

    const updatedUser = await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        email: nextEmail,
        displayName:
          dto.display_name !== undefined ? normalizeOptional(dto.display_name) : undefined,
        passwordHash:
          dto.password !== undefined
            ? await this.authService.createUserPasswordHash(dto.password)
            : undefined,
        role: dto.role,
        status: dto.status,
        clientId:
          nextRole === CLIENT_ROLE
            ? binding?.boundClientId ?? existing.clientId
            : null,
      },
    });

    if (existing.status !== EntityStatus.inactive && updatedUser.status === EntityStatus.inactive) {
      await this.prisma.userSession.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    if (updatedUser.role === SUPERADMIN_ROLE) {
      await this.prisma.userClientScope.deleteMany({
        where: { userId },
      });
    } else if (binding) {
      await this.replaceUserClientScopes(userId, binding.scopeClientIds, actorId);
    } else if (dto.client_ids !== undefined) {
      await this.replaceUserClientScopes(userId, dto.client_ids, actorId);
    }

    await this.writeAuditLog({
      actorId,
      action: 'admin.user.update',
      targetType: 'user',
      targetId: updatedUser.id,
      ipAddress: actorIp,
      metadataJson: {
        email: updatedUser.email,
        display_name: updatedUser.displayName,
        role: updatedUser.role,
        status: updatedUser.status,
        password_rotated: dto.password !== undefined,
        client_id: updatedUser.clientId,
        client_ids: binding?.scopeClientIds ?? dto.client_ids,
      },
    });

    return {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        display_name: updatedUser.displayName,
        role: updatedUser.role,
        status: updatedUser.status,
        updated_at: updatedUser.updatedAt.toISOString(),
      },
    };
  }

  async deleteUser(
    userId: string,
    actorId?: string,
    actorIp?: string,
  ): Promise<{ ok: true; user_id: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, status: true },
    });
    if (!user) {
      throw new NotFoundException('user not found');
    }
    if (actorId && actorId === userId) {
      throw new ForbiddenException('cannot delete your own user');
    }
    if (user.role === SUPERADMIN_ROLE && user.status === EntityStatus.active) {
      const activeSuperadminCount = await this.prisma.user.count({
        where: {
          role: SUPERADMIN_ROLE,
          status: EntityStatus.active,
        },
      });
      if (activeSuperadminCount <= 1) {
        throw new ForbiddenException('cannot delete the last active superadmin');
      }
    }
    await this.writeAuditLog({
      actorId,
      action: 'admin.user.delete',
      targetType: 'user',
      targetId: userId,
      ipAddress: actorIp,
      metadataJson: { email: user.email } as Prisma.JsonObject,
    });
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.user.delete({
      where: { id: userId },
    });
    return { ok: true, user_id: userId };
  }

  async listUserSessions(
    userId: string,
    options: {
      actorSessionId: string;
    },
  ): Promise<{
    items: Array<{
      id: string;
      user_id: string;
      current: boolean;
      created_at: string;
      last_seen_at: string | null;
      expires_at: string;
      revoked_at: string | null;
      ip_address: string | null;
      user_agent: string | null;
    }>;
  }> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
      },
    });
    if (!user) {
      throw new NotFoundException('user not found');
    }

    const sessions = await this.prisma.userSession.findMany({
      where: {
        userId,
      },
      orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
    });

    return {
      items: sessions.map((session) => ({
        id: session.id,
        user_id: session.userId,
        current: session.id === options.actorSessionId,
        created_at: session.createdAt.toISOString(),
        last_seen_at: session.lastSeenAt?.toISOString() ?? null,
        expires_at: session.expiresAt.toISOString(),
        revoked_at: session.revokedAt?.toISOString() ?? null,
        ip_address: session.ipAddress,
        user_agent: session.userAgent,
      })),
    };
  }

  async revokeUserSession(
    userId: string,
    sessionId: string,
    actor: {
      actorId: string;
      actorSessionId: string;
      ipAddress?: string;
    },
  ): Promise<{
    ok: true;
    session_id: string;
    revoked_at: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
      },
    });
    if (!user) {
      throw new NotFoundException('user not found');
    }

    if (sessionId === actor.actorSessionId) {
      throw new ForbiddenException('current session must use logout');
    }

    const session = await this.prisma.userSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
    });

    if (!session) {
      throw new NotFoundException('session not found');
    }

    if (session.revokedAt) {
      return {
        ok: true,
        session_id: session.id,
        revoked_at: session.revokedAt.toISOString(),
      };
    }

    const revokedAt = new Date();

    await this.prisma.userSession.update({
      where: {
        id: session.id,
      },
      data: {
        revokedAt,
      },
    });

    await this.writeAuditLog({
      actorId: actor.actorId,
      action: 'admin.user_session.revoke',
      targetType: 'user_session',
      targetId: session.id,
      ipAddress: actor.ipAddress,
      metadataJson: {
        user_id: user.id,
        user_email: user.email,
        session_id: session.id,
      },
    });

    return {
      ok: true,
      session_id: session.id,
      revoked_at: revokedAt.toISOString(),
    };
  }

  async createClient(dto: CreateClientDto, actorId?: string, actorIp?: string): Promise<{
    client: {
      id: string;
      name: string;
      code: string;
      status: EntityStatus;
      created_at: string;
    };
  }> {
    const client = await this.prisma.client.create({
      data: {
        name: dto.name.trim(),
        code: await this.buildUniqueClientCode(dto.code?.trim() || dto.name.trim()),
        status: dto.status === 'inactive' ? EntityStatus.inactive : EntityStatus.active,
      },
    });

    await this.writeAuditLog({
      actorId,
      action: 'admin.client.create',
      targetType: 'client',
      targetId: client.id,
      ipAddress: actorIp,
      metadataJson: {
        code: client.code,
      },
    });
    this.invalidateNodesFiltersCache();

    return {
      client: {
        id: client.id,
        name: client.name,
        code: client.code,
        status: client.status,
        created_at: client.createdAt.toISOString(),
      },
    };
  }

  async createSite(
    dto: CreateSiteDto,
    actorId?: string,
    actorIp?: string,
    scopeActor?: AccessActor,
  ): Promise<{
    site: {
      id: string;
      client_id: string;
      name: string;
      code: string;
      status: EntityStatus;
      created_at: string;
    };
  }> {
    const client = await this.prisma.client.findUnique({
      where: {
        id: dto.client_id,
      },
      select: {
        id: true,
      },
    });
    if (!client) {
      throw new NotFoundException('client not found');
    }

    await this.withClientScope(scopeActor, dto.client_id);

    const site = await this.prisma.site.create({
      data: {
        clientId: dto.client_id,
        name: dto.name.trim(),
        code: await this.buildUniqueSiteCode(dto.client_id, dto.code?.trim() || dto.name.trim()),
        city: normalizeOptional(dto.city),
        state: normalizeOptional(dto.state),
        timezone: normalizeOptional(dto.timezone),
        status: dto.status === 'inactive' ? EntityStatus.inactive : EntityStatus.active,
      },
    });

    await this.writeAuditLog({
      actorId,
      action: 'admin.site.create',
      targetType: 'site',
      targetId: site.id,
      ipAddress: actorIp,
      metadataJson: {
        client_id: site.clientId,
        code: site.code,
      },
    });
    this.invalidateNodesFiltersCache();

    return {
      site: {
        id: site.id,
        client_id: site.clientId,
        name: site.name,
        code: site.code,
        status: site.status,
        created_at: site.createdAt.toISOString(),
      },
    };
  }

  async updateClient(
    clientId: string,
    dto: UpdateClientDto,
    actorId?: string,
    actorIp?: string,
    scopeActor?: AccessActor,
  ): Promise<{
    client: {
      id: string;
      name: string;
      code: string;
      status: EntityStatus;
      updated_at: string;
    };
  }> {
    const existing = await this.prisma.client.findUnique({
      where: {
        id: clientId,
      },
      select: {
        id: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('client not found');
    }

    await this.withClientScope(scopeActor, clientId);

    const client = await this.prisma.client.update({
      where: {
        id: clientId,
      },
      data: {
        name: dto.name?.trim() || undefined,
        code: dto.code ? normalizeCode(dto.code) : undefined,
        status:
          dto.status === undefined
            ? undefined
            : dto.status === 'inactive'
              ? EntityStatus.inactive
              : EntityStatus.active,
      },
    });

    await this.writeAuditLog({
      actorId,
      action: 'admin.client.update',
      targetType: 'client',
      targetId: client.id,
      ipAddress: actorIp,
      metadataJson: {
        name: client.name,
        code: client.code,
        status: client.status,
      },
    });
    this.invalidateNodesFiltersCache();

    return {
      client: {
        id: client.id,
        name: client.name,
        code: client.code,
        status: client.status,
        updated_at: client.updatedAt.toISOString(),
      },
    };
  }

  async deleteClient(
    clientId: string,
    actorId?: string,
    actorIp?: string,
    scopeActor?: AccessActor,
  ): Promise<{ ok: true; client_id: string }> {
    await this.withClientScope(scopeActor, clientId);

    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        name: true,
        code: true,
        sites: {
          select: {
            _count: { select: { nodes: true } },
          },
        },
      },
    });
    if (!client) {
      throw new NotFoundException('client not found');
    }
    const nodeCount = client.sites.reduce(
      (sum, site) => sum + site._count.nodes,
      0,
    );
    if (nodeCount > 0) {
      throw new ConflictException(
        `Cliente possui ${nodeCount} firewall(s) vinculado(s). Remova os firewalls antes de excluir o cliente.`,
      );
    }
    await this.writeAuditLog({
      actorId,
      action: 'admin.client.delete',
      targetType: 'client',
      targetId: clientId,
      ipAddress: actorIp,
      metadataJson: {
        name: client.name,
        code: client.code,
      } as Prisma.JsonObject,
    });
    await this.prisma.client.delete({
      where: { id: clientId },
    });
    this.invalidateNodesFiltersCache();
    return { ok: true, client_id: clientId };
  }

  async updateSite(
    siteId: string,
    dto: UpdateSiteDto,
    actorId?: string,
    actorIp?: string,
    scopeActor?: AccessActor,
  ): Promise<{
    site: {
      id: string;
      client_id: string;
      name: string;
      code: string;
      city: string | null;
      state: string | null;
      timezone: string | null;
      status: EntityStatus;
      updated_at: string;
    };
  }> {
    const existing = await this.prisma.site.findUnique({
      where: {
        id: siteId,
      },
      select: {
        id: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('site not found');
    }

    await this.withSiteScope(scopeActor, siteId);

    const site = await this.prisma.site.update({
      where: {
        id: siteId,
      },
      data: {
        name: dto.name?.trim() || undefined,
        code: dto.code ? normalizeCode(dto.code) : undefined,
        city: dto.city !== undefined ? normalizeOptional(dto.city) : undefined,
        state: dto.state !== undefined ? normalizeOptional(dto.state) : undefined,
        timezone:
          dto.timezone !== undefined ? normalizeOptional(dto.timezone) : undefined,
        status:
          dto.status === undefined
            ? undefined
            : dto.status === 'inactive'
              ? EntityStatus.inactive
              : EntityStatus.active,
      },
    });

    await this.writeAuditLog({
      actorId,
      action: 'admin.site.update',
      targetType: 'site',
      targetId: site.id,
      ipAddress: actorIp,
      metadataJson: {
        client_id: site.clientId,
        name: site.name,
        code: site.code,
        city: site.city,
        state: site.state,
        timezone: site.timezone,
        status: site.status,
      },
    });
    this.invalidateNodesFiltersCache();

    return {
      site: {
        id: site.id,
        client_id: site.clientId,
        name: site.name,
        code: site.code,
        city: site.city,
        state: site.state,
        timezone: site.timezone,
        status: site.status,
        updated_at: site.updatedAt.toISOString(),
      },
    };
  }

  async createNode(
    dto: CreateNodeDto,
    actorId?: string,
    actorIp?: string,
    scopeActor?: AccessActor,
  ): Promise<{
    node: {
      id: string;
      site_id: string;
      node_uid: string;
      hostname: string;
      display_name: string | null;
      status: NodeStatus;
      node_uid_status: NodeUidStatus;
      created_at: string;
    };
    bootstrap: {
      node_secret: string;
      secret_hint: string;
    };
  }> {
    const hasSiteId = Boolean(dto.site_id?.trim());
    const hasClientId = Boolean(dto.client_id?.trim());
    if (hasSiteId === hasClientId) {
      throw new BadRequestException(
        'Provide exactly one of site_id or client_id to create the firewall.',
      );
    }

    let siteId: string;
    if (hasSiteId) {
      await this.withSiteScope(scopeActor, dto.site_id!);
      const site = await this.prisma.site.findUnique({
        where: { id: dto.site_id! },
        select: { id: true },
      });
      if (!site) {
        throw new NotFoundException('site not found');
      }
      siteId = site.id;
    } else {
      const clientId = dto.client_id!;
      await this.withClientScope(scopeActor, clientId);
      const client = await this.prisma.client.findUnique({
        where: { id: clientId },
        select: { id: true, sites: { select: { id: true } } },
      });
      if (!client) {
        throw new NotFoundException('client not found');
      }
      const siteCount = client.sites.length;
      if (siteCount === 0) {
        const defaultSite = await this.prisma.site.create({
          data: {
            clientId: client.id,
            name: 'Principal',
            code: await this.buildUniqueSiteCode(client.id, 'default'),
            status: EntityStatus.active,
          },
        });
        siteId = defaultSite.id;
      } else {
        // 1+ sites: use first site so UX never needs to expose "site" to the operator
        siteId = client.sites[0].id;
      }
    }

    const hostnameRaw = dto.hostname?.trim();
    const generatedId =
      hostnameRaw ||
      `fw-${Math.random().toString(36).slice(2, 10)}`;
    const nodeUid = await this.buildUniqueNodeUid(
      dto.node_uid?.trim() || generatedId || dto.display_name?.trim() || 'firewall',
    );
    const hostname = hostnameRaw || nodeUid;

    const bootstrapSecret = this.generateNodeSecret();
    const secretHint = this.buildSecretHint(bootstrapSecret);
    const secretHash = this.hashSecret(bootstrapSecret);
    const secretEncrypted = this.nodeSecretCrypto.encrypt(bootstrapSecret);

    const node = await this.prisma.$transaction(async (tx) => {
      const createdNode = await tx.node.create({
        data: {
          siteId,
          nodeUid,
          hostname,
          displayName: normalizeOptional(dto.display_name),
          managementIp: normalizeOptional(dto.management_ip),
          wanIp: normalizeOptional(dto.wan_ip),
          haRole: normalizeOptional(dto.ha_role),
          maintenanceMode: dto.maintenance_mode ?? false,
          status: NodeStatus.unknown,
          nodeUidStatus: NodeUidStatus.active,
        },
      });

      await tx.nodeCredential.create({
        data: {
          nodeId: createdNode.id,
          secretHint,
          secretHash,
          secretEncrypted,
          status: NodeCredentialStatus.active,
        },
      });

      return createdNode;
    });

    await this.writeAuditLog({
      actorId,
      action: 'admin.node.create',
      targetType: 'node',
      targetId: node.id,
      ipAddress: actorIp,
      metadataJson: {
        node_uid: node.nodeUid,
        site_id: node.siteId,
      },
    });
    this.invalidateNodesFiltersCache();

    return {
      node: {
        id: node.id,
        site_id: node.siteId,
        node_uid: node.nodeUid,
        hostname: node.hostname,
        display_name: node.displayName,
        status: node.status,
        node_uid_status: node.nodeUidStatus,
        created_at: node.createdAt.toISOString(),
      },
      bootstrap: {
        node_secret: bootstrapSecret,
        secret_hint: secretHint,
      },
    };
  }

  async rotateNodeSecret(
    nodeId: string,
    actorId?: string,
    actorIp?: string,
    scopeActor?: AccessActor,
  ): Promise<{
    node_id: string;
    bootstrap: {
      node_secret: string;
      secret_hint: string;
      rotated_at: string;
    };
  }> {
    await this.withNodeScope(scopeActor, nodeId);

    const node = await this.prisma.node.findUnique({
      where: {
        id: nodeId,
      },
      select: {
        id: true,
      },
    });
    if (!node) {
      throw new NotFoundException('node not found');
    }

    const bootstrapSecret = this.generateNodeSecret();
    const secretHint = this.buildSecretHint(bootstrapSecret);
    const secretHash = this.hashSecret(bootstrapSecret);
    const secretEncrypted = this.nodeSecretCrypto.encrypt(bootstrapSecret);
    const rotatedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.nodeCredential.updateMany({
        where: {
          nodeId,
          status: NodeCredentialStatus.active,
        },
        data: {
          status: NodeCredentialStatus.rotated,
          rotatedAt,
        },
      });

      await tx.nodeCredential.create({
        data: {
          nodeId,
          secretHint,
          secretHash,
          secretEncrypted,
          status: NodeCredentialStatus.active,
        },
      });
    });

    await this.writeAuditLog({
      actorId,
      action: 'admin.node.rekey',
      targetType: 'node',
      targetId: nodeId,
      ipAddress: actorIp,
      metadataJson: {
        secret_hint: secretHint,
      },
    });

    return {
      node_id: nodeId,
      bootstrap: {
        node_secret: bootstrapSecret,
        secret_hint: secretHint,
        rotated_at: rotatedAt.toISOString(),
      },
    };
  }

  async updateNode(
    nodeId: string,
    dto: UpdateNodeDto,
    actorId?: string,
    actorIp?: string,
    scopeActor?: AccessActor,
  ): Promise<{
    node: {
      id: string;
      hostname: string;
      display_name: string | null;
      management_ip: string | null;
      wan_ip: string | null;
      pfsense_version: string | null;
      agent_version: string | null;
      ha_role: string | null;
      updated_at: string;
    };
  }> {
    await this.withNodeScope(scopeActor, nodeId);

    const node = await this.prisma.node.findUnique({
      where: {
        id: nodeId,
      },
      select: {
        id: true,
      },
    });
    if (!node) {
      throw new NotFoundException('node not found');
    }

    const updatedNode = await this.prisma.node.update({
      where: {
        id: nodeId,
      },
      data: {
        hostname: dto.hostname?.trim() || undefined,
        displayName:
          dto.display_name !== undefined
            ? normalizeOptional(dto.display_name)
            : undefined,
        managementIp:
          dto.management_ip !== undefined
            ? normalizeOptional(dto.management_ip)
            : undefined,
        wanIp:
          dto.wan_ip !== undefined ? normalizeOptional(dto.wan_ip) : undefined,
        haRole:
          dto.ha_role !== undefined ? normalizeOptional(dto.ha_role) : undefined,
      },
    });

    await this.writeAuditLog({
      actorId,
      action: 'admin.node.update',
      targetType: 'node',
      targetId: nodeId,
      ipAddress: actorIp,
      metadataJson: {
        hostname: updatedNode.hostname,
        display_name: updatedNode.displayName,
        management_ip: updatedNode.managementIp,
        wan_ip: updatedNode.wanIp,
        pfsense_version: updatedNode.pfsenseVersion,
        agent_version: updatedNode.agentVersion,
        ha_role: updatedNode.haRole,
      },
    });

    return {
      node: {
        id: updatedNode.id,
        hostname: updatedNode.hostname,
        display_name: updatedNode.displayName,
        management_ip: updatedNode.managementIp,
        wan_ip: updatedNode.wanIp,
        pfsense_version: updatedNode.pfsenseVersion,
        agent_version: updatedNode.agentVersion,
        ha_role: updatedNode.haRole,
        updated_at: updatedNode.updatedAt.toISOString(),
      },
    };
  }

  async setNodeMaintenance(
    nodeId: string,
    maintenanceMode: boolean,
    actorId?: string,
    actorIp?: string,
    scopeActor?: AccessActor,
  ): Promise<{
    node_id: string;
    maintenance_mode: boolean;
    updated_at: string;
  }> {
    await this.withNodeScope(scopeActor, nodeId);

    const node = await this.prisma.node.findUnique({
      where: {
        id: nodeId,
      },
      select: {
        id: true,
        maintenanceMode: true,
      },
    });
    if (!node) {
      throw new NotFoundException('node not found');
    }

    const updatedNode = await this.prisma.node.update({
      where: {
        id: nodeId,
      },
      data: {
        maintenanceMode,
      },
      select: {
        id: true,
        maintenanceMode: true,
        updatedAt: true,
      },
    });

    if (node.maintenanceMode !== maintenanceMode) {
      await this.writeAuditLog({
        actorId,
        action: maintenanceMode
          ? 'admin.node.maintenance.enable'
          : 'admin.node.maintenance.disable',
        targetType: 'node',
        targetId: nodeId,
        ipAddress: actorIp,
        metadataJson: {
          maintenance_mode: maintenanceMode,
        } as Prisma.JsonObject,
      });
    }

    return {
      node_id: updatedNode.id,
      maintenance_mode: updatedNode.maintenanceMode,
      updated_at: updatedNode.updatedAt.toISOString(),
    };
  }

  async listAgentTokens(nodeId: string, scopeActor?: AccessActor): Promise<{
    items: Array<{
      id: string;
      node_id: string;
      token_hint: string;
      status: AgentTokenStatus;
      expires_at: string | null;
      last_used_at: string | null;
      created_at: string;
      revoked_at: string | null;
    }>;
  }> {
    await this.withNodeScope(scopeActor, nodeId);

    const node = await this.prisma.node.findUnique({
      where: {
        id: nodeId,
      },
      select: {
        id: true,
      },
    });
    if (!node) {
      throw new NotFoundException('node not found');
    }

    const tokens = await this.prisma.agentToken.findMany({
      where: {
        nodeId,
      },
      orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
    });

    return {
      items: tokens.map((token) => ({
        id: token.id,
        node_id: token.nodeId,
        token_hint: token.tokenHint,
        status: token.status,
        expires_at: token.expiresAt?.toISOString() ?? null,
        last_used_at: token.lastUsedAt?.toISOString() ?? null,
        created_at: token.createdAt.toISOString(),
        revoked_at: token.revokedAt?.toISOString() ?? null,
      })),
    };
  }

  async createAgentToken(
    nodeId: string,
    dto: CreateAgentTokenDto,
    actorId?: string,
    actorIp?: string,
    scopeActor?: AccessActor,
  ): Promise<{
    node_id: string;
    token: {
      id: string;
      agent_token: string;
      token_hint: string;
      status: AgentTokenStatus;
      expires_at: string | null;
      created_at: string;
    };
  }> {
    await this.withNodeScope(scopeActor, nodeId);

    const node = await this.prisma.node.findUnique({
      where: {
        id: nodeId,
      },
      select: {
        id: true,
        nodeUid: true,
      },
    });
    if (!node) {
      throw new NotFoundException('node not found');
    }

    const rawToken = this.generateNodeSecret();
    const tokenHint = this.buildSecretHint(rawToken);
    const tokenHash = this.hashSecret(rawToken);
    const expiresAt = dto.expires_at ? new Date(dto.expires_at) : null;

    const token = await this.prisma.agentToken.create({
      data: {
        nodeId,
        tokenHint,
        tokenHash,
        status: AgentTokenStatus.active,
        expiresAt,
      },
    });

    await this.writeAuditLog({
      actorId,
      action: 'admin.agent_token.create',
      targetType: 'agent_token',
      targetId: token.id,
      ipAddress: actorIp,
      metadataJson: {
        node_id: node.id,
        node_uid: node.nodeUid,
        token_hint: token.tokenHint,
        expires_at: token.expiresAt?.toISOString() ?? null,
      },
    });

    return {
      node_id: nodeId,
      token: {
        id: token.id,
        agent_token: rawToken,
        token_hint: token.tokenHint,
        status: token.status,
        expires_at: token.expiresAt?.toISOString() ?? null,
        created_at: token.createdAt.toISOString(),
      },
    };
  }

  async revokeAgentToken(
    nodeId: string,
    tokenId: string,
    actorId?: string,
    actorIp?: string,
    scopeActor?: AccessActor,
  ): Promise<{
    ok: true;
    node_id: string;
    token_id: string;
    revoked_at: string;
  }> {
    await this.withNodeScope(scopeActor, nodeId);

    const token = await this.prisma.agentToken.findFirst({
      where: {
        id: tokenId,
        nodeId,
      },
    });
    if (!token) {
      throw new NotFoundException('agent token not found');
    }

    if (token.revokedAt) {
      return {
        ok: true,
        node_id: nodeId,
        token_id: token.id,
        revoked_at: token.revokedAt.toISOString(),
      };
    }

    const revokedAt = new Date();
    await this.prisma.agentToken.update({
      where: {
        id: token.id,
      },
      data: {
        status: AgentTokenStatus.revoked,
        revokedAt,
      },
    });

    await this.writeAuditLog({
      actorId,
      action: 'admin.agent_token.revoke',
      targetType: 'agent_token',
      targetId: token.id,
      ipAddress: actorIp,
      metadataJson: {
        node_id: nodeId,
        token_hint: token.tokenHint,
      },
    });

    return {
      ok: true,
      node_id: nodeId,
      token_id: token.id,
      revoked_at: revokedAt.toISOString(),
    };
  }

  async deleteNode(
    nodeId: string,
    actorId?: string,
    actorIp?: string,
    scopeActor?: AccessActor,
  ): Promise<{
    ok: true;
    node_id: string;
    node_uid: string;
    deleted_at: string;
  }> {
    await this.withNodeScope(scopeActor, nodeId);

    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        id: true,
        nodeUid: true,
        hostname: true,
        displayName: true,
      },
    });
    if (!node) {
      throw new NotFoundException('node not found');
    }

    const targetName = node.displayName ?? node.hostname;

    await this.writeAuditLog({
      actorId,
      action: 'admin.node.delete',
      targetType: 'node',
      targetId: nodeId,
      ipAddress: actorIp,
      metadataJson: {
        mode: 'single',
        node_uid: node.nodeUid,
        target_name: targetName,
      } as Prisma.JsonObject,
    });

    await this.prisma.node.delete({
      where: { id: nodeId },
    });
    this.invalidateNodesFiltersCache();

    return {
      ok: true,
      node_id: nodeId,
      node_uid: node.nodeUid,
      deleted_at: new Date().toISOString(),
    };
  }

  async deleteNodesBatch(
    ids: string[],
    actorId?: string,
    actorIp?: string,
    scopeActor?: AccessActor,
  ): Promise<{
    ok: true;
    deleted_count: number;
    deleted_ids: string[];
    deleted_at: string;
  }> {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) {
      throw new ConflictException('ids must contain at least one node id');
    }

    if (scopeActor) {
      for (const nodeId of uniqueIds) {
        await this.withNodeScope(scopeActor, nodeId);
      }
    }

    const nodes = await this.prisma.node.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, nodeUid: true, hostname: true, displayName: true },
    });

    const foundIds = new Set(nodes.map((n) => n.id));
    const missingIds = uniqueIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new NotFoundException(
        `node(s) not found: ${missingIds.slice(0, 5).join(', ')}${missingIds.length > 5 ? ` and ${missingIds.length - 5} more` : ''}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          actorType: 'user_session',
          actorId,
          action: 'admin.node.delete',
          targetType: 'node',
          targetId: uniqueIds[0],
          ipAddress: actorIp,
          metadataJson: {
            mode: 'batch',
            ids: uniqueIds,
            node_uids: nodes.map((n) => n.nodeUid),
            target_names: nodes.map((n) => n.displayName ?? n.hostname),
          } as Prisma.JsonObject,
        },
      });

      await tx.node.deleteMany({
        where: { id: { in: uniqueIds } },
      });
    });
    this.invalidateNodesFiltersCache();

    return {
      ok: true,
      deleted_count: uniqueIds.length,
      deleted_ids: uniqueIds,
      deleted_at: new Date().toISOString(),
    };
  }

  async getBootstrapCommand(
    nodeId: string,
    releaseBaseUrlOverride?: string,
    controllerUrlOverride?: string,
    heartbeatModeOverride?: string,
    configBackupEnabledOverride?: string,
    scopeActor?: AccessActor,
  ): Promise<{
    node: {
      id: string;
      node_uid: string;
      hostname: string;
      display_name: string | null;
      client_code: string;
      site_code: string;
    };
    heartbeat_mode: BootstrapHeartbeatMode;
    release: {
      version: string;
      release_base_url: string | null;
      controller_url: string;
      artifact_name: string;
      artifact_url: string | null;
      checksum_url: string | null;
      installer_url: string | null;
      ready: boolean;
    };
    command: string | null;
    package_command: string | null;
    uninstall_command: string | null;
    bootstrap: {
      node_secret: string;
      secret_hint: string;
    };
    verification: {
      post_install_steps: string[];
      command_block: string;
    };
  }> {
    await this.withNodeScope(scopeActor, nodeId);

    const node = await this.prisma.node.findUnique({
      where: {
        id: nodeId,
      },
      include: {
        site: {
          include: {
            client: true,
          },
        },
        credentials: {
          where: {
            status: NodeCredentialStatus.active,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    if (!node) {
      throw new NotFoundException('node not found');
    }

    const credential = node.credentials[0];
    if (!credential) {
      throw new NotFoundException('active node credential not found');
    }

    const bootstrapSecret = this.nodeSecretCrypto.decrypt(credential.secretEncrypted);
    const heartbeatMode = normalizeBootstrapHeartbeatMode(heartbeatModeOverride);
    const configBackupEnabled = normalizeConfigBackupEnabled(configBackupEnabledOverride);
    const configBackupInstallFlag = configBackupEnabled
      ? ` --config-backup-enabled ${configBackupEnabled}`
      : '';
    const bootstrapUpdateSecretFile = '/var/db/monitor-pfsense-agent/.update-node-secret';
    const bootstrapSecretSetup = [
      'mkdir -p /var/db/monitor-pfsense-agent',
      `printf %s ${shellQuote(bootstrapSecret)} > ${bootstrapUpdateSecretFile}`,
      `chmod 600 ${bootstrapUpdateSecretFile}`,
    ].join(' && ');
    const bootstrapInstallSecretArgs = `--secret-file ${bootstrapUpdateSecretFile}`;
    const bootstrapInstallEnvPrefix = `env MONITOR_UPDATE_NODE_SECRET=${shellQuote(bootstrapSecret)}`;
    const version = appConfig.systemVersion;
    const artifactName = `monitor-pfsense-agent-v${version}.tar.gz`;
    const releaseBaseUrl =
      releaseBaseUrlOverride?.trim() || appConfig.agentBootstrap.releaseBaseUrl || null;
    const controllerUrl =
      controllerUrlOverride?.trim() || 'https://pfs-monitor.systemup.inf.br';
    const trimmedBaseUrl = releaseBaseUrl?.replace(/\/+$/, '') ?? null;
    const artifactUrl = trimmedBaseUrl ? `${trimmedBaseUrl}/${artifactName}` : null;
    const checksumUrl = artifactUrl ? `${artifactUrl}.sha256` : null;
    const installerUrl = trimmedBaseUrl
      ? `${trimmedBaseUrl}/install-from-release.sh`
      : null;
    const ready = Boolean(artifactUrl && checksumUrl && installerUrl);

    const command = ready
      ? [
          `fetch -o /tmp/install-from-release.sh ${shellQuote(installerUrl!)}`,
          `fetch -o /tmp/monitor-pfsense-agent.sha256 ${shellQuote(checksumUrl!)}`,
          `chmod +x /tmp/install-from-release.sh`,
          `SHA256_VALUE=$(awk 'NR==1 {print $1}' /tmp/monitor-pfsense-agent.sha256)`,
          `${bootstrapSecretSetup} && ${bootstrapInstallEnvPrefix} /tmp/install-from-release.sh --release-url ${shellQuote(artifactUrl!)} --sha256 "$SHA256_VALUE" ${bootstrapInstallSecretArgs} --controller-url ${shellQuote(controllerUrl)} --node-uid ${shellQuote(node.nodeUid)} --customer-code ${shellQuote(node.site.client.code)} --heartbeat-mode ${shellQuote(heartbeatMode)}${configBackupInstallFlag}`,
        ].join(' && ')
      : null;

    // Preferência: ficheiro em runtime (sempre atualizado após git pull); fallback: env (appConfig)
    const packageReleaseFromFile = readPackageReleaseFromFile();

    let package_command: string | null = null;
    let uninstall_command: string | null = null;
    try {
      const packageRelease = this.packageReleaseService.getPackageRelease();
      package_command =
        `fetch -o /tmp/install-from-release.sh ${shellQuote(packageRelease.installer_url)} && chmod +x /tmp/install-from-release.sh && ${bootstrapSecretSetup} && nohup ${bootstrapInstallEnvPrefix} /tmp/install-from-release.sh --release-url ${shellQuote(packageRelease.artifact_url)} --sha256 ${shellQuote(packageRelease.sha256)} ${bootstrapInstallSecretArgs} --controller-url ${shellQuote(controllerUrl)} --node-uid ${shellQuote(node.nodeUid)} --customer-code ${shellQuote(node.site.client.code)} --heartbeat-mode ${shellQuote(heartbeatMode)}${configBackupInstallFlag} </dev/null >>/tmp/monitor-install.log 2>&1 & echo 'Instalação em segundo plano. Log: tail -f /tmp/monitor-install.log'`;
      const base = (
        packageReleaseFromFile?.repoRawBase ??
        appConfig.packageRelease.repoRawBase
      ).replace(/\/+$/, '');
      const uninstallScriptUrl = `${base}/packages/pfsense-package/bootstrap/uninstall.sh`;
      uninstall_command =
        `fetch -o /tmp/uninstall-systemup-monitor.sh ${shellQuote(uninstallScriptUrl)} && chmod +x /tmp/uninstall-systemup-monitor.sh && /tmp/uninstall-systemup-monitor.sh`;
    } catch {
      package_command = null;
      uninstall_command = null;
    }

    const postInstallSteps = [
      'service monitor_pfsense_agent status',
      '/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh print-config',
      "egrep '^(MONITOR_AGENT_LIGHT_HEARTBEAT|MONITOR_AGENT_SERVICES)=' /usr/local/etc/monitor-pfsense-agent.conf",
      '/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh test-connection',
      '/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh heartbeat',
      'tail -n 50 /var/log/monitor-pfsense-agent.log',
    ];

    return {
      node: {
        id: node.id,
        node_uid: node.nodeUid,
        hostname: node.hostname,
        display_name: node.displayName,
        client_code: node.site.client.code,
        site_code: node.site.code,
      },
      heartbeat_mode: heartbeatMode,
      release: {
        version,
        release_base_url: releaseBaseUrl,
        controller_url: controllerUrl,
        artifact_name: artifactName,
        artifact_url: artifactUrl,
        checksum_url: checksumUrl,
        installer_url: installerUrl,
        ready,
      },
      command,
      package_command,
      uninstall_command,
      bootstrap: {
        node_secret: bootstrapSecret,
        secret_hint: credential.secretHint,
      },
      verification: {
        post_install_steps: postInstallSteps,
        command_block: postInstallSteps.join('\n'),
      },
    };
  }

  private generateNodeSecret(): string {
    return randomBytes(32).toString('base64url');
  }

  private buildSecretHint(secret: string): string {
    return `...${secret.slice(-6)}`;
  }

  private hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  private async writeAuditLog(input: {
    actorId?: string;
    actorRole?: string;
    clientId?: string;
    result?: 'success' | 'denied' | 'failure';
    action: string;
    targetType: string;
    targetId?: string;
    ipAddress?: string;
    metadataJson?: Prisma.JsonObject;
  }): Promise<void> {
    await this.auditService.record({
      actorId: input.actorId,
      actorRole: input.actorRole,
      clientId: input.clientId,
      result: input.result,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      ipAddress: input.ipAddress,
      metadataJson: input.metadataJson,
    });
  }
}
