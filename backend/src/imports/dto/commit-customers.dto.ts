import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Body for `POST /api/imports` — the confirmed column mapping, sent as multipart
 * text fields alongside the uploaded file. Each value is a 0-based source column
 * index; `nameColumn` is required (a customer must have a name), the rest are
 * optional and omitted when the user chooses not to import that field. The global
 * ValidationPipe (`transform: true`) coerces the multipart strings to numbers via
 * `@Type(() => Number)` and rejects any unknown field (`forbidNonWhitelisted`).
 */
export class CommitCustomersDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  nameColumn!: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  phoneColumn?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  emailColumn?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  notesColumn?: number;
}
