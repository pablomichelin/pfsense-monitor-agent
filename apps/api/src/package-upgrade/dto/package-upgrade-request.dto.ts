import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class PackageUpgradeRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  target_version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  artifact_url?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/i, {
    message: 'sha256 must be a 64-char hex string',
  })
  sha256?: string;
}
