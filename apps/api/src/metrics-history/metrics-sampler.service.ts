import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { NodeStatus } from '@prisma/client';
import { appConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { deriveEffectiveNodeStatus } from '../nodes/node-status.util';
import {
  computeAvailabilityScore,
  truncateToHourUtc,
} from './metrics-rollup.util';
import { MetricsRollupService } from './metrics-rollup.service';
import { SystemJobLockService } from '../common/system-job-lock.service';

const SAMPLE_LOCK_KEY = 'metrics_sampler';
const SAMPLE_LOCK_TTL_MS = 4 * 60 * 1000;

@Injectable()
export class MetricsSamplerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsSamplerService.name);
  private timer?: NodeJS.Timeout;
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly lockService: SystemJobLockService,
    private readonly rollupService: MetricsRollupService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!appConfig.metricRollups.enabled) {
      this.logger.log('metric rollups disabled; sampler not started');
      return;
    }

    await this.runSamplingCycle('startup');

    this.timer = setInterval(() => {
      void this.runSamplingCycle('interval');
    }, appConfig.metricRollups.sampleIntervalSeconds * 1000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async runSamplingCycle(reason: 'startup' | 'interval' | 'manual'): Promise<void> {
    if (!appConfig.metricRollups.enabled || this.isRunning) {
      return;
    }

    const acquired = await this.lockService.tryAcquire(
      SAMPLE_LOCK_KEY,
      SAMPLE_LOCK_TTL_MS,
    );
    if (!acquired) {
      return;
    }

    this.isRunning = true;
    const sampledAt = new Date();

    try {
      const nodes = await this.prisma.node.findMany({
        select: {
          id: true,
          status: true,
          maintenanceMode: true,
          lastSeenAt: true,
          cpuPercent: true,
          memoryPercent: true,
          diskPercent: true,
          lastLatencyMs: true,
        },
      });

      if (nodes.length === 0) {
        return;
      }

      const rows = nodes.map((node) => {
        const effectiveStatus = deriveEffectiveNodeStatus(node, sampledAt);

        return {
          nodeId: node.id,
          sampledAt,
          status: effectiveStatus as NodeStatus,
          cpuPercent: node.cpuPercent,
          memoryPercent: node.memoryPercent,
          diskPercent: node.diskPercent,
          latencyMs: node.lastLatencyMs,
          availabilityScore: computeAvailabilityScore(effectiveStatus),
        };
      });

      await this.prisma.nodeMetricSample.createMany({
        data: rows,
      });

      const retentionCutoff = new Date(
        sampledAt.getTime() -
          appConfig.metricRollups.sampleRetentionHours * 60 * 60 * 1000,
      );
      const deleted = await this.prisma.nodeMetricSample.deleteMany({
        where: {
          sampledAt: {
            lt: retentionCutoff,
          },
        },
      });

      const currentHour = truncateToHourUtc(sampledAt);
      const previousHour = new Date(currentHour.getTime() - 60 * 60 * 1000);
      await this.rollupService.rollupHourlyBucket(previousHour);

      this.logger.log(
        `metric sampling reason=${reason} nodes=${rows.length} purged_samples=${deleted.count}`,
      );
    } finally {
      this.isRunning = false;
      await this.lockService.release(SAMPLE_LOCK_KEY);
    }
  }
}
