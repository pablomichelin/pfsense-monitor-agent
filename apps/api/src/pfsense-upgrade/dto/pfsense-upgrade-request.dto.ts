import { IsBoolean, IsOptional } from 'class-validator';

export class PfsenseUpgradeRequestDto {
  @IsOptional()
  @IsBoolean()
  enable_maintenance_mode?: boolean;

  @IsOptional()
  @IsBoolean()
  acknowledge_no_recent_backup?: boolean;
}
