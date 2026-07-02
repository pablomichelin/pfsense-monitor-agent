import { Injectable } from '@nestjs/common';
import { AccessActor } from '../auth/access-actor.type';
import { AccessPolicyService } from '../auth/access-policy.service';
import { appConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsHistoryPeriodDto } from './dto/metrics-history-query.dto';
import { resolveHistoryWindow } from './metrics-rollup.util';

const HISTORY_CACHE_TTL_MS = 30_000;

type RollupPoint = {
  bucket_start: string;
  sample_count: number;
  cpu_avg: number | null;
  cpu_min: number | null;
  cpu_max: number | null;
  memory_avg: number | null;
  memory_min: number | null;
  memory_max: number | null;
  disk_avg: number | null;
  disk_min: number | null;
  disk_max: number | null;
  latency_avg: number | null;
  latency_min: number | null;
  latency_max: number | null;
  availability_pct: number | null;
};

export type NodeMetricsHistoryResponse = {
  enabled: boolean;
  generated_at: string;
  node_id: string;
  period: MetricsHistoryPeriodDto;
  granularity: 'hourly' | 'daily';
  from: string;
  to: string;
  points: RollupPoint[];
  summary: {
    sample_count: number;
    cpu_avg: number | null;
    memory_avg: number | null;
    disk_avg: number | null;
    latency_avg: number | null;
    availability_pct: number | null;
  };
};

@Injectable()
export class MetricsHistoryService {
  private readonly cache = new Map<
    string,
    { data: NodeMetricsHistoryResponse; expiresAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async getNodeHistory(
    actor: AccessActor,
    nodeId: string,
    period: MetricsHistoryPeriodDto,
  ): Promise<NodeMetricsHistoryResponse> {
    await this.accessPolicy.assertNodeAccess(actor, nodeId);

    const cacheKey = `${actor.userId}:${nodeId}:${period}`;
    const nowMs = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > nowMs) {
      return cached.data;
    }

    const now = new Date();
    const window = resolveHistoryWindow(period, now);

    if (!appConfig.metricRollups.enabled) {
      const disabledResponse: NodeMetricsHistoryResponse = {
        enabled: false,
        generated_at: now.toISOString(),
        node_id: nodeId,
        period: window.period,
        granularity: window.granularity,
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        points: [],
        summary: emptySummary(),
      };
      return disabledResponse;
    }

    const points =
      window.granularity === 'hourly'
        ? await this.loadHourlyPoints(nodeId, window.from, window.to)
        : await this.loadDailyPoints(nodeId, window.from, window.to);

    const response: NodeMetricsHistoryResponse = {
      enabled: true,
      generated_at: now.toISOString(),
      node_id: nodeId,
      period: window.period,
      granularity: window.granularity,
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      points,
      summary: summarizePoints(points),
    };

    this.cache.set(cacheKey, {
      data: response,
      expiresAt: nowMs + HISTORY_CACHE_TTL_MS,
    });

    return response;
  }

  private async loadHourlyPoints(
    nodeId: string,
    from: Date,
    to: Date,
  ): Promise<RollupPoint[]> {
    const rows = await this.prisma.nodeMetricRollupHourly.findMany({
      where: {
        nodeId,
        bucketStart: {
          gte: from,
          lte: to,
        },
      },
      orderBy: {
        bucketStart: 'asc',
      },
    });

    return rows.map(mapHourlyRow);
  }

  private async loadDailyPoints(
    nodeId: string,
    from: Date,
    to: Date,
  ): Promise<RollupPoint[]> {
    const rows = await this.prisma.nodeMetricRollupDaily.findMany({
      where: {
        nodeId,
        bucketStart: {
          gte: from,
          lte: to,
        },
      },
      orderBy: {
        bucketStart: 'asc',
      },
    });

    return rows.map(mapDailyRow);
  }
}

function mapHourlyRow(row: {
  bucketStart: Date;
  sampleCount: number;
  cpuAvg: number | null;
  cpuMin: number | null;
  cpuMax: number | null;
  memoryAvg: number | null;
  memoryMin: number | null;
  memoryMax: number | null;
  diskAvg: number | null;
  diskMin: number | null;
  diskMax: number | null;
  latencyAvg: number | null;
  latencyMin: number | null;
  latencyMax: number | null;
  availabilityPct: number | null;
}): RollupPoint {
  return {
    bucket_start: row.bucketStart.toISOString(),
    sample_count: row.sampleCount,
    cpu_avg: row.cpuAvg,
    cpu_min: row.cpuMin,
    cpu_max: row.cpuMax,
    memory_avg: row.memoryAvg,
    memory_min: row.memoryMin,
    memory_max: row.memoryMax,
    disk_avg: row.diskAvg,
    disk_min: row.diskMin,
    disk_max: row.diskMax,
    latency_avg: row.latencyAvg,
    latency_min: row.latencyMin,
    latency_max: row.latencyMax,
    availability_pct: row.availabilityPct,
  };
}

function mapDailyRow(row: Parameters<typeof mapHourlyRow>[0]): RollupPoint {
  return mapHourlyRow(row);
}

function emptySummary(): NodeMetricsHistoryResponse['summary'] {
  return {
    sample_count: 0,
    cpu_avg: null,
    memory_avg: null,
    disk_avg: null,
    latency_avg: null,
    availability_pct: null,
  };
}

function summarizePoints(points: RollupPoint[]): NodeMetricsHistoryResponse['summary'] {
  if (points.length === 0) {
    return emptySummary();
  }

  const sampleCount = points.reduce((acc, point) => acc + point.sample_count, 0);
  const availabilityWeighted = points.reduce(
    (acc, point) => {
      if (point.availability_pct == null || point.sample_count <= 0) {
        return acc;
      }
      return {
        sum: acc.sum + point.availability_pct * point.sample_count,
        weight: acc.weight + point.sample_count,
      };
    },
    { sum: 0, weight: 0 },
  );

  return {
    sample_count: sampleCount,
    cpu_avg: weightedMetricAverage(points, 'cpu_avg'),
    memory_avg: weightedMetricAverage(points, 'memory_avg'),
    disk_avg: weightedMetricAverage(points, 'disk_avg'),
    latency_avg: weightedMetricAverage(points, 'latency_avg'),
    availability_pct:
      availabilityWeighted.weight > 0
        ? round2(availabilityWeighted.sum / availabilityWeighted.weight)
        : null,
  };
}

function weightedMetricAverage(
  points: RollupPoint[],
  field: 'cpu_avg' | 'memory_avg' | 'disk_avg' | 'latency_avg',
): number | null {
  const weighted = points.reduce(
    (acc, point) => {
      const value = point[field];
      if (value == null || point.sample_count <= 0) {
        return acc;
      }
      return {
        sum: acc.sum + value * point.sample_count,
        weight: acc.weight + point.sample_count,
      };
    },
    { sum: 0, weight: 0 },
  );

  if (weighted.weight <= 0) {
    return null;
  }

  return round2(weighted.sum / weighted.weight);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
