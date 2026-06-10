import { Injectable, Logger } from '@nestjs/common';
import { ConfigBackupStatus } from '@prisma/client';
import { appConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { BackupsStorageService } from './backups-storage.service';

@Injectable()
export class BackupsRetentionService {
  private readonly logger = new Logger(BackupsRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: BackupsStorageService,
  ) {}

  async enforceRetention(nodeId: string): Promise<string[]> {
    const deletedBackupUids: string[] = [];
    const storedBackups = await this.prisma.nodeConfigBackup.findMany({
      where: {
        nodeId,
        status: ConfigBackupStatus.stored,
        storagePath: {
          not: null,
        },
      },
      orderBy: {
        receivedAt: 'desc',
      },
    });

    if (storedBackups.length === 0) {
      return deletedBackupUids;
    }

    const newestId = storedBackups[0]?.id;
    const keepIds = new Set<string>();
    let totalBytes = 0;

    for (const [index, backup] of storedBackups.entries()) {
      const withinCount =
        index < appConfig.configBackup.retentionCount;
      const withinBytes =
        totalBytes + backup.sizeBytes <=
        appConfig.configBackup.retentionMaxBytesPerNode;

      if (withinCount && withinBytes) {
        keepIds.add(backup.id);
        totalBytes += backup.sizeBytes;
      }
    }

    keepIds.add(newestId);

    for (const backup of storedBackups) {
      if (keepIds.has(backup.id) || !backup.storagePath) {
        continue;
      }

      await this.storage.removeFile(backup.storagePath);
      await this.prisma.nodeConfigBackup.delete({
        where: {
          id: backup.id,
        },
      });

      deletedBackupUids.push(backup.backupUid);

      await this.prisma.auditLog.create({
        data: {
          actorType: 'system',
          action: 'backup.config.retention_delete',
          targetType: 'node_config_backup',
          targetId: backup.id,
          metadataJson: {
            node_id: nodeId,
            backup_uid: backup.backupUid,
            size_bytes: backup.sizeBytes,
          },
        },
      });
    }

    if (deletedBackupUids.length > 0) {
      this.logger.log(
        `retention deleted ${deletedBackupUids.length} backups for node_id=${nodeId}`,
      );
    }

    return deletedBackupUids;
  }
}
