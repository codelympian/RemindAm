import { Test } from '@nestjs/testing';
import {
  ImportStatus,
  type ImportListItem,
  type ImportPreview,
  type ImportSummary,
  type Paginated,
} from '@remindam/shared';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { type AuthenticatedRequest } from '../auth/authenticated-request';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { type CommitCustomersDto } from './dto/commit-customers.dto';

/** A minimal Multer file — the controller only forwards it to the service. */
const file = {
  originalname: 'customers.csv',
  buffer: Buffer.from('Name\nAda\n'),
} as Express.Multer.File;

const summary: ImportSummary = {
  id: 'imp-1',
  filename: 'customers.csv',
  status: ImportStatus.COMPLETED,
  totalRows: 1,
  validRows: 1,
  duplicateRows: 0,
  errorRows: 0,
  createdAt: '2026-09-17T10:00:00.000Z',
  rows: [
    {
      rowIndex: 0,
      status: 'imported',
      message: null,
      data: { name: 'Ada', phone: null, email: null, notes: null },
    },
  ],
};

describe('ImportsController', () => {
  const service = {
    previewCustomers: jest.fn(),
    commitCustomers: jest.fn(),
    list: jest.fn(),
    getOne: jest.fn(),
  };
  const request = { auth: { clerkUserId: 'user_123' } } as AuthenticatedRequest;
  const businessId = 'b-1';

  let controller: ImportsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [ImportsController],
      providers: [{ provide: ImportsService, useValue: service }],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(ImportsController);
  });

  it('delegates preview with the verified clerk id, active business id and file', async () => {
    const preview: ImportPreview = {
      columns: ['Name'],
      sampleRows: [['Ada']],
      totalRows: 1,
      suggestedMapping: { name: 0, phone: null, email: null, notes: null },
    };
    service.previewCustomers.mockResolvedValue(preview);

    const result = await controller.preview(request, businessId, file);

    expect(service.previewCustomers).toHaveBeenCalledWith('user_123', 'b-1', file);
    expect(result).toBe(preview);
  });

  it('delegates commit with the verified clerk id, active business id, file and mapping', async () => {
    const dto: CommitCustomersDto = { nameColumn: 0 };
    service.commitCustomers.mockResolvedValue(summary);

    const result = await controller.commit(request, businessId, file, dto);

    expect(service.commitCustomers).toHaveBeenCalledWith('user_123', 'b-1', file, dto);
    expect(result).toBe(summary);
  });

  it('delegates list with the verified clerk id, active business id and query', async () => {
    const page: Paginated<ImportListItem> = {
      data: [
        {
          id: 'imp-1',
          filename: 'customers.csv',
          status: ImportStatus.COMPLETED,
          totalRows: 1,
          validRows: 1,
          duplicateRows: 0,
          errorRows: 0,
          createdAt: '2026-09-17T10:00:00.000Z',
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };
    service.list.mockResolvedValue(page);

    const result = await controller.list(request, businessId, { page: 1 });

    expect(service.list).toHaveBeenCalledWith('user_123', 'b-1', { page: 1 });
    expect(result).toBe(page);
  });

  it('delegates get with the verified clerk id, active business id and path id', async () => {
    service.getOne.mockResolvedValue(summary);

    const result = await controller.get(request, businessId, 'imp-1');

    expect(service.getOne).toHaveBeenCalledWith('user_123', 'b-1', 'imp-1');
    expect(result).toBe(summary);
  });
});
