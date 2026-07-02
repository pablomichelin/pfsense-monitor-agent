import { ArrayUnique, IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateMfaPolicyDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  enforced_roles?: string[];

  @IsOptional()
  @IsBoolean()
  enforcement_blocking?: boolean;
}
