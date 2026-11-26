import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
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
const ROLLUP_READ_BATCH_SIZE = 128;

async function* loadRollupRowsByNode<Row extends { nodeId: string }>(
  nodes: { nodeId: string }[],
  load: (nodeIds: string[]) => Promise<Row[]>,
): AsyncGenerator<[string, Row[]]> {
  for (let offset = 0; offset < nodes.length; offset += ROLLUP_READ_BATCH_SIZE) {
    const nodeIds = nodes.slice(offset, offset + ROLLUP_READ_BATCH_SIZE).map(({ nodeId }) => nodeId);
    const grouped = new Map<string, Row[]>();
    for (const row of await load(nodeIds)) {
      const existing = grouped.get(row.nodeId);
      if (existing) {
        existing.push(row);
      } else {
        grouped.set(row.nodeId, [row]);
      }
    }
    yield* grouped;
  }
}

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

    const runHourly = (reason: 'startup' | 'interval') =>
      this.runHourlyRollupCycle(reason).catch((error) => {
        this.logger.warn(`hourly metric rollup failed: ${String(error)}`);
      });
    const runDaily = (reason: 'startup' | 'interval') =>
      this.runDailyRollupCycle(reason).catch((error) => {
        this.logger.warn(`daily metric rollup failed: ${String(error)}`);
      });

    await runHourly('startup');
    await runDaily('startup');

    this.hourlyTimer = setInterval(() => {
      void runHourly('interval');
    }, appConfig.metricRollups.hourlyRollupIntervalSeconds * 1000);
    this.hourlyTimer.unref?.();

    this.dailyTimer = setInterval(() => {
      void runDaily('interval');
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
      const lastHour = addHoursUtc(currentDay, -1);
      const sampleCutoff = now.getTime() - appConfig.metricRollups.sampleRetentionHours * 60 * 60_000;
      // The daily timer can run before the hourly timer at the UTC day boundary.
      // Fill the missing hour only while its entire sampling window is retained.
      if (lastHour.getTime() >= sampleCutoff) {
        await this.rollupHourlyBucket(lastHour, { fillMissingOnly: true });
      }
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

  async rollupHourlyBucket(
    bucketStart: Date,
    { fillMissingOnly = false }: { fillMissingOnly?: boolean } = {},
  ): Promise<number> {
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
    const missingHourlyRows: Prisma.NodeMetricRollupHourlyCreateManyInput[] = [];
    const insertMissingRows = async () => {
      const result = await this.prisma.nodeMetricRollupHourly.createMany({
        data: missingHourlyRows,
        skipDuplicates: true,
      });
      upserts += result.count;
      missingHourlyRows.length = 0;
    };

    const samplesByNode = loadRollupRowsByNode(nodeIds, (batch) =>
      this.prisma.nodeMetricSample.findMany({
        where: {
          nodeId: { in: batch },
          sampledAt: {
            gte: bucketStart,
            lt: bucketEnd,
          },
        },
        select: {
          nodeId: true,
          cpuPercent: true,
          memoryPercent: true,
          diskPercent: true,
          latencyMs: true,
          status: true,
          availabilityScore: true,
        },
      }),
    );

    for await (const [nodeId, samples] of samplesByNode) {
      const aggregate = aggregateMetricSamples(samples);
      const key = { nodeId, bucketStart };
      const metrics = {
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
      };
      if (fillMissingOnly) {
        missingHourlyRows.push({ ...key, ...metrics });
        if (missingHourlyRows.length === ROLLUP_READ_BATCH_SIZE) {
          await insertMissingRows();
        }
        continue;
      }

      await this.prisma.nodeMetricRollupHourly.upsert({
        where: { nodeId_bucketStart: key },
        create: { ...key, ...metrics },
        update: metrics,
      });

      upserts += 1;
    }

    if (missingHourlyRows.length > 0) {
      await insertMissingRows();
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

    const hourlyRowsByNode = loadRollupRowsByNode(nodeIds, (batch) =>
      this.prisma.nodeMetricRollupHourly.findMany({
        where: {
          nodeId: { in: batch },
          bucketStart: {
            gte: bucketStart,
            lt: bucketEnd,
          },
        },
        select: {
          nodeId: true,
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
      }),
    );

    for await (const [nodeId, hourlyRows] of hourlyRowsByNode) {
      const metricAverage = (field: 'cpuAvg' | 'memoryAvg' | 'diskAvg' | 'latencyAvg' | 'availabilityPct') =>
        weightedAverage(hourlyRows.flatMap((row) => {
          const value = row[field];
          return value != null && row.sampleCount > 0 ? [{ value, weight: row.sampleCount }] : [];
        }));
      const metrics = {
        sampleCount: hourlyRows.reduce((sum, row) => sum + row.sampleCount, 0),
        cpuAvg: metricAverage('cpuAvg'),
        cpuMin: minNullable(hourlyRows.map((row) => row.cpuMin)),
        cpuMax: maxNullable(hourlyRows.map((row) => row.cpuMax)),
        memoryAvg: metricAverage('memoryAvg'),
        memoryMin: minNullable(hourlyRows.map((row) => row.memoryMin)),
        memoryMax: maxNullable(hourlyRows.map((row) => row.memoryMax)),
        diskAvg: metricAverage('diskAvg'),
        diskMin: minNullable(hourlyRows.map((row) => row.diskMin)),
        diskMax: maxNullable(hourlyRows.map((row) => row.diskMax)),
        latencyAvg: metricAverage('latencyAvg'),
        latencyMin: minNullable(hourlyRows.map((row) => row.latencyMin)),
        latencyMax: maxNullable(hourlyRows.map((row) => row.latencyMax)),
        availabilityPct: metricAverage('availabilityPct'),
      };
      const key = { nodeId, bucketStart };

      await this.prisma.nodeMetricRollupDaily.upsert({
        where: { nodeId_bucketStart: key },
        create: { ...key, ...metrics },
        update: metrics,
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
