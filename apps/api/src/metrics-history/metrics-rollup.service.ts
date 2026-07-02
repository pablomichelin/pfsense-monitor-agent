import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { appConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import {
  addDaysUtc,
  addHoursUtc,
  aggregateMetricSamples,
  truncateToDayUtc,
  truncateToHourUtc,
} from './metrics-rollup.util';
import { SystemJobLockService } from '../common/system-job-lock.service';

const HOURLY_LOCK_KEY = 'metrics_rollup_hourly';
const DAILY_LOCK_KEY = 'metrics_rollup_daily';
const ROLLUP_LOCK_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class MetricsRollupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsRollupService.name);
  private hourlyTimer?: NodeJS.Timeout;
  private dailyTimer?: NodeJS.Timeout;
  private isHourlyRunning = false;
  private isDailyRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly lockService: SystemJobLockService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!appConfig.metricRollups.enabled) {
      this.logger.log('metric rollups disabled; rollup scheduler not started');
      return;
    }

    await this.runHourlyRollupCycle('startup');
    await this.runDailyRollupCycle('startup');

    this.hourlyTimer = setInterval(() => {
      void this.runHourlyRollupCycle('interval');
    }, appConfig.metricRollups.hourlyRollupIntervalSeconds * 1000);
    this.hourlyTimer.unref?.();

    this.dailyTimer = setInterval(() => {
      void this.runDailyRollupCycle('interval');
    }, appConfig.metricRollups.dailyRollupIntervalSeconds * 1000);
    this.dailyTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.hourlyTimer) {
      clearInterval(this.hourlyTimer);
    }
    if (this.dailyTimer) {
      clearInterval(this.dailyTimer);
    }
  }

  async runHourlyRollupCycle(reason: 'startup' | 'interval' | 'manual'): Promise<void> {
    if (!appConfig.metricRollups.enabled || this.isHourlyRunning) {
      return;
    }

    const acquired = await this.lockService.tryAcquire(
      HOURLY_LOCK_KEY,
      ROLLUP_LOCK_TTL_MS,
    );
    if (!acquired) {
      return;
    }

    this.isHourlyRunning = true;

    try {
      const now = new Date();
      const currentHour = truncateToHourUtc(now);
      const previousHour = addHoursUtc(currentHour, -1);
      await this.rollupHourlyBucket(previousHour);

      const retentionCutoff = addDaysUtc(
        truncateToDayUtc(now),
        -appConfig.metricRollups.hourlyRetentionDays,
      );
      const deleted = await this.prisma.nodeMetricRollupHourly.deleteMany({
        where: {
          bucketStart: {
            lt: retentionCutoff,
          },
        },
      });

      this.logger.log(
        `hourly rollup reason=${reason} bucket=${previousHour.toISOString()} purged_hourly=${deleted.count}`,
      );
    } finally {
      this.isHourlyRunning = false;
      await this.lockService.release(HOURLY_LOCK_KEY);
    }
  }

  async runDailyRollupCycle(reason: 'startup' | 'interval' | 'manual'): Promise<void> {
    if (!appConfig.metricRollups.enabled || this.isDailyRunning) {
      return;
    }

    const acquired = await this.lockService.tryAcquire(
      DAILY_LOCK_KEY,
      ROLLUP_LOCK_TTL_MS,
    );
    if (!acquired) {
      return;
    }

    this.isDailyRunning = true;

    try {
      const now = new Date();
      const currentDay = truncateToDayUtc(now);
      const previousDay = addDaysUtc(currentDay, -1);
      await this.rollupDailyBucket(previousDay);

      const retentionCutoff = addDaysUtc(
        currentDay,
        -appConfig.metricRollups.dailyRetentionDays,
      );
      const deleted = await this.prisma.nodeMetricRollupDaily.deleteMany({
        where: {
          bucketStart: {
            lt: retentionCutoff,
          },
        },
      });

      this.logger.log(
        `daily rollup reason=${reason} bucket=${previousDay.toISOString()} purged_daily=${deleted.count}`,
      );
    } finally {
      this.isDailyRunning = false;
      await this.lockService.release(DAILY_LOCK_KEY);
    }
  }

  async rollupHourlyBucket(bucketStart: Date): Promise<number> {
    const bucketEnd = addHoursUtc(bucketStart, 1);
    const nodeIds = await this.prisma.nodeMetricSample.findMany({
      where: {
        sampledAt: {
          gte: bucketStart,
          lt: bucketEnd,
        },
      },
      distinct: ['nodeId'],
      select: {
        nodeId: true,
      },
    });

    let upserts = 0;

    for (const entry of nodeIds) {
      const samples = await this.prisma.nodeMetricSample.findMany({
        where: {
          nodeId: entry.nodeId,
          sampledAt: {
            gte: bucketStart,
            lt: bucketEnd,
          },
        },
        select: {
          cpuPercent: true,
          memoryPercent: true,
          diskPercent: true,
          latencyMs: true,
          status: true,
          availabilityScore: true,
        },
      });

      if (samples.length === 0) {
        continue;
      }

      const aggregate = aggregateMetricSamples(samples);

      await this.prisma.nodeMetricRollupHourly.upsert({
        where: {
          nodeId_bucketStart: {
            nodeId: entry.nodeId,
            bucketStart,
          },
        },
        create: {
          nodeId: entry.nodeId,
          bucketStart,
          sampleCount: aggregate.sampleCount,
          cpuAvg: aggregate.cpu.avg,
          cpuMin: aggregate.cpu.min,
          cpuMax: aggregate.cpu.max,
          memoryAvg: aggregate.memory.avg,
          memoryMin: aggregate.memory.min,
          memoryMax: aggregate.memory.max,
          diskAvg: aggregate.disk.avg,
          diskMin: aggregate.disk.min,
          diskMax: aggregate.disk.max,
          latencyAvg: aggregate.latency.avg,
          latencyMin: aggregate.latency.min,
          latencyMax: aggregate.latency.max,
          availabilityPct: aggregate.availabilityPct,
        },
        update: {
          sampleCount: aggregate.sampleCount,
          cpuAvg: aggregate.cpu.avg,
          cpuMin: aggregate.cpu.min,
          cpuMax: aggregate.cpu.max,
          memoryAvg: aggregate.memory.avg,
          memoryMin: aggregate.memory.min,
          memoryMax: aggregate.memory.max,
          diskAvg: aggregate.disk.avg,
          diskMin: aggregate.disk.min,
          diskMax: aggregate.disk.max,
          latencyAvg: aggregate.latency.avg,
          latencyMin: aggregate.latency.min,
          latencyMax: aggregate.latency.max,
          availabilityPct: aggregate.availabilityPct,
        },
      });

      upserts += 1;
    }

    return upserts;
  }

  async rollupDailyBucket(bucketStart: Date): Promise<number> {
    const bucketEnd = addDaysUtc(bucketStart, 1);
    const nodeIds = await this.prisma.nodeMetricRollupHourly.findMany({
      where: {
        bucketStart: {
          gte: bucketStart,
          lt: bucketEnd,
        },
      },
      distinct: ['nodeId'],
      select: {
        nodeId: true,
      },
    });

    let upserts = 0;

    for (const entry of nodeIds) {
      const hourlyRows = await this.prisma.nodeMetricRollupHourly.findMany({
        where: {
          nodeId: entry.nodeId,
          bucketStart: {
            gte: bucketStart,
            lt: bucketEnd,
          },
        },
        select: {
          sampleCount: true,
          cpuAvg: true,
          cpuMin: true,
          cpuMax: true,
          memoryAvg: true,
          memoryMin: true,
          memoryMax: true,
          diskAvg: true,
          diskMin: true,
          diskMax: true,
          latencyAvg: true,
          latencyMin: true,
          latencyMax: true,
          availabilityPct: true,
        },
      });

      if (hourlyRows.length === 0) {
        continue;
      }

      const weightedSamples = hourlyRows.reduce(
        (acc, row) => acc + row.sampleCount,
        0,
      );
      const weightedAvailability =
        weightedSamples > 0
          ? hourlyRows.reduce((acc, row) => {
              if (row.availabilityPct == null) {
                return acc;
              }
              return acc + row.availabilityPct * row.sampleCount;
            }, 0) / weightedSamples
          : null;

      const cpuValues = hourlyRows
        .flatMap((row) =>
          row.cpuAvg != null ? [{ value: row.cpuAvg, weight: row.sampleCount }] : [],
        )
        .filter((entry) => entry.weight > 0);
      const memoryValues = hourlyRows
        .flatMap((row) =>
          row.memoryAvg != null
            ? [{ value: row.memoryAvg, weight: row.sampleCount }]
            : [],
        )
        .filter((entry) => entry.weight > 0);
      const diskValues = hourlyRows
        .flatMap((row) =>
          row.diskAvg != null ? [{ value: row.diskAvg, weight: row.sampleCount }] : [],
        )
        .filter((entry) => entry.weight > 0);
      const latencyValues = hourlyRows
        .flatMap((row) =>
          row.latencyAvg != null
            ? [{ value: row.latencyAvg, weight: row.sampleCount }]
            : [],
        )
        .filter((entry) => entry.weight > 0);

      await this.prisma.nodeMetricRollupDaily.upsert({
        where: {
          nodeId_bucketStart: {
            nodeId: entry.nodeId,
            bucketStart,
          },
        },
        create: {
          nodeId: entry.nodeId,
          bucketStart,
          sampleCount: weightedSamples,
          cpuAvg: weightedAverage(cpuValues),
          cpuMin: minNullable(hourlyRows.map((row) => row.cpuMin)),
          cpuMax: maxNullable(hourlyRows.map((row) => row.cpuMax)),
          memoryAvg: weightedAverage(memoryValues),
          memoryMin: minNullable(hourlyRows.map((row) => row.memoryMin)),
          memoryMax: maxNullable(hourlyRows.map((row) => row.memoryMax)),
          diskAvg: weightedAverage(diskValues),
          diskMin: minNullable(hourlyRows.map((row) => row.diskMin)),
          diskMax: maxNullable(hourlyRows.map((row) => row.diskMax)),
          latencyAvg: weightedAverage(latencyValues),
          latencyMin: minNullable(hourlyRows.map((row) => row.latencyMin)),
          latencyMax: maxNullable(hourlyRows.map((row) => row.latencyMax)),
          availabilityPct:
            weightedAvailability != null ? round2(weightedAvailability) : null,
        },
        update: {
          sampleCount: weightedSamples,
          cpuAvg: weightedAverage(cpuValues),
          cpuMin: minNullable(hourlyRows.map((row) => row.cpuMin)),
          cpuMax: maxNullable(hourlyRows.map((row) => row.cpuMax)),
          memoryAvg: weightedAverage(memoryValues),
          memoryMin: minNullable(hourlyRows.map((row) => row.memoryMin)),
          memoryMax: maxNullable(hourlyRows.map((row) => row.memoryMax)),
          diskAvg: weightedAverage(diskValues),
          diskMin: minNullable(hourlyRows.map((row) => row.diskMin)),
          diskMax: maxNullable(hourlyRows.map((row) => row.diskMax)),
          latencyAvg: weightedAverage(latencyValues),
          latencyMin: minNullable(hourlyRows.map((row) => row.latencyMin)),
          latencyMax: maxNullable(hourlyRows.map((row) => row.latencyMax)),
          availabilityPct:
            weightedAvailability != null ? round2(weightedAvailability) : null,
        },
      });

      upserts += 1;
    }

    return upserts;
  }
}

function weightedAverage(
  entries: Array<{ value: number; weight: number }>,
): number | null {
  if (entries.length === 0) {
    return null;
  }

  const totalWeight = entries.reduce((acc, entry) => acc + entry.weight, 0);
  if (totalWeight <= 0) {
    return null;
  }

  const sum = entries.reduce(
    (acc, entry) => acc + entry.value * entry.weight,
    0,
  );
  return round2(sum / totalWeight);
}

function minNullable(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => value != null);
  return nums.length > 0 ? round2(Math.min(...nums)) : null;
}

function maxNullable(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => value != null);
  return nums.length > 0 ? round2(Math.max(...nums)) : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
