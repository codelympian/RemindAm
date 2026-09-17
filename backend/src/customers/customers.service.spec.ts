import { NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CustomersService } from './customers.service';

const now = new Date('2026-09-10T10:00:00.000Z');

const customerRow = {
  id: 'c-1',
  businessId: 'b-1',
  name: 'Ada Okafor',
  phone: '+2348012345678',
  email: 'ada@example.com',
  notes: null,
  createdAt: now,
  updatedAt: now,
};

describe('CustomersService', () => {
  const prisma = {
    $transaction: jest.fn(),
    businessMembership: { findUnique: jest.fn() },
    customer: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    sale: { findMany: jest.fn() },
    lead: { findMany: jest.fn() },
    leadInteraction: { findMany: jest.fn() },
  };
  const users = { getOrCreateFromClerk: jest.fn() };

  let service: CustomersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    users.getOrCreateFromClerk.mockResolvedValue({ id: 'user-1' });
    prisma.businessMembership.findUnique.mockResolvedValue({ id: 'm-1' });

    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: users },
      ],
    }).compile();

    service = moduleRef.get(CustomersService);
  });

  it('rejects a caller with no membership in the business as NotFound', async () => {
    prisma.businessMembership.findUnique.mockResolvedValue(null);

    await expect(service.list('clerk_1', 'b-x', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
  });

  it('lists customers scoped to the business, newest first, paginated', async () => {
    prisma.$transaction.mockResolvedValue([[customerRow], 1]);

    const result = await service.list('clerk_1', 'b-1', {
      page: 1,
      pageSize: 20,
    });

    expect(users.getOrCreateFromClerk).toHaveBeenCalledWith('clerk_1');
    expect(prisma.businessMembership.findUnique).toHaveBeenCalledWith({
      where: { userId_businessId: { userId: 'user-1', businessId: 'b-1' } },
    });
    expect(prisma.customer.findMany).toHaveBeenCalledWith({
      where: { businessId: 'b-1' },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    expect(result.data[0]).toMatchObject({
      id: 'c-1',
      createdAt: now.toISOString(),
    });
  });

  it('applies a case-insensitive search across name/email and a phone contains', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.list('clerk_1', 'b-1', { q: 'ada' });

    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: 'b-1',
          OR: [
            { name: { contains: 'ada', mode: Prisma.QueryMode.insensitive } },
            { email: { contains: 'ada', mode: Prisma.QueryMode.insensitive } },
            { phone: { contains: 'ada' } },
          ],
        },
      }),
    );
  });

  it('creates a customer with business-scoped data and null-normalised optionals', async () => {
    prisma.customer.create.mockResolvedValue(customerRow);

    const result = await service.create('clerk_1', 'b-1', {
      name: 'Ada Okafor',
      phone: '+2348012345678',
      email: 'ada@example.com',
    });

    expect(prisma.customer.create).toHaveBeenCalledWith({
      data: {
        businessId: 'b-1',
        name: 'Ada Okafor',
        phone: '+2348012345678',
        email: 'ada@example.com',
        notes: null,
      },
    });
    expect(result.id).toBe('c-1');
  });

  it('returns a single customer that belongs to the active business', async () => {
    prisma.customer.findFirst.mockResolvedValue(customerRow);

    const result = await service.getOne('clerk_1', 'b-1', 'c-1');

    expect(prisma.customer.findFirst).toHaveBeenCalledWith({
      where: { id: 'c-1', businessId: 'b-1' },
    });
    expect(result.id).toBe('c-1');
  });

  it('throws NotFound for a customer id outside the active business', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);

    await expect(
      service.getOne('clerk_1', 'b-1', 'c-x'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates only the fields the caller sent, after confirming ownership', async () => {
    prisma.customer.findFirst.mockResolvedValue(customerRow);
    prisma.customer.update.mockResolvedValue({ ...customerRow, name: 'Ada N.' });

    const result = await service.update('clerk_1', 'b-1', 'c-1', {
      name: 'Ada N.',
    });

    expect(prisma.customer.findFirst).toHaveBeenCalledWith({
      where: { id: 'c-1', businessId: 'b-1' },
    });
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: { name: 'Ada N.' },
    });
    expect(result.name).toBe('Ada N.');
  });

  it('will not update a customer outside the active business', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);

    await expect(
      service.update('clerk_1', 'b-1', 'c-x', { name: 'Nope' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('deletes a customer that belongs to the active business', async () => {
    prisma.customer.findFirst.mockResolvedValue(customerRow);
    prisma.customer.delete.mockResolvedValue(customerRow);

    await service.remove('clerk_1', 'b-1', 'c-1');

    expect(prisma.customer.delete).toHaveBeenCalledWith({
      where: { id: 'c-1' },
    });
  });

  describe('getTimeline', () => {
    it('rejects a non-member before reading any history', async () => {
      prisma.businessMembership.findUnique.mockResolvedValue(null);

      await expect(
        service.getTimeline('clerk_1', 'b-x', 'c-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.sale.findMany).not.toHaveBeenCalled();
    });

    it('throws NotFound for a customer outside the active business', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        service.getTimeline('clerk_1', 'b-1', 'c-x'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.sale.findMany).not.toHaveBeenCalled();
    });

    it('returns just the customer_created anchor when there is no history', async () => {
      prisma.customer.findFirst.mockResolvedValue(customerRow);
      prisma.sale.findMany.mockResolvedValue([]);
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.leadInteraction.findMany.mockResolvedValue([]);

      const events = await service.getTimeline('clerk_1', 'b-1', 'c-1');

      expect(events).toEqual([
        {
          id: 'customer:c-1',
          type: 'customer_created',
          at: now.toISOString(),
          label: null,
          amount: null,
          paymentStatus: null,
          amountOwed: null,
        },
      ]);
      // Every history query is scoped by BOTH business and customer.
      expect(prisma.sale.findMany).toHaveBeenCalledWith({
        where: { businessId: 'b-1', customerId: 'c-1' },
        include: { items: { select: { name: true } }, debt: true },
      });
      expect(prisma.lead.findMany).toHaveBeenCalledWith({
        where: { businessId: 'b-1', customerId: 'c-1' },
      });
      expect(prisma.leadInteraction.findMany).toHaveBeenCalledWith({
        where: { lead: { customerId: 'c-1', businessId: 'b-1' } },
      });
    });

    it('merges sales, leads and interactions newest-first with the anchor last', async () => {
      prisma.customer.findFirst.mockResolvedValue(customerRow); // created 09-10
      prisma.sale.findMany.mockResolvedValue([
        {
          id: 's-1',
          soldAt: new Date('2026-09-12T09:00:00.000Z'),
          total: new Prisma.Decimal(5000),
          paymentStatus: PaymentStatus.PAID,
          items: [{ name: 'Rice' }, { name: 'Beans' }],
          debt: null,
        },
      ]);
      prisma.lead.findMany.mockResolvedValue([
        {
          id: 'l-1',
          createdAt: new Date('2026-09-11T09:00:00.000Z'),
          source: 'WhatsApp',
          interestedProduct: null,
          value: new Prisma.Decimal(20000),
        },
      ]);
      prisma.leadInteraction.findMany.mockResolvedValue([
        {
          id: 'i-1',
          createdAt: new Date('2026-09-13T09:00:00.000Z'),
          note: 'Called about delivery',
        },
      ]);

      const events = await service.getTimeline('clerk_1', 'b-1', 'c-1');

      expect(events.map((event) => event.id)).toEqual([
        'interaction:i-1', // 09-13
        'purchase:s-1', // 09-12
        'lead:l-1', // 09-11
        'customer:c-1', // 09-10 (anchor)
      ]);
    });

    it('surfaces outstanding debt on the purchase entry for each payment status', async () => {
      prisma.customer.findFirst.mockResolvedValue(customerRow);
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.leadInteraction.findMany.mockResolvedValue([]);
      prisma.sale.findMany.mockResolvedValue([
        {
          id: 's-paid',
          soldAt: new Date('2026-09-14T09:00:00.000Z'),
          total: new Prisma.Decimal(5000),
          paymentStatus: PaymentStatus.PAID,
          items: [{ name: 'Rice' }],
          debt: null,
        },
        {
          id: 's-partial',
          soldAt: new Date('2026-09-13T09:00:00.000Z'),
          total: new Prisma.Decimal(5000),
          paymentStatus: PaymentStatus.PARTIAL,
          items: [{ name: 'Rice' }, { name: 'Beans' }, { name: 'Oil' }],
          debt: { paidAmount: new Prisma.Decimal(2000) },
        },
        {
          id: 's-unpaid',
          soldAt: new Date('2026-09-12T09:00:00.000Z'),
          total: new Prisma.Decimal(5000),
          paymentStatus: PaymentStatus.UNPAID,
          items: [{ name: 'Rice' }],
          debt: { paidAmount: new Prisma.Decimal(0) },
        },
      ]);

      const events = await service.getTimeline('clerk_1', 'b-1', 'c-1');
      const byId = Object.fromEntries(events.map((event) => [event.id, event]));

      expect(byId['purchase:s-paid']).toMatchObject({
        type: 'purchase',
        label: 'Rice',
        amount: 5000,
        paymentStatus: 'PAID',
        amountOwed: 0,
      });
      expect(byId['purchase:s-partial']).toMatchObject({
        label: 'Rice +2 more', // item summary collapses the rest
        amount: 5000,
        paymentStatus: 'PARTIAL',
        amountOwed: 3000, // total 5000 − paid 2000
      });
      expect(byId['purchase:s-unpaid']).toMatchObject({
        paymentStatus: 'UNPAID',
        amountOwed: 5000, // the whole total
      });
    });

    it('maps a lead to a lead_created event, falling back to the product and hiding a zero value', async () => {
      prisma.customer.findFirst.mockResolvedValue(customerRow);
      prisma.sale.findMany.mockResolvedValue([]);
      prisma.leadInteraction.findMany.mockResolvedValue([]);
      prisma.lead.findMany.mockResolvedValue([
        {
          id: 'l-1',
          createdAt: new Date('2026-09-11T09:00:00.000Z'),
          source: null,
          interestedProduct: 'Generator',
          value: new Prisma.Decimal(0),
        },
      ]);

      const events = await service.getTimeline('clerk_1', 'b-1', 'c-1');
      const lead = events.find((event) => event.id === 'lead:l-1');

      expect(lead).toMatchObject({
        type: 'lead_created',
        label: 'Generator', // source is null → falls back to interestedProduct
        amount: null, // value 0 → null
        paymentStatus: null,
        amountOwed: null,
      });
    });
  });
});
