import { IsArray, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { NodeCommandType } from '@prisma/client';
import { EmptyStringToUndefined } from '../../common/empty-to-undefined';
import { GENERIC_BATCH_COMMAND_TYPES } from '../generic-command-batch.policy';

export class ListNodeCommandsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(Object.values(NodeCommandType))
  type?: NodeCommandType;
}

export class CreateCommandBatchDto {
  @IsIn([...GENERIC_BATCH_COMMAND_TYPES], {
    message: 'command_type requires its dedicated operation endpoint; generic batches only support config_backup_now',
  })
  command_type!: NodeCommandType;

  @IsArray()
  @IsUUID('4', { each: true })
  node_ids!: string[];

  @IsOptional()
  label?: string;

  @EmptyStringToUndefined()
  @IsOptional()
  @IsUUID('4')
  client_id?: string;

  @IsOptional()
  idempotency_prefix?: string;
}
