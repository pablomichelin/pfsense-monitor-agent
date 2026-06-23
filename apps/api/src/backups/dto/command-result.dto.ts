import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CommandResultDto {
  @IsUUID('4')
  command_id!: string;

  @IsIn(['succeeded', 'failed'])
  status!: 'succeeded' | 'failed';

  @ValidateIf((dto: CommandResultDto) => dto.status === 'failed')
  @IsString()
  @MaxLength(500)
  error_message?: string;

  @IsOptional()
  @IsObject()
  result_json?: Record<string, unknown>;
}
