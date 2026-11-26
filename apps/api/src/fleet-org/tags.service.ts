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
import { lockFleetClient } from './fleet-client-lock';

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
      const tag = await this.prisma.$transaction(async (tx) => {
        if (!await lockFleetClient(tx, dto.client_id)) throw new NotFoundException('client not found');
        const tag = await tx.tag.create({
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
        }, tx);
        return tag;
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
        clientId: true,
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
      const tag = await this.prisma.$transaction(async (tx) => {
        const previous = await this.lockTagForUpdate(tx, tagId, existing.clientId);
        const tag = await tx.tag.update({
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
            previous_name: previous.name,
            name: tag.name,
          },
        }, tx);
        return tag;
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
        clientId: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('tag not found');
    }

    await this.accessPolicy.assertClientAccess(actor, existing.clientId);

    await this.prisma.$transaction(async (tx) => {
      const previous = await this.lockTagForUpdate(tx, tagId, existing.clientId);
      await tx.tag.delete({
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
          name: previous.name,
        },
      }, tx);
    });

    this.nodesService.invalidateFiltersCache();

    return {
      deleted: true,
      id: tagId,
    };
  }
  private async lockTagForUpdate(tx: Prisma.TransactionClient, tagId: string, clientId: string) {
    if (!await lockFleetClient(tx, clientId)) throw new NotFoundException('tag not found');
    const [tag] = await tx.$queryRaw<Array<{ name: string }>>`
      SELECT name FROM tags WHERE id = ${tagId}::uuid AND client_id = ${clientId}::uuid
      FOR NO KEY UPDATE
    `;
    if (!tag) throw new NotFoundException('tag not found');
    return tag;
  }

}
