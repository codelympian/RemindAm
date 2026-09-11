import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentStatus } from '@prisma/client';
import { MAX_PRODUCT_MONEY, MAX_SALE_ITEMS } from '@remindam/shared';
import { CreateSaleItemDto } from './create-sale-item.dto';

/**
 * Body for `POST /api/sales`. The owning business is resolved from the validated
 * `x-business-id` header (re-checked against the caller's membership), so this
 * payload carries no business id — the global ValidationPipe (whitelist +
 * forbidNonWhitelisted) rejects any such extra.
 *
 * The server owns every total (subtotal, discount, grand total) — none are
 * accepted from the client. `paymentStatus` defaults to PAID; `amountPaid`
 * matters only for a PARTIAL sale (the service enforces `0 < amountPaid <
 * total`). An UNPAID or PARTIAL sale must carry a `customerId`, because the debt
 * it creates must belong to someone.
 */
export class CreateSaleDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SALE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];

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
