'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/cn';
import { formatPercent } from '@/lib/format';
import {
  METRICS_HISTORY_PERIODS,
  metricsHistoryPeriodLabel,
  normalizeMetricsHistoryPeriod,
  type MetricsHistoryPeriod,
  type NodeMetricsHistoryResponse,
} from '@/lib/metrics-history';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';

type TrendMetric = 'cpu_avg' | 'memory_avg' | 'disk_avg' | 'latency_avg' | 'availability_pct';

const METRIC_LABELS: Record<TrendMetric, string> = {
  cpu_avg: 'CPU',
  memory_avg: 'Memória',
  disk_avg: 'Disco',
  latency_avg: 'Latência (ms)',
  availability_pct: 'Disponibilidade',
};

function formatMetricValue(metric: TrendMetric, value: number | null): string {
  if (value == null) {
    return '—';
  }
  if (metric === 'latency_avg') {
    return `${Math.round(value)} ms`;
  }
  if (metric === 'availability_pct') {
    return `${value.toFixed(1)}%`;
  }
  return formatPercent(value);
}

function SparkBars({
  metric,
  points,
}: {
  metric: TrendMetric;
  points: NodeMetricsHistoryResponse['points'];
}) {
  const values = points
    .map((point) => point[metric])
    .filter((value): value is number => value != null && Number.isFinite(value));

  if (values.length === 0) {
    return <p className="text-xs text-slate-500">Sem amostras no período.</p>;
  }

  const max = Math.max(...values, metric === 'availability_pct' ? 100 : 1);

  return (
    <div className="flex h-16 items-end gap-0.5" aria-hidden>
      {points.map((point) => {
        const value = point[metric];
        const height =
          value != null && Number.isFinite(value)
            ? Math.max(4, Math.round((value / max) * 100))
            : 4;
        return (
          <div
            key={point.bucket_start}
            className="min-w-[3px] flex-1 rounded-sm bg-cyan-500/70"
            style={{ height: `${height}%` }}
            title={`${point.bucket_start}: ${formatMetricValue(metric, value)}`}
          />
        );
      })}
    </div>
  );
}

export function NodeMetricsTrendsPanel({
  nodeId,
  history,
  activePeriod,
}: {
  nodeId: string;
  history: NodeMetricsHistoryResponse;
  activePeriod: MetricsHistoryPeriod;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectPeriod = (period: MetricsHistoryPeriod) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'metrics');
    if (period === '24h') {
      params.delete('metrics_period');
    } else {
      params.set('metrics_period', period);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  if (!history.enabled) {
    return (
      <Alert variant="info">
        Histórico de métricas desligado neste ambiente (
        <code className="text-xs">METRIC_ROLLUPS_ENABLED=false</code>). O snapshot
        operacional atual permanece disponível acima.
      </Alert>
    );
  }

  if (history.points.length === 0) {
    return (
      <div className="space-y-4">
        <PeriodSelector activePeriod={activePeriod} onSelect={selectPeriod} />
        <Alert variant="info">
          Ainda não há rollups para este firewall. Amostras periódicas começam após
          habilitar <code className="text-xs">METRIC_ROLLUPS_ENABLED=true</code> e
          aguardar o primeiro ciclo (~5 min).
        </Alert>
      </div>
    );
  }

  const trendMetrics: TrendMetric[] = [
    'cpu_avg',
    'memory_avg',
    'disk_avg',
    'latency_avg',
    'availability_pct',
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector activePeriod={activePeriod} onSelect={selectPeriod} />
        <p className="text-xs text-slate-500">
          Granularidade: {history.granularity === 'hourly' ? 'horária' : 'diária'} ·{' '}
          {history.points.length} buckets
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {trendMetrics.map((metric) => (
          <Card key={metric} className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-200">{METRIC_LABELS[metric]}</p>
              <p className="font-mono text-xs text-slate-400">
                média período:{' '}
                {formatMetricValue(
                  metric,
                  metric === 'cpu_avg'
                    ? history.summary.cpu_avg
                    : metric === 'memory_avg'
                      ? history.summary.memory_avg
                      : metric === 'disk_avg'
                        ? history.summary.disk_avg
                        : metric === 'latency_avg'
                          ? history.summary.latency_avg
                          : history.summary.availability_pct,
                )}
              </p>
            </div>
            <SparkBars metric={metric} points={history.points} />
          </Card>
        ))}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-slate-800 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Bucket</th>
              <th className="px-3 py-2 font-medium">Amostras</th>
              <th className="px-3 py-2 font-medium">CPU méd.</th>
              <th className="px-3 py-2 font-medium">Mem. méd.</th>
              <th className="px-3 py-2 font-medium">Disco méd.</th>
              <th className="px-3 py-2 font-medium">Lat. méd.</th>
              <th className="px-3 py-2 font-medium">Disp.</th>
            </tr>
          </thead>
          <tbody>
            {[...history.points].reverse().slice(0, 24).map((point) => (
              <tr key={point.bucket_start} className="border-b border-slate-800/60">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-300">
                  {new Date(point.bucket_start).toLocaleString('pt-BR', {
                    timeZone: 'UTC',
                    hour: '2-digit',
                    minute: '2-digit',
                    day: '2-digit',
                    month: '2-digit',
                  })}{' '}
                  UTC
                </td>
                <td className="px-3 py-2 text-slate-400">{point.sample_count}</td>
                <td className="px-3 py-2">{formatMetricValue('cpu_avg', point.cpu_avg)}</td>
                <td className="px-3 py-2">
                  {formatMetricValue('memory_avg', point.memory_avg)}
                </td>
                <td className="px-3 py-2">{formatMetricValue('disk_avg', point.disk_avg)}</td>
                <td className="px-3 py-2">
                  {formatMetricValue('latency_avg', point.latency_avg)}
                </td>
                <td className="px-3 py-2">
                  {formatMetricValue('availability_pct', point.availability_pct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-slate-500">
        Node <span className="font-mono">{nodeId.slice(0, 8)}…</span> · API{' '}
        <Link href={`/nodes/${nodeId}?tab=metrics`} className="text-cyan-400 hover:underline">
          tendências
        </Link>
      </p>
    </div>
  );
}

function PeriodSelector({
  activePeriod,
  onSelect,
}: {
  activePeriod: MetricsHistoryPeriod;
  onSelect: (period: MetricsHistoryPeriod) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {METRICS_HISTORY_PERIODS.map((period) => (
        <button
          key={period}
          type="button"
          onClick={() => onSelect(period)}
          className={cn(
            'rounded-md border px-3 py-1.5 text-xs font-medium transition',
            activePeriod === period
              ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-200'
              : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200',
          )}
        >
          {metricsHistoryPeriodLabel(period)}
        </button>
      ))}
    </div>
  );
}
