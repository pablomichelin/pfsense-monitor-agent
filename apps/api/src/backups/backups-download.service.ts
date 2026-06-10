import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigBackupStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { BackupsStorageService } from './backups-storage.service';

@Injectable()
export class BackupsDownloadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: BackupsStorageService,
    private readonly auditService: AuditService,
  ) {}

  async listBackups(nodeId: string): Promise<{
    items: Array<{
      id: string;
      backup_uid: string;
      status: ConfigBackupStatus;
      source: string;
      received_at: string;
      config_sha256: string;
      size_bytes: number;
      compression: string | null;
      agent_version: string | null;
      pfsense_version: string | null;
      command_id: string | null;
    }>;
    summary: {
      total_count: number;
      stored_count: number;
      total_stored_bytes: number;
      latest_received_at: string | null;
      latest_status: ConfigBackupStatus | null;
    };
  }> {
    const backups = await this.prisma.nodeConfigBackup.findMany({
      where: {
        nodeId,
        status: {
          in: [
            ConfigBackupStatus.stored,
            ConfigBackupStatus.duplicate,
          ],
        },
      },
      orderBy: {
        receivedAt: 'desc',
      },
    });

    const storedBackups = backups.filter(
      (backup) => backup.status === ConfigBackupStatus.stored,
    );

    return {
      items: backups.map((backup) => ({
        id: backup.id,
        backup_uid: backup.backupUid,
        status: backup.status,
        source: backup.source,
        received_at: backup.receivedAt.toISOString(),
        config_sha256: backup.configSha256,
        size_bytes: backup.sizeBytes,
        compression: backup.compression,
        agent_version: backup.agentVersion,
        pfsense_version: backup.pfsenseVersion,
        command_id: backup.commandId,
      })),
      summary: {
        total_count: backups.length,
        stored_count: storedBackups.length,
        total_stored_bytes: storedBackups.reduce(
          (sum, backup) => sum + backup.sizeBytes,
          0,
        ),
        latest_received_at: backups[0]?.receivedAt.toISOString() ?? null,
        latest_status: backups[0]?.status ?? null,
      },
    };
  }

  async downloadBackup(input: {
    nodeId: string;
    backupId: string;
    userId: string;
    actorRole?: string;
    ipAddress?: string;
  }): Promise<{
    xmlBytes: Buffer;
    backup_uid: string;
    config_sha256: string;
    size_bytes: number;
    received_at: string;
  }> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        input.backupId,
      );

    const backup = await this.prisma.nodeConfigBackup.findFirst({
      where: {
        nodeId: input.nodeId,
        ...(isUuid
          ? {
              OR: [{ id: input.backupId }, { backupUid: input.backupId }],
            }
          : { backupUid: input.backupId }),
        status: ConfigBackupStatus.stored,
        storagePath: {
          not: null,
        },
      },
      include: {
        node: {
          select: {
            site: {
              select: {
                clientId: true,
              },
            },
          },
        },
      },
    });

    if (!backup?.storagePath) {
      throw new NotFoundException('stored backup not found');
    }

    const xmlBytes = await this.storage.decryptFromFile(backup.storagePath);

    await this.auditService.record({
      actorType: 'user_session',
      actorId: input.userId,
      actorRole: input.actorRole,
      clientId: backup.node.site.clientId,
      action: 'backup.config.download',
      targetType: 'node_config_backup',
      targetId: backup.id,
      ipAddress: input.ipAddress,
      metadataJson: {
        node_id: input.nodeId,
        backup_uid: backup.backupUid,
        sha256: backup.configSha256,
        size_bytes: backup.sizeBytes,
      },
    });

    return {
      xmlBytes,
      backup_uid: backup.backupUid,
      config_sha256: backup.configSha256,
      size_bytes: backup.sizeBytes,
      received_at: backup.receivedAt.toISOString(),
    };
  }
}
