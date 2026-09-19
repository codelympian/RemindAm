import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ImportStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { MAX_IMPORT_ROWS } from '@remindam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ImportsService } from './imports.service';

const now = new Date('2026-09-17T10:00:00.000Z');

/** A minimal Multer file — the service only reads `originalname` and `buffer`. */
function file(name: string, content: string): Express.Multer.File {
  return { originalname: name, buffer: Buffer.from(content) } as Express.Multer.File;
}

const importRecord = {
  id: 'imp-1',
  businessId: 'b-1',
  filename: 'customers.csv',
  status: ImportStatus.COMPLETED,
  totalRows: 6,
  validRows: 2,
  duplicateRows: 2,
  errorRows: 2,
  createdAt: now,
};

describe('ImportsService', () => {
  const prisma = {
    $transaction: jest.fn(),
    businessMembership: { findUnique: jest.fn() },
    customer: { findMany: jest.fn(), createMany: jest.fn() },
    import: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    importRow: { createMany: jest.fn() },
  };
  const users = { getOrCreateFromClerk: jest.fn() };

  let service: ImportsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    users.getOrCreateFromClerk.mockResolvedValue({ id: 'user-1' });
    prisma.businessMembership.findUnique.mockResolvedValue({ id: 'm-1' });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ImportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: users },
      ],
    }).compile();

    service = moduleRef.get(ImportsService);
  });

  describe('previewCustomers', () => {
    it('rejects a caller with no membership before parsing anything', async () => {
      prisma.businessMembership.findUnique.mockResolvedValue(null);

      await expect(
        service.previewCustomers('clerk_1', 'b-x', file('c.csv', 'Name\nAda\n')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns columns, a sample, the total and a suggested mapping', async () => {
      const preview = await service.previewCustomers(
        'clerk_1',
        'b-1',
        file(
          'customers.csv',
          'Name,Phone,Email\nAda,0801,ada@e.com\nBola,0802,bola@e.com\n',
        ),
      );

      expect(users.getOrCreateFromClerk).toHaveBeenCalledWith('clerk_1');
      expect(preview.columns).toEqual(['Name', 'Phone', 'Email']);
      expect(preview.totalRows).toBe(2);
      expect(preview.sampleRows).toHaveLength(2);
      expect(preview.suggestedMapping).toEqual({
        name: 0,
        phone: 1,
        email: 2,
        notes: null,
      });
    });

    it('rejects a request with no file', async () => {
      await expect(
        service.previewCustomers('clerk_1', 'b-1', undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a file with more than the allowed number of rows', async () => {
      const body = Array.from(
        { length: MAX_IMPORT_ROWS + 1 },
        (_unused, i) => `Customer ${i}`,
      ).join('\n');
      await expect(
        service.previewCustomers('clerk_1', 'b-1', file('big.csv', `Name\n${body}\n`)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('commitCustomers', () => {
    const mixedCsv =
      'Name,Phone,Email\n' +
      'Ada,08011112222,ada@example.com\n' + // imported
      'Bola,,bola@example.com\n' + // imported (email only)
      'Dupe,09099999999,\n' + // duplicate — existing phone
      ',08055556666,noname@example.com\n' + // error — blank name
      'Chidi,08011112222,chidi@example.com\n' + // duplicate — in-file phone
      'Emeka,,not-an-email\n'; // error — invalid email

    /** Wire `$transaction(cb)` to run the callback against a tx double. */
    function wireTransaction() {
      const tx = {
        import: { create: jest.fn().mockResolvedValue(importRecord) },
        customer: { createMany: jest.fn() },
        importRow: { createMany: jest.fn() },
      };
      prisma.$transaction.mockImplementation((cb) => cb(tx));
      return tx;
    }

    it('classifies imported / duplicate / error rows and counts them', async () => {
      prisma.customer.findMany.mockResolvedValue([
        { phone: '09099999999', email: 'existing@e.com' },
      ]);
      wireTransaction();

      const summary = await service.commitCustomers('clerk_1', 'b-1', file('customers.csv', mixedCsv), {
        nameColumn: 0,
        phoneColumn: 1,
        emailColumn: 2,
      });

      expect(summary.totalRows).toBe(6);
      expect(summary.validRows).toBe(2);
      expect(summary.duplicateRows).toBe(2);
      expect(summary.errorRows).toBe(2);

      expect(summary.rows.map((r) => r.status)).toEqual([
        'imported',
        'imported',
        'duplicate',
        'error',
        'duplicate',
        'error',
      ]);
      expect(summary.rows[2].message).toBe(
        'Matches an existing customer (same phone or email).',
      );
      expect(summary.rows[3].message).toBe('Name is required.');
      expect(summary.rows[4].message).toBe(
        'Duplicate of an earlier row in this file.',
      );
      expect(summary.rows[5].message).toBe(
        'Email is not a valid email address.',
      );
    });

    it('inserts only the valid rows, null-normalised and business-scoped', async () => {
      prisma.customer.findMany.mockResolvedValue([
        { phone: '09099999999', email: 'existing@e.com' },
      ]);
      const tx = wireTransaction();

      await service.commitCustomers('clerk_1', 'b-1', file('customers.csv', mixedCsv), {
        nameColumn: 0,
        phoneColumn: 1,
        emailColumn: 2,
      });

      expect(tx.customer.createMany).toHaveBeenCalledWith({
        data: [
          {
            businessId: 'b-1',
            name: 'Ada',
            phone: '08011112222',
            email: 'ada@example.com',
            notes: null,
          },
          {
            businessId: 'b-1',
            name: 'Bola',
            phone: null,
            email: 'bola@example.com',
            notes: null,
          },
        ],
      });
    });

    it('records the import and one audit row per input line', async () => {
      prisma.customer.findMany.mockResolvedValue([
        { phone: '09099999999', email: 'existing@e.com' },
      ]);
      const tx = wireTransaction();

      await service.commitCustomers('clerk_1', 'b-1', file('customers.csv', mixedCsv), {
        nameColumn: 0,
        phoneColumn: 1,
        emailColumn: 2,
      });

      expect(tx.import.create).toHaveBeenCalledWith({
        data: {
          businessId: 'b-1',
          filename: 'customers.csv',
          status: ImportStatus.COMPLETED,
          totalRows: 6,
          validRows: 2,
          duplicateRows: 2,
          errorRows: 2,
        },
      });

      const rowArg = tx.importRow.createMany.mock.calls[0][0].data;
      expect(rowArg).toHaveLength(6);
      expect(rowArg[0]).toEqual({
        importId: 'imp-1',
        rowIndex: 0,
        raw: {
          status: 'imported',
          message: null,
          data: {
            name: 'Ada',
            phone: '08011112222',
            email: 'ada@example.com',
            notes: null,
          },
        },
        valid: true,
        error: null,
      });
      expect(rowArg[3]).toMatchObject({
        rowIndex: 3,
        valid: false,
        error: 'Name is required.',
      });
    });

    it('imports rows that have neither phone nor email (never deduped away)', async () => {
      prisma.customer.findMany.mockResolvedValue([]);
      const tx = wireTransaction();

      const summary = await service.commitCustomers(
        'clerk_1',
        'b-1',
        file('customers.csv', 'Name\nAda\nAda\n'),
        { nameColumn: 0 },
      );

      expect(summary.validRows).toBe(2);
      expect(tx.customer.createMany).toHaveBeenCalledWith({
        data: [
          { businessId: 'b-1', name: 'Ada', phone: null, email: null, notes: null },
          { businessId: 'b-1', name: 'Ada', phone: null, email: null, notes: null },
        ],
      });
    });

    it('rejects a mapping that points outside the file, before touching the database', async () => {
      await expect(
        service.commitCustomers('clerk_1', 'b-1', file('c.csv', 'Name,Phone\nAda,0801\n'), {
          nameColumn: 5,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.customer.findMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a non-member before parsing', async () => {
      prisma.businessMembership.findUnique.mockResolvedValue(null);
      await expect(
        service.commitCustomers('clerk_1', 'b-x', file('c.csv', 'Name\nAda\n'), {
          nameColumn: 0,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('rejects a non-member', async () => {
      prisma.businessMembership.findUnique.mockResolvedValue(null);
      await expect(service.list('clerk_1', 'b-x', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns a business-scoped page of imports, newest first', async () => {
      prisma.$transaction.mockResolvedValue([[importRecord], 1]);

      const result = await service.list('clerk_1', 'b-1', { page: 1, pageSize: 20 });

      expect(prisma.import.findMany).toHaveBeenCalledWith({
        where: { businessId: 'b-1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
      expect(result.data[0]).toEqual({
        id: 'imp-1',
        filename: 'customers.csv',
        status: 'COMPLETED',
        totalRows: 6,
        validRows: 2,
        duplicateRows: 2,
        errorRows: 2,
        createdAt: now.toISOString(),
      });
    });
  });

  describe('getOne', () => {
    it('throws NotFound for an import id outside the active business', async () => {
      prisma.import.findFirst.mockResolvedValue(null);

      await expect(
        service.getOne('clerk_1', 'b-1', 'imp-x'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rebuilds the per-row detail from the stored raw JSON', async () => {
      prisma.import.findFirst.mockResolvedValue({
        ...importRecord,
        rows: [
          {
            rowIndex: 0,
            raw: {
              status: 'imported',
              message: null,
              data: { name: 'Ada', phone: '0801', email: null, notes: null },
            },
            valid: true,
            error: null,
          },
          {
            rowIndex: 1,
            raw: {
              status: 'error',
              message: 'Name is required.',
              data: { name: null, phone: null, email: null, notes: null },
            },
            valid: false,
            error: 'Name is required.',
          },
        ],
      });

      const summary = await service.getOne('clerk_1', 'b-1', 'imp-1');

      expect(prisma.import.findFirst).toHaveBeenCalledWith({
        where: { id: 'imp-1', businessId: 'b-1' },
        include: { rows: { orderBy: { rowIndex: 'asc' } } },
      });
      expect(summary.id).toBe('imp-1');
      expect(summary.status).toBe('COMPLETED');
      expect(summary.rows).toEqual([
        {
          rowIndex: 0,
          status: 'imported',
          message: null,
          data: { name: 'Ada', phone: '0801', email: null, notes: null },
        },
        {
          rowIndex: 1,
          status: 'error',
          message: 'Name is required.',
          data: { name: null, phone: null, email: null, notes: null },
        },
      ]);
    });
  });
});
