import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ConfigBackupStatus,
  NodeCommandStatus,
  NodeCommandType,
  Prisma,
} from '@prisma/client';
import { NodeCommandsService } from '../node-commands/node-commands.service';
import { PrismaService } from '../prisma/prisma.service';

export type { PendingCommandPayload } from '../node-commands/node-commands.service';

@Injectable()
export class BackupsCommandService {
  private readonly logger = new Logger(BackupsCommandService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nodeCommandsService: NodeCommandsService,
  ) {}

  getPendingCommandsForNode(nodeId: string) {
    return this.nodeCommandsService.getPendingCommandsForNode(nodeId);
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
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() +
        this.nodeCommandsService.getCommandExpireMinutes(
          NodeCommandType.config_backup_now,
        ) *
          60_000,
    );

    const command = await this.prisma.$transaction(
      async (tx) => {
        const node = await tx.node.findUnique({
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

        const activeCommand = await tx.nodeCommand.findFirst({
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
          throw new ConflictException(
            'backup request already pending for this node',
          );
        }

        return tx.nodeCommand.create({
          data: {
            nodeId: input.nodeId,
            type: NodeCommandType.config_backup_now,
            status: NodeCommandStatus.pending,
            requestedByUserId: input.requestedByUserId,
            expiresAt,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

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

  getCommandStatus(nodeId: string, commandId: string) {
    return this.nodeCommandsService.getCommandStatus(nodeId, commandId);
  }

  acknowledgeCommand(input: {
    nodeId: string;
    credentialId: string;
    commandId: string;
    status: 'picked_up' | 'running';
    clientIp?: string;
  }) {
    return this.nodeCommandsService.acknowledgeCommand(input);
  }

  async reportCommandFailure(input: {
    nodeId: string;
    credentialId: string;
    commandId: string;
    errorMessage: string;
    clientIp?: string;
  }): Promise<{ ok: true; command_id: string; status: NodeCommandStatus }> {
    return this.nodeCommandsService.reportCommandResult({
      nodeId: input.nodeId,
      credentialId: input.credentialId,
      commandId: input.commandId,
      status: 'failed',
      errorMessage: input.errorMessage,
      clientIp: input.clientIp,
    });
  }

  async markCommandSucceeded(input: {
    nodeId: string;
    commandId: string;
    duplicate: boolean;
    sha256: string;
    backupUid?: string;
  }): Promise<void> {
    const activeStatuses: NodeCommandStatus[] = [
      NodeCommandStatus.pending,
      NodeCommandStatus.picked_up,
      NodeCommandStatus.running,
    ];

    const updated = await this.prisma.$transaction(async (tx) => {
      // One atomic admission decision: a concurrent cancel/failure/result wins
      // permanently. Expiry can only be reconciled by a recorded backup of this
      // command, node and config; receiving an upload alone is not that proof.
      const changed = await tx.nodeCommand.updateMany({
        where: {
          id: input.commandId,
          nodeId: input.nodeId,
          type: NodeCommandType.config_backup_now,
          OR: [
            { status: { in: activeStatuses } },
            {
              status: NodeCommandStatus.expired,
              configBackups: {
                some: {
                  nodeId: input.nodeId,
                  commandId: input.commandId,
                  configSha256: input.sha256,
                  status: { in: [ConfigBackupStatus.stored, ConfigBackupStatus.duplicate] },
                },
              },
            },
          ],
        },
        data: {
          status: NodeCommandStatus.succeeded,
          completedAt: new Date(),
          errorMessage: null,
          resultJson: {
            duplicate: input.duplicate,
            sha256: input.sha256,
            backup_uid: input.backupUid ?? null,
          },
        },
      });
      if (changed.count === 0) return null;

      const command = await tx.nodeCommand.findUnique({ where: { id: input.commandId } });
      if (!command) throw new NotFoundException('command not found');
      await tx.auditLog.create({
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
      return command;
    });

    // Dispatch only after the winning transition and its audit have committed.
    if (updated) {
      await this.nodeCommandsService.handleBackupCommandSucceeded(updated);
    }
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
}
