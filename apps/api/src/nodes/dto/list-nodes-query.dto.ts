import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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
  @IsString()
  @MaxLength(120)
  search?: string;
}
