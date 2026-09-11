import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SalesService } from './sales.service';

const now = new Date('2026-09-11T10:00:00.000Z');

/** A PAID sale of 2×2000 + 1×500 = 4500, one product line and one free-text line. */
function saleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 's-1',
    businessId: 'b-1',
    customerId: 'c-1',
    total: new Prisma.Decimal('4500.00'),
    discount: new Prisma.Decimal('0.00'),
    paymentStatus: PaymentStatus.PAID,
    soldAt: now,
    createdAt: now,
    updatedAt: now,
    items: [
      {
        id: 'si-1',
        saleId: 's-1',
        productId: 'p-1',
        name: 'Ankara fabric',
        quantity: 2,
        unitPrice: new Prisma.Decimal('2000.00'),
      },
      {
        id: 'si-2',
        saleId: 's-1',
        productId: null,
        name: 'Delivery',
        quantity: 1,
        unitPrice: new Prisma.Decimal('500.00'),
      },
    ],
    customer: { name: 'Chidi' },
    debt: null,
    ...overrides,
  };
}

describe('SalesService', () => {
  const prisma = {
    $transaction: jest.fn(),
    businessMembership: { findUnique: jest.fn() },
    customer: { findFirst: jest.fn() },
    product: { findMany: jest.fn() },
    sale: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    debt: { upsert: jest.fn(), delete: jest.fn() },
  };
  const users = { getOrCreateFromClerk: jest.fn() };

  let service: SalesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    users.getOrCreateFromClerk.mockResolvedValue({ id: 'user-1' });
    prisma.businessMembership.findUnique.mockResolvedValue({ id: 'm-1' });
    // Handle both the array form (list/remove) and the interactive callback
    // form (update); the callback gets the same mock as its transaction client.
    prisma.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: typeof prisma) => unknown)(prisma)
        : Promise.all(arg as unknown[]),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: users },
      ],
    }).compile();

    service = moduleRef.get(SalesService);
  });

  it('rejects a caller with no membership in the business as NotFound', async () => {
    prisma.businessMembership.findUnique.mockResolvedValue(null);

    await expect(service.list('clerk_1', 'b-x', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.sale.findMany).not.toHaveBeenCalled();
  });

  it('lists sales scoped to the business, newest first, paginated', async () => {
    prisma.sale.findMany.mockResolvedValue([saleRow()]);
    prisma.sale.count.mockResolvedValue(1);

    const result = await service.list('clerk_1', 'b-1', { page: 1, pageSize: 20 });

    expect(prisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: 'b-1' },
        orderBy: { soldAt: 'desc' },
        skip: 0,
        take: 20,
      }),
    );
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('narrows the list by customer and by payment status when asked', async () => {
    prisma.sale.findMany.mockResolvedValue([]);
    prisma.sale.count.mockResolvedValue(0);

    await service.list('clerk_1', 'b-1', {
      customerId: 'c-1',
      status: PaymentStatus.UNPAID,
    });

    expect(prisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: 'b-1',
          customerId: 'c-1',
          paymentStatus: PaymentStatus.UNPAID,
        },
      }),
    );
  });

  it('serializes money as numbers and computes subtotal, line totals and paid/owed', async () => {
    prisma.sale.findMany.mockResolvedValue([saleRow()]);
    prisma.sale.count.mockResolvedValue(1);

    const { data } = await service.list('clerk_1', 'b-1', {});

    expect(data[0]).toMatchObject({
      id: 's-1',
      customerName: 'Chidi',
      subtotal: 4500,
      total: 4500,
      discount: 0,
      paymentStatus: PaymentStatus.PAID,
      amountPaid: 4500,
      amountOwed: 0,
    });
    expect(data[0].items).toEqual([
      {
        id: 'si-1',
        productId: 'p-1',
        name: 'Ankara fabric',
        quantity: 2,
        unitPrice: 2000,
        lineTotal: 4000,
      },
      {
        id: 'si-2',
        productId: null,
        name: 'Delivery',
        quantity: 1,
        unitPrice: 500,
        lineTotal: 500,
      },
    ]);
  });

  it('derives the owed balance of a partial sale from its debt', async () => {
    prisma.sale.findMany.mockResolvedValue([
      saleRow({
        paymentStatus: PaymentStatus.PARTIAL,
        debt: { paidAmount: new Prisma.Decimal('1500.00') },
      }),
    ]);
    prisma.sale.count.mockResolvedValue(1);

    const { data } = await service.list('clerk_1', 'b-1', {});

    expect(data[0]).toMatchObject({
      total: 4500,
      amountPaid: 1500,
      amountOwed: 3000,
    });
  });

  it('records a PAID sale with snapshot line items and no debt', async () => {
    prisma.product.findMany.mockResolvedValue([{ id: 'p-1' }]);
    prisma.sale.create.mockResolvedValue(saleRow());

    await service.create('clerk_1', 'b-1', {
      items: [
        { productId: 'p-1', name: 'Ankara fabric', quantity: 2, unitPrice: 2000 },
      ],
    });

    const arg = prisma.sale.create.mock.calls[0][0];
    expect(arg.data.businessId).toBe('b-1');
    expect(arg.data.customerId).toBeNull();
    expect(arg.data.paymentStatus).toBe(PaymentStatus.PAID);
    expect(arg.data.total.toNumber()).toBe(4000);
    expect(arg.data.items.create).toEqual([
      { productId: 'p-1', name: 'Ankara fabric', quantity: 2, unitPrice: 2000 },
    ]);
    expect(arg.data.debt).toBeUndefined();
  });

  it('applies a discount to the total and floors it at zero', async () => {
    prisma.sale.create.mockResolvedValue(saleRow());

    await service.create('clerk_1', 'b-1', {
      items: [{ name: 'Item', quantity: 1, unitPrice: 1000 }],
      discount: 5000,
    });

    expect(prisma.sale.create.mock.calls[0][0].data.total.toNumber()).toBe(0);
  });

  it('creates a debt for an UNPAID sale that owes the full total', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'c-1' });
    prisma.sale.create.mockResolvedValue(
      saleRow({ paymentStatus: PaymentStatus.UNPAID }),
    );

    await service.create('clerk_1', 'b-1', {
      customerId: 'c-1',
      items: [{ name: 'Item', quantity: 1, unitPrice: 3000 }],
      paymentStatus: PaymentStatus.UNPAID,
    });

    const debt = prisma.sale.create.mock.calls[0][0].data.debt.create;
    expect(debt.customerId).toBe('c-1');
    expect(debt.amount.toNumber()).toBe(3000);
    expect(debt.paidAmount.toNumber()).toBe(0);
  });

  it('creates a debt for a PARTIAL sale recording what was paid', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'c-1' });
    prisma.sale.create.mockResolvedValue(
      saleRow({ paymentStatus: PaymentStatus.PARTIAL }),
    );

    await service.create('clerk_1', 'b-1', {
      customerId: 'c-1',
      items: [{ name: 'Item', quantity: 1, unitPrice: 3000 }],
      paymentStatus: PaymentStatus.PARTIAL,
      amountPaid: 1000,
    });

    const debt = prisma.sale.create.mock.calls[0][0].data.debt.create;
    expect(debt.amount.toNumber()).toBe(3000);
    expect(debt.paidAmount.toNumber()).toBe(1000);
  });

  it('refuses an UNPAID sale with no customer (a debt must belong to someone)', async () => {
    await expect(
      service.create('clerk_1', 'b-1', {
        items: [{ name: 'Item', quantity: 1, unitPrice: 3000 }],
        paymentStatus: PaymentStatus.UNPAID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.sale.create).not.toHaveBeenCalled();
  });

  it('refuses a PARTIAL payment that is not between zero and the total', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'c-1' });

    await expect(
      service.create('clerk_1', 'b-1', {
        customerId: 'c-1',
        items: [{ name: 'Item', quantity: 1, unitPrice: 3000 }],
        paymentStatus: PaymentStatus.PARTIAL,
        amountPaid: 3000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.sale.create).not.toHaveBeenCalled();
  });

  it('refuses a line item whose product is not in the business', async () => {
    prisma.product.findMany.mockResolvedValue([]); // p-1 not found

    await expect(
      service.create('clerk_1', 'b-1', {
        items: [
          { productId: 'p-1', name: 'Ankara', quantity: 1, unitPrice: 2000 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.sale.create).not.toHaveBeenCalled();
  });

  it('refuses a customer that is not in the business', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);

    await expect(
      service.create('clerk_1', 'b-1', {
        customerId: 'c-x',
        items: [{ name: 'Item', quantity: 1, unitPrice: 100 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.sale.create).not.toHaveBeenCalled();
  });

  it('returns a single sale that belongs to the active business', async () => {
    prisma.sale.findFirst.mockResolvedValue(saleRow());

    const result = await service.getOne('clerk_1', 'b-1', 's-1');

    expect(prisma.sale.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's-1', businessId: 'b-1' } }),
    );
    expect(result.id).toBe('s-1');
  });

  it('throws NotFound for a sale id outside the active business', async () => {
    prisma.sale.findFirst.mockResolvedValue(null);

    await expect(
      service.getOne('clerk_1', 'b-1', 's-x'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('settles the debt when a partial sale is edited to PAID', async () => {
    prisma.sale.findFirst.mockResolvedValue(
      saleRow({
        paymentStatus: PaymentStatus.PARTIAL,
        debt: { paidAmount: new Prisma.Decimal('1000.00') },
      }),
    );
    prisma.sale.findUniqueOrThrow.mockResolvedValue(saleRow());

    await service.update('clerk_1', 'b-1', 's-1', {
      paymentStatus: PaymentStatus.PAID,
    });

    expect(prisma.debt.delete).toHaveBeenCalledWith({ where: { saleId: 's-1' } });
    expect(prisma.debt.upsert).not.toHaveBeenCalled();
    expect(prisma.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's-1' },
        data: { paymentStatus: PaymentStatus.PAID },
      }),
    );
  });

  it('creates a debt when a paid sale is edited to UNPAID', async () => {
    prisma.sale.findFirst.mockResolvedValue(saleRow()); // PAID, no debt
    prisma.sale.findUniqueOrThrow.mockResolvedValue(
      saleRow({ paymentStatus: PaymentStatus.UNPAID }),
    );

    await service.update('clerk_1', 'b-1', 's-1', {
      paymentStatus: PaymentStatus.UNPAID,
    });

    const upsert = prisma.debt.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({ saleId: 's-1' });
    expect(upsert.create.customerId).toBe('c-1');
    expect(upsert.create.amount.toNumber()).toBe(4500);
    expect(upsert.create.paidAmount.toNumber()).toBe(0);
  });

  it('recomputes the total from the existing lines when the discount changes', async () => {
    prisma.sale.findFirst.mockResolvedValue(saleRow()); // subtotal 4500
    prisma.sale.findUniqueOrThrow.mockResolvedValue(saleRow());

    await service.update('clerk_1', 'b-1', 's-1', { discount: 500 });

    const arg = prisma.sale.update.mock.calls[0][0];
    expect(arg.data.discount).toBe(500);
    expect(arg.data.total.toNumber()).toBe(4000);
  });

  it('refuses to detach the customer from an unpaid sale', async () => {
    prisma.sale.findFirst.mockResolvedValue(
      saleRow({
        paymentStatus: PaymentStatus.UNPAID,
        debt: { paidAmount: new Prisma.Decimal('0.00') },
      }),
    );

    await expect(
      service.update('clerk_1', 'b-1', 's-1', { customerId: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.sale.update).not.toHaveBeenCalled();
  });

  it('deletes the linked debt alongside the sale', async () => {
    prisma.sale.findFirst.mockResolvedValue(
      saleRow({
        paymentStatus: PaymentStatus.UNPAID,
        debt: { paidAmount: new Prisma.Decimal('0.00') },
      }),
    );

    await service.remove('clerk_1', 'b-1', 's-1');

    expect(prisma.debt.delete).toHaveBeenCalledWith({ where: { saleId: 's-1' } });
    expect(prisma.sale.delete).toHaveBeenCalledWith({ where: { id: 's-1' } });
  });

  it('deletes a fully-paid sale without touching any debt', async () => {
    prisma.sale.findFirst.mockResolvedValue(saleRow()); // PAID, debt null

    await service.remove('clerk_1', 'b-1', 's-1');

    expect(prisma.debt.delete).not.toHaveBeenCalled();
    expect(prisma.sale.delete).toHaveBeenCalledWith({ where: { id: 's-1' } });
  });
});
