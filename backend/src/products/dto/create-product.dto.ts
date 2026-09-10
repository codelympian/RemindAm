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
 * Body for `POST /api/products`. The owning business is resolved from the
 * validated `x-business-id` header (re-checked against the caller's membership),
 * so this payload carries no business/id — the global ValidationPipe (whitelist
 * + forbidNonWhitelisted) rejects any such extras.
 *
 * Money and quantity bounds come from the shared constants that mirror the
 * column types, so an out-of-range value fails as a 400 here rather than a 500
 * from Postgres — and the frontend form rejects exactly the same values.
 */
export class CreateProductDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sku?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

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
