import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_PAGE_SIZE } from '@remindam/shared';
import { trim } from '../../common/transforms';

/**
 * Query for `GET /api/customers`. `q` searches name/phone/email; `page`/`pageSize`
 * page the results. The global ValidationPipe (`transform: true`) coerces the
 * numeric query strings via `@Type(() => Number)` and rejects unknown params.
 */
export class ListCustomersQueryDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;
}
