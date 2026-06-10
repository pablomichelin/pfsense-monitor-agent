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
  ConfigBackupStatus,
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
}

@Injectable()
export class BackupsCommandService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupsCommandService.name);
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

  async getPendingCommandsForNode(nodeId: string): Promise<PendingCommandPayload[]> {
    const now = new Date();
    const commands = await this.prisma.nodeCommand.findMany({
      where: {
        nodeId,
        type: NodeCommandType.config_backup_now,
        status: {
          in: [
            NodeCommandStatus.pending,
            NodeCommandStatus.picked_up,
            NodeCommandStatus.running,
          ],
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
    }));
  }

  async requestBackupNow(input: {
    nodeId: string;
    requestedByUserId: string;
    ipAddress?: string;
  }): Promise<{
    command_id: string;
    status: NodeCommandStatus;
    expires_at: string;
  }> {
    const node = await this.prisma.node.findUnique({
      where: {
        id: input.nodeId,
      },
      select: {
        id: true,
      },
    });

    if (!node) {
      throw new NotFoundException('node not found');
    }

    const activeCommand = await this.prisma.nodeCommand.findFirst({
      where: {
        nodeId: input.nodeId,
        type: NodeCommandType.config_backup_now,
        status: {
          in: [
            NodeCommandStatus.pending,
            NodeCommandStatus.picked_up,
            NodeCommandStatus.running,
          ],
        },
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    if (activeCommand) {
      throw new ConflictException('backup request already pending for this node');
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + appConfig.configBackup.commandExpireMinutes * 60_000,
    );

    const command = await this.prisma.nodeCommand.create({
      data: {
        nodeId: input.nodeId,
        type: NodeCommandType.config_backup_now,
        status: NodeCommandStatus.pending,
        requestedByUserId: input.requestedByUserId,
        expiresAt,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'user',
        actorId: input.requestedByUserId,
        action: 'backup.config.request',
        targetType: 'node',
        targetId: input.nodeId,
        ipAddress: input.ipAddress,
        metadataJson: {
          command_id: command.id,
          expires_at: expiresAt.toISOString(),
        },
      },
    });

    return {
      command_id: command.id,
      status: command.status,
      expires_at: command.expiresAt.toISOString(),
    };
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
    const command = await this.findActiveCommand(input.nodeId, input.commandId);

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

    const updated = await this.prisma.nodeCommand.update({
      where: {
        id: command.id,
      },
      data: {
        status: nextStatus,
        pickedUpAt: command.pickedUpAt ?? new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'node_credential',
        actorId: input.credentialId,
        action: 'backup.config.request_picked_up',
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

  async reportCommandFailure(input: {
    nodeId: string;
    credentialId: string;
    commandId: string;
    errorMessage: string;
    clientIp?: string;
  }): Promise<{ ok: true; command_id: string; status: NodeCommandStatus }> {
    const command = await this.findActiveCommand(input.nodeId, input.commandId);
    const truncatedError = input.errorMessage.trim().slice(0, 500);
    const completedAt = new Date();

    const updated = await this.prisma.nodeCommand.update({
      where: {
        id: command.id,
      },
      data: {
        status: NodeCommandStatus.failed,
        completedAt,
        errorMessage: truncatedError,
        resultJson: {
          error_message: truncatedError,
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'node_credential',
        actorId: input.credentialId,
        action: 'backup.config.request_failed',
        targetType: 'node_command',
        targetId: command.id,
        ipAddress: input.clientIp,
        metadataJson: {
          node_id: input.nodeId,
          error_message: truncatedError,
        },
      },
    });

    return {
      ok: true,
      command_id: updated.id,
      status: updated.status,
    };
  }

  async markCommandSucceeded(input: {
    nodeId: string;
    commandId: string;
    duplicate: boolean;
    sha256: string;
    backupUid?: string;
  }): Promise<void> {
    const command = await this.prisma.nodeCommand.findFirst({
      where: {
        id: input.commandId,
        nodeId: input.nodeId,
        type: NodeCommandType.config_backup_now,
        status: {
          in: [
            NodeCommandStatus.pending,
            NodeCommandStatus.picked_up,
            NodeCommandStatus.running,
          ],
        },
      },
    });

    if (!command) {
      return;
    }

    const completedAt = new Date();
    await this.prisma.nodeCommand.update({
      where: {
        id: command.id,
      },
      data: {
        status: NodeCommandStatus.succeeded,
        completedAt,
        resultJson: {
          duplicate: input.duplicate,
          sha256: input.sha256,
          backup_uid: input.backupUid ?? null,
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'system',
        action: 'backup.config.request_succeeded',
        targetType: 'node_command',
        targetId: command.id,
        metadataJson: {
          node_id: input.nodeId,
          duplicate: input.duplicate,
          sha256: input.sha256,
          backup_uid: input.backupUid ?? null,
        },
      },
    });
  }

  async reconcileSucceededCommands(nodeId: string): Promise<void> {
    const activeCommands = await this.prisma.nodeCommand.findMany({
      where: {
        nodeId,
        type: NodeCommandType.config_backup_now,
        status: {
          in: [
            NodeCommandStatus.pending,
            NodeCommandStatus.picked_up,
            NodeCommandStatus.running,
          ],
        },
      },
      include: {
        configBackups: {
          where: {
            status: {
              in: [ConfigBackupStatus.stored, ConfigBackupStatus.duplicate],
            },
          },
          orderBy: {
            receivedAt: 'desc',
          },
          take: 1,
        },
      },
    });

    for (const command of activeCommands) {
      const backup = command.configBackups[0];
      if (!backup) {
        continue;
      }

      await this.markCommandSucceeded({
        nodeId,
        commandId: command.id,
        duplicate: backup.status === ConfigBackupStatus.duplicate,
        sha256: backup.configSha256,
        backupUid: backup.backupUid,
      });
    }
  }

  private async findActiveCommand(nodeId: string, commandId: string) {
    const command = await this.prisma.nodeCommand.findFirst({
      where: {
        id: commandId,
        nodeId,
        type: NodeCommandType.config_backup_now,
        status: {
          in: [
            NodeCommandStatus.pending,
            NodeCommandStatus.picked_up,
            NodeCommandStatus.running,
          ],
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

  private async expireStaleCommands(reason: 'startup' | 'interval'): Promise<void> {
    const now = new Date();
    const expired = await this.prisma.nodeCommand.findMany({
      where: {
        status: NodeCommandStatus.pending,
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
        await tx.nodeCommand.update({
          where: {
            id: command.id,
          },
          data: {
            status: NodeCommandStatus.expired,
            completedAt: now,
          },
        });

        await tx.auditLog.create({
          data: {
            actorType: 'system',
            action: 'backup.config.request_expired',
            targetType: 'node_command',
            targetId: command.id,
            metadataJson: {
              node_id: command.nodeId,
              reason,
            },
          },
        });
      }
    });

    this.logger.log(`expired ${expired.length} backup commands reason=${reason}`);
  }
}
