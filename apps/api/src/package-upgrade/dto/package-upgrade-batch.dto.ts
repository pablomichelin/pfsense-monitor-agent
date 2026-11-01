import { IsArray, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { EmptyStringToUndefined } from '../../common/empty-to-undefined';

export class CreatePackageUpgradeBatchDto {
  @IsArray()
  @IsUUID('4', { each: true })
  node_ids!: string[];

  @IsOptional()
  @MaxLength(120)
  label?: string;

  @EmptyStringToUndefined()
  @IsOptional()
  @IsUUID('4')
  client_id?: string;
}
