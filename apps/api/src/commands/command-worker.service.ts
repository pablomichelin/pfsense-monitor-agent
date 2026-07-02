import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { NodeCommandStatus, NodeCommandType } from '@prisma/client';
import { SystemJobLockService } from '../common/system-job-lock.service';
import { appConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { getCommandDefinition } from './command-registry';
import {
  canRetryCommand,
  computeRetryBackoffMs,
  shouldDeferForConcurrency,
} from './command-registry.util';
import { CommandOrchestratorService } from './command-orchestrator.service';

const WORKER_LOCK_KEY = 'command_worker';
const ACTIVE_STATUSES: NodeCommandStatus[] = [
  NodeCommandStatus.pending,
  NodeCommandStatus.picked_up,
  NodeCommandStatus.running,
];

@Injectable()
export class CommandWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommandWorkerService.name);
  private timer?: NodeJS.Timeout;

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
    if (!appConfig.commands.workerEnabled) {
      return;
    }

    const lockTtlMs = appConfig.commands.workerLockTtlSeconds * 1000;
    const acquired = await this.lockService.tryAcquire(
      WORKER_LOCK_KEY,
      lockTtlMs,
    );

    if (!acquired) {
      return;
    }

    try {
      await this.processRetries();
      await this.processDeferredCommands();
      await this.reconcileOpenBatches();
      this.logger.debug(`command worker cycle completed reason=${reason}`);
    } catch (error) {
      this.logger.warn(`command worker cycle failed: ${String(error)}`);
    } finally {
      await this.lockService.release(WORKER_LOCK_KEY);
    }
  }

  private async processRetries(): Promise<void> {
    const failedCommands = await this.prisma.nodeCommand.findMany({
      where: {
        status: NodeCommandStatus.failed,
        maxRetries: {
          gt: 0,
        },
      },
      take: 50,
      orderBy: {
        completedAt: 'asc',
      },
    });

    const now = new Date();

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

      const definition = getCommandDefinition(command.type);
      const backoffMs = computeRetryBackoffMs(
        definition,
        command.retryCount + 1,
      );
      const nextRetryAt = new Date(now.getTime() + backoffMs);

      if (command.expiresAt.getTime() <= nextRetryAt.getTime()) {
        await this.prisma.nodeCommand.update({
          where: { id: command.id },
          data: {
            resultJson: {
              ...result,
              retry_exhausted: true,
            },
          },
        });
        continue;
      }

      await this.prisma.nodeCommand.update({
        where: { id: command.id },
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

      await this.prisma.auditLog.create({
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
    }
  }

  private async processDeferredCommands(): Promise<void> {
    const now = new Date();

    for (const type of Object.values(NodeCommandType)) {
      const definition = getCommandDefinition(type);
      if (definition.maxConcurrentGlobal <= 0) {
        continue;
      }

      const activeGlobal = await this.prisma.nodeCommand.count({
        where: {
          type,
          status: {
            in: ACTIVE_STATUSES,
          },
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        },
      });

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
            nextRetryAt: {
              gt: now,
            },
          },
          orderBy: {
            nextRetryAt: 'asc',
          },
          take: definition.maxConcurrentGlobal - activeGlobal,
        });

        for (const command of deferred) {
          await this.prisma.nodeCommand.update({
            where: { id: command.id },
            data: {
              nextRetryAt: null,
            },
          });
        }

        continue;
      }

      const overflow = await this.prisma.nodeCommand.findMany({
        where: {
          type,
          status: NodeCommandStatus.pending,
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        },
        orderBy: {
          requestedAt: 'asc',
        },
        skip: definition.maxConcurrentGlobal,
        take: 20,
      });

      for (const command of overflow) {
        await this.prisma.nodeCommand.update({
          where: { id: command.id },
          data: {
            nextRetryAt: new Date(now.getTime() + 30_000),
          },
        });
      }
    }
  }

  private async reconcileOpenBatches(): Promise<void> {
    const openBatches = await this.prisma.jobBatch.findMany({
      where: {
        status: {
          in: ['pending', 'running'],
        },
      },
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
