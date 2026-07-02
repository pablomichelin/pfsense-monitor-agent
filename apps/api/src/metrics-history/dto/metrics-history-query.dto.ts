import { IsIn } from 'class-validator';

export const METRICS_HISTORY_PERIODS = ['24h', '7d', '30d'] as const;
export type MetricsHistoryPeriodDto =
  (typeof METRICS_HISTORY_PERIODS)[number];

export class MetricsHistoryQueryDto {
  @IsIn(METRICS_HISTORY_PERIODS)
  period: MetricsHistoryPeriodDto = '24h';
}
