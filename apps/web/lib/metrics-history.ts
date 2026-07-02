export type MetricsHistoryPeriod = '24h' | '7d' | '30d';

export type MetricsHistoryPoint = {
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
  period: MetricsHistoryPeriod;
  granularity: 'hourly' | 'daily';
  from: string;
  to: string;
  points: MetricsHistoryPoint[];
  summary: {
    sample_count: number;
    cpu_avg: number | null;
    memory_avg: number | null;
    disk_avg: number | null;
    latency_avg: number | null;
    availability_pct: number | null;
  };
};

export const METRICS_HISTORY_PERIODS: MetricsHistoryPeriod[] = ['24h', '7d', '30d'];

export function metricsHistoryPeriodLabel(period: MetricsHistoryPeriod): string {
  if (period === '24h') return '24 horas';
  if (period === '7d') return '7 dias';
  return '30 dias';
}

export function normalizeMetricsHistoryPeriod(
  value: string | undefined,
): MetricsHistoryPeriod {
  if (value === '7d' || value === '30d') {
    return value;
  }
  return '24h';
}
