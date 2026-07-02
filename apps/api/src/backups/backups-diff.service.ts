import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigBackupStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { appConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { diffConfigXml } from './backups-config-diff.util';
import { BackupsStorageService } from './backups-storage.service';

@Injectable()
export class BackupsDiffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: BackupsStorageService,
    private readonly auditService: AuditService,
  ) {}

  assertDiffEnabled(): void {
    if (!appConfig.configBackup.advanced.diffEnabled) {
      throw new ForbiddenException('backup diff is disabled');
    }
  }

  async compareBackups(input: {
    nodeId: string;
    fromBackupId: string;
    toBackupId: string;
    userId: string;
    actorRole?: string;
    ipAddress?: string;
  }) {
    this.assertDiffEnabled();

    if (input.fromBackupId === input.toBackupId) {
      throw new BadRequestException('from and to backup must differ');
    }

    const [fromBackup, toBackup] = await Promise.all([
      this.loadStoredBackup(input.nodeId, input.fromBackupId),
      this.loadStoredBackup(input.nodeId, input.toBackupId),
    ]);

    const [fromXmlBytes, toXmlBytes] = await Promise.all([
      this.storage.decryptFromFile(fromBackup.storagePath!),
      this.storage.decryptFromFile(toBackup.storagePath!),
    ]);

    const diff = diffConfigXml({
      fromXml: fromXmlBytes.toString('utf8'),
      toXml: toXmlBytes.toString('utf8'),
      fromSha256: fromBackup.configSha256,
      toSha256: toBackup.configSha256,
    });

    await this.auditService.record({
      actorType: 'user_session',
      actorId: input.userId,
      actorRole: input.actorRole,
      action: 'backup.config.diff',
      targetType: 'node',
      targetId: input.nodeId,
      ipAddress: input.ipAddress,
      metadataJson: {
        from_backup_id: fromBackup.id,
        to_backup_id: toBackup.id,
        from_backup_uid: fromBackup.backupUid,
        to_backup_uid: toBackup.backupUid,
        identical: diff.identical,
        sections_changed: diff.sections.filter(
          (section) => section.status !== 'unchanged',
        ).length,
        secrets_masked: diff.secrets_masked,
      },
    });

    return {
      from: {
        id: fromBackup.id,
        backup_uid: fromBackup.backupUid,
        received_at: fromBackup.receivedAt.toISOString(),
        config_sha256: fromBackup.configSha256,
      },
      to: {
        id: toBackup.id,
        backup_uid: toBackup.backupUid,
        received_at: toBackup.receivedAt.toISOString(),
        config_sha256: toBackup.configSha256,
      },
      diff,
    };
  }

  async buildExportGuide(input: {
    nodeId: string;
    backupId: string;
    userId: string;
    actorRole?: string;
    ipAddress?: string;
  }) {
    this.assertDiffEnabled();

    const backup = await this.loadStoredBackup(input.nodeId, input.backupId);

    await this.auditService.record({
      actorType: 'user_session',
      actorId: input.userId,
      actorRole: input.actorRole,
      action: 'backup.config.export_guide',
      targetType: 'node_config_backup',
      targetId: backup.id,
      ipAddress: input.ipAddress,
      metadataJson: {
        node_id: input.nodeId,
        backup_uid: backup.backupUid,
        sha256: backup.configSha256,
      },
    });

    return {
      backup: {
        id: backup.id,
        backup_uid: backup.backupUid,
        received_at: backup.receivedAt.toISOString(),
        config_sha256: backup.configSha256,
        size_bytes: backup.sizeBytes,
        pfsense_version: backup.pfsenseVersion,
      },
      restore_automatic_enabled: false,
      steps: [
        'Baixe o config.xml criptografado usando o botao de download auditado.',
        'Valide o SHA256 localmente antes de aplicar no pfSense.',
        'Aplique manualmente em Diagnostics > Backup & Restore no pfSense alvo.',
        'Nao existe restore automatico pelo Monitor-Pfsense nesta versao.',
      ],
      warnings: [
        'O arquivo contem segredos sensiveis; trate como credencial.',
        'Restaurar em HA/CARP exige procedimento manual por peer.',
      ],
    };
  }

  private async loadStoredBackup(nodeId: string, backupId: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        backupId,
      );

    const backup = await this.prisma.nodeConfigBackup.findFirst({
      where: {
        nodeId,
        ...(isUuid
          ? {
              OR: [{ id: backupId }, { backupUid: backupId }],
            }
          : { backupUid: backupId }),
        status: ConfigBackupStatus.stored,
        storagePath: {
          not: null,
        },
      },
    });

    if (!backup?.storagePath) {
      throw new NotFoundException('stored backup not found');
    }

    return backup;
  }
}
