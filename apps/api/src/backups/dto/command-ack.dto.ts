import { IsIn, IsUUID } from 'class-validator';

export class CommandAckDto {
  @IsUUID('4')
  command_id!: string;

  @IsIn(['picked_up', 'running'])
  status!: 'picked_up' | 'running';
}
