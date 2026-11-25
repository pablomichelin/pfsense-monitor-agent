import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigBackupStatus, type NodeConfigBackup, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { isAgentVersionAtLeast } from '../common/agent-version';
import { gunzipSync } from 'zlib';
import { appConfig } from '../config/app-config';
import { NodeRequestAuthService, type AuthenticatedNodeRequest } from '../common/node-request-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveBackupArtifactUid } from './backups-artifact-uid.util';
import { BackupsCommandService } from './backups-command.service';
import { lockBackupPolicyRow } from './backups-policy-lock.util';
import { BackupsRetentionService } from './backups-retention.service';
import { BackupsStorageService } from './backups-storage.service';
import { BackupsDriftService } from './backups-drift.service';
import {
  mergeBackupSchedulePolicy,
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

type ConfigBackupRequest = {
    rawBody: Buffer;
    headerNodeUid?: string;
    headerTimestamp?: string;
    headerSignature?: string;
    headerConfigSha256?: string;
    headerConfigSize?: string;
    headerBackupId?: string;
    headerCommandId?: string;
    headerCommandDeliveryAttempt?: string;
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
  };
type BackupIngestResponse = {
    ok: true;
    server_time: string;
    backup_id: string;
    stored: boolean;
    duplicate: boolean;
    sha256: string;
  };
type ValidatedBackup = {
  attemptId: string;
  configSha256: string;
  configSize: number;
  isGzip: boolean;
  xmlBytes: Buffer;
};
type BackupAdmission = {
  priorAttempt: NodeConfigBackup | null;
  latestStored: NodeConfigBackup | null;
  needsFile: boolean;
};
type BackupFile = {
  absolutePath: string;
  relativePath: string;
  storedBackupUid: string;
};
type BackupIngestContext = {
  db: Prisma.TransactionClient;
  deliveryAttempt?: number;
  scheduledBackupRecordId?: string;
  scheduledStaging?: BackupFile;
  scheduledInsertStarted?: boolean;
  afterCommit: Array<() => Promise<unknown>>;
  auditAfterRollback?: () => Promise<unknown>;
  createdPaths: Set<string>;
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

  async ingestConfigBackup(request: ConfigBackupRequest): Promise<BackupIngestResponse> {
    const receivedAt = new Date();
    this.assertPayloadSize(request.rawBody);

    const authenticated = await this.nodeRequestAuth.authenticateNodeRequest({
        headerNodeUid: request.headerNodeUid,
        headerTimestamp: request.headerTimestamp,
        headerSignature: request.headerSignature,
        rawBody: request.rawBody,
        receivedAt,
      });

    const context: BackupIngestContext = {
      db: this.prisma, afterCommit: [], createdPaths: new Set(),
    };
    const scheduled = !request.headerCommandId;
    let preparedResponse: BackupIngestResponse | undefined;
    let callbackReturned = false;
    const prepare = async (
      tx: Prisma.TransactionClient,
      payload?: ValidatedBackup,
      admission?: BackupAdmission,
    ) => {
      context.db = tx;
      preparedResponse = await this.ingestAuthenticatedBackup(
        request, authenticated, receivedAt, context, payload, admission,
      );
      return preparedResponse;
    };

    let response: BackupIngestResponse;
    try {
      if (scheduled) {
        const payload = this.validateBackup(request);
        const readAdmission = (db: Prisma.TransactionClient) =>
          this.readBackupAdmission(db, authenticated.node.id, request, receivedAt, payload);
        const stage = () => this.writeBackupFile(request, authenticated, receivedAt, payload, context);
        const publish = () => this.prisma.$transaction(async (tx) => {
          if (!await lockBackupPolicyRow(tx, authenticated.node.id)) {
            throw new NotFoundException('node not found');
          }
          const admission = await readAdmission(tx);
          if (admission.needsFile && !context.scheduledStaging) return undefined;

          const prepared = await prepare(tx, payload, admission);
          callbackReturned = true;
          return prepared;
        }, { timeout: 30_000 });

        // The preliminary read is only an optimization. A manual upload or a
        // concurrent retry may change the answer before the node lock is held.
        if ((await readAdmission(this.prisma)).needsFile) await stage();
        let published = await publish();
        if (!published) {
          await stage();
          published = await publish();
        }
        if (!published) throw new InternalServerErrorException('scheduled backup was not prepared');
        response = published;
      } else if (request.headerCommandId && isAgentVersionAtLeast(authenticated.node.agentVersion, '0.5.26')) {
        if (!UUID_V4_REGEX.test(request.headerCommandId)) {
          throw new BadRequestException('X-Command-Id must be a UUID v4');
        }
        const rawAttempt = request.headerCommandDeliveryAttempt;
        if (rawAttempt == null || !/^(0|[1-9][0-9]*)$/.test(rawAttempt) ||
            Number(rawAttempt) > 2_147_483_647) {
          throw new BadRequestException('X-Command-Delivery-Attempt must be an integer >= 0');
        }
        context.deliveryAttempt = Number(rawAttempt);
        response = await this.commandService.withBackupDeliveryAttempt({
          nodeId: authenticated.node.id, commandId: request.headerCommandId,
          deliveryAttempt: context.deliveryAttempt,
        }, prepare, () => { callbackReturned = true; });
      } else {
        response = await this.ingestAuthenticatedBackup(request, authenticated, receivedAt, context);
      }
    } catch (error) {
      // If COMMIT's reply was lost, a prepared response plus the persisted
      // record proves success. Never delete its file or report a false failure.
      let committed = false;
      if (preparedResponse && callbackReturned) {
        try {
          if (scheduled && context.scheduledBackupRecordId) {
            committed = !!await this.prisma.nodeConfigBackup.findFirst({
              where: {
                id: context.scheduledBackupRecordId,
                nodeId: authenticated.node.id,
                configSha256: preparedResponse.sha256,
              },
            });
          } else if (!scheduled) {
            committed = !!await this.prisma.nodeConfigBackup.findFirst({
              where: {
                nodeId: authenticated.node.id, commandId: request.headerCommandId,
                attemptId: request.headerBackupId,
                configSha256: request.headerConfigSha256?.toLowerCase(),
                metadataJson: { path: ['delivery_attempt'], equals: context.deliveryAttempt },
              },
            });
          }
        } catch { /* Unknown commit outcome: retain encrypted files for recovery. */ }
      }
      if (committed && preparedResponse) {
        response = preparedResponse;
      } else {
        // Only files of a rolled-back callback are eligible for removal. Once
        // prepared, an uncertain COMMIT must leave files intact, never dangling.
        if (!callbackReturned) {
          for (const path of context.createdPaths) {
            if (scheduled && !context.scheduledInsertStarted) continue;
            try {
              const referenced = await this.prisma.nodeConfigBackup.findFirst({ where: { storagePath: path } });
              if (!referenced) await this.storage.removeFile(path);
            } catch { /* Retain ciphertext if the database cannot prove ownership. */ }
          }
          await context.auditAfterRollback?.();
        }
        throw error;
      }
    } finally {
      if (context.scheduledStaging && !context.scheduledInsertStarted) {
        // This unique path never reached an insert, even if the transaction's
        // reply for reusing another backup was lost.
        await this.storage.removeFile(context.scheduledStaging.absolutePath);
      }
    }
    // A discarded staging can still have confirmed duplicate accounting.
    for (const afterCommit of context.afterCommit) {
      if (scheduled) {
        await afterCommit();
      } else {
        try { await afterCommit(); }
        catch { this.logger.warn('committed backup post-processing pending; ingest remains successful'); }
      }
    }
    return response;
  }

  private async ingestAuthenticatedBackup(
    request: ConfigBackupRequest,
    { headerNodeUid, node, credential }: AuthenticatedNodeRequest,
    receivedAt: Date,
    context: BackupIngestContext,
    payload = this.validateBackup(request),
    admission?: BackupAdmission,
  ): Promise<BackupIngestResponse> {
    const db = context.db;
    const scheduled = !request.headerCommandId;
    const durableCommand = context.deliveryAttempt != null;
    const transactional = scheduled || durableCommand;
    const { attemptId, configSha256, configSize, isGzip } = payload;
    const { priorAttempt, latestStored } = admission ?? await this.readBackupAdmission(
      db, node.id, request, receivedAt, payload, context.deliveryAttempt,
    );

    if (priorAttempt) {
      if (scheduled) context.scheduledBackupRecordId = priorAttempt.id;
      const backupUid = resolveBackupArtifactUid(priorAttempt);
      const duplicate = priorAttempt.status === ConfigBackupStatus.duplicate;

      if (request.headerCommandId) {
        await this.commandService.markCommandSucceeded({
          nodeId: node.id,
          commandId: request.headerCommandId,
          duplicate,
          sha256: configSha256,
          backupUid,
          deliveryAttempt: context.deliveryAttempt,
        }, transactional ? db : undefined);
      }

      await db.nodeCredential.update({
        where: { id: credential.id },
        data: { lastUsedAt: receivedAt },
      });

      return {
        ok: true,
        server_time: receivedAt.toISOString(),
        backup_id: backupUid,
        stored: !duplicate,
        duplicate,
        sha256: configSha256,
      };
    }

    const isDuplicate =
      latestStored !== null && latestStored.configSha256 === configSha256;
    if (isDuplicate && scheduled) {
      context.scheduledBackupRecordId = latestStored.id;
      return this.suppressScheduledDuplicate({
        nodeId: node.id,
        headerNodeUid,
        credentialId: credential.id,
        configSha256,
        backupUid: latestStored.backupUid,
        receivedAt,
        clientIp: request.clientIp,
        agentVersion: request.headerAgentVersion,
      }, context);
    }

    const source = request.headerCommandId ? 'manual_request' : 'scheduled';
    const payloadSha256 = isGzip ? this.storage.sha256Hex(request.rawBody) : configSha256;

    if (isDuplicate) {
      const duplicateBackupUid = `cfgbdup_${attemptId.replace(/-/g, '')}` +
        (durableCommand ? `_a${context.deliveryAttempt}` : '');
      const duplicateRecord = await db.nodeConfigBackup.create({
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
            ...(durableCommand ? { delivery_attempt: context.deliveryAttempt } : {}),
          },
        },
      });

      await db.auditLog.create({
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
          deliveryAttempt: context.deliveryAttempt,
        }, transactional ? db : undefined);
      }

      await db.nodeCredential.update({
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

    const file = scheduled ? context.scheduledStaging : await this.writeBackupFile(
      request, { headerNodeUid, node, credential }, receivedAt, payload, context,
    );
    if (!file) throw new InternalServerErrorException('scheduled backup file was not staged');
    if (scheduled) context.scheduledInsertStarted = true;
    const { absolutePath, relativePath, storedBackupUid } = file;

    const storedRecord = await db.nodeConfigBackup.create({
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
        ...(durableCommand ? { metadataJson: { delivery_attempt: context.deliveryAttempt } } : {}),
      },
    });

    await db.auditLog.create({
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
        deliveryAttempt: context.deliveryAttempt,
      }, transactional ? db : undefined);
    }

    await db.nodeCredential.update({
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
    }, transactional ? db : undefined);

    if (scheduled) context.scheduledBackupRecordId = storedRecord.id;

    if (transactional) {
      context.afterCommit.push(() => this.retention.enforceRetention(node.id));
      context.afterCommit.push(() => this.driftService.evaluateStoredBackup(node.id, storedRecord.id));
    } else {
      await this.retention.enforceRetention(node.id);
      await this.driftService.evaluateStoredBackup(node.id, storedRecord.id);
    }

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

  private validateBackup(request: ConfigBackupRequest): ValidatedBackup {
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

    const compression = request.headerConfigCompression?.trim().toLowerCase();
    const isGzip =
      compression === 'gzip' ||
      request.contentType?.toLowerCase() === 'application/gzip';

    if (request.rawBody.byteLength === 0) {
      throw new BadRequestException('backup payload cannot be empty');
    }

    let xmlBytes = request.rawBody;
    if (isGzip) {
      // Zip-bomb protection: reject before decompressing when the declared
      // size (X-Config-Size) exceeds the configured limit.
      if (configSize > appConfig.configBackup.maxBytes) {
        throw new PayloadTooLargeException(
          `config backup decompressed size exceeds ${appConfig.configBackup.maxBytes} bytes`,
        );
      }
      try {
        xmlBytes = gunzipSync(request.rawBody, {
          maxOutputLength: appConfig.configBackup.maxBytes,
        });
      } catch {
        throw new BadRequestException('invalid or oversized gzip payload');
      }
    }

    if (xmlBytes.byteLength !== configSize) {
      throw new BadRequestException('X-Config-Size does not match payload');
    }

    const computedSha256 = this.storage.sha256Hex(xmlBytes);
    if (computedSha256 !== configSha256) {
      throw new BadRequestException('X-Config-Sha256 does not match payload');
    }

    return { attemptId, configSha256, configSize, isGzip, xmlBytes };
  }

  private async readBackupAdmission(
    db: Prisma.TransactionClient,
    nodeId: string,
    request: ConfigBackupRequest,
    receivedAt: Date,
    { attemptId, configSha256 }: ValidatedBackup,
    deliveryAttempt?: number,
  ): Promise<BackupAdmission> {
    const idempotencySince = new Date(
      receivedAt.getTime() -
        appConfig.configBackup.attemptIdempotencyHours * 60 * 60 * 1000,
    );
    const priorAttempt = await db.nodeConfigBackup.findFirst({
      where: {
        nodeId,
        attemptId,
        commandId: request.headerCommandId ?? null,
        ...(deliveryAttempt != null ? {
          metadataJson: { path: ['delivery_attempt'], equals: deliveryAttempt },
        } : {}),
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
    const latestStored = priorAttempt ? null : await db.nodeConfigBackup.findFirst({
      where: {
        nodeId,
        status: ConfigBackupStatus.stored,
      },
      orderBy: {
        receivedAt: 'desc',
      },
    });

    return { priorAttempt, latestStored, needsFile: !priorAttempt && latestStored?.configSha256 !== configSha256 };
  }

  private async writeBackupFile(
    request: ConfigBackupRequest,
    { headerNodeUid, node, credential }: AuthenticatedNodeRequest,
    receivedAt: Date,
    { configSha256, xmlBytes }: ValidatedBackup,
    context: BackupIngestContext,
  ): Promise<BackupFile> {
    const scheduled = !request.headerCommandId;
    const durableCommand = context.deliveryAttempt != null;
    const transactional = scheduled || durableCommand;
    const storageNonce = transactional ? randomUUID() : undefined;
    const storedBackupUid = this.buildBackupUid(receivedAt, configSha256) +
      (durableCommand && storageNonce ? `_${storageNonce}` : '');
    const storagePath = this.storage.buildStoragePath(
      headerNodeUid,
      receivedAt,
      configSha256,
    );

    // A fresh nonce avoids overwriting any prior path, even two uploads in the
    // same second. Cleanup after rollback owns only this newly allocated path.
    const relativePath = storageNonce
      ? storagePath.relativePath.replace(/\.enc$/, `.${storageNonce}.enc`) : storagePath.relativePath;
    const absolutePath = storageNonce
      ? storagePath.absolutePath.replace(/\.enc$/, `.${storageNonce}.enc`) : storagePath.absolutePath;
    const file = { absolutePath, relativePath, storedBackupUid };
    if (scheduled) context.scheduledStaging = file;
    if (transactional) context.createdPaths.add(absolutePath);
    try {
      await this.storage.encryptToFile(xmlBytes, absolutePath);
    } catch (error) {
      const failureAudit = {
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
      };
      if (scheduled) {
        context.auditAfterRollback = () => this.prisma.auditLog.create({ data: failureAudit });
      } else {
        await this.storage.removeFile(absolutePath);
        await context.db.auditLog.create({ data: failureAudit });
      }
      throw error;
    }

    return file;
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
  }, context: BackupIngestContext): Promise<BackupIngestResponse> {
    await context.db.nodeCredential.update({
      where: { id: input.credentialId },
      data: { lastUsedAt: input.receivedAt },
    });

    context.afterCommit.push(async () => {
      this.trackScheduledDuplicateFlood(input.nodeId, input.headerNodeUid, {
        agentVersion: input.agentVersion,
        sha256: input.configSha256,
      });
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
  }, uploadTransaction?: Prisma.TransactionClient): Promise<void> {
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

    const reportedSchedule = toStoredBackupPolicyJson(policy, input.receivedAt);
    const save = async (tx: Prisma.TransactionClient) => {
      // The upload transaction already holds the node lock.
      const node = uploadTransaction
        ? await tx.node.findUnique({
            where: { id: input.nodeId },
            select: { configBackupPolicyJson: true },
          })
        : await lockBackupPolicyRow(tx, input.nodeId);
      if (!node) throw new NotFoundException('node not found');

      await tx.node.update({
        where: { id: input.nodeId },
        data: {
          configBackupPolicyJson: mergeBackupSchedulePolicy(
            node.configBackupPolicyJson,
            reportedSchedule,
          ),
        },
      });
    };

    if (uploadTransaction) {
      await save(uploadTransaction);
    } else {
      await this.prisma.$transaction(save);
    }
  }
}
