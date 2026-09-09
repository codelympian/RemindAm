import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MembershipRole } from '@remindam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { BusinessesService } from './businesses.service';

const now = new Date('2026-09-09T10:00:00.000Z');

const businessRow = {
  id: 'b-1',
  name: 'Ada Stores',
  phone: '+2348012345678',
  email: null,
  industry: 'Retail',
  customerTrackingMethod: 'WhatsApp',
  currency: 'NGN',
  timezone: 'Africa/Lagos',
  createdAt: now,
  updatedAt: now,
};

describe('BusinessesService', () => {
  const tx = {
    business: { create: jest.fn() },
    businessMembership: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(),
    businessMembership: { findMany: jest.fn(), findUnique: jest.fn() },
  };
  const users = { getOrCreateFromClerk: jest.fn() };

  let service: BusinessesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    users.getOrCreateFromClerk.mockResolvedValue({ id: 'user-1' });
    const moduleRef = await Test.createTestingModule({
      providers: [
        BusinessesService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: users },
      ],
    }).compile();
    service = moduleRef.get(BusinessesService);
  });

  it('creates the business and the OWNER membership atomically', async () => {
    tx.business.create.mockResolvedValue(businessRow);
    tx.businessMembership.create.mockResolvedValue({});
    prisma.$transaction.mockImplementation(
      (cb: (client: typeof tx) => Promise<unknown>) => cb(tx),
    );

    const result = await service.create('clerk_1', {
      name: 'Ada Stores',
      industry: 'Retail',
      phone: '+2348012345678',
      customerTrackingMethod: 'WhatsApp',
    });

    expect(users.getOrCreateFromClerk).toHaveBeenCalledWith('clerk_1');
    expect(tx.business.create).toHaveBeenCalledWith({
      data: {
        name: 'Ada Stores',
        industry: 'Retail',
        phone: '+2348012345678',
        customerTrackingMethod: 'WhatsApp',
      },
    });
    expect(tx.businessMembership.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', businessId: 'b-1', role: 'OWNER' },
    });
    // DTO shape: dates serialized to ISO strings.
    expect(result.id).toBe('b-1');
    expect(result.customerTrackingMethod).toBe('WhatsApp');
    expect(result.createdAt).toBe(now.toISOString());
  });

  it('lists the memberships as summaries carrying the caller role', async () => {
    prisma.businessMembership.findMany.mockResolvedValue([
      {
        role: 'OWNER',
        business: {
          id: 'b-1',
          name: 'Ada Stores',
          industry: 'Retail',
          currency: 'NGN',
        },
      },
    ]);

    const result = await service.listForUser('clerk_1');

    expect(prisma.businessMembership.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      include: { business: true },
      orderBy: { business: { createdAt: 'asc' } },
    });
    expect(result).toEqual([
      {
        id: 'b-1',
        name: 'Ada Stores',
        industry: 'Retail',
        currency: 'NGN',
        role: MembershipRole.OWNER,
      },
    ]);
  });

  it('returns a single business when the caller is a member', async () => {
    prisma.businessMembership.findUnique.mockResolvedValue({
      business: businessRow,
    });

    const result = await service.getForUser('clerk_1', 'b-1');

    expect(prisma.businessMembership.findUnique).toHaveBeenCalledWith({
      where: { userId_businessId: { userId: 'user-1', businessId: 'b-1' } },
      include: { business: true },
    });
    expect(result.id).toBe('b-1');
  });

  it('throws NotFound when the caller has no membership in the business', async () => {
    prisma.businessMembership.findUnique.mockResolvedValue(null);

    await expect(service.getForUser('clerk_1', 'b-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
