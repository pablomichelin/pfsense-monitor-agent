import { IsIn, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;
const LIST_PRESETS = [
  'problem',
  'offline',
  'degraded',
  'backup-late',
  'no-backup',
  'package-outdated',
] as const;

export class ListNodesQueryDto {
  @IsOptional()
  @IsUUID()
  client_id?: string;

  @IsOptional()
  @IsUUID()
  site_id?: string;

  @IsOptional()
  @IsString()
  @IsIn(['online', 'degraded', 'offline', 'maintenance', 'unknown'])
  status?: 'online' | 'degraded' | 'offline' | 'maintenance' | 'unknown';

  @IsOptional()
  @IsUUID()
  tag_id?: string;

  @IsOptional()
  @IsUUID()
  group_id?: string;

  @IsOptional()
  @IsString()
  @IsIn(['critical', 'standard', 'lab'])
  criticality?: 'critical' | 'standard' | 'lab';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  /** Ordenar por coluna do inventário (status, nome, versões, backup, alertas…). */
  @IsOptional()
  @IsString()
  @IsIn([
    'name',
    'agent_version',
    'version',
    'status',
    'backup',
    'alerts',
    'last_seen',
  ])
  sort_by?:
    | 'name'
    | 'agent_version'
    | 'version'
    | 'status'
    | 'backup'
    | 'alerts'
    | 'last_seen';

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sort_order?: 'asc' | 'desc';

  /** Limite de nodes na resposta (evita lentidão com muitos firewalls). Default 500, max 1000. */
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;

  /** Preset operacional (aplica-se após derivar status/backup, sem cortar a 200 primeiras linhas). */
  @IsOptional()
  @IsString()
  @IsIn(LIST_PRESETS)
  preset?: (typeof LIST_PRESETS)[number];
}

export const LIST_NODES_DEFAULT_LIMIT = DEFAULT_LIMIT;
export const LIST_NODES_MAX_LIMIT = MAX_LIMIT;
