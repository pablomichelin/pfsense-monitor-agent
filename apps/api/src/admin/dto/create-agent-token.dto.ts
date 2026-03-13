import { IsDateString, IsOptional } from 'class-validator';

export class CreateAgentTokenDto {
  @IsOptional()
  @IsDateString()
  expires_at?: string;
}
