import { Transform } from 'class-transformer';
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
import { LeadStatus } from '@prisma/client';
import {
  MAX_LEAD_NOTE_LENGTH,
  MAX_LEAD_TEXT_LENGTH,
  MAX_PRODUCT_MONEY,
} from '@remindam/shared';
import { emptyToUndefined } from '../../common/transforms';

/**
 * Body for `POST /api/leads`. The owning business is resolved from the validated
 * `x-business-id` header (re-checked against the caller's membership), so this
 * payload carries no business id — the global ValidationPipe (whitelist +
 * forbidNonWhitelisted) rejects any such extra.
 *
 * A lead must name a customer (`customerId` is required); a lead has no name of
 * its own, and its interactions feed that customer's intelligence. `status`
 * defaults to NEW and `value` to 0 in the service. An optional `note` records a
 * first interaction in the same write.
 */
export class CreateLeadDto {
  @IsUUID()
  customerId!: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LEAD_TEXT_LENGTH)
  source?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LEAD_TEXT_LENGTH)
  interestedProduct?: string;

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
  nextFollowUpAt?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LEAD_NOTE_LENGTH)
  note?: string;
}
