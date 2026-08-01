import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  JobBatchStatus,
  NodeCommand,
  NodeCommandStatus,
  NodeCommandType,
  Prisma,
} from '@prisma/client';
import { isAgentVersionAtLeast } from '../common/agent-version';
import { appConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import {
  COMMAND_REGISTRY,
  getCommandDefinition,
  getCommandPermission,
} from './command-registry';
import {
  normalizeCommandHistoryLimit,
} from './command-registry.util';
import { scrubPasswordFromPayload } from '../technicians/technician-accounts.util';

const PASSWORD_BEARING_COMMAND_TYPES: NodeCommandType[] = [
  NodeCommandType.local_user_create,
  NodeCommandType.local_user_set_password,
];

const ACTIVE_STATUSES: NodeCommandStatus[] = [
  NodeCommandStatus.pending,
  NodeCommandStatus.picked_up,
  NodeCommandStatus.running,
];

export type CommandHistoryItem = {
  command_id: string;
  node_id: string;
  type: NodeCommandType;
  status: NodeCommandStatus;
  requested_at: string;
  picked_up_at: string | null;
  running_at: string | null;
  completed_at: string | null;
  expires_at: string;
  cancelled_at: string | null;
  retry_count: number;
  max_retries: number;
  batch_id: string | null;
  error_message: string | null;
  result_json: unknown;
  payload_json: unknown;
  progress: {
    phase: 'queued' | 'pending' | 'picked_up' | 'running' | 'terminal';
    is_active: boolean;
    is_terminal: boolean;
  };
};

@Injectable()
export class CommandOrchestratorService {
  constructor(private readonly prisma: PrismaService) {}

  serializeCommand(command: NodeCommand): CommandHistoryItem {
    const isActive = ACTIVE_STATUSES.includes(command.status);
    const isTerminal = !isActive;

    let phase: CommandHistoryItem['progress']['phase'] = 'terminal';
    if (command.status === NodeCommandStatus.pending) {
      phase =
        command.nextRetryAt && command.nextRetryAt.getTime() > Date.now()
          ? 'queued'
          : 'pending';
    } else if (command.status === NodeCommandStatus.picked_up) {
      phase = 'picked_up';
    } else if (command.status === NodeCommandStatus.running) {
      phase = 'running';
    }

    // Defesa em profundidade: mesmo que a senha ainda nao tenha sido varrida do
    // registro persistido (janela entre enfileirar e o agente confirmar "picked_up"),
    // nunca serializar texto claro em respostas de leitura (historico/lote), que sao
    // acessiveis com permissao mais ampla (firewalls.view) do que a gestao de tecnicos.
    const payloadForResponse = PASSWORD_BEARING_COMMAND_TYPES.includes(command.type)
      ? scrubPasswordFromPayload(command.payloadJson)
      : command.payloadJson;

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
      cancelled_at: command.cancelledAt?.toISOString() ?? null,
      retry_count: command.retryCount,
      max_retries: command.maxRetries,
      batch_id: command.batchId,
      error_message: command.errorMessage,
      result_json: command.resultJson,
      payload_json: payloadForResponse,
      progress: {
        phase,
        is_active: isActive,
        is_terminal: isTerminal,
      },
    };
  }

  async listNodeCommandHistory(input: {
    nodeId: string;
    limit?: number;
    type?: NodeCommandType;
  }) {
    const limit = normalizeCommandHistoryLimit(
      input.limit ?? appConfig.commands.historyDefaultLimit,
    );

    const commands = await this.prisma.nodeCommand.findMany({
      where: {
        nodeId: input.nodeId,
        ...(input.type ? { type: input.type } : {}),
      },
      orderBy: {
        requestedAt: 'desc',
      },
      take: limit,
    });

    return {
      generated_at: new Date().toISOString(),
      node_id: input.nodeId,
      items: commands.map((command) => this.serializeCommand(command)),
    };
  }

  async getCommandDetail(nodeId: string, commandId: string) {
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
      generated_at: new Date().toISOString(),
      command: this.serializeCommand(command),
    };
  }

  async cancelCommand(input: {
    nodeId: string;
    commandId: string;
    cancelledByUserId: string;
    ipAddress?: string;
  }) {
    const command = await this.prisma.nodeCommand.findFirst({
      where: {
        id: input.commandId,
        nodeId: input.nodeId,
      },
    });

    if (!command) {
      throw new NotFoundException('command not found');
    }

    if (!ACTIVE_STATUSES.includes(command.status)) {
      throw new ConflictException('command is not active');
    }

    const now = new Date();
    const definition = getCommandDefinition(command.type);

    const updated = await this.prisma.nodeCommand.updateMany({
      where: {
        id: command.id,
        status: {
          in: ACTIVE_STATUSES,
        },
      },
      data: {
        status: NodeCommandStatus.cancelled,
        cancelledAt: now,
        cancelledByUserId: input.cancelledByUserId,
        completedAt: now,
      },
    });

    if (updated.count === 0) {
      throw new ConflictException('command state changed');
    }

    await this.prisma.auditLog.create({
      data: {
        actorType: 'user',
        actorId: input.cancelledByUserId,
        action: `${definition.auditPrefix}.request_cancelled`,
        targetType: 'node_command',
        targetId: command.id,
        ipAddress: input.ipAddress,
        metadataJson: {
          node_id: input.nodeId,
          command_type: command.type,
          batch_id: command.batchId,
        },
      },
    });

    if (command.batchId) {
      await this.reconcileBatchStatus(command.batchId);
    }

    return {
      ok: true as const,
      command_id: command.id,
      status: NodeCommandStatus.cancelled,
    };
  }

  async createBatch(input: {
    commandType: NodeCommandType;
    nodeIds: string[];
    requestedByUserId: string;
    label?: string;
    clientId?: string;
    ipAddress?: string;
    payloadByNode?: Record<string, Record<string, unknown>>;
    idempotencyPrefix?: string;
  }) {
    const uniqueNodeIds = [...new Set(input.nodeIds.map((id) => id.trim()))].filter(
      (id) => id.length > 0,
    );

    if (uniqueNodeIds.length === 0) {
      throw new BadRequestException('node_ids must not be empty');
    }

    const definition = getCommandDefinition(input.commandType);

    const batch = await this.prisma.$transaction(async (tx) => {
      const createdBatch = await tx.jobBatch.create({
        data: {
          commandType: input.commandType,
          status: JobBatchStatus.pending,
          requestedByUserId: input.requestedByUserId,
          clientId: input.clientId,
          label: input.label,
          totalCount: uniqueNodeIds.length,
        },
      });

      const results: Array<{
        node_id: string;
        ok: boolean;
        command_id?: string;
        status?: NodeCommandStatus;
        error?: string;
      }> = [];

      for (const nodeId of uniqueNodeIds) {
        try {
          const node = await tx.node.findUnique({
            where: { id: nodeId },
            select: {
              id: true,
              agentVersion: true,
            },
          });

          if (!node) {
            results.push({ node_id: nodeId, ok: false, error: 'node not found' });
            continue;
          }

          if (
            !isAgentVersionAtLeast(node.agentVersion, definition.minAgentVersion)
          ) {
            results.push({
              node_id: nodeId,
              ok: false,
              error: `agent_version below minimum ${definition.minAgentVersion}`,
            });
            continue;
          }

          const payload = definition.validatePayload(
            input.payloadByNode?.[nodeId],
          );

          const idempotencyKey = input.idempotencyPrefix
            ? `${input.idempotencyPrefix}:${nodeId}`
            : `${createdBatch.id}:${nodeId}`;

          const enqueueResult = await this.enqueueCommandInTransaction(tx, {
            nodeId,
            type: input.commandType,
            requestedByUserId: input.requestedByUserId,
            payloadJson: payload as Prisma.InputJsonValue | undefined,
            batchId: createdBatch.id,
            idempotencyKey,
          });

          results.push({
            node_id: nodeId,
            ok: true,
            command_id: enqueueResult.id,
            status: enqueueResult.status,
          });
        } catch (error) {
          results.push({
            node_id: nodeId,
            ok: false,
            error: error instanceof Error ? error.message : 'enqueue failed',
          });
        }
      }

      const enqueuedCount = results.filter((entry) => entry.ok).length;
      const batchStatus =
        enqueuedCount === 0
          ? JobBatchStatus.failed
          : JobBatchStatus.running;

      await tx.jobBatch.update({
        where: { id: createdBatch.id },
        data: {
          status: batchStatus,
          metadataJson: {
            results,
          },
        },
      });

      return {
        batch: createdBatch,
        results,
        enqueuedCount,
      };
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: 'user',
        actorId: input.requestedByUserId,
        action: 'commands.batch.created',
        targetType: 'job_batch',
        targetId: batch.batch.id,
        ipAddress: input.ipAddress,
        metadataJson: {
          command_type: input.commandType,
          total_count: uniqueNodeIds.length,
          enqueued_count: batch.enqueuedCount,
          label: input.label ?? null,
        },
      },
    });

    return this.getBatchStatus(batch.batch.id);
  }

  async getBatchStatus(batchId: string) {
    const batch = await this.prisma.jobBatch.findUnique({
      where: { id: batchId },
      include: {
        commands: {
          orderBy: { requestedAt: 'asc' },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException('batch not found');
    }

    return {
      generated_at: new Date().toISOString(),
      batch: {
        batch_id: batch.id,
        command_type: batch.commandType,
        status: batch.status,
        label: batch.label,
        requested_at: batch.requestedAt.toISOString(),
        completed_at: batch.completedAt?.toISOString() ?? null,
        total_count: batch.totalCount,
        succeeded_count: batch.succeededCount,
        failed_count: batch.failedCount,
        cancelled_count: batch.cancelledCount,
        expired_count: batch.expiredCount,
      },
      nodes: batch.commands.map((command) => ({
        node_id: command.nodeId,
        command_id: command.id,
        status: command.status,
        error_message: command.errorMessage,
        progress: this.serializeCommand(command).progress,
      })),
    };
  }

  async reconcileBatchStatus(batchId: string): Promise<void> {
    const commands = await this.prisma.nodeCommand.findMany({
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

    for (const command of commands) {
      switch (command.status) {
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

    await this.prisma.jobBatch.update({
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

  async enqueueCommand(input: {
    nodeId: string;
    type: NodeCommandType;
    requestedByUserId?: string;
    payloadJson?: Prisma.InputJsonValue;
    batchId?: string;
    idempotencyKey?: string;
  }): Promise<NodeCommand> {
    return this.prisma.$transaction((tx) =>
      this.enqueueCommandInTransaction(tx, input),
    );
  }

  private async enqueueCommandInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      nodeId: string;
      type: NodeCommandType;
      requestedByUserId?: string;
      payloadJson?: Prisma.InputJsonValue;
      batchId?: string;
      idempotencyKey?: string;
    },
  ): Promise<NodeCommand> {
    const definition = getCommandDefinition(input.type);
    const normalizedPayload = definition.validatePayload(input.payloadJson);

    if (input.idempotencyKey) {
      const existing = await tx.nodeCommand.findFirst({
        where: {
          nodeId: input.nodeId,
          type: input.type,
          idempotencyKey: input.idempotencyKey,
          status: {
            in: ACTIVE_STATUSES,
          },
        },
      });

      if (existing) {
        return existing;
      }
    }

    if (definition.maxConcurrentPerNode > 0) {
      const activeOnNode = await tx.nodeCommand.count({
        where: {
          nodeId: input.nodeId,
          type: input.type,
          status: {
            in: ACTIVE_STATUSES,
          },
        },
      });

      if (activeOnNode >= definition.maxConcurrentPerNode) {
        throw new ConflictException(
          `active ${input.type} command already exists for node`,
        );
      }
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + definition.expireMinutes * 60_000,
    );

    let nextRetryAt: Date | null = null;
    if (
      appConfig.commands.workerEnabled &&
      definition.maxConcurrentGlobal > 0
    ) {
      const activeGlobal = await tx.nodeCommand.count({
        where: {
          type: input.type,
          status: {
            in: ACTIVE_STATUSES,
          },
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        },
      });

      if (activeGlobal >= definition.maxConcurrentGlobal) {
        nextRetryAt = new Date(now.getTime() + 30_000);
      }
    }

    return tx.nodeCommand.create({
      data: {
        nodeId: input.nodeId,
        type: input.type,
        status: NodeCommandStatus.pending,
        requestedByUserId: input.requestedByUserId,
        payloadJson: normalizedPayload as Prisma.InputJsonValue | undefined,
        expiresAt,
        batchId: input.batchId,
        idempotencyKey: input.idempotencyKey,
        maxRetries: definition.maxRetries,
        nextRetryAt,
      },
    });
  }

  getRegistrySummary() {
    return {
      generated_at: new Date().toISOString(),
      worker_enabled: appConfig.commands.workerEnabled,
      types: Object.entries(COMMAND_REGISTRY).map(([type, definition]) => ({
        type,
        permission: getCommandPermission(type as NodeCommandType),
        min_agent_version: definition.minAgentVersion,
        expire_minutes: definition.expireMinutes,
        max_retries: definition.maxRetries,
        max_concurrent_per_node: definition.maxConcurrentPerNode,
        max_concurrent_global: definition.maxConcurrentGlobal,
      })),
    };
  }
}
