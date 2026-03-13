import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveAlertDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  resolution_note?: string;
}
