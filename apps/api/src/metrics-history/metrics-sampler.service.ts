import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
const SAMPLE_INSERT_BATCH_SIZE = 500;

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

    const run = (reason: 'startup' | 'interval') =>
      this.runSamplingCycle(reason).catch((error) => {
        this.logger.warn(`metric sampling failed: ${String(error)}`);
      });

    await run('startup');
    this.timer = setInterval(() => {
      void run('interval');
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
        orderBy: { id: 'asc' },
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

      const inserts: Prisma.PrismaPromise<number>[] = [];
      for (let offset = 0; offset < nodes.length; offset += SAMPLE_INSERT_BATCH_SIZE) {
        const values = nodes.slice(offset, offset + SAMPLE_INSERT_BATCH_SIZE).map((node) => {
          const status = deriveEffectiveNodeStatus(node, sampledAt);
          return Prisma.sql`(
            ${node.id}::uuid, ${status}::node_status,
            ${node.cpuPercent}::float8, ${node.memoryPercent}::float8, ${node.diskPercent}::float8,
            ${node.lastLatencyMs}::integer, ${computeAvailabilityScore(status)}::float8
          )`;
        });
        // A firewall may be removed after the sample snapshot was read.
        inserts.push(this.prisma.$executeRaw`
          INSERT INTO node_metric_samples (
            node_id, sampled_at, status, cpu_percent, memory_percent, disk_percent, latency_ms, availability_score
          )
          SELECT input.node_id, ${sampledAt}::timestamptz, input.status, input.cpu_percent,
            input.memory_percent, input.disk_percent, input.latency_ms, input.availability_score
          FROM (VALUES ${Prisma.join(values)}) AS input (
            node_id, status, cpu_percent, memory_percent, disk_percent, latency_ms, availability_score
          )
          JOIN nodes ON nodes.id = input.node_id
          ORDER BY input.node_id
          FOR KEY SHARE OF nodes
        `);
      }
      const inserted = await this.prisma.$transaction(inserts);
      const written = inserted.reduce((total, count) => total + count, 0);

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
        `metric sampling reason=${reason} nodes=${written} purged_samples=${deleted.count}`,
      );
    } finally {
      this.isRunning = false;
      await this.lockService.release(SAMPLE_LOCK_KEY);
    }
  }
}
