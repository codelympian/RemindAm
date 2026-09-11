import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PaymentStatus } from '@prisma/client';
import { MAX_PRODUCT_MONEY } from '@remindam/shared';

/**
 * Body for `PATCH /api/sales/:id` — editing a sale is **header-only**. Customer,
 * discount, payment status, amount paid and date can change; line items cannot
 * (to change them you delete the sale and re-record it), which keeps the stored
 * totals unambiguous. Any attempt to send `items` is rejected by the global
 * ValidationPipe's `forbidNonWhitelisted`.
 *
 * `customerId` accepts an explicit `null` to detach the customer (turning the
 * sale into a walk-in); `@IsOptional()` lets both `null` and an omitted value
 * through, so only a present string is UUID-checked. Omitting a field leaves it
 * untouched — the service only assigns what was actually sent.
 */
export class UpdateSaleDto {
  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PRODUCT_MONEY)
  discount?: number;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PRODUCT_MONEY)
  amountPaid?: number;

  @IsOptional()
  @IsISO8601()
  soldAt?: string;
}
