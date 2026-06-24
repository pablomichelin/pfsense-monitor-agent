import { IsString, MaxLength, MinLength } from 'class-validator';

export class MfaLoginDto {
  @IsString()
  @MinLength(10)
  @MaxLength(256)
  mfa_token!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code!: string;
}

export class MfaCodeDto {
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code!: string;
}
