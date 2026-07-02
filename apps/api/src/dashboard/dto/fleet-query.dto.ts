import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class FleetQueryDto {
  @IsOptional()
  @IsUUID()
  client_id?: string;

  @IsOptional()
  @IsUUID()
  site_id?: string;

  @IsOptional()
  @IsIn(['online', 'degraded', 'offline', 'maintenance', 'unknown'])
  status?: 'online' | 'degraded' | 'offline' | 'maintenance' | 'unknown';
}
