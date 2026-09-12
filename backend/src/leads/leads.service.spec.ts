import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LeadsService } from './leads.service';

const now = new Date('2026-09-12T10:00:00.000Z');
const earlier = new Date('2026-09-10T09:00:00.000Z');

/** A NEW lead for Chidi, worth 15,000, with two interactions (newest first). */
function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'l-1',
    businessId: 'b-1',
    customerId: 'c-1',
    source: 'WhatsApp',
    interestedProduct: 'Ankara fabric',
    status: LeadStatus.NEW,
    value: new Prisma.Decimal('15000.00'),
    nextFollowUpAt: now,
    createdAt: now,
    updatedAt: now,
    customer: { name: 'Chidi' },
    interactions: [
      { id: 'li-1', leadId: 'l-1', note: 'Called, interested', createdAt: now },
      { id: 'li-2', leadId: 'l-1', note: 'First contact', createdAt: earlier },
    ],
    ...overrides,
  };
}

describe('LeadsService', () => {
  const prisma = {
    $transaction: jest.fn(),
    businessMembership: { findUnique: jest.fn() },
    customer: { findFirst: jest.fn() },
    lead: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    leadInteraction: { create: jest.fn() },
  };
  const users = { getOrCreateFromClerk: jest.fn() };

  let service: LeadsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    users.getOrCreateFromClerk.mockResolvedValue({ id: 'user-1' });
    prisma.businessMembership.findUnique.mockResolvedValue({ id: 'm-1' });
    // The list runs `$transaction([findMany, count])`; resolve the array form.
    prisma.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: typeof prisma) => unknown)(prisma)
        : Promise.all(arg as unknown[]),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: users },
      ],
    }).compile();

    service = moduleRef.get(LeadsService);
  });

  it('rejects a caller with no membership in the business as NotFound', async () => {
    prisma.businessMembership.findUnique.mockResolvedValue(null);

    await expect(service.list('clerk_1', 'b-x', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.lead.findMany).not.toHaveBeenCalled();
  });

  it('lists leads scoped to the business, newest first, paginated', async () => {
    prisma.lead.findMany.mockResolvedValue([leadRow()]);
    prisma.lead.count.mockResolvedValue(1);

    const result = await service.list('clerk_1', 'b-1', { page: 1, pageSize: 20 });

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: 'b-1' },
        orderBy: { createdAt: 'desc' },
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

  it('narrows the list by customer and by status when asked', async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.count.mockResolvedValue(0);

    await service.list('clerk_1', 'b-1', {
      customerId: 'c-1',
      status: LeadStatus.WON,
    });

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: 'b-1', customerId: 'c-1', status: LeadStatus.WON },
      }),
    );
  });

  it('serializes value as a number, maps status, and derives the last-interaction date', async () => {
    prisma.lead.findMany.mockResolvedValue([leadRow()]);
    prisma.lead.count.mockResolvedValue(1);

    const { data } = await service.list('clerk_1', 'b-1', {});

    expect(data[0]).toMatchObject({
      id: 'l-1',
      customerName: 'Chidi',
      source: 'WhatsApp',
      interestedProduct: 'Ankara fabric',
      status: LeadStatus.NEW,
      value: 15000,
      nextFollowUpAt: now.toISOString(),
      lastInteractionAt: now.toISOString(),
    });
    expect(data[0].interactions).toEqual([
      {
        id: 'li-1',
        leadId: 'l-1',
        note: 'Called, interested',
        createdAt: now.toISOString(),
      },
      {
        id: 'li-2',
        leadId: 'l-1',
        note: 'First contact',
        createdAt: earlier.toISOString(),
      },
    ]);
  });

  it('reports a null follow-up and last-interaction date when there are none', async () => {
    prisma.lead.findMany.mockResolvedValue([
      leadRow({ nextFollowUpAt: null, interactions: [] }),
    ]);
    prisma.lead.count.mockResolvedValue(1);

    const { data } = await service.list('clerk_1', 'b-1', {});

    expect(data[0].nextFollowUpAt).toBeNull();
    expect(data[0].lastInteractionAt).toBeNull();
    expect(data[0].interactions).toEqual([]);
  });

  it('refuses to create a lead whose customer is not in the business', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);

    await expect(
      service.create('clerk_1', 'b-1', { customerId: 'c-x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('creates a lead with NEW/zero defaults and an optional opening note', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'c-1' });
    prisma.lead.create.mockResolvedValue(leadRow());

    await service.create('clerk_1', 'b-1', {
      customerId: 'c-1',
      note: 'First contact',
    });

    const arg = prisma.lead.create.mock.calls[0][0];
    expect(arg.data.businessId).toBe('b-1');
    expect(arg.data.customerId).toBe('c-1');
    expect(arg.data.status).toBe(LeadStatus.NEW);
    expect(arg.data.value).toBe(0);
    expect(arg.data.nextFollowUpAt).toBeNull();
    expect(arg.data.interactions.create).toEqual({ note: 'First contact' });
  });

  it('creates a lead without an interaction when no opening note is given', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'c-1' });
    prisma.lead.create.mockResolvedValue(leadRow({ interactions: [] }));

    await service.create('clerk_1', 'b-1', { customerId: 'c-1' });

    expect(prisma.lead.create.mock.calls[0][0].data.interactions).toBeUndefined();
  });

  it('records the provided status, value and follow-up date on create', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'c-1' });
    prisma.lead.create.mockResolvedValue(leadRow());

    await service.create('clerk_1', 'b-1', {
      customerId: 'c-1',
      status: LeadStatus.NEGOTIATING,
      value: 15000,
      nextFollowUpAt: '2026-09-20T09:00:00.000Z',
    });

    const arg = prisma.lead.create.mock.calls[0][0];
    expect(arg.data.status).toBe(LeadStatus.NEGOTIATING);
    expect(arg.data.value).toBe(15000);
    expect(arg.data.nextFollowUpAt).toEqual(new Date('2026-09-20T09:00:00.000Z'));
  });

  it('returns a single lead that belongs to the active business', async () => {
    prisma.lead.findFirst.mockResolvedValue(leadRow());

    const result = await service.getOne('clerk_1', 'b-1', 'l-1');

    expect(prisma.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'l-1', businessId: 'b-1' } }),
    );
    expect(result.id).toBe('l-1');
  });

  it('throws NotFound for a lead id outside the active business', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);

    await expect(
      service.getOne('clerk_1', 'b-1', 'l-x'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('writes a WON status straight through as a plain field (no side effect)', async () => {
    prisma.lead.findFirst.mockResolvedValue(leadRow());
    prisma.lead.update.mockResolvedValue(leadRow({ status: LeadStatus.WON }));

    await service.update('clerk_1', 'b-1', 'l-1', { status: LeadStatus.WON });

    // Only the status is written — nothing derived, nothing cascaded.
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'l-1' },
        data: { status: LeadStatus.WON },
      }),
    );
  });

  it('assigns only the fields actually sent on update', async () => {
    prisma.lead.findFirst.mockResolvedValue(leadRow());
    prisma.lead.update.mockResolvedValue(
      leadRow({ value: new Prisma.Decimal('20000.00') }),
    );

    await service.update('clerk_1', 'b-1', 'l-1', { value: 20000 });

    expect(prisma.lead.update.mock.calls[0][0].data).toEqual({ value: 20000 });
  });

  it('reassigns the customer via connect when a valid one is sent', async () => {
    prisma.lead.findFirst.mockResolvedValue(leadRow());
    prisma.customer.findFirst.mockResolvedValue({ id: 'c-2' });
    prisma.lead.update.mockResolvedValue(leadRow({ customerId: 'c-2' }));

    await service.update('clerk_1', 'b-1', 'l-1', { customerId: 'c-2' });

    expect(prisma.lead.update.mock.calls[0][0].data.customer).toEqual({
      connect: { id: 'c-2' },
    });
  });

  it('refuses to reassign a lead to a customer not in the business', async () => {
    prisma.lead.findFirst.mockResolvedValue(leadRow());
    prisma.customer.findFirst.mockResolvedValue(null);

    await expect(
      service.update('clerk_1', 'b-1', 'l-1', { customerId: 'c-x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('clears the source and follow-up date when sent an explicit null', async () => {
    prisma.lead.findFirst.mockResolvedValue(leadRow());
    prisma.lead.update.mockResolvedValue(
      leadRow({ source: null, nextFollowUpAt: null }),
    );

    await service.update('clerk_1', 'b-1', 'l-1', {
      source: null,
      nextFollowUpAt: null,
    });

    const data = prisma.lead.update.mock.calls[0][0].data;
    expect(data.source).toBeNull();
    expect(data.nextFollowUpAt).toBeNull();
  });

  it('converts a string follow-up date to a Date on update', async () => {
    prisma.lead.findFirst.mockResolvedValue(leadRow());
    prisma.lead.update.mockResolvedValue(leadRow());

    await service.update('clerk_1', 'b-1', 'l-1', {
      nextFollowUpAt: '2026-10-01T08:00:00.000Z',
    });

    expect(prisma.lead.update.mock.calls[0][0].data.nextFollowUpAt).toEqual(
      new Date('2026-10-01T08:00:00.000Z'),
    );
  });

  it('throws NotFound when updating a lead outside the active business', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);

    await expect(
      service.update('clerk_1', 'b-1', 'l-x', { status: LeadStatus.WON }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('deletes a lead that belongs to the active business', async () => {
    prisma.lead.findFirst.mockResolvedValue(leadRow());

    await service.remove('clerk_1', 'b-1', 'l-1');

    expect(prisma.lead.delete).toHaveBeenCalledWith({ where: { id: 'l-1' } });
  });

  it('throws NotFound when deleting a lead outside the active business', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);

    await expect(
      service.remove('clerk_1', 'b-1', 'l-x'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.lead.delete).not.toHaveBeenCalled();
  });

  it('logs an interaction against a lead in the active business', async () => {
    prisma.lead.findFirst.mockResolvedValue(leadRow());
    prisma.leadInteraction.create.mockResolvedValue({
      id: 'li-9',
      leadId: 'l-1',
      note: 'Sent quote',
      createdAt: now,
    });

    const result = await service.addInteraction('clerk_1', 'b-1', 'l-1', {
      note: 'Sent quote',
    });

    expect(prisma.leadInteraction.create).toHaveBeenCalledWith({
      data: { leadId: 'l-1', note: 'Sent quote' },
    });
    expect(result).toEqual({
      id: 'li-9',
      leadId: 'l-1',
      note: 'Sent quote',
      createdAt: now.toISOString(),
    });
  });

  it('throws NotFound when logging against a lead outside the active business', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);

    await expect(
      service.addInteraction('clerk_1', 'b-1', 'l-x', { note: 'Sent quote' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.leadInteraction.create).not.toHaveBeenCalled();
  });
});
