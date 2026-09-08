import { Test } from '@nestjs/testing';
import { type UserProfile } from '@remindam/shared';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { type AuthenticatedRequest } from '../auth/authenticated-request';
import { UsersService } from './users.service';
import { MeController } from './me.controller';

describe('MeController', () => {
  const users = { getOrCreateFromClerk: jest.fn() };
  let controller: MeController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [MeController],
      providers: [{ provide: UsersService, useValue: users }],
    })
      // The guard is exercised in its own spec; here we only assert mapping.
      .overrideGuard(ClerkAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(MeController);
  });

  it('maps the synced user to a UserProfile with ISO timestamps', async () => {
    users.getOrCreateFromClerk.mockResolvedValue({
      id: 'a1b2c3',
      clerkUserId: 'user_123',
      email: 'primary@example.com',
      firstName: 'Ada',
      lastName: 'Obi',
      createdAt: new Date('2026-09-08T12:00:00.000Z'),
      updatedAt: new Date('2026-09-08T13:30:00.000Z'),
    });

    const request = {
      auth: { clerkUserId: 'user_123' },
    } as AuthenticatedRequest;

    const result = await controller.getProfile(request);

    expect(users.getOrCreateFromClerk).toHaveBeenCalledWith('user_123');
    const expected: UserProfile = {
      id: 'a1b2c3',
      clerkUserId: 'user_123',
      email: 'primary@example.com',
      firstName: 'Ada',
      lastName: 'Obi',
      createdAt: '2026-09-08T12:00:00.000Z',
      updatedAt: '2026-09-08T13:30:00.000Z',
    };
    expect(result).toEqual(expected);
  });
});
