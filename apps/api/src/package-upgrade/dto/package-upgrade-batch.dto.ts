import { IsArray, IsOptional, IsUUID, MaxLength } from 'class-validator';

export class CreatePackageUpgradeBatchDto {
  @IsArray()
  @IsUUID('4', { each: true })
  node_ids!: string[];

  @IsOptional()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsUUID('4')
  client_id?: string;
}
