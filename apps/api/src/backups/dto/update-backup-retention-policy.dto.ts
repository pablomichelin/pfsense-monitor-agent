import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateBackupRetentionPolicyDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  retention_count?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1024 * 1024)
  @Max(1024 * 1024 * 1024)
  retention_max_bytes?: number | null;
}
