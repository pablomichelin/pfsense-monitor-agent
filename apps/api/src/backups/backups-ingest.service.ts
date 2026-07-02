import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigBackupStatus } from '@prisma/client';
import { gunzipSync } from 'zlib';
import { appConfig } from '../config/app-config';
import { NodeRequestAuthService } from '../common/node-request-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { BackupsCommandService } from './backups-command.service';
import { BackupsRetentionService } from './backups-retention.service';
import { BackupsStorageService } from './backups-storage.service';
import { BackupsDriftService } from './backups-drift.service';
import {
  normalizeBackupSchedulePolicy,
  toStoredBackupPolicyJson,
} from '../nodes/backup-policy.util';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ScheduledDuplicateFloodBucket = {
  count: number;
  windowStart: number;
  warned: boolean;
};

@Injectable()
export class BackupsIngestService {
  private readonly logger = new Logger(BackupsIngestService.name);
  private readonly scheduledDuplicateFlood = new Map<
    string,
    ScheduledDuplicateFloodBucket
  >();
  private readonly scheduledDuplicateFloodWindowMs = 60 * 60 * 1000;
  private readonly scheduledDuplicateFloodWarnThreshold = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly nodeRequestAuth: NodeRequestAuthService,
    private readonly storage: BackupsStorageService,
    private readonly retention: BackupsRetentionService,
    private readonly commandService: BackupsCommandService,
    private readonly driftService: BackupsDriftService,
  ) {}

  async ingestConfigBackup(request: {
    rawBody: Buffer;
    headerNodeUid?: string;
    headerTimestamp?: string;
    headerSignature?: string;
    headerConfigSha256?: string;
    headerConfigSize?: string;
    headerBackupId?: string;
    headerCommandId?: string;
    headerAgentVersion?: string;
    headerPfsenseVersion?: string;
    headerConfigCompression?: string;
    headerBackupScheduleMode?: string;
    headerBackupIntervalHours?: string;
    headerBackupScheduleTime?: string;
    headerBackupScheduleDow?: string;
    headerBackupScheduleDom?: string;
    headerBackupEnabled?: string;
    contentType?: string;
    clientIp?: string;
  }): Promise<{
    ok: true;
    server_time: string;
    backup_id: string;
    stored: boolean;
    duplicate: boolean;
    sha256: string;
  }> {
    const receivedAt = new Date();
    this.assertPayloadSize(request.rawBody);

    const { headerNodeUid, node, credential } =
      await this.nodeRequestAuth.authenticateNodeRequest({
        headerNodeUid: request.headerNodeUid,
        headerTimestamp: request.headerTimestamp,
        headerSignature: request.headerSignature,
        rawBody: request.rawBody,
        receivedAt,
      });

    const configSha256 = this.requireHeader(
      'X-Config-Sha256',
      request.headerConfigSha256,
    ).toLowerCase();
    const configSize = this.parsePositiveInt(
      this.requireHeader('X-Config-Size', request.headerConfigSize),
      'X-Config-Size',
    );
    const attemptId = this.requireHeader('X-Backup-Id', request.headerBackupId);
    if (!UUID_V4_REGEX.test(attemptId)) {
      throw new BadRequestException('X-Backup-Id must be a UUID v4');
    }

    if (!request.headerCommandId) {
      const latestStoredEarly = await this.prisma.nodeConfigBackup.findFirst({
        where: {
          nodeId: node.id,
          status: ConfigBackupStatus.stored,
        },
        orderBy: {
          receivedAt: 'desc',
        },
      });

      if (
        latestStoredEarly !== null &&
        latestStoredEarly.configSha256 === configSha256
      ) {
        return this.suppressScheduledDuplicate({
          nodeId: node.id,
          headerNodeUid,
          credentialId: credential.id,
          configSha256,
          backupUid: latestStoredEarly.backupUid,
          receivedAt,
          clientIp: request.clientIp,
          agentVersion: request.headerAgentVersion,
        });
      }
    }

    const compression = request.headerConfigCompression?.trim().toLowerCase();
    const isGzip =
      compression === 'gzip' ||
      request.contentType?.toLowerCase() === 'application/gzip';

    if (request.rawBody.byteLength === 0) {
      throw new BadRequestException('backup payload cannot be empty');
    }

    const payloadSha256 = this.storage.sha256Hex(request.rawBody);
    let xmlBytes = request.rawBody;
    if (isGzip) {
      try {
        xmlBytes = gunzipSync(request.rawBody);
      } catch {
        throw new BadRequestException('invalid gzip payload');
      }
    }

    if (xmlBytes.byteLength !== configSize) {
      throw new BadRequestException('X-Config-Size does not match payload');
    }

    const computedSha256 = this.storage.sha256Hex(xmlBytes);
    if (computedSha256 !== configSha256) {
      throw new BadRequestException('X-Config-Sha256 does not match payload');
    }

    const idempotencySince = new Date(
      receivedAt.getTime() -
        appConfig.configBackup.attemptIdempotencyHours * 60 * 60 * 1000,
    );
    const priorAttempt = await this.prisma.nodeConfigBackup.findFirst({
      where: {
        nodeId: node.id,
        attemptId,
        configSha256,
        receivedAt: {
          gte: idempotencySince,
        },
        status: {
          in: [ConfigBackupStatus.stored, ConfigBackupStatus.duplicate],
        },
      },
      orderBy: {
        receivedAt: 'desc',
      },
    });

    if (priorAttempt) {
      if (request.headerCommandId) {
        await this.commandService.markCommandSucceeded({
          nodeId: node.id,
          commandId: request.headerCommandId,
          duplicate: priorAttempt.status === ConfigBackupStatus.duplicate,
          sha256: configSha256,
          backupUid: priorAttempt.backupUid,
        });
      }

      await this.prisma.nodeCredential.update({
        where: { id: credential.id },
        data: { lastUsedAt: receivedAt },
      });

      return {
        ok: true,
        server_time: receivedAt.toISOString(),
        backup_id: priorAttempt.backupUid,
        stored: priorAttempt.status === ConfigBackupStatus.stored,
        duplicate: true,
        sha256: configSha256,
      };
    }

    const latestStored = await this.prisma.nodeConfigBackup.findFirst({
      where: {
        nodeId: node.id,
        status: ConfigBackupStatus.stored,
      },
      orderBy: {
        receivedAt: 'desc',
      },
    });

    const isDuplicate =
      latestStored !== null && latestStored.configSha256 === configSha256;
    const source = request.headerCommandId ? 'manual_request' : 'scheduled';
    const storedBackupUid = this.buildBackupUid(receivedAt, configSha256);

    if (isDuplicate) {
      if (!request.headerCommandId) {
        return this.suppressScheduledDuplicate({
          nodeId: node.id,
          headerNodeUid,
          credentialId: credential.id,
          configSha256,
          backupUid: latestStored?.backupUid ?? '',
          receivedAt,
          clientIp: request.clientIp,
          agentVersion: request.headerAgentVersion,
        });
      }

      const duplicateBackupUid = `cfgbdup_${attemptId.replace(/-/g, '')}`;
      const duplicateRecord = await this.prisma.nodeConfigBackup.create({
        data: {
          nodeId: node.id,
          commandId: request.headerCommandId ?? null,
          backupUid: duplicateBackupUid,
          attemptId,
          status: ConfigBackupStatus.duplicate,
          source,
          receivedAt,
          configSha256,
          payloadSha256,
          sizeBytes: configSize,
          payloadSizeBytes: request.rawBody.byteLength,
          compression: isGzip ? 'gzip' : null,
          agentVersion: request.headerAgentVersion ?? null,
          pfsenseVersion: request.headerPfsenseVersion ?? null,
          metadataJson: {
            duplicate_of: latestStored?.backupUid ?? null,
          },
        },
      });

      await this.prisma.auditLog.create({
        data: {
          actorType: 'node_credential',
          actorId: credential.id,
          action: 'backup.config.duplicate',
          targetType: 'node_config_backup',
          targetId: duplicateRecord.id,
          ipAddress: request.clientIp,
          metadataJson: {
            node_id: node.id,
            node_uid: headerNodeUid,
            backup_uid: duplicateBackupUid,
            sha256: configSha256,
            command_id: request.headerCommandId ?? null,
          },
        },
      });

      if (request.headerCommandId) {
        await this.commandService.markCommandSucceeded({
          nodeId: node.id,
          commandId: request.headerCommandId,
          duplicate: true,
          sha256: configSha256,
          backupUid: latestStored?.backupUid,
        });
      }

      await this.prisma.nodeCredential.update({
        where: { id: credential.id },
        data: { lastUsedAt: receivedAt },
      });

      this.logger.log(
        `config backup duplicate node_uid=${headerNodeUid} sha256=${configSha256.slice(0, 8)}`,
      );

      return {
        ok: true,
        server_time: receivedAt.toISOString(),
        backup_id: latestStored?.backupUid ?? duplicateBackupUid,
        stored: false,
        duplicate: true,
        sha256: configSha256,
      };
    }

    const { relativePath, absolutePath } = this.storage.buildStoragePath(
      headerNodeUid,
      receivedAt,
      configSha256,
    );

    try {
      await this.storage.encryptToFile(xmlBytes, absolutePath);
    } catch (error) {
      await this.storage.removeFile(absolutePath);
      await this.prisma.auditLog.create({
        data: {
          actorType: 'node_credential',
          actorId: credential.id,
          action: 'backup.config.failure',
          targetType: 'node',
          targetId: node.id,
          ipAddress: request.clientIp,
          metadataJson: {
            node_uid: headerNodeUid,
            reason: 'encryption_failed',
          },
        },
      });
      throw error;
    }

    const storedRecord = await this.prisma.nodeConfigBackup.create({
      data: {
        nodeId: node.id,
        commandId: request.headerCommandId ?? null,
        backupUid: storedBackupUid,
        attemptId,
        status: ConfigBackupStatus.stored,
        source,
        receivedAt,
        configSha256,
        payloadSha256,
        sizeBytes: configSize,
        payloadSizeBytes: request.rawBody.byteLength,
        compression: isGzip ? 'gzip' : null,
        storagePath: absolutePath,
        encryptionVersion: appConfig.configBackup.encryptionVersion,
        agentVersion: request.headerAgentVersion ?? null,
        pfsenseVersion: request.headerPfsenseVersion ?? null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'node_credential',
        actorId: credential.id,
        action: 'backup.config.ingest',
        targetType: 'node_config_backup',
        targetId: storedRecord.id,
        ipAddress: request.clientIp,
        metadataJson: {
          node_id: node.id,
          node_uid: headerNodeUid,
          backup_uid: storedBackupUid,
          sha256: configSha256,
          size_bytes: configSize,
          command_id: request.headerCommandId ?? null,
          storage_path: relativePath,
        },
      },
    });

    if (request.headerCommandId) {
      await this.commandService.markCommandSucceeded({
        nodeId: node.id,
        commandId: request.headerCommandId,
        duplicate: false,
        sha256: configSha256,
        backupUid: storedBackupUid,
      });
    }

    await this.prisma.nodeCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: receivedAt },
    });

    await this.persistBackupPolicyFromHeaders({
      nodeId: node.id,
      receivedAt,
      headerBackupEnabled: request.headerBackupEnabled,
      headerBackupScheduleMode: request.headerBackupScheduleMode,
      headerBackupIntervalHours: request.headerBackupIntervalHours,
      headerBackupScheduleTime: request.headerBackupScheduleTime,
      headerBackupScheduleDow: request.headerBackupScheduleDow,
      headerBackupScheduleDom: request.headerBackupScheduleDom,
    });

    await this.retention.enforceRetention(node.id);

    await this.driftService.evaluateStoredBackup(node.id, storedRecord.id);

    this.logger.log(
      `config backup stored node_uid=${headerNodeUid} backup_uid=${storedBackupUid} size=${configSize}`,
    );

    return {
      ok: true,
      server_time: receivedAt.toISOString(),
      backup_id: storedBackupUid,
      stored: true,
      duplicate: false,
      sha256: configSha256,
    };
  }

  private async suppressScheduledDuplicate(input: {
    nodeId: string;
    headerNodeUid: string;
    credentialId: string;
    configSha256: string;
    backupUid: string;
    receivedAt: Date;
    clientIp?: string;
    agentVersion?: string;
  }): Promise<{
    ok: true;
    server_time: string;
    backup_id: string;
    stored: boolean;
    duplicate: boolean;
    sha256: string;
  }> {
    await this.prisma.nodeCredential.update({
      where: { id: input.credentialId },
      data: { lastUsedAt: input.receivedAt },
    });

    this.trackScheduledDuplicateFlood(input.nodeId, input.headerNodeUid, {
      agentVersion: input.agentVersion,
      sha256: input.configSha256,
    });

    return {
      ok: true,
      server_time: input.receivedAt.toISOString(),
      backup_id: input.backupUid,
      stored: false,
      duplicate: true,
      sha256: input.configSha256,
    };
  }

  private trackScheduledDuplicateFlood(
    nodeId: string,
    headerNodeUid: string,
    context: { agentVersion?: string; sha256: string },
  ): void {
    const now = Date.now();
    const bucket = this.scheduledDuplicateFlood.get(nodeId);

    if (
      !bucket ||
      now - bucket.windowStart >= this.scheduledDuplicateFloodWindowMs
    ) {
      this.scheduledDuplicateFlood.set(nodeId, {
        count: 1,
        windowStart: now,
        warned: false,
      });
      return;
    }

    bucket.count += 1;

    if (
      !bucket.warned &&
      bucket.count >= this.scheduledDuplicateFloodWarnThreshold
    ) {
      bucket.warned = true;
      this.logger.warn(
        `config backup scheduled duplicate flood node_uid=${headerNodeUid} count=${bucket.count}/h ` +
          `agent=${context.agentVersion ?? 'unknown'} sha256=${context.sha256.slice(0, 8)} ` +
          `(agente desatualizado ou bug de agendamento; atualizar package >= 0.2.35)`,
      );
    }
  }

  private buildBackupUid(receivedAt: Date, configSha256: string): string {
    const timestamp = receivedAt
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
    return `cfgb_${timestamp}_${configSha256.slice(0, 8)}`;
  }

  private requireHeader(name: string, value?: string): string {
    if (!value?.trim()) {
      throw new BadRequestException(`${name} header is required`);
    }
    return value.trim();
  }

  private parsePositiveInt(value: string, fieldName: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(`${fieldName} must be a positive integer`);
    }
    return parsed;
  }

  private assertPayloadSize(rawBody: Buffer): void {
    if (rawBody.byteLength > appConfig.configBackup.maxBytes) {
      throw new PayloadTooLargeException(
        `config backup payload exceeds ${appConfig.configBackup.maxBytes} bytes`,
      );
    }
  }

  private async persistBackupPolicyFromHeaders(input: {
    nodeId: string;
    receivedAt: Date;
    headerBackupEnabled?: string;
    headerBackupScheduleMode?: string;
    headerBackupIntervalHours?: string;
    headerBackupScheduleTime?: string;
    headerBackupScheduleDow?: string;
    headerBackupScheduleDom?: string;
  }): Promise<void> {
    if (
      input.headerBackupScheduleMode == null &&
      input.headerBackupEnabled == null
    ) {
      return;
    }

    const policy = normalizeBackupSchedulePolicy({
      enabled: input.headerBackupEnabled ?? '1',
      schedule_mode: input.headerBackupScheduleMode,
      interval_hours: input.headerBackupIntervalHours,
      schedule_time: input.headerBackupScheduleTime,
      schedule_dow: input.headerBackupScheduleDow,
      schedule_dom: input.headerBackupScheduleDom,
    });

    if (!policy) {
      return;
    }

    await this.prisma.node.update({
      where: { id: input.nodeId },
      data: {
        configBackupPolicyJson: toStoredBackupPolicyJson(
          policy,
          input.receivedAt,
        ),
      },
    });
  }
}
