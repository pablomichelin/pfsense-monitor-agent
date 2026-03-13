import {
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
  UserRole,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { appConfig } from '../config/app-config';
import { NodeSecretCryptoService } from '../common/node-secret-crypto.service';
import { AuthService } from '../auth/auth.service';
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

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\"'\"'`)}'`;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nodeSecretCrypto: NodeSecretCryptoService,
    private readonly authService: AuthService,
  ) {}

  private ensureNonEmptySlug(value: string, fallback: string): string {
    const normalized = toSlug(value);
    return normalized || fallback;
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

  async listUsers(): Promise<{
    items: Array<{
      id: string;
      email: string;
      display_name: string | null;
      role: UserRole;
      status: EntityStatus;
      created_at: string;
      updated_at: string;
    }>;
  }> {
    const users = await this.prisma.user.findMany({
      orderBy: [
        { role: 'asc' },
        { email: 'asc' },
      ],
    });

    return {
      items: users.map((user) => ({
        id: user.id,
        email: user.email,
        display_name: user.displayName,
        role: user.role,
        status: user.status,
        created_at: user.createdAt.toISOString(),
        updated_at: user.updatedAt.toISOString(),
      })),
    };
  }

  async listAuditLogs(query: ListAuditLogsQueryDto): Promise<{
    generated_at: string;
    items: Array<{
      id: string;
      actor_type: string;
      actor_id: string | null;
      actor_email: string | null;
      action: string;
      target_type: string;
      target_id: string | null;
      ip_address: string | null;
      metadata_json: Prisma.JsonValue | null;
      created_at: string;
    }>;
  }> {
    const limit = query.limit ?? 50;

    const logs = await this.prisma.auditLog.findMany({
      where: {
        action: query.action
          ? {
              startsWith: query.action,
            }
          : undefined,
        targetType: query.target_type
          ? {
              equals: query.target_type,
            }
          : undefined,
        targetId: query.target_id
          ? {
              equals: query.target_id,
            }
          : undefined,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    const actorIds = Array.from(
      new Set(logs.map((log) => log.actorId).filter((value): value is string => Boolean(value))),
    );

    const actors =
      actorIds.length > 0
        ? await this.prisma.user.findMany({
            where: {
              id: {
                in: actorIds,
              },
            },
            select: {
              id: true,
              email: true,
            },
          })
        : [];

    const actorEmailById = new Map(actors.map((actor) => [actor.id, actor.email]));

    return {
      generated_at: new Date().toISOString(),
      items: logs.map((log) => ({
        id: log.id,
        actor_type: log.actorType,
        actor_id: log.actorId,
        actor_email: log.actorId ? actorEmailById.get(log.actorId) ?? null : null,
        action: log.action,
        target_type: log.targetType,
        target_id: log.targetId,
        ip_address: log.ipAddress,
        metadata_json: log.metadataJson,
        created_at: log.createdAt.toISOString(),
      })),
    };
  }

  async createUser(dto: CreateUserDto, actorId?: string, actorIp?: string): Promise<{
    user: {
      id: string;
      email: string;
      display_name: string | null;
      role: UserRole;
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

    const user = await this.prisma.user.create({
      data: {
        email,
        displayName: normalizeOptional(dto.display_name),
        passwordHash: await this.authService.createUserPasswordHash(dto.password),
        role: dto.role ?? UserRole.readonly,
        status: dto.status ?? EntityStatus.active,
      },
    });

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
      role: UserRole;
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
    const nextStatus = dto.status ?? existing.status;
    const willRemainActiveSuperadmin =
      nextRole === UserRole.superadmin && nextStatus === EntityStatus.active;

    if (actorId && actorId === userId && !willRemainActiveSuperadmin) {
      throw new ForbiddenException(
        'current session cannot remove its own active superadmin access',
      );
    }

    if (
      existing.role === UserRole.superadmin &&
      existing.status === EntityStatus.active &&
      !willRemainActiveSuperadmin
    ) {
      const activeSuperadminCount = await this.prisma.user.count({
        where: {
          role: UserRole.superadmin,
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

  async createSite(dto: CreateSiteDto, actorId?: string, actorIp?: string): Promise<{
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

  async updateSite(
    siteId: string,
    dto: UpdateSiteDto,
    actorId?: string,
    actorIp?: string,
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

  async createNode(dto: CreateNodeDto, actorId?: string, actorIp?: string): Promise<{
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
    const site = await this.prisma.site.findUnique({
      where: {
        id: dto.site_id,
      },
      select: {
        id: true,
      },
    });
    if (!site) {
      throw new NotFoundException('site not found');
    }

    const hostname = dto.hostname.trim();
    const nodeUid = await this.buildUniqueNodeUid(
      dto.node_uid?.trim() || hostname || dto.display_name?.trim() || 'firewall',
    );

    const bootstrapSecret = this.generateNodeSecret();
    const secretHint = this.buildSecretHint(bootstrapSecret);
    const secretHash = this.hashSecret(bootstrapSecret);
    const secretEncrypted = this.nodeSecretCrypto.encrypt(bootstrapSecret);

    const node = await this.prisma.$transaction(async (tx) => {
      const createdNode = await tx.node.create({
        data: {
          siteId: dto.site_id,
          nodeUid,
          hostname,
          displayName: normalizeOptional(dto.display_name),
          managementIp: normalizeOptional(dto.management_ip),
          wanIp: normalizeOptional(dto.wan_ip),
          pfsenseVersion: normalizeOptional(dto.pfsense_version),
          agentVersion: normalizeOptional(dto.agent_version),
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

  async rotateNodeSecret(nodeId: string, actorId?: string, actorIp?: string): Promise<{
    node_id: string;
    bootstrap: {
      node_secret: string;
      secret_hint: string;
      rotated_at: string;
    };
  }> {
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
        pfsenseVersion:
          dto.pfsense_version !== undefined
            ? normalizeOptional(dto.pfsense_version)
            : undefined,
        agentVersion:
          dto.agent_version !== undefined
            ? normalizeOptional(dto.agent_version)
            : undefined,
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
  ): Promise<{
    node_id: string;
    maintenance_mode: boolean;
    updated_at: string;
  }> {
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

  async listAgentTokens(nodeId: string): Promise<{
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
  ): Promise<{
    ok: true;
    node_id: string;
    token_id: string;
    revoked_at: string;
  }> {
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

  async getBootstrapCommand(
    nodeId: string,
    releaseBaseUrlOverride?: string,
    controllerUrlOverride?: string,
  ): Promise<{
    node: {
      id: string;
      node_uid: string;
      hostname: string;
      display_name: string | null;
      client_code: string;
      site_code: string;
    };
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
    bootstrap: {
      node_secret: string;
      secret_hint: string;
    };
    verification: {
      post_install_steps: string[];
      command_block: string;
    };
  }> {
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
          `/tmp/install-from-release.sh --release-url ${shellQuote(artifactUrl!)} --sha256 "$SHA256_VALUE" --controller-url ${shellQuote(controllerUrl)} --node-uid ${shellQuote(node.nodeUid)} --node-secret ${shellQuote(bootstrapSecret)} --customer-code ${shellQuote(node.site.client.code)}`,
        ].join(' && ')
      : null;

    const { packageRelease } = appConfig;
    let package_command: string | null = null;
    if (
      packageRelease.version &&
      packageRelease.sha256 &&
      packageRelease.repoRawBase
    ) {
      const base = packageRelease.repoRawBase.replace(/\/+$/, '');
      const installerUrlPkg = `${base}/packages/pfsense-package/bootstrap/install-from-release.sh`;
      const artifactUrlPkg = `${base}/dist/pfsense-package/monitor-pfsense-package-v${packageRelease.version}.tar.gz`;
      package_command =
        `fetch -o /tmp/install-from-release.sh ${shellQuote(installerUrlPkg)} && chmod +x /tmp/install-from-release.sh && nohup /tmp/install-from-release.sh --release-url ${shellQuote(artifactUrlPkg)} --sha256 ${shellQuote(packageRelease.sha256)} --controller-url ${shellQuote(controllerUrl)} --node-uid ${shellQuote(node.nodeUid)} --node-secret ${shellQuote(bootstrapSecret)} --customer-code ${shellQuote(node.site.client.code)} </dev/null >>/tmp/monitor-install.log 2>&1 & echo 'Instalação em segundo plano. Log: tail -f /tmp/monitor-install.log'`;
    }

    const postInstallSteps = [
      'service monitor_pfsense_agent status',
      '/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh print-config',
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
    action: string;
    targetType: string;
    targetId?: string;
    ipAddress?: string;
    metadataJson?: Prisma.JsonObject;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorType: 'user_session',
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        ipAddress: input.ipAddress,
        metadataJson: input.metadataJson,
      },
    });
  }
}
