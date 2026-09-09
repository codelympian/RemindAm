import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CUSTOMER_TRACKING_METHODS } from '@remindam/shared';

/** Trims incoming strings so whitespace-only values are rejected by IsNotEmpty. */
const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Body for `POST /api/businesses`. The owner is resolved server-side from the
 * verified Clerk session, so this payload carries no user/business id and the
 * global ValidationPipe (whitelist + forbidNonWhitelisted) rejects any extras
 * such as a client-supplied `currency`, `timezone`, or `id`.
 */
export class CreateBusinessDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  industry?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsIn([...CUSTOMER_TRACKING_METHODS])
  customerTrackingMethod?: string;
}
