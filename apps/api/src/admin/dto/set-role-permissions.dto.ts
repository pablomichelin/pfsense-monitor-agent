import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class SetRolePermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permission_ids!: string[];
}
