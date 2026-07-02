import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AccessActor } from '../auth/access-actor.type';
import { AccessPolicyService } from '../auth/access-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { NodesService } from '../nodes/nodes.service';
import {
  CreateGroupDto,
  ListGroupsQueryDto,
  SetGroupMembersDto,
  UpdateGroupDto,
} from './dto/groups.dto';
import { normalizeGroupName } from './tag-name.util';

type GroupRecord = {
  id: string;
  client_id: string;
  client_name: string;
  name: string;
  description: string | null;
  member_count: number;
  created_at: string;
  updated_at: string;
};

type GroupMemberRecord = {
  node_id: string;
  hostname: string;
  display_name: string | null;
};

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly auditService: AuditService,
    private readonly nodesService: NodesService,
  ) {}

  private mapGroup(
    group: {
      id: string;
      clientId: string;
      name: string;
      description: string | null;
      createdAt: Date;
      updatedAt: Date;
      client: { name: string };
      _count: { members: number };
    },
  ): GroupRecord {
    return {
      id: group.id,
      client_id: group.clientId,
      client_name: group.client.name,
      name: group.name,
      description: group.description,
      member_count: group._count.members,
      created_at: group.createdAt.toISOString(),
      updated_at: group.updatedAt.toISOString(),
    };
  }

  private async buildClientScopeWhere(
    actor: AccessActor,
    clientId?: string,
  ): Promise<Prisma.NodeGroupWhereInput> {
    await this.accessPolicy.assertRequestedClientFilter(actor, clientId);
    const allowedClientIds = await this.accessPolicy.getAllowedClientIds(actor);

    if (clientId) {
      return { clientId };
    }

    if (allowedClientIds === null) {
      return {};
    }

    if (allowedClientIds.length === 0) {
      return { id: { in: [] } };
    }

    return {
      clientId: {
        in: allowedClientIds,
      },
    };
  }

  async listGroups(
    actor: AccessActor,
    query: ListGroupsQueryDto,
  ): Promise<{ items: GroupRecord[]; generated_at: string }> {
    const where = await this.buildClientScopeWhere(actor, query.client_id);
    const groups = await this.prisma.nodeGroup.findMany({
      where,
      orderBy: [{ client: { name: 'asc' } }, { name: 'asc' }],
      include: {
        client: {
          select: {
            name: true,
          },
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    return {
      items: groups.map((group) => this.mapGroup(group)),
      generated_at: new Date().toISOString(),
    };
  }

  async getGroupById(
    actor: AccessActor,
    groupId: string,
  ): Promise<{
    group: GroupRecord;
    members: GroupMemberRecord[];
    generated_at: string;
  }> {
    const group = await this.prisma.nodeGroup.findUnique({
      where: { id: groupId },
      include: {
        client: {
          select: {
            name: true,
          },
        },
        _count: {
          select: {
            members: true,
          },
        },
        members: {
          include: {
            node: {
              select: {
                id: true,
                hostname: true,
                displayName: true,
              },
            },
          },
          orderBy: {
            node: {
              hostname: 'asc',
            },
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('group not found');
    }

    await this.accessPolicy.assertClientAccess(actor, group.clientId);

    return {
      group: this.mapGroup(group),
      members: group.members.map((member) => ({
        node_id: member.node.id,
        hostname: member.node.hostname,
        display_name: member.node.displayName,
      })),
      generated_at: new Date().toISOString(),
    };
  }

  async createGroup(
    actor: AccessActor,
    dto: CreateGroupDto,
    actorId?: string,
    actorIp?: string,
  ): Promise<{ group: GroupRecord }> {
    await this.accessPolicy.assertClientAccess(actor, dto.client_id);
    const name = normalizeGroupName(dto.name);
    if (!name) {
      throw new ConflictException('group name is required');
    }

    try {
      const group = await this.prisma.nodeGroup.create({
        data: {
          clientId: dto.client_id,
          name,
          description: dto.description?.trim() || null,
        },
        include: {
          client: {
            select: {
              name: true,
            },
          },
          _count: {
            select: {
              members: true,
            },
          },
        },
      });

      await this.auditService.record({
        actorId,
        clientId: dto.client_id,
        action: 'fleet.group.create',
        targetType: 'node_group',
        targetId: group.id,
        ipAddress: actorIp,
        metadataJson: {
          name: group.name,
          client_id: dto.client_id,
        },
      });

      this.nodesService.invalidateFiltersCache();

      return {
        group: this.mapGroup(group),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('group name already exists for this client');
      }
      throw error;
    }
  }

  async updateGroup(
    actor: AccessActor,
    groupId: string,
    dto: UpdateGroupDto,
    actorId?: string,
    actorIp?: string,
  ): Promise<{ group: GroupRecord }> {
    const existing = await this.prisma.nodeGroup.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        clientId: true,
        name: true,
        description: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('group not found');
    }

    await this.accessPolicy.assertClientAccess(actor, existing.clientId);

    const name =
      dto.name !== undefined ? normalizeGroupName(dto.name) : undefined;
    if (name !== undefined && !name) {
      throw new ConflictException('group name is required');
    }

    try {
      const group = await this.prisma.nodeGroup.update({
        where: { id: groupId },
        data: {
          name,
          description:
            dto.description !== undefined
              ? dto.description.trim() || null
              : undefined,
        },
        include: {
          client: {
            select: {
              name: true,
            },
          },
          _count: {
            select: {
              members: true,
            },
          },
        },
      });

      await this.auditService.record({
        actorId,
        clientId: existing.clientId,
        action: 'fleet.group.update',
        targetType: 'node_group',
        targetId: group.id,
        ipAddress: actorIp,
        metadataJson: {
          previous_name: existing.name,
          name: group.name,
          description: group.description,
        },
      });

      this.nodesService.invalidateFiltersCache();

      return {
        group: this.mapGroup(group),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('group name already exists for this client');
      }
      throw error;
    }
  }

  async deleteGroup(
    actor: AccessActor,
    groupId: string,
    actorId?: string,
    actorIp?: string,
  ): Promise<{ deleted: true; id: string }> {
    const existing = await this.prisma.nodeGroup.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        clientId: true,
        name: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('group not found');
    }

    await this.accessPolicy.assertClientAccess(actor, existing.clientId);

    await this.prisma.nodeGroup.delete({
      where: { id: groupId },
    });

    await this.auditService.record({
      actorId,
      clientId: existing.clientId,
      action: 'fleet.group.delete',
      targetType: 'node_group',
      targetId: groupId,
      ipAddress: actorIp,
      metadataJson: {
        name: existing.name,
      },
    });

    this.nodesService.invalidateFiltersCache();

    return {
      deleted: true,
      id: groupId,
    };
  }

  async setGroupMembers(
    actor: AccessActor,
    groupId: string,
    dto: SetGroupMembersDto,
    actorId?: string,
    actorIp?: string,
  ): Promise<{ group: GroupRecord; member_count: number }> {
    const group = await this.prisma.nodeGroup.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        clientId: true,
        name: true,
      },
    });

    if (!group) {
      throw new NotFoundException('group not found');
    }

    await this.accessPolicy.assertClientAccess(actor, group.clientId);

    const uniqueNodeIds = [...new Set(dto.node_ids)];
    if (uniqueNodeIds.length > 0) {
      const nodes = await this.prisma.node.findMany({
        where: {
          id: {
            in: uniqueNodeIds,
          },
          site: {
            clientId: group.clientId,
          },
        },
        select: {
          id: true,
        },
      });

      if (nodes.length !== uniqueNodeIds.length) {
        throw new BadRequestException(
          'one or more nodes are invalid or out of client scope',
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.nodeGroupMember.deleteMany({
        where: { groupId },
      }),
      ...(uniqueNodeIds.length > 0
        ? [
            this.prisma.nodeGroupMember.createMany({
              data: uniqueNodeIds.map((nodeId) => ({
                groupId,
                nodeId,
              })),
            }),
          ]
        : []),
    ]);

    const updated = await this.prisma.nodeGroup.findUniqueOrThrow({
      where: { id: groupId },
      include: {
        client: {
          select: {
            name: true,
          },
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    await this.auditService.record({
      actorId,
      clientId: group.clientId,
      action: 'fleet.group.members.set',
      targetType: 'node_group',
      targetId: groupId,
      ipAddress: actorIp,
      metadataJson: {
        group_name: group.name,
        member_count: uniqueNodeIds.length,
        node_ids: uniqueNodeIds,
      },
    });

    this.nodesService.invalidateFiltersCache();

    return {
      group: this.mapGroup(updated),
      member_count: uniqueNodeIds.length,
    };
  }
}
