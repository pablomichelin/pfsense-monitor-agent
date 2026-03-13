import {
  IsIP,
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
}
