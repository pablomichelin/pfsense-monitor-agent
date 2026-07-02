import { IsArray, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { NodeCommandType } from '@prisma/client';

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
  @IsIn(Object.values(NodeCommandType))
  command_type!: NodeCommandType;

  @IsArray()
  @IsUUID('4', { each: true })
  node_ids!: string[];

  @IsOptional()
  label?: string;

  @IsOptional()
  @IsUUID('4')
  client_id?: string;

  @IsOptional()
  idempotency_prefix?: string;
}
