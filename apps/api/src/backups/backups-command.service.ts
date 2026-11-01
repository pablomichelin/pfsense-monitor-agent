import {
  BadRequestException,
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
import { assertMatchingDeliveryAttempt, NodeCommandsService } from '../node-commands/node-commands.service';
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
    deliveryAttempt?: number;
    clientIp?: string;
  }) {
    return this.nodeCommandsService.acknowledgeCommand(input);
  }

  async reportCommandFailure(input: {
    nodeId: string;
    credentialId: string;
    commandId: string;
    errorMessage: string;
    deliveryAttempt?: number;
    clientIp?: string;
  }): Promise<{ ok: true; command_id: string; status: NodeCommandStatus }> {
    return this.nodeCommandsService.reportCommandResult({
      nodeId: input.nodeId,
      credentialId: input.credentialId,
      commandId: input.commandId,
      status: 'failed',
      errorMessage: input.errorMessage,
      deliveryAttempt: input.deliveryAttempt,
      clientIp: input.clientIp,
    });
  }

  /** New-protocol manual uploads hold the command fence until commit. */
  async withBackupDeliveryAttempt<T>(
    input: { nodeId: string; commandId: string; deliveryAttempt: number },
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    onCallbackReturned?: () => void,
  ): Promise<T> {
    const { value, completed } = await this.prisma.$transaction(async (tx) => {
      // Same node->command order as enqueue and follow-up dispatch.
      await tx.$queryRaw`SELECT id FROM nodes WHERE id = ${input.nodeId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM node_commands WHERE id = ${input.commandId}::uuid FOR UPDATE`;
      const command = await tx.nodeCommand.findFirst({
        where: { id: input.commandId, nodeId: input.nodeId, type: NodeCommandType.config_backup_now },
      });
      if (!command) throw new NotFoundException('backup command not found');
      assertMatchingDeliveryAttempt(command, input.deliveryAttempt, true);
      if (command.status === 'cancelled' || command.status === 'failed' || command.status === 'expired') {
        throw new ConflictException('backup command is terminal');
      }
      if (command.status !== 'succeeded' && command.expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('command expired');
      }
      const value = await work(tx);
      const completed = await tx.nodeCommand.findUnique({ where: { id: command.id } });
      onCallbackReturned?.();
      return { value, completed };
    }, { timeout: 30_000 });
    // Outbox is already durable. A post-commit dispatch failure cannot turn a
    // committed upload into an HTTP failure or create a second backup attempt.
    if (completed?.status === NodeCommandStatus.succeeded) {
      try { await this.nodeCommandsService.handleBackupCommandSucceeded(completed); }
      catch { this.logger.warn('committed backup follow-up pending reconciliation'); }
    }
    return value;
  }

  async markCommandSucceeded(input: {
    nodeId: string;
    commandId: string;
    duplicate: boolean;
    sha256: string;
    backupUid?: string;
    deliveryAttempt?: number;
  }, transaction?: Prisma.TransactionClient): Promise<void> {
    const activeStatuses: NodeCommandStatus[] = [
      NodeCommandStatus.pending,
      NodeCommandStatus.picked_up,
      NodeCommandStatus.running,
    ];

    const mark = async (tx: Prisma.TransactionClient) => {
      // One atomic admission decision: a concurrent cancel/failure/result wins
      // permanently. Expiry can only be reconciled by a recorded backup of this
      // command, node and config; receiving an upload alone is not that proof.
      const changed = await tx.nodeCommand.updateMany({
        where: {
          id: input.commandId,
          nodeId: input.nodeId,
          type: NodeCommandType.config_backup_now,
          ...(input.deliveryAttempt != null ? { retryCount: input.deliveryAttempt } : {}),
          OR: [
            { status: { in: activeStatuses } },
            {
              status: NodeCommandStatus.expired,
              configBackups: {
                some: {
                  nodeId: input.nodeId,
                  commandId: input.commandId,
                  configSha256: input.sha256,
                  ...(input.deliveryAttempt != null ? { metadataJson: { path: ['delivery_attempt'], equals: input.deliveryAttempt } } : {}),
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
            ...(input.deliveryAttempt != null ? { delivery_attempt: input.deliveryAttempt } : {}),
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
    };
    const updated = transaction ? await mark(transaction) : await this.prisma.$transaction(mark);

    // Dispatch only after the winning transition and its audit have committed.
    if (updated && !transaction) {
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

    const durableDelivery = await this.nodeCommandsService.supportsDurableDelivery(nodeId);
    for (const command of activeCommands) {
      const backup = durableDelivery ? await this.prisma.nodeConfigBackup.findFirst({
        where: {
          commandId: command.id, nodeId,
          status: { in: [ConfigBackupStatus.stored, ConfigBackupStatus.duplicate] },
          metadataJson: { path: ['delivery_attempt'], equals: command.retryCount },
        },
        orderBy: { receivedAt: 'desc' },
      }) : command.configBackups[0];
      if (!backup) {
        continue;
      }

      await this.markCommandSucceeded({
        nodeId,
        commandId: command.id,
        duplicate: backup.status === ConfigBackupStatus.duplicate,
        sha256: backup.configSha256,
        backupUid: backup.backupUid,
        ...(durableDelivery ? { deliveryAttempt: command.retryCount } : {}),
      });
    }
  }
}
