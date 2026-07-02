import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateNodeDto {
  @IsOptional()
  @IsUUID()
  site_id?: string;

  @IsOptional()
  @IsUUID()
  client_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  node_uid?: string;

  /** Se omitido, o backend gera um node_uid; hostname e IPs serao preenchidos pelo agente no primeiro heartbeat. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  hostname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  display_name?: string;

  /** IP(s) de gerenciamento; multiplas IPs separadas por virgula (como no heartbeat). */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  management_ip?: string;

  /** IP(s) WAN; multiplas IPs separadas por virgula (como no heartbeat). */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  wan_ip?: string;

  /** URL de acesso remoto ao pfSense (ex.: https://177.38.158.46:9999). Se omitida, derivada do IP WAN ou de gerenciamento. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  remote_access_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  pfsense_version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  agent_version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  ha_role?: string;

  @IsOptional()
  @IsBoolean()
  maintenance_mode?: boolean;
}
