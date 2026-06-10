import { IsIn, IsString, IsUUID, MaxLength } from 'class-validator';

export class CommandResultDto {
  @IsUUID('4')
  command_id!: string;

  @IsIn(['failed'])
  status!: 'failed';

  @IsString()
  @MaxLength(500)
  error_message!: string;
}
