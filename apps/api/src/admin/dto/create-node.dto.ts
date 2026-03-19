import {
  IsBoolean,
  IsIP,
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

  @IsOptional()
  @IsIP()
  management_ip?: string;

  @IsOptional()
  @IsIP()
  wan_ip?: string;

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
