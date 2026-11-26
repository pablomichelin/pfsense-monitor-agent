import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodeCriticality, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AccessActor } from '../auth/access-actor.type';
import { AccessPolicyService } from '../auth/access-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateNodeFleetMetadataDto } from './dto/node-fleet-metadata.dto';
import { lockFleetClient } from './fleet-client-lock';

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

    const replaceTags = dto.tag_ids !== undefined;
    if (replaceTags && (dto.add_tag_ids !== undefined || dto.remove_tag_ids !== undefined)) {
      throw new BadRequestException('tag replacements and partial tag changes cannot be combined');
    }
    const addedTagIds = replaceTags
      ? [...new Set(dto.tag_ids)]
      : [...new Set((dto.add_tag_ids ?? []).map((id) => id.toLowerCase()))];
    const removedTagIds = new Set((dto.remove_tag_ids ?? []).map((id) => id.toLowerCase()));
    if (addedTagIds.some((id) => removedTagIds.has(id))) {
      throw new BadRequestException('a tag cannot be both added and removed');
    }
    if (dto.criticality === undefined && !replaceTags && addedTagIds.length === 0 && removedTagIds.size === 0) {
      throw new BadRequestException('no fields to update');
    }

    const updatedNode = await this.prisma.$transaction(async (tx) => {
      // Lock parents before replacing links so concurrent deletes can cascade
      // without waiting on a link this edit holds while awaiting its parent.
      if (!await lockFleetClient(tx, clientId)) throw new NotFoundException('node not found');
      const [locked] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT n.id FROM nodes n JOIN sites s ON s.id = n.site_id
        WHERE n.id = ${nodeId}::uuid AND s.client_id = ${clientId}::uuid
        FOR NO KEY UPDATE OF n
      `;
      if (!locked) throw new NotFoundException('node not found');

      if (addedTagIds.length > 0) {
        const tags = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM tags
          WHERE id IN (${Prisma.join(addedTagIds.map((id) => Prisma.sql`${id}::uuid`))})
            AND client_id = ${clientId}::uuid
          ORDER BY id FOR KEY SHARE
        `;
        if (tags.length !== addedTagIds.length) {
          throw new BadRequestException('one or more tags are invalid or out of client scope');
        }
      }

      const existing = await tx.node.findUniqueOrThrow({
        where: { id: nodeId },
        select: { criticality: true, status: true, nodeTags: { select: { tagId: true } } },
      });
      if (replaceTags || removedTagIds.size > 0) {
        await tx.nodeTag.deleteMany({
          where: replaceTags ? { nodeId } : { nodeId, tagId: { in: [...removedTagIds] } },
        });
      }
      if (addedTagIds.length > 0) {
        await tx.nodeTag.createMany({
          data: addedTagIds.map((tagId) => ({ nodeId, tagId })),
          skipDuplicates: !replaceTags,
        });
      }
      return this.updateAndAudit(tx, existing, clientId, nodeId, dto.criticality, actorId, actorIp);
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

  private async updateAndAudit(
    tx: Prisma.TransactionClient,
    existing: { criticality: NodeCriticality; status: string; nodeTags: Array<{ tagId: string }> },
    clientId: string,
    nodeId: string,
    criticality: NodeCriticality | undefined,
    actorId?: string,
    actorIp?: string,
  ) {
    const updated = await tx.node.update({
      where: { id: nodeId },
      data: { criticality },
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
        criticality: updated.criticality,
        previous_tag_ids: existing.nodeTags.map((entry) => entry.tagId),
        tag_ids: updated.nodeTags.map((entry) => entry.tag.id),
        node_status_unchanged: existing.status === updated.status,
      },
    }, tx);
    return updated;
  }
}
