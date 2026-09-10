import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
});
