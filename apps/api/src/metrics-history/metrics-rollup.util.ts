import { NodeStatus } from '@prisma/client';

export type MetricSampleInput = {
  cpuPercent: number | null;
  memoryPercent: number | null;
  diskPercent: number | null;
  latencyMs: number | null;
  status: NodeStatus | string;
  availabilityScore?: number | null;
};

export type NumericRollupStats = {
  avg: number | null;
  min: number | null;
  max: number | null;
  count: number;
};

export type MetricRollupAggregate = {
  sampleCount: number;
  cpu: NumericRollupStats;
  memory: NumericRollupStats;
  disk: NumericRollupStats;
  latency: NumericRollupStats;
  availabilityPct: number | null;
};

const AVAILABLE_STATUSES = new Set<string>([
  NodeStatus.online,
  NodeStatus.degraded,
  NodeStatus.maintenance,
]);

export function isNodeStatusAvailable(status: string): boolean {
  return AVAILABLE_STATUSES.has(status);
}

export function computeAvailabilityScore(status: NodeStatus | string): number {
  return isNodeStatusAvailable(status) ? 1 : 0;
}

export function computeNumericStats(
  values: Array<number | null | undefined>,
): NumericRollupStats {
  const nums = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );

  if (nums.length === 0) {
    return { avg: null, min: null, max: null, count: 0 };
  }

  const sum = nums.reduce((acc, value) => acc + value, 0);

  return {
    avg: round2(sum / nums.length),
    min: round2(Math.min(...nums)),
    max: round2(Math.max(...nums)),
    count: nums.length,
  };
}

export function computeAvailabilityPercent(
  samples: MetricSampleInput[],
): number | null {
  if (samples.length === 0) {
    return null;
  }

  const total = samples.reduce((acc, sample) => {
    if (sample.availabilityScore != null && Number.isFinite(sample.availabilityScore)) {
      return acc + sample.availabilityScore;
    }

    return acc + computeAvailabilityScore(sample.status);
  }, 0);

  return round2((total / samples.length) * 100);
}

export function aggregateMetricSamples(
  samples: MetricSampleInput[],
): MetricRollupAggregate {
  return {
    sampleCount: samples.length,
    cpu: computeNumericStats(samples.map((sample) => sample.cpuPercent)),
    memory: computeNumericStats(samples.map((sample) => sample.memoryPercent)),
    disk: computeNumericStats(samples.map((sample) => sample.diskPercent)),
    latency: computeNumericStats(samples.map((sample) => sample.latencyMs)),
    availabilityPct: computeAvailabilityPercent(samples),
  };
}

export function truncateToHourUtc(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      0,
      0,
      0,
    ),
  );
}

export function truncateToDayUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
}

export function addHoursUtc(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export type MetricsHistoryPeriod = '24h' | '7d' | '30d';

export function resolveHistoryWindow(
  period: MetricsHistoryPeriod,
  now: Date = new Date(),
): {
  period: MetricsHistoryPeriod;
  granularity: 'hourly' | 'daily';
  from: Date;
  to: Date;
} {
  const to = now;

  if (period === '24h') {
    return {
      period,
      granularity: 'hourly',
      from: new Date(to.getTime() - 24 * 60 * 60 * 1000),
      to,
    };
  }

  if (period === '7d') {
    return {
      period,
      granularity: 'hourly',
      from: new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000),
      to,
    };
  }

  return {
    period: '30d',
    granularity: 'daily',
    from: new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000),
    to,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
