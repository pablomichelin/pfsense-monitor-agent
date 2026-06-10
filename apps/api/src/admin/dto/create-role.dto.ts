import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(48)
  @Matches(/^[a-z][a-z0-9-]*$/, {
    message: 'code must be lowercase slug (a-z, 0-9, hyphen)',
  })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  label!: string;
}
