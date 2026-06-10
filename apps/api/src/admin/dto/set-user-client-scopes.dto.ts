import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SetUserClientScopesDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  client_ids!: string[];
}
