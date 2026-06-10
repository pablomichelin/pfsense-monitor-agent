import { EntityStatus } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  display_name?: string;

  @IsString()
  @MinLength(10)
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9-]*$/)
  role?: string;

  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;

  @IsOptional()
  @IsUUID('4')
  client_id?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  client_ids?: string[];
}
