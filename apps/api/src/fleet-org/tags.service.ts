import {
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
import { CreateTagDto, ListTagsQueryDto, UpdateTagDto } from './dto/tags.dto';
import { normalizeTagName } from './tag-name.util';

type TagRecord = {
  id: string;
  client_id: string;
  client_name: string;
  name: string;
  node_count: number;
  created_at: string;
  updated_at: string;
};

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly auditService: AuditService,
    private readonly nodesService: NodesService,
  ) {}

  private mapTag(
    tag: {
      id: string;
      clientId: string;
      name: string;
      createdAt: Date;
      updatedAt: Date;
      client: { name: string };
      _count: { nodeTags: number };
    },
  ): TagRecord {
    return {
      id: tag.id,
      client_id: tag.clientId,
      client_name: tag.client.name,
      name: tag.name,
      node_count: tag._count.nodeTags,
      created_at: tag.createdAt.toISOString(),
      updated_at: tag.updatedAt.toISOString(),
    };
  }

  private async buildClientScopeWhere(
    actor: AccessActor,
    clientId?: string,
  ): Promise<Prisma.TagWhereInput> {
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

  async listTags(
    actor: AccessActor,
    query: ListTagsQueryDto,
  ): Promise<{ items: TagRecord[]; generated_at: string }> {
    const where = await this.buildClientScopeWhere(actor, query.client_id);
    const tags = await this.prisma.tag.findMany({
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
            nodeTags: true,
          },
        },
      },
    });

    return {
      items: tags.map((tag) => this.mapTag(tag)),
      generated_at: new Date().toISOString(),
    };
  }

  async createTag(
    actor: AccessActor,
    dto: CreateTagDto,
    actorId?: string,
    actorIp?: string,
  ): Promise<{ tag: TagRecord }> {
    await this.accessPolicy.assertClientAccess(actor, dto.client_id);
    const name = normalizeTagName(dto.name);
    if (!name) {
      throw new ConflictException('tag name is required');
    }

    try {
      const tag = await this.prisma.tag.create({
        data: {
          clientId: dto.client_id,
          name,
        },
        include: {
          client: {
            select: {
              name: true,
            },
          },
          _count: {
            select: {
              nodeTags: true,
            },
          },
        },
      });

      await this.auditService.record({
        actorId,
        clientId: dto.client_id,
        action: 'fleet.tag.create',
        targetType: 'tag',
        targetId: tag.id,
        ipAddress: actorIp,
        metadataJson: {
          name: tag.name,
          client_id: dto.client_id,
        },
      });

      this.nodesService.invalidateFiltersCache();

      return {
        tag: this.mapTag(tag),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('tag name already exists for this client');
      }
      throw error;
    }
  }

  async updateTag(
    actor: AccessActor,
    tagId: string,
    dto: UpdateTagDto,
    actorId?: string,
    actorIp?: string,
  ): Promise<{ tag: TagRecord }> {
    const existing = await this.prisma.tag.findUnique({
      where: { id: tagId },
      select: {
        id: true,
        clientId: true,
        name: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('tag not found');
    }

    await this.accessPolicy.assertClientAccess(actor, existing.clientId);

    const name =
      dto.name !== undefined ? normalizeTagName(dto.name) : undefined;
    if (name !== undefined && !name) {
      throw new ConflictException('tag name is required');
    }

    try {
      const tag = await this.prisma.tag.update({
        where: { id: tagId },
        data: {
          name,
        },
        include: {
          client: {
            select: {
              name: true,
            },
          },
          _count: {
            select: {
              nodeTags: true,
            },
          },
        },
      });

      await this.auditService.record({
        actorId,
        clientId: existing.clientId,
        action: 'fleet.tag.update',
        targetType: 'tag',
        targetId: tag.id,
        ipAddress: actorIp,
        metadataJson: {
          previous_name: existing.name,
          name: tag.name,
        },
      });

      this.nodesService.invalidateFiltersCache();

      return {
        tag: this.mapTag(tag),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('tag name already exists for this client');
      }
      throw error;
    }
  }

  async deleteTag(
    actor: AccessActor,
    tagId: string,
    actorId?: string,
    actorIp?: string,
  ): Promise<{ deleted: true; id: string }> {
    const existing = await this.prisma.tag.findUnique({
      where: { id: tagId },
      select: {
        id: true,
        clientId: true,
        name: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('tag not found');
    }

    await this.accessPolicy.assertClientAccess(actor, existing.clientId);

    await this.prisma.tag.delete({
      where: { id: tagId },
    });

    await this.auditService.record({
      actorId,
      clientId: existing.clientId,
      action: 'fleet.tag.delete',
      targetType: 'tag',
      targetId: tagId,
      ipAddress: actorIp,
      metadataJson: {
        name: existing.name,
      },
    });

    this.nodesService.invalidateFiltersCache();

    return {
      deleted: true,
      id: tagId,
    };
  }
}
