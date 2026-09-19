import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ImportStatus,
  Prisma,
  type Import as ImportRecord,
  type ImportRow as ImportRowRecord,
} from '@prisma/client';
import { isEmail } from 'class-validator';
import {
  DEFAULT_PAGE_SIZE,
  IMPORT_PREVIEW_ROWS,
  MAX_IMPORT_ROWS,
  MAX_PAGE_SIZE,
  ImportStatus as ApiImportStatus,
  type CustomerColumnMapping,
  type ImportableCustomerField,
  type ImportListItem,
  type ImportListParams,
  type ImportPreview,
  type ImportRowResult,
  type ImportRowStatus,
  type ImportSummary,
  type Paginated,
} from '@remindam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import {
  parseTabularFile,
  suggestCustomerMapping,
} from './customer-import.parser';
import { CommitCustomersDto } from './dto/commit-customers.dto';

/** The four customer fields an import maps onto, in the order the DTO folds them. */
const CUSTOMER_FIELDS: ImportableCustomerField[] = [
  'name',
  'phone',
  'email',
  'notes',
];

/** The customer field length caps, mirrored from create-customer.dto.ts. */
const MAX_NAME = 120;
const MAX_PHONE = 40;
const MAX_EMAIL = 160;
const MAX_NOTES = 2000;

/** The mapped, trimmed values of one input row (empty cells become null). */
type MappedRow = ImportRowResult['data'];

/**
 * A row's phone reduced to digits only, so `+234 801 234 5678` and
 * `08012345678`-style variants at least compare on their significant digits.
 * Returns null when there is nothing to compare.
 */
function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

/** A row's email lowercased and trimmed for a case-insensitive dedupe. */
function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Customer import, scoped to a single business (tenant) exactly like every other
 * resource. Every method takes the *verified* Clerk id (from the guard) plus the
 * business id (from the validated `x-business-id` header) and first re-checks the
 * caller's membership; a business id they aren't a member of is treated as not
 * found (§11/§46). All file parsing, validation, dedupe and persistence happen
 * here on the server — the frontend only ever uploads the raw bytes (§5/§46).
 *
 * The flow is honest by construction (§24): the preview persists nothing, and a
 * commit records exactly what happened — one {@link ImportRecord} plus one
 * {@link ImportRowRecord} per input row (imported / duplicate / error, each with
 * a reason), all in one transaction so an import is either wholly recorded or
 * visibly failed. Nothing is silently discarded.
 */
@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /**
   * Parse an uploaded file and return its headers, a small sample and a suggested
   * mapping, so the user can confirm the columns before anything is written.
   * **Persists nothing.**
   */
  async previewCustomers(
    clerkUserId: string,
    businessId: string,
    file: Express.Multer.File | undefined,
  ): Promise<ImportPreview> {
    await this.resolveMembership(clerkUserId, businessId);
    if (!file) {
      throw new BadRequestException('A file is required.');
    }
    const { columns, rows } = await this.parse(file);

    return {
      columns,
      sampleRows: rows.slice(0, IMPORT_PREVIEW_ROWS),
      totalRows: rows.length,
      suggestedMapping: suggestCustomerMapping(columns),
    };
  }

  /**
   * Parse the file, classify every row against the confirmed mapping (valid /
   * duplicate / error), then in one transaction create the import record, insert
   * the valid customers, and write one audit row per input line. Returns the full
   * per-row summary.
   */
  async commitCustomers(
    clerkUserId: string,
    businessId: string,
    file: Express.Multer.File | undefined,
    dto: CommitCustomersDto,
  ): Promise<ImportSummary> {
    await this.resolveMembership(clerkUserId, businessId);
    if (!file) {
      throw new BadRequestException('A file is required.');
    }
    const { columns, rows } = await this.parse(file);

    const mapping: CustomerColumnMapping = {
      name: dto.nameColumn,
      phone: dto.phoneColumn ?? null,
      email: dto.emailColumn ?? null,
      notes: dto.notesColumn ?? null,
    };
    this.assertMappingInRange(mapping, columns.length);

    // Load the existing dedupe keys once, so each row is O(1) to check.
    const existing = await this.prisma.customer.findMany({
      where: { businessId },
      select: { phone: true, email: true },
    });
    const existingPhones = new Set<string>();
    const existingEmails = new Set<string>();
    for (const customer of existing) {
      const phone = normalizePhone(customer.phone);
      if (phone) existingPhones.add(phone);
      const email = normalizeEmail(customer.email);
      if (email) existingEmails.add(email);
    }

    // Keys seen earlier in *this* file, to catch in-file duplicates.
    const seenPhones = new Set<string>();
    const seenEmails = new Set<string>();

    const results: ImportRowResult[] = [];
    const toInsert: Prisma.CustomerCreateManyInput[] = [];

    rows.forEach((row, rowIndex) => {
      const data = this.mapRow(row, mapping);
      const result = this.classifyRow(rowIndex, data, {
        existingPhones,
        existingEmails,
        seenPhones,
        seenEmails,
      });
      results.push(result);

      if (result.status === 'imported' && data.name !== null) {
        toInsert.push({
          businessId,
          name: data.name,
          phone: data.phone,
          email: data.email,
          notes: data.notes,
        });
      }
    });

    const validRows = toInsert.length;
    const duplicateRows = results.filter((r) => r.status === 'duplicate').length;
    const errorRows = results.filter((r) => r.status === 'error').length;

    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.import.create({
        data: {
          businessId,
          filename: file.originalname,
          status: ImportStatus.COMPLETED,
          totalRows: rows.length,
          validRows,
          duplicateRows,
          errorRows,
        },
      });

      if (toInsert.length > 0) {
        await tx.customer.createMany({ data: toInsert });
      }

      await tx.importRow.createMany({
        data: results.map((result) => ({
          importId: created.id,
          rowIndex: result.rowIndex,
          raw: this.toRawJson(result),
          valid: result.status === 'imported',
          error: result.message,
        })),
      });

      return created;
    });

    this.logger.log(
      `Imported ${validRows} customer(s) into business ${businessId} ` +
        `from ${file.originalname} (${duplicateRows} duplicate, ${errorRows} error)`,
    );

    return { ...this.toListItem(record), rows: results };
  }

  /** A page of the business's past imports, newest first. */
  async list(
    clerkUserId: string,
    businessId: string,
    params: ImportListParams,
  ): Promise<Paginated<ImportListItem>> {
    await this.resolveMembership(clerkUserId, businessId);

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE),
    );

    const where: Prisma.ImportWhereInput = { businessId };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.import.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.import.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toListItem(row)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  /** One import with its full per-row detail, but only if it belongs to the business. */
  async getOne(
    clerkUserId: string,
    businessId: string,
    id: string,
  ): Promise<ImportSummary> {
    await this.resolveMembership(clerkUserId, businessId);

    const record = await this.prisma.import.findFirst({
      where: { id, businessId },
      include: { rows: { orderBy: { rowIndex: 'asc' } } },
    });
    if (!record) {
      throw new NotFoundException('Import not found');
    }

    return {
      ...this.toListItem(record),
      rows: record.rows.map((row) => this.fromRawJson(row)),
    };
  }

  /**
   * Resolve the local user for the verified Clerk id and assert they are a member
   * of the business — the same non-leaking 404 as reading a business the caller
   * doesn't belong to.
   */
  private async resolveMembership(
    clerkUserId: string,
    businessId: string,
  ): Promise<string> {
    const user = await this.users.getOrCreateFromClerk(clerkUserId);
    const membership = await this.prisma.businessMembership.findUnique({
      where: { userId_businessId: { userId: user.id, businessId } },
    });
    if (!membership) {
      throw new NotFoundException('Business not found');
    }
    return user.id;
  }

  /** Parse the uploaded file and enforce the row ceiling (a 400, never a silent trim). */
  private async parse(
    file: Express.Multer.File,
  ): Promise<{ columns: string[]; rows: string[][] }> {
    const { columns, rows } = await parseTabularFile(
      file.originalname,
      file.buffer,
    );
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `This file has ${rows.length} rows, more than the ${MAX_IMPORT_ROWS} allowed in one import.`,
      );
    }
    return { columns, rows };
  }

  /** Every mapped column must actually exist in the parsed file. */
  private assertMappingInRange(
    mapping: CustomerColumnMapping,
    columnCount: number,
  ): void {
    for (const field of CUSTOMER_FIELDS) {
      const column = mapping[field];
      if (column !== null && (column < 0 || column >= columnCount)) {
        throw new BadRequestException(
          `The column chosen for ${field} is not in the uploaded file.`,
        );
      }
    }
  }

  /** Read one row's cells through the mapping, trimming and nulling blanks. */
  private mapRow(row: string[], mapping: CustomerColumnMapping): MappedRow {
    const read = (column: number | null): string | null => {
      if (column === null) return null;
      const value = (row[column] ?? '').trim();
      return value.length > 0 ? value : null;
    };
    return {
      name: read(mapping.name),
      phone: read(mapping.phone),
      email: read(mapping.email),
      notes: read(mapping.notes),
    };
  }

  /**
   * Decide a row's fate: an invalid row is an `error` (with the first failing
   * rule), a row whose phone or email matches an existing customer or an earlier
   * row is a `duplicate`, otherwise it is `imported` and its keys are remembered.
   */
  private classifyRow(
    rowIndex: number,
    data: MappedRow,
    sets: {
      existingPhones: Set<string>;
      existingEmails: Set<string>;
      seenPhones: Set<string>;
      seenEmails: Set<string>;
    },
  ): ImportRowResult {
    const error = this.validateRow(data);
    if (error) {
      return { rowIndex, status: 'error', message: error, data };
    }

    const phone = normalizePhone(data.phone);
    const email = normalizeEmail(data.email);

    if (
      (phone && sets.existingPhones.has(phone)) ||
      (email && sets.existingEmails.has(email))
    ) {
      return {
        rowIndex,
        status: 'duplicate',
        message: 'Matches an existing customer (same phone or email).',
        data,
      };
    }

    if (
      (phone && sets.seenPhones.has(phone)) ||
      (email && sets.seenEmails.has(email))
    ) {
      return {
        rowIndex,
        status: 'duplicate',
        message: 'Duplicate of an earlier row in this file.',
        data,
      };
    }

    if (phone) sets.seenPhones.add(phone);
    if (email) sets.seenEmails.add(email);
    return { rowIndex, status: 'imported', message: null, data };
  }

  /** Validate a mapped row against the customer field rules; first failure wins. */
  private validateRow(data: MappedRow): string | null {
    if (!data.name) return 'Name is required.';
    if (data.name.length > MAX_NAME) {
      return `Name is too long (max ${MAX_NAME} characters).`;
    }
    if (data.phone && data.phone.length > MAX_PHONE) {
      return `Phone is too long (max ${MAX_PHONE} characters).`;
    }
    if (data.email) {
      if (!isEmail(data.email)) {
        return 'Email is not a valid email address.';
      }
      if (data.email.length > MAX_EMAIL) {
        return `Email is too long (max ${MAX_EMAIL} characters).`;
      }
    }
    if (data.notes && data.notes.length > MAX_NOTES) {
      return `Notes are too long (max ${MAX_NOTES} characters).`;
    }
    return null;
  }

  /** Serialize a row result for the `ImportRow.raw` audit column. */
  private toRawJson(result: ImportRowResult): Prisma.InputJsonObject {
    return {
      status: result.status,
      message: result.message,
      data: {
        name: result.data.name,
        phone: result.data.phone,
        email: result.data.email,
        notes: result.data.notes,
      },
    };
  }

  /** Rebuild a row result from its stored `raw` JSON (defensive about its shape). */
  private fromRawJson(row: ImportRowRecord): ImportRowResult {
    const raw = this.asJsonObject(row.raw);
    const data = this.asJsonObject(raw.data);
    return {
      rowIndex: row.rowIndex,
      status: this.parseRowStatus(raw.status, row.valid),
      message: this.asString(raw.message) ?? row.error ?? null,
      data: {
        name: this.asString(data.name),
        phone: this.asString(data.phone),
        email: this.asString(data.email),
        notes: this.asString(data.notes),
      },
    };
  }

  /** A JSON value read back as an object, or an empty object when it isn't one. */
  private asJsonObject(value: Prisma.JsonValue | undefined): Prisma.JsonObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }

  private asString(value: Prisma.JsonValue | undefined): string | null {
    return typeof value === 'string' ? value : null;
  }

  private parseRowStatus(
    value: Prisma.JsonValue | undefined,
    valid: boolean,
  ): ImportRowStatus {
    if (value === 'imported' || value === 'duplicate' || value === 'error') {
      return value;
    }
    return valid ? 'imported' : 'error';
  }

  /** Map an import record (no rows) to its list-item DTO. */
  private toListItem(record: ImportRecord): ImportListItem {
    return {
      id: record.id,
      filename: record.filename,
      // Prisma and the shared enum share identical string values.
      status: ApiImportStatus[record.status],
      totalRows: record.totalRows,
      validRows: record.validRows,
      duplicateRows: record.duplicateRows,
      errorRows: record.errorRows,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
