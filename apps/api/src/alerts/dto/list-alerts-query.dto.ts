import { Type } from 'class-transformer';
import { IsInt, Max, Min, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const ALERT_STATUSES = ['open', 'acknowledged', 'resolved'] as const;
const ALERT_SEVERITIES = ['critical', 'warning', 'info'] as const;
const ALERT_TYPES = [
  'heartbeat_missing',
  'service_down',
  'gateway_down',
  'version_change',
  'agent_error',
  'node_uid_conflict',
  'clock_skew',
  'auth_failure_repeated',
] as const;

export class ListAlertsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @IsOptional()
  @IsIn(['legacy', 'attention'])
  sort_by?: 'legacy' | 'attention';

  @IsOptional()
  @IsString()
  client_id?: string;

  @IsOptional()
  @IsString()
  site_id?: string;

  @IsOptional()
  @IsString()
  node_id?: string;

  @IsOptional()
  @IsString()
  @IsIn(ALERT_STATUSES)
  status?: (typeof ALERT_STATUSES)[number];

  @IsOptional()
  @IsString()
  @IsIn(ALERT_SEVERITIES)
  severity?: (typeof ALERT_SEVERITIES)[number];

  @IsOptional()
  @IsString()
  @IsIn(ALERT_TYPES)
  type?: (typeof ALERT_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
