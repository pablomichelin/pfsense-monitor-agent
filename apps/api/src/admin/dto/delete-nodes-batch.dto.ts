import { IsArray, ArrayMinSize, IsUUID } from 'class-validator';

export class DeleteNodesBatchDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'ids must contain at least one id' })
  @IsUUID(4, { each: true, message: 'each id must be a valid UUID' })
  ids!: string[];
}
