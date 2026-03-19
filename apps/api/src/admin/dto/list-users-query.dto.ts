import { IsIn, IsOptional } from 'class-validator';

export class ListUsersQueryDto {
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
