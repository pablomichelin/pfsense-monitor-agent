import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
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

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  delivery_attempt?: number;
}
