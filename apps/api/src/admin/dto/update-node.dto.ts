import {
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateNodeDto {
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
}
