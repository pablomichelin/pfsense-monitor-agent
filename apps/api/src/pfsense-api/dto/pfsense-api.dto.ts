import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class PreviewAliasChangeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  type!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class ApplyAliasChangeDto extends PreviewAliasChangeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  confirm_name!: string;
}
