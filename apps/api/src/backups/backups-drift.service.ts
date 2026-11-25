import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigBackupStatus, type Prisma } from '@prisma/client';
import { appConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { lockBackupPolicyRow } from './backups-policy-lock.util';
import {
  detectConfigDrift,
  extractTopLevelSections,
} from './backups-config-diff.util';
import {
  mergeDriftStateJson,
  parseDriftState,
  StoredDriftState,
} from './backups-retention-policy.util';
import { BackupsStorageService } from './backups-storage.service';

@Injectable()
export class BackupsDriftService {
  private readonly logger = new Logger(BackupsDriftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: BackupsStorageService,
  ) {}

  isEnabled(): boolean {
    return appConfig.configBackup.advanced.driftEnabled;
  }

  assertDriftEnabled(): void {
    if (!this.isEnabled()) {
      throw new ForbiddenException('backup drift detection is disabled');
    }
  }

  async getDriftStatus(nodeId: string) {
    this.assertDriftEnabled();

    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        configBackupPolicyJson: true,
        configBackups: {
          where: {
            status: ConfigBackupStatus.stored,
          },
          orderBy: {
            receivedAt: 'desc',
          },
          take: 2,
          select: {
            id: true,
            backupUid: true,
            receivedAt: true,
            configSha256: true,
          },
        },
      },
    });

    if (!node) {
      throw new NotFoundException('node not found');
    }

    const driftState = parseDriftState(node.configBackupPolicyJson);

    return {
      enabled: true,
      active: driftState?.active === true,
      state: driftState,
      latest: node.configBackups[0]
        ? {
            id: node.configBackups[0].id,
            backup_uid: node.configBackups[0].backupUid,
            received_at: node.configBackups[0].receivedAt.toISOString(),
            config_sha256: node.configBackups[0].configSha256,
          }
        : null,
      previous: node.configBackups[1]
        ? {
            id: node.configBackups[1].id,
            backup_uid: node.configBackups[1].backupUid,
            received_at: node.configBackups[1].receivedAt.toISOString(),
            config_sha256: node.configBackups[1].configSha256,
          }
        : null,
    };
  }

  async evaluateStoredBackup(nodeId: string, storedBackupId: string): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    const pairQuery = {
      where: {
        nodeId,
        status: ConfigBackupStatus.stored,
        storagePath: { not: null },
      },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: 2,
    } satisfies Prisma.NodeConfigBackupFindManyArgs;
    const [current, previous] = await this.prisma.nodeConfigBackup.findMany({
      ...pairQuery,
      select: { id: true, configSha256: true, storagePath: true },
    });

    if (!current?.storagePath || current.id !== storedBackupId) {
      return;
    }

    let detectedDrift: StoredDriftState | null = null;
    if (previous?.storagePath) {
      const [previousXml, currentXml] = await Promise.all([
        this.storage.decryptFromFile(previous.storagePath),
        this.storage.decryptFromFile(current.storagePath),
      ]);

      const drift = detectConfigDrift({
        previousSections: extractTopLevelSections(previousXml.toString('utf8')),
        currentSections: extractTopLevelSections(currentXml.toString('utf8')),
        previousSha256: previous.configSha256,
        currentSha256: current.configSha256,
      });

      if (drift.drift) {
        detectedDrift = {
          active: true,
          baseline_sha256: previous.configSha256,
          baseline_backup_id: previous.id,
          current_sha256: current.configSha256,
          changed_sections: drift.changed_sections,
          sensitive_changed_sections: drift.sensitive_changed_sections,
          alert_key: `${previous.configSha256}:${current.configSha256}`,
        };
      }
    }

    const detectedSections = await this.prisma.$transaction(async (tx) => {
      const node = await lockBackupPolicyRow(tx, nodeId);
      if (!node) return null;

      // The latest pair may have changed while the artifacts were being read.
      const [latest, baseline] = await tx.nodeConfigBackup.findMany({
        ...pairQuery,
        select: { id: true },
      });
      if (latest?.id !== current.id || baseline?.id !== previous?.id) {
        return null;
      }

      const existing = parseDriftState(node.configBackupPolicyJson);
      const duplicateAlert = detectedDrift !== null &&
        existing?.active === true && existing.alert_key === detectedDrift.alert_key;
      const nextState = detectedDrift ? {
        ...detectedDrift,
        detected_at: (duplicateAlert ? existing?.detected_at : undefined) ?? new Date().toISOString(),
      } : null;

      await tx.node.update({
        where: { id: nodeId },
        data: {
          configBackupPolicyJson: mergeDriftStateJson(node.configBackupPolicyJson, nextState),
        },
      });

      if (!nextState || duplicateAlert) return null;

      await tx.auditLog.create({
        data: {
          actorType: 'system',
          action: 'backup.config.drift_detected',
          targetType: 'node',
          targetId: nodeId,
          metadataJson: {
            backup_id: current.id,
            previous_backup_id: nextState.baseline_backup_id,
            changed_sections: nextState.changed_sections,
            sensitive_changed_sections: nextState.sensitive_changed_sections,
          },
        },
      });
      return nextState.sensitive_changed_sections;
    });

    if (detectedSections) {
      this.logger.warn(
        `config drift detected node_id=${nodeId} sections=${detectedSections.join(',')}`,
      );
    }
  }

  async acknowledgeDrift(input: {
    nodeId: string;
    userId: string;
    actorRole?: string;
    ipAddress?: string;
  }) {
    this.assertDriftEnabled();

    return this.prisma.$transaction(async (tx) => {
      const node = await lockBackupPolicyRow(tx, input.nodeId);
      const driftState = parseDriftState(node?.configBackupPolicyJson);
      if (!node || !driftState?.active) {
        return { ok: true, cleared: false };
      }

      await tx.node.update({
        where: { id: input.nodeId },
        data: {
          configBackupPolicyJson: mergeDriftStateJson(node.configBackupPolicyJson, null),
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: 'user_session',
          actorId: input.userId,
          actorRole: input.actorRole,
          action: 'backup.config.drift_acknowledged',
          targetType: 'node',
          targetId: input.nodeId,
          metadataJson: {
            previous_state: driftState,
          },
        },
      });

      return { ok: true, cleared: true };
    });
  }
}
