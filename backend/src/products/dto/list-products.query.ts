import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_PAGE_SIZE } from '@remindam/shared';
import { toBoolean, trim } from '../../common/transforms';

/**
 * Query for `GET /api/products`. `q` searches name/SKU; `active` filters the
 * catalogue by status (omit it to see both). The global ValidationPipe
 * (`transform: true`) coerces the query strings via `@Type(() => Number)` and
 * {@link toBoolean}, and rejects unknown params.
 */
export class ListProductsQueryDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  active?: boolean;

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
