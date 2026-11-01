import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CommandAckDto {
  @IsUUID('4')
  command_id!: string;

  @IsIn(['picked_up', 'running'])
  status!: 'picked_up' | 'running';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  delivery_attempt?: number;
}
