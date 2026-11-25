import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { appConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { lockBackupPolicyRow } from './backups-policy-lock.util';
import {
  mergeRetentionPolicyJson,
  resolveRetentionPolicy,
} from './backups-retention-policy.util';
import { BackupsRetentionService } from './backups-retention.service';

@Injectable()
export class BackupsPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retention: BackupsRetentionService,
    private readonly auditService: AuditService,
  ) {}

  async getRetentionPolicy(nodeId: string) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        configBackupPolicyJson: true,
      },
    });

    if (!node) {
      throw new NotFoundException('node not found');
    }

    const effective = resolveRetentionPolicy(node.configBackupPolicyJson);

    return {
      effective: {
        count: effective.count,
        max_bytes: effective.max_bytes,
        source: effective.source,
      },
      global_defaults: {
        count: appConfig.configBackup.retentionCount,
        max_bytes: appConfig.configBackup.retentionMaxBytesPerNode,
      },
      overrides: {
        retention_count:
          effective.source === 'node'
            ? effective.count
            : null,
        retention_max_bytes:
          effective.source === 'node'
            ? effective.max_bytes
            : null,
      },
    };
  }

  async updateRetentionPolicy(input: {
    nodeId: string;
    userId: string;
    actorRole?: string;
    ipAddress?: string;
    retention_count?: number | null;
    retention_max_bytes?: number | null;
  }) {
    const { nextPolicyJson, clientId } = await this.prisma.$transaction(async (tx) => {
      const node = await lockBackupPolicyRow(tx, input.nodeId);
      if (!node) throw new NotFoundException('node not found');

      const nextPolicyJson = mergeRetentionPolicyJson(node.configBackupPolicyJson, {
        retention_count: input.retention_count,
        retention_max_bytes: input.retention_max_bytes,
      });
      const updated = await tx.node.update({
        where: { id: input.nodeId },
        data: { configBackupPolicyJson: nextPolicyJson },
        select: { site: { select: { clientId: true } } },
      });

      return { nextPolicyJson, clientId: updated.site.clientId };
    });

    const deletedBackupUids = await this.retention.enforceRetention(input.nodeId);
    const effective = resolveRetentionPolicy(
      nextPolicyJson as Prisma.JsonValue,
    );

    await this.auditService.record({
      actorType: 'user_session',
      actorId: input.userId,
      actorRole: input.actorRole,
      clientId,
      action: 'backup.config.retention_policy_update',
      targetType: 'node',
      targetId: input.nodeId,
      ipAddress: input.ipAddress,
      metadataJson: {
        retention_count: input.retention_count ?? null,
        retention_max_bytes: input.retention_max_bytes ?? null,
        effective_count: effective.count,
        effective_max_bytes: effective.max_bytes,
        deleted_backup_uids: deletedBackupUids,
      },
    });

    return {
      ok: true,
      effective: {
        count: effective.count,
        max_bytes: effective.max_bytes,
        source: effective.source,
      },
      deleted_backup_uids: deletedBackupUids,
    };
  }
}
