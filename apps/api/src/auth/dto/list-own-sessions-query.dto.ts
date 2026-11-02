import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListOwnSessionsQueryDto {
  @IsOptional()
  @IsIn(['active', 'history', 'all'])
  view?: 'active' | 'history' | 'all';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([10, 25, 50])
  per_page?: number;
}
