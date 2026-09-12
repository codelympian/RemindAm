import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { LeadStatus } from '@prisma/client';
import { MAX_PAGE_SIZE } from '@remindam/shared';

/**
 * Query for `GET /api/leads`. `customerId` and `status` narrow the list (both
 * omitted shows everything); results are newest-first by `createdAt`. The global
 * ValidationPipe (`transform: true`) coerces `page`/`pageSize` via
 * `@Type(() => Number)` and rejects unknown params.
 */
export class ListLeadsQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

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
