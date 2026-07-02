import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NodeExternalCredentialAuthMethod } from '@prisma/client';

export class UpsertPfrestCredentialDto {
  @IsEnum(NodeExternalCredentialAuthMethod)
  auth_method!: NodeExternalCredentialAuthMethod;

  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  secret!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  api_base_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  scope_description?: string;
}

export class RotatePfrestCredentialDto extends UpsertPfrestCredentialDto {}
