import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MAX_LEAD_NOTE_LENGTH } from '@remindam/shared';
import { trim } from '../../common/transforms';

/**
 * Body for `POST /api/leads/:id/interactions` — logs one immutable note against a
 * lead (a call, a WhatsApp message, a meeting outcome). `trim` strips surrounding
 * whitespace so a whitespace-only note is rejected by `@IsNotEmpty()`.
 */
export class CreateLeadInteractionDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LEAD_NOTE_LENGTH)
  note!: string;
}
