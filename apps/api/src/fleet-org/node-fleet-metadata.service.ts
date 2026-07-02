import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodeCriticality } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AccessActor } from '../auth/access-actor.type';
import { AccessPolicyService } from '../auth/access-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateNodeFleetMetadataDto } from './dto/node-fleet-metadata.dto';

@Injectable()
export class NodeFleetMetadataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly auditService: AuditService,
  ) {}

  async updateNodeFleetMetadata(
    actor: AccessActor,
    nodeId: string,
    dto: UpdateNodeFleetMetadataDto,
    actorId?: string,
    actorIp?: string,
  ): Promise<{
    node_id: string;
    criticality: NodeCriticality;
    tags: Array<{ id: string; name: string }>;
    updated_at: string;
  }> {
    const clientId = await this.accessPolicy.assertNodeAccess(actor, nodeId);

    const existing = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        id: true,
        criticality: true,
        status: true,
        nodeTags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
                clientId: true,
              },
            },
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('node not found');
    }

    if (
      dto.criticality === undefined &&
      dto.tag_ids === undefined
    ) {
      throw new BadRequestException('no fields to update');
    }

    if (dto.tag_ids !== undefined) {
      const uniqueTagIds = [...new Set(dto.tag_ids)];
      if (uniqueTagIds.length > 0) {
        const tags = await this.prisma.tag.findMany({
          where: {
            id: {
              in: uniqueTagIds,
            },
            clientId,
          },
          select: {
            id: true,
          },
        });

        if (tags.length !== uniqueTagIds.length) {
          throw new BadRequestException(
            'one or more tags are invalid or out of client scope',
          );
        }
      }

      await this.prisma.$transaction([
        this.prisma.nodeTag.deleteMany({
          where: { nodeId },
        }),
        ...(uniqueTagIds.length > 0
          ? [
              this.prisma.nodeTag.createMany({
                data: uniqueTagIds.map((tagId) => ({
                  nodeId,
                  tagId,
                })),
              }),
            ]
          : []),
      ]);
    }

    const updatedNode = await this.prisma.node.update({
      where: { id: nodeId },
      data: {
        criticality: dto.criticality,
      },
      select: {
        id: true,
        criticality: true,
        status: true,
        updatedAt: true,
        nodeTags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            tag: {
              name: 'asc',
            },
          },
        },
      },
    });

    await this.auditService.record({
      actorId,
      clientId,
      action: 'fleet.node_metadata.update',
      targetType: 'node',
      targetId: nodeId,
      ipAddress: actorIp,
      metadataJson: {
        previous_criticality: existing.criticality,
        criticality: updatedNode.criticality,
        previous_tag_ids: existing.nodeTags.map((entry) => entry.tag.id),
        tag_ids: updatedNode.nodeTags.map((entry) => entry.tag.id),
        node_status_unchanged: existing.status === updatedNode.status,
      },
    });

    return {
      node_id: updatedNode.id,
      criticality: updatedNode.criticality,
      tags: updatedNode.nodeTags.map((entry) => ({
        id: entry.tag.id,
        name: entry.tag.name,
      })),
      updated_at: updatedNode.updatedAt.toISOString(),
    };
  }
}
