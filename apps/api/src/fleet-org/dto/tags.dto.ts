import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateTagDto {
  @IsUUID()
  client_id!: string;

  @IsString()
  @MaxLength(64)
  name!: string;
}

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;
}

export class ListTagsQueryDto {
  @IsOptional()
  @IsUUID()
  client_id?: string;
}
