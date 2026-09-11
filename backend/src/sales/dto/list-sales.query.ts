import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PaymentStatus } from '@prisma/client';
import { MAX_PAGE_SIZE } from '@remindam/shared';

/**
 * Query for `GET /api/sales`. `customerId` and `status` narrow the list (both
 * omitted shows everything); results are newest-first by `soldAt`. The global
 * ValidationPipe (`transform: true`) coerces `page`/`pageSize` via
 * `@Type(() => Number)` and rejects unknown params.
 */
export class ListSalesQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

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
