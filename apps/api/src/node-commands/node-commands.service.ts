import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import {
  NodeCommand,
  NodeCommandStatus,
  NodeCommandType,
  JobBatchStatus,
  Prisma,
  TechnicianNodeAccountStatus,
} from '@prisma/client';
import { restoreCommandMaintenance } from './command-maintenance';
import { getCommandDefinition } from '../commands/command-registry';
import { appConfig } from '../config/app-config';
import { isAgentVersionAtLeast } from '../common/agent-version';
import { PrismaService } from '../prisma/prisma.service';
import {
  parseFollowUpTechnicianProvision,
  scrubPasswordFromPayload,
  scrubSensitiveCommandPayload,
} from '../technicians/technician-accounts.util';
import { TechnicianBackupFollowUpService } from '../technicians/technician-backup-followup.service';

export interface PendingCommandPayload {
  id: string;
  type: NodeCommandType;
  expires_at: string;
  payload?: Record<string, unknown>;
  status?: NodeCommandStatus;
  delivery_state?: CommandDeliveryState;
  delivery_attempt?: number;
}

type CommandDeliveryState = 'awaiting_pickup' | 'ready' | 'execution_committed' | 'terminal';

export interface CommandAckResponse {
  ok: true;
  command_id: string;
  status: NodeCommandStatus;
  terminal?: boolean;
  delivery_state?: CommandDeliveryState;
  execute?: boolean;
  recovery_required?: boolean;
  delivery_attempt?: number;
}

export function assertMatchingDeliveryAttempt(
  command: NodeCommand, attempt: number | undefined, required: boolean,
): void {
  if (!required) return;
  if (!Number.isInteger(attempt) || attempt! < 0 || attempt! > 2_147_483_647) {
    throw new BadRequestException('delivery_attempt must be an integer >= 0');
  }
  if (attempt !== command.retryCount) {
    throw new ConflictException('delivery attempt does not match current command');
  }
}

const LATE_RESULT_COMMAND_TYPES: NodeCommandType[] = [
  NodeCommandType.pfsense_upgrade,
  NodeCommandType.local_user_create,
  NodeCommandType.local_user_set_password,
  NodeCommandType.local_user_disable,
  NodeCommandType.local_user_delete,
  NodeCommandType.config_backup_now,
];

const ACTIVE_STATUSES: NodeCommandStatus[] = [
  NodeCommandStatus.pending,
  NodeCommandStatus.picked_up,
  NodeCommandStatus.running,
];

export function toAgentCommandPayload(
  type: NodeCommandType,
  payloadJson: Prisma.JsonValue | null,
): Record<string, unknown> | undefined {
  if (!payloadJson || typeof payloadJson !== 'object' || Array.isArray(payloadJson)) {
    return undefined;
  }

  const raw = payloadJson as Record<string, unknown>;

  if (type === NodeCommandType.pfsense_upgrade) {
    if (raw.target_version == null) {
      return undefined;
    }

    return {
      target_version: raw.target_version,
    };
  }

  if (type === NodeCommandType.package_upgrade) {
    const targetVersion = raw.target_version;
    const artifactUrl = raw.artifact_url;
    const sha256 = raw.sha256;

    if (
      targetVersion == null ||
      typeof artifactUrl !== 'string' ||
      typeof sha256 !== 'string'
    ) {
      return undefined;
    }

    return {
      target_version: targetVersion,
      artifact_url: artifactUrl,
      sha256,
    };
  }

  if (type === NodeCommandType.table_search) {
    if (raw.mode === 'list') {
      return { mode: 'list' };
    }
    if (typeof raw.ip !== 'string' || !raw.ip.trim()) {
      return undefined;
    }

    return { ip: raw.ip.trim() };
  }

  if (type === NodeCommandType.table_entry_remove) {
    if (
      typeof raw.ip !== 'string' || !raw.ip.trim() ||
      typeof raw.table !== 'string' || !raw.table.trim()
    ) {
      return undefined;
    }

    return { ip: raw.ip.trim(), table: raw.table.trim() };
  }

  if (type === NodeCommandType.service_restart) {
    const service = raw.service;
    if (typeof service !== 'string' || !service.trim()) {
      return undefined;
    }

    return {
      service: service.trim().toLowerCase(),
    };
  }

  if (type === NodeCommandType.node_reboot) {
    const delaySeconds = raw.delay_seconds;
    if (delaySeconds == null) {
      return undefined;
    }

    return {
      delay_seconds: delaySeconds,
    };
  }

  if (type === NodeCommandType.local_user_create) {
    const pfsenseUsername = raw.pfsense_username ?? raw.username;
    if (typeof pfsenseUsername !== 'string' || !pfsenseUsername.trim()) {
      return undefined;
    }

    const payload: Record<string, unknown> = {
      pfsense_username: String(pfsenseUsername).trim().toLowerCase(),
    };

    if (typeof raw.full_name === 'string' && raw.full_name.trim()) {
      payload.full_name = raw.full_name.trim();
    }

    if (typeof raw.privilege_profile === 'string' && raw.privilege_profile.trim()) {
      payload.privilege_profile = raw.privilege_profile.trim();
    }

    if (typeof raw.password === 'string' && raw.password.length > 0) {
      payload.password = raw.password;
    }

    return payload;
  }

  if (
    type === NodeCommandType.local_user_set_password ||
    type === NodeCommandType.local_user_disable ||
    type === NodeCommandType.local_user_delete
  ) {
    const pfsenseUsername = raw.pfsense_username;
    if (typeof pfsenseUsername !== 'string' || !pfsenseUsername.trim()) {
      return undefined;
    }

    const payload: Record<string, unknown> = {
      pfsense_username: pfsenseUsername.trim().toLowerCase(),
    };

    if (
      type === NodeCommandType.local_user_set_password &&
      typeof raw.password === 'string' &&
      raw.password.length > 0
    ) {
      payload.password = raw.password;
    }

    return payload;
  }

  return undefined;
}

export interface UpgradePayloadJson {
  target_version?: string;
  maintenance_mode_before?: boolean;
  maintenance_mode_toggled?: boolean;
  maintenance_restored_at?: string | null;
  backup_acknowledged_without_recent?: boolean;
}

@Injectable()
export class NodeCommandsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NodeCommandsService.name);
  private timer?: NodeJS.Timeout;
  private readonly warnedStuckCommandIds = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TechnicianBackupFollowUpService))
    private readonly technicianBackupFollowUp: TechnicianBackupFollowUpService,
  ) {}

  onModuleInit(): void {
    void this.expireStaleCommands('startup');
    void this.warnStuckPendingCommands();

    this.timer = setInterval(() => {
      void this.expireStaleCommands('interval');
      void this.warnStuckPendingCommands();
    }, 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  getCommandExpireMinutes(type: NodeCommandType): number {
    if (type === NodeCommandType.pfsense_upgrade) {
      return appConfig.pfsenseUpgrade.commandExpireMinutes;
    }

    if (type === NodeCommandType.package_upgrade) {
      return appConfig.packageUpgrade.commandExpireMinutes;
    }

    if (
      type === NodeCommandType.service_restart ||
      type === NodeCommandType.node_reboot
    ) {
      return appConfig.operationalActions.commandExpireMinutes;
    }

    if (
      type === NodeCommandType.local_user_create ||
      type === NodeCommandType.local_user_set_password ||
      type === NodeCommandType.local_user_disable ||
      type === NodeCommandType.local_user_delete
    ) {
      return appConfig.technicianAccounts.commandExpireMinutes;
    }

    return appConfig.configBackup.commandExpireMinutes;
  }

  async getPendingCommandsForNode(
    nodeId: string,
    deliveryChannel: 'agent' | 'supervisor_v1' = 'agent',
  ): Promise<PendingCommandPayload[]> {
    const now = new Date();
    const durableDelivery = await this.supportsDurableDelivery(nodeId);
    // Running is an execution boundary, never a queue for replay. Legacy agents
    // lose the password at pickup and must never receive a scrubbed redelivery.
    const commands = await this.prisma.nodeCommand.findMany({
      where: {
        nodeId,
        expiresAt: {
          gt: now,
        },
        AND: [
          {
            OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
          },
          {
            OR: [
              { status: NodeCommandStatus.pending },
              {
                status: NodeCommandStatus.picked_up,
                ...(!durableDelivery ? { type: {
                  notIn: [
                    NodeCommandType.local_user_create,
                    NodeCommandType.local_user_set_password,
                  ],
                } } : {}),
              },
            ],
          },
        ],
      },
      orderBy: {
        requestedAt: 'asc',
      },
    });

    return commands.filter((command) => {
      const payload = command.payloadJson as Record<string, unknown> | null;
      const recovery = command.type === NodeCommandType.service_restart && payload?.delivery_channel === 'supervisor_v1';
      return deliveryChannel === 'supervisor_v1' ? recovery : !recovery;
    }).map((command) => ({
      id: command.id,
      type: command.type,
      expires_at: command.expiresAt.toISOString(),
      payload: toAgentCommandPayload(command.type, command.payloadJson),
      ...(durableDelivery ? {
        status: command.status,
        delivery_state: this.deliveryState(command.status),
        delivery_attempt: command.retryCount,
      } : {}),
    }));
  }

  async supportsDurableDelivery(
    nodeId: string, db: Prisma.TransactionClient = this.prisma,
  ): Promise<boolean> {
    const node = await db.node.findUnique({
      where: { id: nodeId }, select: { agentVersion: true },
    });
    return isAgentVersionAtLeast(node?.agentVersion, '0.5.26');
  }

  private deliveryState(status: NodeCommandStatus): CommandDeliveryState {
    if (status === 'pending') return 'awaiting_pickup';
    if (status === 'picked_up') return 'ready';
    if (status === 'running') return 'execution_committed';
    return 'terminal';
  }

  private ackResponse(command: NodeCommand, durable: boolean, execute = false): CommandAckResponse {
    return {
      ok: true, command_id: command.id, status: command.status,
      ...(durable ? {
        terminal: !ACTIVE_STATUSES.includes(command.status),
        delivery_state: this.deliveryState(command.status),
        delivery_attempt: command.retryCount,
        execute,
        recovery_required: command.status === 'running' && !execute,
      } : {}),
    };
  }

  async createCommand(input: {
    nodeId: string;
    type: NodeCommandType;
    requestedByUserId?: string;
    payloadJson?: Prisma.InputJsonValue;
    expiresAt: Date;
  }): Promise<NodeCommand> {
    return this.prisma.nodeCommand.create({
      data: {
        nodeId: input.nodeId,
        type: input.type,
        status: NodeCommandStatus.pending,
        requestedByUserId: input.requestedByUserId,
        payloadJson: input.payloadJson,
        expiresAt: input.expiresAt,
      },
    });
  }

  async getCommandStatus(nodeId: string, commandId: string) {
    const command = await this.prisma.nodeCommand.findFirst({
      where: {
        id: commandId,
        nodeId,
      },
    });

    if (!command) {
      throw new NotFoundException('command not found');
    }

    return {
      command_id: command.id,
      node_id: command.nodeId,
      type: command.type,
      status: command.status,
      requested_at: command.requestedAt.toISOString(),
      picked_up_at: command.pickedUpAt?.toISOString() ?? null,
      running_at: command.runningAt?.toISOString() ?? null,
      completed_at: command.completedAt?.toISOString() ?? null,
      expires_at: command.expiresAt.toISOString(),
      result_json: command.resultJson,
      error_message: command.errorMessage,
    };
  }

  async acknowledgeCommand(input: {
    nodeId: string;
    credentialId: string;
    commandId: string;
    status: 'picked_up' | 'running';
    deliveryAttempt?: number;
    clientIp?: string;
  }): Promise<CommandAckResponse> {
    const durableDelivery = await this.supportsDurableDelivery(input.nodeId);
    return this.prisma.$transaction(async (tx) => {
      const command = await tx.nodeCommand.findFirst({
        where: { id: input.commandId, nodeId: input.nodeId },
      });
      if (!command) throw new NotFoundException('command not found');
      assertMatchingDeliveryAttempt(command, input.deliveryAttempt, durableDelivery);
      if (!ACTIVE_STATUSES.includes(command.status)) {
        // Legacy agents treat any 2xx as permission to execute, ignoring status.
        if (!durableDelivery) throw new NotFoundException('active command not found');
        return this.ackResponse(command, true);
      }
      const now = new Date();
      if (command.expiresAt.getTime() <= now.getTime()) {
        // Expiry worker owns terminal side effects; never grant execution while
        // an active row is waiting for that worker to persist expiry.
        if (!durableDelivery) throw new BadRequestException('command expired');
        return { ...this.ackResponse(command, true), execute: false, recovery_required: true };
      }
      if (command.status === 'running' && input.status === 'picked_up') {
        if (!durableDelivery) throw new BadRequestException('command cannot move back to picked_up');
        return this.ackResponse(command, true);
      }
      // Repeated ACK is a read. Only the first running CAS grants execution;
      // losing its HTTP response requires local reconciliation, never replay.
      if (command.status === input.status) return this.ackResponse(command, durableDelivery);
      const changed = await tx.nodeCommand.updateMany({
        where: {
          id: command.id, nodeId: input.nodeId, retryCount: command.retryCount,
          status: { in: input.status === 'running'
            ? [NodeCommandStatus.pending, NodeCommandStatus.picked_up]
            : [NodeCommandStatus.pending] },
          expiresAt: { gt: now },
        },
        data: {
          status: input.status,
          pickedUpAt: command.pickedUpAt ?? now,
          ...(input.status === 'running' ? { runningAt: now } : {}),
        },
      });
      const current = await tx.nodeCommand.findFirst({
        where: { id: command.id, nodeId: input.nodeId },
      });
      if (!current) throw new NotFoundException('command not found');
      if (changed.count === 0) {
        assertMatchingDeliveryAttempt(current, input.deliveryAttempt, durableDelivery);
        if (!durableDelivery && !ACTIVE_STATUSES.includes(current.status)) {
          throw new NotFoundException('active command not found');
        }
        if (!durableDelivery && input.status === 'picked_up' && current.status === 'running') {
          throw new BadRequestException('command cannot move back to picked_up');
        }
        return this.ackResponse(current, durableDelivery);
      }
      if ((durableDelivery ? input.status === 'running' : input.status === 'picked_up') &&
          (command.type === NodeCommandType.local_user_create ||
           command.type === NodeCommandType.local_user_set_password)) {
        await this.scrubCommandPassword(command.id, tx);
      }
      await tx.auditLog.create({
        data: {
          actorType: 'node_credential', actorId: input.credentialId,
          action: `${getCommandDefinition(command.type).auditPrefix}.request_picked_up`,
          targetType: 'node_command', targetId: command.id, ipAddress: input.clientIp,
          metadataJson: { node_id: input.nodeId, status: input.status, command_type: command.type },
        },
      });
      return this.ackResponse(current, durableDelivery, input.status === 'running');
    });
  }

  async reportCommandResult(input: {
    nodeId: string;
    credentialId: string;
    commandId: string;
    status: 'succeeded' | 'failed';
    errorMessage?: string;
    resultJson?: Record<string, unknown>;
    deliveryAttempt?: number;
    clientIp?: string;
  }): Promise<{ ok: true; command_id: string; status: NodeCommandStatus; delivery_attempt?: number }> {
    const { backupCommand, ...response } = await this.prisma.$transaction((tx) =>
      this.reportCommandResultInTransaction(input, tx),
    );
    if (backupCommand) await this.handleBackupCommandSucceeded(backupCommand);
    return response;
  }

  private async reportCommandResultInTransaction(
    input: Parameters<NodeCommandsService['reportCommandResult']>[0],
    tx: Prisma.TransactionClient,
  ): Promise<{ ok: true; command_id: string; status: NodeCommandStatus; delivery_attempt?: number; backupCommand?: NodeCommand }> {
    const command = await tx.nodeCommand.findFirst({
      where: { id: input.commandId, nodeId: input.nodeId },
    });
    if (!command) throw new NotFoundException('command not found');
    const durableDelivery = await this.supportsDurableDelivery(input.nodeId, tx);
    assertMatchingDeliveryAttempt(command, input.deliveryAttempt, durableDelivery);
    if (command.status === 'succeeded' || command.status === 'failed') {
      return { ok: true, command_id: command.id, status: command.status,
        ...(durableDelivery ? { delivery_attempt: command.retryCount } : {}) };
    }
    if (command.status === 'expired') return this.reconcileLateResult(input, command, tx);
    if (!ACTIVE_STATUSES.includes(command.status)) {
      throw new NotFoundException('active command not found');
    }
    const completedAt = new Date();
    if (command.expiresAt.getTime() <= completedAt.getTime()) {
      throw new BadRequestException('command expired');
    }
    const error = input.status === 'failed'
      ? (input.errorMessage ?? 'unknown error').trim().slice(0, 500) : null;
    const changed = await tx.nodeCommand.updateMany({
      where: {
        id: command.id,
        nodeId: input.nodeId,
        status: { in: ACTIVE_STATUSES },
        retryCount: command.retryCount,
        expiresAt: { gt: completedAt },
      },
      data: {
        status: input.status,
        completedAt,
        errorMessage: error,
        resultJson: (input.status === 'failed'
          ? { ...(input.resultJson ?? {}), error_message: error }
          : input.resultJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
    if (changed.count === 0) return this.currentResultResponse(tx, command, input.deliveryAttempt);

    // Hold the conditional update's row lock through all terminal side effects.
    const updated = (await tx.nodeCommand.findUnique({ where: { id: command.id } }))!;
    await restoreCommandMaintenance(tx, updated, completedAt);
    await tx.auditLog.create({
      data: {
        actorType: 'node_credential',
        actorId: input.credentialId,
        action: `${getCommandDefinition(command.type).auditPrefix}.request_${input.status}`,
        targetType: 'node_command',
        targetId: command.id,
        ipAddress: input.clientIp,
        metadataJson: {
          node_id: input.nodeId,
          command_type: command.type,
          ...(input.status === 'failed' ? { error_message: error } : input.resultJson ?? {}),
        },
      },
    });
    if (command.batchId) await this.reconcileBatchStatus(command.batchId, tx);
    await this.reconcileTechnicianNodeAccount(updated, input.status, error ?? undefined, tx);
    if (command.type !== NodeCommandType.config_backup_now || input.status === 'failed') {
      await tx.nodeCommand.update({
        where: { id: command.id },
        data: { payloadJson: scrubSensitiveCommandPayload(updated.payloadJson) as Prisma.InputJsonValue },
      });
    }
    return {
      ok: true,
      command_id: command.id,
      status: updated.status,
      ...(input.deliveryAttempt != null ? { delivery_attempt: updated.retryCount } : {}),
      ...(command.type === NodeCommandType.config_backup_now && input.status === 'succeeded'
        ? { backupCommand: updated } : {}),
    };
  }

  private async currentResultResponse(
    tx: Prisma.TransactionClient, command: NodeCommand, expectedAttempt?: number,
  ) {
    const current = await tx.nodeCommand.findFirst({
      where: { id: command.id, nodeId: command.nodeId },
    });
    if (!current) throw new NotFoundException('command not found');
    assertMatchingDeliveryAttempt(current, expectedAttempt, expectedAttempt != null);
    return { ok: true as const, command_id: command.id, status: current.status,
      ...(expectedAttempt != null ? { delivery_attempt: current.retryCount } : {}) };
  }

  private async scrubCommandPassword(commandId: string, db: Prisma.TransactionClient): Promise<void> {
    const command = await db.nodeCommand.findUnique({
      where: { id: commandId },
      select: { payloadJson: true },
    });

    if (!command?.payloadJson) {
      return;
    }

    const scrubbed = scrubPasswordFromPayload(command.payloadJson);
    if (scrubbed === command.payloadJson) {
      return;
    }

    await db.nodeCommand.update({
      where: { id: commandId },
      data: {
        payloadJson: scrubbed as Prisma.InputJsonValue,
      },
    });
  }

  private async reconcileTechnicianNodeAccount(
    command: NodeCommand,
    status: 'succeeded' | 'failed',
    errorMessage?: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    if (
      command.type !== NodeCommandType.local_user_create &&
      command.type !== NodeCommandType.local_user_set_password
    ) {
      return;
    }

    const payload =
      command.payloadJson &&
      typeof command.payloadJson === 'object' &&
      !Array.isArray(command.payloadJson)
        ? (command.payloadJson as Record<string, unknown>)
        : null;

    const accountId =
      typeof payload?.account_id === 'string' ? payload.account_id : null;
    const technicianId =
      typeof payload?.technician_id === 'string' ? payload.technician_id.trim() : null;

    const accountWhere = accountId
      ? { id: accountId }
      : technicianId
        ? { technicianId, nodeId: command.nodeId }
        : null;

    if (!accountWhere) {
      return;
    }

    if (status === 'succeeded') {
      await db.technicianNodeAccount.updateMany({
        where: { ...accountWhere, lastCommandId: command.id },
        data: {
          status: TechnicianNodeAccountStatus.active,
          lastSyncedAt: new Date(),
          lastError: null,
        },
      });
      return;
    }

    const truncatedError = (errorMessage ?? 'command failed').trim().slice(0, 500);
    await db.technicianNodeAccount.updateMany({
      where: { ...accountWhere, lastCommandId: command.id },
      data: {
        status: TechnicianNodeAccountStatus.failed,
        lastError: truncatedError,
      },
    });
  }

  private async reconcileBatchStatus(batchId: string, db: Prisma.TransactionClient = this.prisma): Promise<void> {
    const commands = await db.nodeCommand.findMany({
      where: { batchId },
      select: { status: true },
    });

    if (commands.length === 0) {
      return;
    }

    const counts = {
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      expired: 0,
      active: 0,
    };

    for (const entry of commands) {
      switch (entry.status) {
        case NodeCommandStatus.succeeded:
          counts.succeeded += 1;
          break;
        case NodeCommandStatus.failed:
          counts.failed += 1;
          break;
        case NodeCommandStatus.cancelled:
          counts.cancelled += 1;
          break;
        case NodeCommandStatus.expired:
          counts.expired += 1;
          break;
        default:
          counts.active += 1;
      }
    }

    let status: JobBatchStatus = JobBatchStatus.running;
    if (counts.active === 0) {
      if (counts.succeeded === commands.length) {
        status = JobBatchStatus.completed;
      } else if (counts.failed > 0) {
        status = JobBatchStatus.failed;
      } else if (counts.cancelled === commands.length) {
        status = JobBatchStatus.cancelled;
      } else {
        status = JobBatchStatus.completed;
      }
    }

    await db.jobBatch.update({
      where: { id: batchId },
      data: {
        status,
        succeededCount: counts.succeeded,
        failedCount: counts.failed,
        cancelledCount: counts.cancelled,
        expiredCount: counts.expired,
        completedAt: counts.active === 0 ? new Date() : null,
      },
    });
  }

  async countActiveUpgradeCommandsGlobal(): Promise<number> {
    return this.prisma.nodeCommand.count({
      where: {
        type: NodeCommandType.pfsense_upgrade,
        status: {
          in: ACTIVE_STATUSES,
        },
      },
    });
  }

  async hasActiveUpgradeCommand(nodeId: string): Promise<boolean> {
    const active = await this.prisma.nodeCommand.findFirst({
      where: {
        nodeId,
        type: NodeCommandType.pfsense_upgrade,
        status: {
          in: ACTIVE_STATUSES,
        },
      },
      select: {
        id: true,
      },
    });

    return active != null;
  }

  async loadActivePfsenseUpgradeNodeIds(now: Date): Promise<Set<string>> {
    const graceMinutes = appConfig.pfsenseUpgrade.offlineGraceMinutes;
    const graceMs = graceMinutes * 60_000;

    const commands = await this.prisma.nodeCommand.findMany({
      where: {
        type: NodeCommandType.pfsense_upgrade,
        status: {
          in: [NodeCommandStatus.picked_up, NodeCommandStatus.running],
        },
      },
      select: {
        nodeId: true,
        runningAt: true,
        pickedUpAt: true,
        requestedAt: true,
      },
    });

    const activeNodeIds = new Set<string>();

    for (const command of commands) {
      const graceAnchor =
        command.runningAt ?? command.pickedUpAt ?? command.requestedAt;
      if (now.getTime() <= graceAnchor.getTime() + graceMs) {
        activeNodeIds.add(command.nodeId);
      }
    }

    return activeNodeIds;
  }

  private async reconcileLateResult(
    input: {
      nodeId: string;
      credentialId: string;
      commandId: string;
      status: 'succeeded' | 'failed';
      errorMessage?: string;
      resultJson?: Record<string, unknown>;
      deliveryAttempt?: number;
      clientIp?: string;
    },
    command: NodeCommand,
    tx: Prisma.TransactionClient,
  ): Promise<{ ok: true; command_id: string; status: NodeCommandStatus; delivery_attempt?: number; backupCommand?: NodeCommand }> {
    if (!LATE_RESULT_COMMAND_TYPES.includes(command.type)) {
      throw new ConflictException('late result not accepted for this command type');
    }

    const completedAt = command.completedAt ?? new Date();
    const reconcileWindowMs =
      appConfig.pfsenseUpgrade.lateResultReconcileHours * 60 * 60_000;

    if (
      completedAt.getTime() + reconcileWindowMs <
      Date.now()
    ) {
      await tx.auditLog.create({
        data: {
          actorType: 'node_credential',
          actorId: input.credentialId,
          action: 'pfsense.upgrade.late_result_rejected',
          targetType: 'node_command',
          targetId: command.id,
          ipAddress: input.clientIp,
          metadataJson: {
            node_id: input.nodeId,
            completed_at: completedAt.toISOString(),
          },
        },
      });

      throw new ConflictException('late result outside reconciliation window');
    }

    const nextStatus =
      input.status === 'succeeded'
        ? NodeCommandStatus.succeeded
        : NodeCommandStatus.failed;

    const truncatedError =
      input.status === 'failed'
        ? (input.errorMessage ?? 'unknown error').trim().slice(0, 500)
        : undefined;

    const changed = await tx.nodeCommand.updateMany({
      where: {
        id: command.id,
        status: NodeCommandStatus.expired,
        completedAt: command.completedAt,
      },
      data: {
        status: nextStatus,
        errorMessage: truncatedError ?? null,
        resultJson: {
          ...(input.resultJson ?? {}),
          late_reconciliation: true,
          ...(truncatedError ? { error_message: truncatedError } : {}),
        },
      },
    });

    if (changed.count === 0) return this.currentResultResponse(tx, command, input.deliveryAttempt);
    const updated = (await tx.nodeCommand.findUnique({ where: { id: command.id } }))!;

    await tx.auditLog.create({
      data: {
        actorType: 'node_credential',
        actorId: input.credentialId,
        action:
          command.type === NodeCommandType.pfsense_upgrade
            ? 'pfsense.upgrade.late_result_reconciled'
            : 'node_command.late_result_reconciled',
        targetType: 'node_command',
        targetId: command.id,
        ipAddress: input.clientIp,
        metadataJson: {
          node_id: input.nodeId,
          status: nextStatus,
          command_type: command.type,
        },
      },
    });

    await this.reconcileTechnicianNodeAccount(
      updated,
      input.status,
      input.errorMessage,
      tx,
    );

    if (command.batchId) {
      await this.reconcileBatchStatus(command.batchId, tx);
    }


    return {
      ok: true,
      command_id: updated.id,
      status: updated.status,
      ...(input.deliveryAttempt != null ? { delivery_attempt: updated.retryCount } : {}),
      ...(command.type === NodeCommandType.config_backup_now && nextStatus === 'succeeded'
        ? { backupCommand: updated } : {}),
    };
  }

  async restoreMaintenanceModeIfNeeded(command: NodeCommand, restoredAt: Date): Promise<void> {
    await this.prisma.$transaction((tx) => restoreCommandMaintenance(tx, command, restoredAt));
  }

  private async findActiveCommand(nodeId: string, commandId: string, db: Prisma.TransactionClient) {
    const command = await db.nodeCommand.findFirst({
      where: {
        id: commandId,
        nodeId,
        status: {
          in: ACTIVE_STATUSES,
        },
      },
    });

    if (!command) {
      throw new NotFoundException('active command not found');
    }

    if (command.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('command expired');
    }

    return command;
  }

  private async expireStaleCommands(
    reason: 'startup' | 'interval',
  ): Promise<void> {
    const now = new Date();
    const expired = await this.prisma.nodeCommand.findMany({
      where: {
        status: {
          in: ACTIVE_STATUSES,
        },
        expiresAt: {
          lte: now,
        },
      },
    });

    if (expired.length === 0) {
      return;
    }

    const transitioned: NodeCommand[] = [];
    for (const candidate of expired) {
      const command = await this.prisma.$transaction(async (tx) => {
        const changed = await tx.nodeCommand.updateMany({
          where: { id: candidate.id, status: { in: ACTIVE_STATUSES }, expiresAt: { lte: now } },
          data: { status: NodeCommandStatus.expired, completedAt: now },
        });
        if (changed.count === 0) return null;
        const current = (await tx.nodeCommand.findUnique({ where: { id: candidate.id } }))!;
        await tx.auditLog.create({
          data: {
            actorType: 'system',
            action: `${getCommandDefinition(current.type).auditPrefix}.request_expired`,
            targetType: 'node_command',
            targetId: current.id,
            metadataJson: { node_id: current.nodeId, reason, command_type: current.type },
          },
        });
        await restoreCommandMaintenance(tx, current, now);
        await this.reconcileExpiredTechnicianSideEffects(current, tx);
        return current;
      });
      if (command) transitioned.push(command);
    }
    const batchIds = new Set(transitioned.map((command) => command.batchId).filter((id): id is string => id != null));
    for (const batchId of batchIds) await this.reconcileBatchStatus(batchId);
    this.logger.log(`expired ${transitioned.length} node commands reason=${reason}`);
  }

  private async reconcileExpiredTechnicianSideEffects(
    command: NodeCommand,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.reconcileTechnicianNodeAccount(
      command,
      'failed',
      'command expired',
      tx,
    );

    const followUp = command.type === NodeCommandType.config_backup_now
      ? parseFollowUpTechnicianProvision(command.payloadJson) : null;
    if (followUp) {
      await tx.technicianNodeAccount.updateMany({
        where: { id: followUp.account_id, lastCommandId: command.id },
        data: {
          status: TechnicianNodeAccountStatus.failed,
          lastError: 'command expired before backup follow-up',
        },
      });
    }

    const scrubbed = scrubSensitiveCommandPayload(command.payloadJson);
    if (scrubbed !== command.payloadJson) {
      await tx.nodeCommand.update({
        where: { id: command.id },
        data: {
          payloadJson: scrubbed as Prisma.InputJsonValue,
        },
      });
    }
  }

  private async warnStuckPendingCommands(): Promise<void> {
    const pendingSince = new Date(Date.now() - 90_000);
    const stuck = await this.prisma.nodeCommand.findMany({
      where: {
        status: NodeCommandStatus.pending,
        requestedAt: { lte: pendingSince },
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        nodeId: true,
        type: true,
        requestedAt: true,
      },
      take: 50,
    });

    for (const command of stuck) {
      if (this.warnedStuckCommandIds.has(command.id)) {
        continue;
      }

      this.warnedStuckCommandIds.add(command.id);
      const ageSeconds = Math.floor(
        (Date.now() - command.requestedAt.getTime()) / 1000,
      );
      this.logger.warn(
        `command still pending after ${ageSeconds}s command=${command.id} node=${command.nodeId} type=${command.type}`,
      );
    }
  }

  /** Dispara follow-up de provisionamento após config_backup_now succeeded. */
  async handleBackupCommandSucceeded(command: NodeCommand): Promise<void> {
    if (
      command.type !== NodeCommandType.config_backup_now ||
      command.status !== NodeCommandStatus.succeeded
    ) {
      return;
    }

    try {
      await this.technicianBackupFollowUp.processAfterBackupSuccess(command);
    } catch {
      // The committed backup payload is the durable outbox; its periodic
      // reconciler retries. An enqueue outage must not invalidate the upload.
      this.logger.warn(`backup follow-up pending retry command=${command.id}`);
    }
  }
}
