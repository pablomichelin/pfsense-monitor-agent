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

export const HEARTBEAT_SERVICE_IMPACT = [
  'critical',
  'optional',
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

  /** Se omitido, trata-se como critical (compatibilidade Fase A). Optional nao degrada o node. */
  @IsOptional()
  @IsIn(HEARTBEAT_SERVICE_IMPACT)
  impact_on_status?: (typeof HEARTBEAT_SERVICE_IMPACT)[number];
}

export class HeartbeatInterfaceDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsString()
  @MaxLength(45)
  ip!: string;

  /** wan, lan, opt1, opt2, ... — usado pelo painel para agrupar interno vs WAN. */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  role?: string;
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

  /** IP(s) de gerenciamento (LAN); multiplas IPs separadas por virgula. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  mgmt_ip?: string;

  /** IP(s) WAN reportada(s); multiplas IPs separadas por virgula. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
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

  /** Opcional: quando omitido, a API mantém o último estado conhecido (heartbeat leve). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => HeartbeatGatewayDto)
  gateways?: HeartbeatGatewayDto[];

  /** Opcional: quando omitido, a API mantém o último estado conhecido (heartbeat leve). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => HeartbeatServiceDto)
  services?: HeartbeatServiceDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  notices?: string[];

  /** Interfaces de rede: name = descricao (ex.: ADM, P4), ip, role = wan/lan/opt1/... para o painel agrupar. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => HeartbeatInterfaceDto)
  interfaces?: HeartbeatInterfaceDto[];
}

