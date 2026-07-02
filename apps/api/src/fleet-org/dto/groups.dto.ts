import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateGroupDto {
  @IsUUID()
  client_id!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;
}

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;
}

export class SetGroupMembersDto {
  @IsArray()
  @IsUUID('4', { each: true })
  node_ids!: string[];
}

export class ListGroupsQueryDto {
  @IsOptional()
  @IsUUID()
  client_id?: string;
}
