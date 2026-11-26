import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { NodeCommandStatus, NodeCommandType, Prisma } from '@prisma/client';
import { SystemJobLockService } from '../common/system-job-lock.service';
import { appConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { reconcileCommandBatchStatus } from './command-batch-status';
import { getCommandDefinition } from './command-registry';
import {
  canRetryCommand,
  computeRetryBackoffMs,
  shouldDeferForConcurrency,
} from './command-registry.util';
import { CommandOrchestratorService } from './command-orchestrator.service';

const WORKER_LOCK_KEY = 'command_worker';
const IN_FLIGHT_STATUSES: NodeCommandStatus[] = [
  NodeCommandStatus.picked_up,
  NodeCommandStatus.running,
];

@Injectable()
export class CommandWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommandWorkerService.name);
  private timer?: NodeJS.Timeout;
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly lockService: SystemJobLockService,
    private readonly orchestrator: CommandOrchestratorService,
  ) {}

  onModuleInit(): void {
    if (!appConfig.commands.workerEnabled) {
      this.logger.log('command worker disabled (COMMAND_WORKER_ENABLED=false)');
      return;
    }

    const intervalMs = appConfig.commands.workerIntervalSeconds * 1000;
    void this.runCycle('startup');

    this.timer = setInterval(() => {
      void this.runCycle('interval');
    }, intervalMs);
    this.timer.unref?.();

    this.logger.log(
      `command worker enabled interval=${appConfig.commands.workerIntervalSeconds}s`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async runCycle(reason: 'startup' | 'interval' | 'manual'): Promise<void> {
    if (!appConfig.commands.workerEnabled || this.isRunning) {
      return;
    }

    this.isRunning = true;
    const lockTtlMs = appConfig.commands.workerLockTtlSeconds * 1000;
    try {
      const acquired = await this.lockService.tryAcquire(WORKER_LOCK_KEY, lockTtlMs);
      if (!acquired) {
        return;
      }
      try {
        const reconciledBatchIds = await this.processRetries();
        await this.processDeferredCommands();
        await this.reconcileOpenBatches(reconciledBatchIds);
        this.logger.debug(`command worker cycle completed reason=${reason}`);
      } finally {
        await this.lockService.release(WORKER_LOCK_KEY);
      }
    } catch (error) {
      this.logger.warn(`command worker cycle failed: ${String(error)}`);
    } finally {
      this.isRunning = false;
    }
  }

  private async processRetries(): Promise<Set<string>> {
    const failedCommands = await this.prisma.nodeCommand.findMany({
      where: {
        status: NodeCommandStatus.failed,
        maxRetries: { gt: 0 },
        retryCount: { lt: this.prisma.nodeCommand.fields.maxRetries },
        AND: ['retry_exhausted', 'retry_scheduled'].map((flag) => ({
          OR: [
            { resultJson: { path: [flag], equals: Prisma.AnyNull } },
            { resultJson: { path: [flag], not: true } },
          ],
        })),
      },
      take: 50,
      orderBy: {
        completedAt: 'asc',
      },
    });

    const now = new Date();
    const reconciledBatchIds = new Set<string>();

    for (const command of failedCommands) {
      if (!canRetryCommand(command)) {
        continue;
      }
      const result =
        command.resultJson &&
        typeof command.resultJson === 'object' &&
        !Array.isArray(command.resultJson)
          ? (command.resultJson as Record<string, unknown>)
          : {};

      if (result.retry_scheduled === true || result.retry_exhausted === true) {
        continue;
      }

      // A failed write after execution intent is not proof it is safe to repeat.
      // Preserve failed status and record the indeterminate recovery explicitly.
      if (command.runningAt &&
          command.type !== NodeCommandType.config_backup_now &&
          command.type !== NodeCommandType.table_search) {
        await this.prisma.$transaction(async (tx) => {
          const blocked = await tx.nodeCommand.updateMany({
            where: {
              id: command.id, status: NodeCommandStatus.failed,
              retryCount: command.retryCount, runningAt: command.runningAt,
              resultJson: { equals: command.resultJson ?? Prisma.JsonNull },
            },
            data: { resultJson: {
              ...result, retry_exhausted: true,
              execution_recovery_status: 'indeterminate',
              retry_blocked_reason: 'execution_intent_committed',
            } },
          });
          if (!blocked.count) return;
          await tx.auditLog.create({
            data: {
              actorType: 'system',
              action: `${getCommandDefinition(command.type).auditPrefix}.request_retry_blocked`,
              targetType: 'node_command', targetId: command.id,
              metadataJson: { node_id: command.nodeId, reason: 'execution_intent_committed' },
            },
          });
        });
        continue;
      }

      const definition = getCommandDefinition(command.type);
      const backoffMs = computeRetryBackoffMs(
        definition,
        command.retryCount + 1,
      );
      const nextRetryAt = new Date(now.getTime() + backoffMs);

      if (command.expiresAt.getTime() <= nextRetryAt.getTime()) {
        await this.prisma.nodeCommand.updateMany({
          where: { id: command.id, status: NodeCommandStatus.failed, retryCount: command.retryCount },
          data: {
            resultJson: {
              ...result,
              retry_exhausted: true,
            },
          },
        });
        continue;
      }

      const scheduled = await this.prisma.$transaction(async (tx) => {
        const changed = await tx.nodeCommand.updateMany({
          where: {
            id: command.id,
            status: NodeCommandStatus.failed,
            retryCount: command.retryCount,
            expiresAt: { gt: nextRetryAt },
          },
          data: {
            status: NodeCommandStatus.pending,
            retryCount: command.retryCount + 1,
            nextRetryAt,
            pickedUpAt: null,
            runningAt: null,
            completedAt: null,
            errorMessage: null,
            resultJson: {
              ...result,
              retry_scheduled: true,
              retry_attempt: command.retryCount + 1,
            },
          },
        });

        if (changed.count === 0) return false;

        await tx.auditLog.create({
          data: {
            actorType: 'system',
            action: `${definition.auditPrefix}.request_retry_scheduled`,
            targetType: 'node_command',
            targetId: command.id,
            metadataJson: {
              node_id: command.nodeId,
              retry_count: command.retryCount + 1,
              next_retry_at: nextRetryAt.toISOString(),
            },
          },
        });
        if (command.batchId) await reconcileCommandBatchStatus(tx, command.batchId);
        return true;
      });

      if (scheduled && command.batchId) reconciledBatchIds.add(command.batchId);
    }
    return reconciledBatchIds;
  }

  private async processDeferredCommands(): Promise<void> {
    const now = new Date();
    const readyToRun = {
      status: NodeCommandStatus.pending,
      expiresAt: { gt: now },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    } satisfies Prisma.NodeCommandWhereInput;

    for (const type of Object.values(NodeCommandType)) {
      const definition = getCommandDefinition(type);
      if (definition.maxConcurrentGlobal <= 0) {
        continue;
      }

      const [inFlight, ready] = await Promise.all([
        this.prisma.nodeCommand.count({ where: { type, status: { in: IN_FLIGHT_STATUSES } } }),
        this.prisma.nodeCommand.count({ where: { type, ...readyToRun } }),
      ]);
      const activeGlobal = inFlight + ready;

      if (
        !shouldDeferForConcurrency({
          activeGlobalCount: activeGlobal,
          maxConcurrentGlobal: definition.maxConcurrentGlobal,
        })
      ) {
        const deferred = await this.prisma.nodeCommand.findMany({
          where: {
            type,
            status: NodeCommandStatus.pending,
            expiresAt: { gt: now },
            // Only first attempts can be released before their capacity delay.
            retryCount: 0,
            nextRetryAt: { gt: now },
          },
          orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
          take: definition.maxConcurrentGlobal - activeGlobal,
        });

        for (const command of deferred) {
          await this.prisma.nodeCommand.updateMany({
            where: {
              id: command.id,
              status: NodeCommandStatus.pending,
              expiresAt: { gt: now },
              retryCount: 0,
              nextRetryAt: command.nextRetryAt,
            },
            data: {
              // The warning timer starts when the attempt becomes eligible.
              nextRetryAt: now,
            },
          });
        }

        continue;
      }

      // Keep the oldest eligible request ready when every slot is occupied.
      // Admission still checks capacity under the transaction lock.
      const readySlots = Math.max(1, definition.maxConcurrentGlobal - inFlight);
      const overflow = await this.prisma.nodeCommand.findMany({
        where: { type, ...readyToRun },
        orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
        skip: readySlots,
        take: 20,
      });

      for (const command of overflow) {
        await this.prisma.nodeCommand.updateMany({
          where: {
            ...readyToRun,
            id: command.id,
            nextRetryAt: command.nextRetryAt,
          },
          data: {
            nextRetryAt: new Date(now.getTime() + 30_000),
          },
        });
      }
    }
  }

  private async reconcileOpenBatches(reconciledBatchIds: ReadonlySet<string>): Promise<void> {
    const openBatches = await this.prisma.jobBatch.findMany({
      where: {
        ...(reconciledBatchIds.size > 0 ? { id: { notIn: [...reconciledBatchIds] } } : {}),
        status: {
          in: ['pending', 'running'],
        },
        commands: { some: {} },
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
      },
      take: 20,
    });

    for (const batch of openBatches) {
      await this.orchestrator.reconcileBatchStatus(batch.id);
    }
  }
}
