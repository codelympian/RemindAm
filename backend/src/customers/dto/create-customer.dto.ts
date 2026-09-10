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
 * Body for `POST /api/customers`. The owning business is resolved from the
 * validated `x-business-id` header (re-checked against the caller's membership),
 * so this payload carries no business/id — the global ValidationPipe (whitelist
 * + forbidNonWhitelisted) rejects any such extras.
 */
export class CreateCustomerDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
