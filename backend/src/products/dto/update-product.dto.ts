import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_PRODUCT_MONEY, MAX_PRODUCT_QUANTITY } from '@remindam/shared';
import { emptyToUndefined, trim } from '../../common/transforms';

/**
 * Body for `PATCH /api/products/:id` — every field optional, same rules as
 * {@link CreateProductDto}. Written out by hand rather than via
 * `PartialType` because `@nestjs/mapped-types` is not a dependency.
 *
 * The nullable fields accept an explicit `null` to *clear* them; omitting a
 * field leaves it untouched (the service only assigns what was actually sent).
 */
export class UpdateProductDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sku?: string | null;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string | null;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PRODUCT_MONEY)
  price?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PRODUCT_MONEY)
  cost?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PRODUCT_QUANTITY)
  stockQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PRODUCT_QUANTITY)
  reorderThreshold?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
