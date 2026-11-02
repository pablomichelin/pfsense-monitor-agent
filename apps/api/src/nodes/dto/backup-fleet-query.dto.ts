import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class FleetScopeQueryDto {
  @IsOptional()
  @IsUUID()
  client_id?: string;

  @IsOptional()
  @IsUUID()
  site_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class BackupFleetQueryDto extends FleetScopeQueryDto {
  @IsOptional()
  @IsIn(['ok', 'late', 'failed', 'never'])
  backup_status?: 'ok' | 'late' | 'failed' | 'never';

  @IsOptional()
  @IsIn(['name', 'backup_priority', 'backup_age'])
  sort_by?: 'name' | 'backup_priority' | 'backup_age';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort_order?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([10, 25, 50])
  per_page?: number;
}
