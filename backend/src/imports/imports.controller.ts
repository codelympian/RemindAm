import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  MAX_IMPORT_FILE_BYTES,
  type ImportListItem,
  type ImportPreview,
  type ImportSummary,
  type Paginated,
} from '@remindam/shared';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { type AuthenticatedRequest } from '../auth/authenticated-request';
import { ActiveBusinessId } from '../common/active-business-id.decorator';
import { ImportsService } from './imports.service';
import { CommitCustomersDto } from './dto/commit-customers.dto';
import { ListImportsQueryDto } from './dto/list-imports.query';

/**
 * Multer config shared by both upload handlers: keep the file in memory (the
 * parser reads `file.buffer`), cap its size, and accept only `.csv`/`.xlsx` so a
 * wrong file type is a clear 400 rather than an opaque parse failure later.
 */
const UPLOAD = FileInterceptor('file', {
  limits: { fileSize: MAX_IMPORT_FILE_BYTES },
  fileFilter: (_req, file, callback) => {
    const name = file.originalname.toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.xlsx')) {
      callback(null, true);
    } else {
      callback(new BadRequestException('Upload a .csv or .xlsx file.'), false);
    }
  },
});

/**
 * `/api/imports` — the guided customer import (§24), scoped to the active
 * business. The guard verifies the session and sets `request.auth.clerkUserId`;
 * `@ActiveBusinessId()` supplies the business id from the `x-business-id` header,
 * which the service re-validates against the caller's membership (§11/§46).
 */
@Controller('imports')
@UseGuards(ClerkAuthGuard)
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  /** Upload a file and get back the parsed columns, a sample and a suggested mapping. Persists nothing. */
  @Post('preview')
  @UseInterceptors(UPLOAD)
  preview(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportPreview> {
    return this.imports.previewCustomers(
      request.auth.clerkUserId,
      businessId,
      file,
    );
  }

  /** Commit the import with the confirmed mapping; returns the honest per-row summary. */
  @Post()
  @UseInterceptors(UPLOAD)
  commit(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CommitCustomersDto,
  ): Promise<ImportSummary> {
    return this.imports.commitCustomers(
      request.auth.clerkUserId,
      businessId,
      file,
      dto,
    );
  }

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Query() query: ListImportsQueryDto,
  ): Promise<Paginated<ImportListItem>> {
    return this.imports.list(request.auth.clerkUserId, businessId, query);
  }

  @Get(':id')
  get(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ImportSummary> {
    return this.imports.getOne(request.auth.clerkUserId, businessId, id);
  }
}
