import {
  IsArray,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class UpdateNodeFleetMetadataDto {
  @IsOptional()
  @IsIn(['critical', 'standard', 'lab'])
  criticality?: 'critical' | 'standard' | 'lab';

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tag_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  add_tag_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  remove_tag_ids?: string[];
}
