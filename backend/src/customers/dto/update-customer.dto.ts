import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { emptyToUndefined, trim } from '../../common/transforms';

/**
 * Body for `PATCH /api/customers/:id` — any subset of the mutable fields. A field
 * omitted (or sent blank) is left unchanged; sending `null` for an optional field
 * clears it. `name`, if present, must still be a non-empty string.
 */
export class UpdateCustomerDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string | null;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
