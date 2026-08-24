import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
  ValidateIf,
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

export const HEARTBEAT_BACKUP_SCHEDULE_MODES = [
  'hours',
  'daily',
  'weekly',
  'monthly',
] as const;

export class HeartbeatConfigBackupDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(HEARTBEAT_BACKUP_SCHEDULE_MODES)
  schedule_mode?: (typeof HEARTBEAT_BACKUP_SCHEDULE_MODES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  interval_hours?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  schedule_time?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  schedule_dow?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  schedule_dom?: number;
}

export class HeartbeatCertificateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  cert_key!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  issuer?: string;

  @IsISO8601()
  not_before!: string;

  @IsISO8601()
  not_after!: string;

  /** Uso ou descritor legivel (ex.: Web GUI, OpenVPN server). */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  usage?: string;
}

export class HeartbeatCapabilitiesDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsBoolean()
  pfrest_enabled?: boolean | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  pfrest_version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  api_base_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  access_mode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  auth_method?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  modules?: string[];
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

export class HeartbeatLocalUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  uid?: number;

  @IsOptional()
  @IsBoolean()
  disabled?: boolean;

  @IsOptional()
  @IsBoolean()
  is_admin?: boolean;
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

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsBoolean()
  pfsense_update_available?: boolean | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  pfsense_update_target_version?: string;

  @IsOptional()
  @IsISO8601()
  pfsense_update_checked_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  pfsense_update_check_error?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  pfsense_update_error_class?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  pfsense_update_log_snippet?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  pfsense_firmware_branch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  pfsense_firmware_branch_descr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pfsense_update_branches?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsBoolean()
  ha_detected?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ha_detection_detail?: string;

  /** Politica de backup reportada pelo agente (agendamento local do pfSense). */
  @IsOptional()
  @ValidateNested()
  @Type(() => HeartbeatConfigBackupDto)
  config_backup?: HeartbeatConfigBackupDto;

  /** Inventario de certificados (somente metadados publicos). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => HeartbeatCertificateDto)
  certificates?: HeartbeatCertificateDto[];

  /** Inventario de capacidades pfREST reportado pelo agente. */
  @IsOptional()
  @ValidateNested()
  @Type(() => HeartbeatCapabilitiesDto)
  capabilities?: HeartbeatCapabilitiesDto;

  /** Inventario de usuarios locais pfSense (guardrail revogacao). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(128)
  @ValidateNested({ each: true })
  @Type(() => HeartbeatLocalUserDto)
  local_users?: HeartbeatLocalUserDto[];
}

