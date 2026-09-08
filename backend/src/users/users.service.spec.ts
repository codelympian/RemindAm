import { Test } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CLERK_CLIENT } from '../auth/clerk.provider';
import { UsersService } from './users.service';

const clerkUserFixture = {
  primaryEmailAddressId: 'idn_primary',
  emailAddresses: [
    { id: 'idn_other', emailAddress: 'secondary@example.com' },
    { id: 'idn_primary', emailAddress: 'primary@example.com' },
  ],
  firstName: 'Ada',
  lastName: 'Obi',
};

const dbUserFixture = {
  id: 'a1b2c3',
  clerkUserId: 'user_123',
  email: 'primary@example.com',
  firstName: 'Ada',
  lastName: 'Obi',
  createdAt: new Date('2026-09-08T12:00:00.000Z'),
  updatedAt: new Date('2026-09-08T12:00:00.000Z'),
};

describe('UsersService', () => {
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn() },
  };
  const clerk = {
    users: { getUser: jest.fn() },
  };

  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: CLERK_CLIENT, useValue: clerk },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('returns the existing local user without calling Clerk', async () => {
    prisma.user.findUnique.mockResolvedValue(dbUserFixture);

    const result = await service.getOrCreateFromClerk('user_123');

    expect(result).toBe(dbUserFixture);
    expect(clerk.users.getUser).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates the user from the Clerk primary email on first contact', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    clerk.users.getUser.mockResolvedValue(clerkUserFixture);
    prisma.user.create.mockResolvedValue(dbUserFixture);

    const result = await service.getOrCreateFromClerk('user_123');

    expect(clerk.users.getUser).toHaveBeenCalledWith('user_123');
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        clerkUserId: 'user_123',
        email: 'primary@example.com',
        firstName: 'Ada',
        lastName: 'Obi',
      },
    });
    expect(result).toBe(dbUserFixture);
  });

  it('throws when the Clerk user has no email address', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    clerk.users.getUser.mockResolvedValue({
      primaryEmailAddressId: null,
      emailAddresses: [],
      firstName: null,
      lastName: null,
    });

    await expect(service.getOrCreateFromClerk('user_123')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('resolves a unique-constraint race by returning the winning row', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(null) // initial lookup: not there yet
      .mockResolvedValueOnce(dbUserFixture); // after the race: the winner
    clerk.users.getUser.mockResolvedValue(clerkUserFixture);
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '5.20.0',
      }),
    );

    const result = await service.getOrCreateFromClerk('user_123');

    expect(result).toBe(dbUserFixture);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });
});
