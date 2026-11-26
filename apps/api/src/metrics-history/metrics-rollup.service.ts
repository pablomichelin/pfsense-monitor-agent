import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
const ROLLUP_BATCH_SIZE = 128;
type RollupRow = Required<Omit<
  Prisma.NodeMetricRollupHourlyCreateManyInput,
  'id' | 'createdAt' | 'updatedAt'
>>;

async function* loadRollupRowsByNode<Row extends { nodeId: string }>(
  nodes: { nodeId: string }[],
  load: (nodeIds: string[]) => Promise<Row[]>,
): AsyncGenerator<Array<[string, Row[]]>> {
  for (let offset = 0; offset < nodes.length; offset += ROLLUP_BATCH_SIZE) {
    const nodeIds = nodes.slice(offset, offset + ROLLUP_BATCH_SIZE).map(({ nodeId }) => nodeId);
    const grouped = new Map<string, Row[]>();
    for (const row of await load(nodeIds)) {
      const existing = grouped.get(row.nodeId);
      if (existing) {
        existing.push(row);
      } else {
        grouped.set(row.nodeId, [row]);
      }
    }
    const ordered: Array<[string, Row[]]> = [];
    for (const nodeId of nodeIds) {
      const rows = grouped.get(nodeId);
      if (rows) ordered.push([nodeId, rows]);
    }
    if (ordered.length) yield ordered;
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
      orderBy: { nodeId: 'asc' },
      select: {
        nodeId: true,
      },
    });

    let upserts = 0;
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

    for await (const batch of samplesByNode) {
      const rows = batch.map(([nodeId, samples]) => {
        const aggregate = aggregateMetricSamples(samples);
        return {
          nodeId,
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
        };
      });
      upserts += await this.upsertRollupRows('hourly', rows, fillMissingOnly);
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
      orderBy: { nodeId: 'asc' },
      select: {
        nodeId: true,
      },
    });

    let upserts = 0;

    // Read each node immediately before writing its daily result. The last
    // hourly bucket may still be refreshed by the sampler after the UTC boundary.
    for (const { nodeId } of nodeIds) {
      const hourlyRows = await this.prisma.nodeMetricRollupHourly.findMany({
        where: {
          nodeId,
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
      });
      if (hourlyRows.length === 0) continue;

      const metricAverage = (field: 'cpuAvg' | 'memoryAvg' | 'diskAvg' | 'latencyAvg' | 'availabilityPct') =>
        weightedAverage(hourlyRows.flatMap((row) => {
          const value = row[field];
          return value != null && row.sampleCount > 0 ? [{ value, weight: row.sampleCount }] : [];
        }));
      const metrics = {
        nodeId,
        bucketStart,
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
      upserts += await this.upsertRollupRows('daily', [metrics]);
    }

    return upserts;
  }

  private upsertRollupRows(
    granularity: 'hourly' | 'daily',
    rows: RollupRow[],
    fillMissingOnly = false,
  ): Promise<number> {
    const table = granularity === 'hourly'
      ? Prisma.sql`node_metric_rollups_hourly`
      : Prisma.sql`node_metric_rollups_daily`;
    const values = rows.map((row) => Prisma.sql`(
      ${row.nodeId}::uuid, ${row.bucketStart}::timestamptz, ${row.sampleCount}::integer,
      ${row.cpuAvg}::float8, ${row.cpuMin}::float8, ${row.cpuMax}::float8,
      ${row.memoryAvg}::float8, ${row.memoryMin}::float8, ${row.memoryMax}::float8,
      ${row.diskAvg}::float8, ${row.diskMin}::float8, ${row.diskMax}::float8,
      ${row.latencyAvg}::float8, ${row.latencyMin}::float8, ${row.latencyMax}::float8,
      ${row.availabilityPct}::float8
    )`);
    const conflictAction = fillMissingOnly ? Prisma.sql`DO NOTHING` : Prisma.sql`
      DO UPDATE SET
        sample_count = EXCLUDED.sample_count,
        cpu_avg = EXCLUDED.cpu_avg, cpu_min = EXCLUDED.cpu_min, cpu_max = EXCLUDED.cpu_max,
        memory_avg = EXCLUDED.memory_avg, memory_min = EXCLUDED.memory_min, memory_max = EXCLUDED.memory_max,
        disk_avg = EXCLUDED.disk_avg, disk_min = EXCLUDED.disk_min, disk_max = EXCLUDED.disk_max,
        latency_avg = EXCLUDED.latency_avg, latency_min = EXCLUDED.latency_min, latency_max = EXCLUDED.latency_max,
        availability_pct = EXCLUDED.availability_pct,
        updated_at = EXCLUDED.updated_at
    `;
    // Exclude nodes removed since the read and hold each surviving FK row until the write commits.
    return this.prisma.$executeRaw`
      INSERT INTO ${table} (
        node_id, bucket_start, sample_count,
        cpu_avg, cpu_min, cpu_max, memory_avg, memory_min, memory_max,
        disk_avg, disk_min, disk_max, latency_avg, latency_min, latency_max,
        availability_pct, updated_at
      )
      SELECT input.*, CURRENT_TIMESTAMP
      FROM (VALUES ${Prisma.join(values)}) AS input (
        node_id, bucket_start, sample_count,
        cpu_avg, cpu_min, cpu_max, memory_avg, memory_min, memory_max,
        disk_avg, disk_min, disk_max, latency_avg, latency_min, latency_max,
        availability_pct
      )
      JOIN nodes ON nodes.id = input.node_id
      ORDER BY input.node_id
      FOR KEY SHARE OF nodes
      ON CONFLICT (node_id, bucket_start) ${conflictAction}
    `;
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
