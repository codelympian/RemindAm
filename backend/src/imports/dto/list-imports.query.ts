import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_PAGE_SIZE } from '@remindam/shared';

/**
 * Query for `GET /api/imports` — pagination only; results come back newest-first.
 * The global ValidationPipe (`transform: true`) coerces the numeric query strings
 * via `@Type(() => Number)` and rejects unknown params.
 */
export class ListImportsQueryDto {
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
