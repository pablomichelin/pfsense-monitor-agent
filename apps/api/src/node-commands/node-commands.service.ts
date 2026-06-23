import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  NodeCommand,
  NodeCommandStatus,
  NodeCommandType,
  Prisma,
} from '@prisma/client';
import { appConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';

export interface PendingCommandPayload {
  id: string;
  type: NodeCommandType;
  expires_at: string;
  payload?: Record<string, unknown>;
}

type CommandAuditPrefix = 'backup.config' | 'pfsense.upgrade';

const AUDIT_PREFIX_BY_TYPE: Record<NodeCommandType, CommandAuditPrefix> = {
  [NodeCommandType.config_backup_now]: 'backup.config',
  [NodeCommandType.pfsense_upgrade]: 'pfsense.upgrade',
};

const ACTIVE_STATUSES: NodeCommandStatus[] = [
  NodeCommandStatus.pending,
  NodeCommandStatus.picked_up,
  NodeCommandStatus.running,
];

export function toAgentCommandPayload(
  type: NodeCommandType,
  payloadJson: Prisma.JsonValue | null,
): Record<string, unknown> | undefined {
  if (type !== NodeCommandType.pfsense_upgrade || !payloadJson) {
    return undefined;
  }

  const raw = payloadJson as Record<string, unknown>;
  if (raw.target_version == null) {
    return undefined;
  }

  return {
    target_version: raw.target_version,
  };
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

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    void this.expireStaleCommands('startup');

    this.timer = setInterval(() => {
      void this.expireStaleCommands('interval');
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

    return appConfig.configBackup.commandExpireMinutes;
  }

  async getPendingCommandsForNode(
    nodeId: string,
  ): Promise<PendingCommandPayload[]> {
    const now = new Date();
    const commands = await this.prisma.nodeCommand.findMany({
      where: {
        nodeId,
        status: {
          in: ACTIVE_STATUSES,
        },
        expiresAt: {
          gt: now,
        },
      },
      orderBy: {
        requestedAt: 'asc',
      },
    });

    return commands.map((command) => ({
      id: command.id,
      type: command.type,
      expires_at: command.expiresAt.toISOString(),
      payload: toAgentCommandPayload(command.type, command.payloadJson),
    }));
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
    clientIp?: string;
  }): Promise<{ ok: true; command_id: string; status: NodeCommandStatus }> {
    const command = await this.findActiveCommand(
      input.nodeId,
      input.commandId,
    );

    const nextStatus =
      input.status === 'running'
        ? NodeCommandStatus.running
        : NodeCommandStatus.picked_up;

    if (
      command.status === NodeCommandStatus.running &&
      nextStatus === NodeCommandStatus.picked_up
    ) {
      throw new BadRequestException('command cannot move back to picked_up');
    }

    const now = new Date();
    const updated = await this.prisma.nodeCommand.update({
      where: {
        id: command.id,
      },
      data: {
        status: nextStatus,
        pickedUpAt: command.pickedUpAt ?? now,
        ...(nextStatus === NodeCommandStatus.running && !command.runningAt
          ? { runningAt: now }
          : {}),
      },
    });

    const auditPrefix = AUDIT_PREFIX_BY_TYPE[command.type];
    await this.prisma.auditLog.create({
      data: {
        actorType: 'node_credential',
        actorId: input.credentialId,
        action: `${auditPrefix}.request_picked_up`,
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

    return {
      ok: true,
      command_id: updated.id,
      status: updated.status,
    };
  }

  async reportCommandResult(input: {
    nodeId: string;
    credentialId: string;
    commandId: string;
    status: 'succeeded' | 'failed';
    errorMessage?: string;
    resultJson?: Record<string, unknown>;
    clientIp?: string;
  }): Promise<{ ok: true; command_id: string; status: NodeCommandStatus }> {
    const command = await this.prisma.nodeCommand.findFirst({
      where: {
        id: input.commandId,
        nodeId: input.nodeId,
      },
    });

    if (!command) {
      throw new NotFoundException('command not found');
    }

    if (
      command.status === NodeCommandStatus.succeeded ||
      command.status === NodeCommandStatus.failed
    ) {
      return {
        ok: true,
        command_id: command.id,
        status: command.status,
      };
    }

    if (command.status === NodeCommandStatus.expired) {
      return this.reconcileLateResult(input, command);
    }

    if (!ACTIVE_STATUSES.includes(command.status)) {
      throw new NotFoundException('active command not found');
    }

    if (command.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('command expired');
    }

    const completedAt = new Date();
    const auditPrefix = AUDIT_PREFIX_BY_TYPE[command.type];

    if (input.status === 'failed') {
      const truncatedError = (input.errorMessage ?? 'unknown error')
        .trim()
        .slice(0, 500);

      const updated = await this.prisma.nodeCommand.update({
        where: {
          id: command.id,
        },
        data: {
          status: NodeCommandStatus.failed,
          completedAt,
          errorMessage: truncatedError,
          resultJson: {
            ...(input.resultJson ?? {}),
            error_message: truncatedError,
          },
        },
      });

      await this.restoreMaintenanceModeIfNeeded(command, completedAt);

      await this.prisma.auditLog.create({
        data: {
          actorType: 'node_credential',
          actorId: input.credentialId,
          action: `${auditPrefix}.request_failed`,
          targetType: 'node_command',
          targetId: command.id,
          ipAddress: input.clientIp,
          metadataJson: {
            node_id: input.nodeId,
            error_message: truncatedError,
            command_type: command.type,
          },
        },
      });

      return {
        ok: true,
        command_id: updated.id,
        status: updated.status,
      };
    }

    const updated = await this.prisma.nodeCommand.update({
      where: {
        id: command.id,
      },
      data: {
        status: NodeCommandStatus.succeeded,
        completedAt,
        resultJson: (input.resultJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });

    await this.restoreMaintenanceModeIfNeeded(command, completedAt);

    await this.prisma.auditLog.create({
      data: {
        actorType: 'node_credential',
        actorId: input.credentialId,
        action: `${auditPrefix}.request_succeeded`,
        targetType: 'node_command',
        targetId: command.id,
        ipAddress: input.clientIp,
        metadataJson: {
          node_id: input.nodeId,
          command_type: command.type,
          ...(input.resultJson ?? {}),
        },
      },
    });

    return {
      ok: true,
      command_id: updated.id,
      status: updated.status,
    };
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
      clientIp?: string;
    },
    command: NodeCommand,
  ): Promise<{ ok: true; command_id: string; status: NodeCommandStatus }> {
    if (command.type !== NodeCommandType.pfsense_upgrade) {
      throw new ConflictException('late result not accepted for this command type');
    }

    const completedAt = command.completedAt ?? new Date();
    const reconcileWindowMs =
      appConfig.pfsenseUpgrade.lateResultReconcileHours * 60 * 60_000;

    if (
      completedAt.getTime() + reconcileWindowMs <
      Date.now()
    ) {
      await this.prisma.auditLog.create({
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

    const updated = await this.prisma.nodeCommand.update({
      where: {
        id: command.id,
      },
      data: {
        status: nextStatus,
        errorMessage: truncatedError ?? command.errorMessage,
        resultJson: {
          ...(input.resultJson ?? {}),
          late_reconciliation: true,
          ...(truncatedError ? { error_message: truncatedError } : {}),
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'node_credential',
        actorId: input.credentialId,
        action: 'pfsense.upgrade.late_result_reconciled',
        targetType: 'node_command',
        targetId: command.id,
        ipAddress: input.clientIp,
        metadataJson: {
          node_id: input.nodeId,
          status: nextStatus,
        },
      },
    });

    return {
      ok: true,
      command_id: updated.id,
      status: updated.status,
    };
  }

  async restoreMaintenanceModeIfNeeded(
    command: NodeCommand,
    restoredAt: Date,
  ): Promise<void> {
    if (command.type !== NodeCommandType.pfsense_upgrade) {
      return;
    }

    const payload = (command.payloadJson ?? {}) as UpgradePayloadJson;

    if (!payload.maintenance_mode_toggled || payload.maintenance_restored_at) {
      return;
    }

    const maintenanceModeBefore = payload.maintenance_mode_before ?? false;

    await this.prisma.$transaction(async (tx) => {
      await tx.node.update({
        where: {
          id: command.nodeId,
        },
        data: {
          maintenanceMode: maintenanceModeBefore,
        },
      });

      await tx.nodeCommand.update({
        where: {
          id: command.id,
        },
        data: {
          payloadJson: {
            ...payload,
            maintenance_restored_at: restoredAt.toISOString(),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: 'system',
          action: 'pfsense.upgrade.maintenance_restored',
          targetType: 'node_command',
          targetId: command.id,
          metadataJson: {
            node_id: command.nodeId,
            maintenance_mode: maintenanceModeBefore,
          },
        },
      });
    });
  }

  private async findActiveCommand(nodeId: string, commandId: string) {
    const command = await this.prisma.nodeCommand.findFirst({
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

    await this.prisma.$transaction(async (tx) => {
      for (const command of expired) {
        const updated = await tx.nodeCommand.updateMany({
          where: {
            id: command.id,
            status: {
              in: ACTIVE_STATUSES,
            },
          },
          data: {
            status: NodeCommandStatus.expired,
            completedAt: now,
          },
        });

        if (updated.count === 0) {
          continue;
        }

        const auditPrefix = AUDIT_PREFIX_BY_TYPE[command.type];
        await tx.auditLog.create({
          data: {
            actorType: 'system',
            action: `${auditPrefix}.request_expired`,
            targetType: 'node_command',
            targetId: command.id,
            metadataJson: {
              node_id: command.nodeId,
              reason,
              command_type: command.type,
            },
          },
        });

        if (command.type === NodeCommandType.pfsense_upgrade) {
          await this.restoreMaintenanceModeIfNeeded(command, now);
        }
      }
    });

    this.logger.log(`expired ${expired.length} node commands reason=${reason}`);
  }
}
