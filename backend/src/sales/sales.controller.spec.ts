import { Test } from '@nestjs/testing';
import { PaymentStatus, type Paginated, type Sale } from '@remindam/shared';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { type AuthenticatedRequest } from '../auth/authenticated-request';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { type CreateSaleDto } from './dto/create-sale.dto';
import { type UpdateSaleDto } from './dto/update-sale.dto';

const sale: Sale = {
  id: 's-1',
  businessId: 'b-1',
  customerId: 'c-1',
  customerName: 'Chidi',
  items: [
    {
      id: 'si-1',
      productId: 'p-1',
      name: 'Ankara fabric',
      quantity: 2,
      unitPrice: 2000,
      lineTotal: 4000,
    },
  ],
  subtotal: 4000,
  discount: 0,
  total: 4000,
  paymentStatus: PaymentStatus.PAID,
  amountPaid: 4000,
  amountOwed: 0,
  soldAt: '2026-09-11T10:00:00.000Z',
  createdAt: '2026-09-11T10:00:00.000Z',
  updatedAt: '2026-09-11T10:00:00.000Z',
};

describe('SalesController', () => {
  const service = {
    list: jest.fn(),
    create: jest.fn(),
    getOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const request = { auth: { clerkUserId: 'user_123' } } as AuthenticatedRequest;
  const businessId = 'b-1';

  let controller: SalesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [SalesController],
      providers: [{ provide: SalesService, useValue: service }],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(SalesController);
  });

  it('delegates list with the verified clerk id, active business id and query', async () => {
    const page: Paginated<Sale> = {
      data: [sale],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };
    service.list.mockResolvedValue(page);

    const result = await controller.list(request, businessId, {
      status: PaymentStatus.PAID,
    });

    expect(service.list).toHaveBeenCalledWith('user_123', 'b-1', {
      status: PaymentStatus.PAID,
    });
    expect(result).toBe(page);
  });

  it('delegates create with the verified clerk id and active business id', async () => {
    const dto: CreateSaleDto = {
      items: [{ name: 'Ankara fabric', quantity: 2, unitPrice: 2000 }],
    };
    service.create.mockResolvedValue(sale);

    const result = await controller.create(request, businessId, dto);

    expect(service.create).toHaveBeenCalledWith('user_123', 'b-1', dto);
    expect(result).toBe(sale);
  });

  it('delegates get with the path id', async () => {
    service.getOne.mockResolvedValue(sale);

    const result = await controller.get(request, businessId, 's-1');

    expect(service.getOne).toHaveBeenCalledWith('user_123', 'b-1', 's-1');
    expect(result).toBe(sale);
  });

  it('delegates update with the path id and body', async () => {
    const dto: UpdateSaleDto = { discount: 500 };
    service.update.mockResolvedValue({ ...sale, discount: 500, total: 3500 });

    const result = await controller.update(request, businessId, 's-1', dto);

    expect(service.update).toHaveBeenCalledWith('user_123', 'b-1', 's-1', dto);
    expect(result.discount).toBe(500);
  });

  it('delegates remove with the path id', async () => {
    service.remove.mockResolvedValue(undefined);

    await controller.remove(request, businessId, 's-1');

    expect(service.remove).toHaveBeenCalledWith('user_123', 'b-1', 's-1');
  });
});
