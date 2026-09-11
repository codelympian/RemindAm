import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_PRODUCT_MONEY, MAX_PRODUCT_QUANTITY } from '@remindam/shared';
import { trim } from '../../common/transforms';

/**
 * One line on a {@link CreateSaleDto}. `productId` optionally links to a
 * catalogue product, but `name` and `unitPrice` are always taken from this
 * payload and stored as a *snapshot* — so the sale keeps reading correctly even
 * if the product is later renamed, re-priced or deleted, and a line can be pure
 * free text with no product at all. The server re-checks that any `productId`
 * belongs to the active business before trusting it.
 *
 * Money and quantity bounds reuse the shared product ceilings (the columns are
 * the same `Decimal(14, 2)` / `integer` types), so an out-of-range value fails
 * as a 400 here rather than a 500 from Postgres.
 */
export class CreateSaleItemDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_PRODUCT_QUANTITY)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PRODUCT_MONEY)
  unitPrice!: number;
}
