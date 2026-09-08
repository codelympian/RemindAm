import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { type User } from '@prisma/client';
import { type UserProfile } from '@remindam/shared';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { type AuthenticatedRequest } from '../auth/authenticated-request';
import { UsersService } from './users.service';

/**
 * The authenticated user's own profile. Every request is gated by
 * {@link ClerkAuthGuard}, so reaching a handler means the Clerk session token
 * was verified and `request.auth.clerkUserId` is trustworthy.
 */
@Controller('me')
@UseGuards(ClerkAuthGuard)
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async getProfile(@Req() request: AuthenticatedRequest): Promise<UserProfile> {
    const user = await this.users.getOrCreateFromClerk(
      request.auth.clerkUserId,
    );
    return this.toProfile(user);
  }

  private toProfile(user: User): UserProfile {
    return {
      id: user.id,
      clerkUserId: user.clerkUserId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
