import {
  ArrayMaxSize,
  IsArray,
  IsIP,
  IsISO8601,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const HEARTBEAT_SERVICE_STATUSES = [
  'running',
  'stopped',
  'degraded',
  'unknown',
  'not_installed',
] as const;

export const HEARTBEAT_GATEWAY_STATUSES = [
  'online',
  'degraded',
  'down',
  'unknown',
] as const;

export class HeartbeatServiceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string;

  @IsString()
  @IsIn(HEARTBEAT_SERVICE_STATUSES)
  status!: (typeof HEARTBEAT_SERVICE_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  message?: string;
}

export class HeartbeatGatewayDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string;

  @IsString()
  @IsIn(HEARTBEAT_GATEWAY_STATUSES)
  status!: (typeof HEARTBEAT_GATEWAY_STATUSES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  latency_ms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  loss_percent?: number;
}

export class HeartbeatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  schema_version!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  heartbeat_id!: string;

  @IsISO8601()
  sent_at!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  node_uid!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  site_name?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  hostname!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  customer_code!: string;

  @IsOptional()
  @IsIP()
  mgmt_ip?: string;

  @IsOptional()
  @IsIP()
  wan_ip_reported?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  pfsense_version!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  agent_version?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  uptime_sec!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  cpu_percent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  memory_percent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  disk_percent?: number;

  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => HeartbeatGatewayDto)
  gateways!: HeartbeatGatewayDto[];

  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => HeartbeatServiceDto)
  services!: HeartbeatServiceDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  notices?: string[];
}

