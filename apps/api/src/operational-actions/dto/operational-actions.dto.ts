import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SERVICE_RESTART_ALLOWLIST } from '../operational-actions.util';

export class ServiceRestartRequestDto {
  @IsString()
  @IsIn([...SERVICE_RESTART_ALLOWLIST])
  service!: string;
}

export class NodeRebootRequestDto {
  @IsString()
  confirm_hostname!: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(600)
  delay_seconds?: number;

  @IsOptional()
  @IsBoolean()
  enable_maintenance_mode?: boolean;

  @IsOptional()
  @IsBoolean()
  acknowledge_ha_risk?: boolean;
}

export class CreateBackupBatchDto {
  @IsString({ each: true })
  node_ids!: string[];

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  client_id?: string;
}
