import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { LeadStatus } from '@prisma/client';
import { MAX_LEAD_TEXT_LENGTH, MAX_PRODUCT_MONEY } from '@remindam/shared';
import { emptyToUndefined } from '../../common/transforms';

/**
 * Body for `PATCH /api/leads/:id` — any subset of the mutable fields. Omitting a
 * field leaves it untouched; the service only assigns what was actually sent.
 *
 * A lead always names a customer, so `customerId` can be *reassigned* but never
 * cleared: it is typed `string` (not `string | null`) and `@IsOptional()` lets
 * an omitted value through, so only a present string is UUID-checked. By
 * contrast `source`, `interestedProduct` and `nextFollowUpAt` accept an explicit
 * `null` to clear them — `@IsOptional()` passes both `null` and an omitted value,
 * and `emptyToUndefined` turns a blank string into "not provided" while letting
 * `null` through unchanged.
 */
export class UpdateLeadDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LEAD_TEXT_LENGTH)
  source?: string | null;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LEAD_TEXT_LENGTH)
  interestedProduct?: string | null;

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PRODUCT_MONEY)
  value?: number;

  @IsOptional()
  @IsISO8601()
  nextFollowUpAt?: string | null;
}
