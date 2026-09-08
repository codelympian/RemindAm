import {
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { type ClerkClient } from '@clerk/backend';
import { PrismaService } from '../prisma/prisma.service';
import { CLERK_CLIENT } from '../auth/clerk.provider';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLERK_CLIENT) private readonly clerk: ClerkClient,
  ) {}

  /**
   * Returns the local `User` for a verified Clerk id, creating it on first
   * contact by pulling the canonical email/name from Clerk. Idempotent: the
   * common path is a single indexed lookup with no Clerk API call.
   */
  async getOrCreateFromClerk(clerkUserId: string): Promise<User> {
    const existing = await this.prisma.user.findUnique({
      where: { clerkUserId },
    });
    if (existing) {
      return existing;
    }

    const clerkUser = await this.clerk.users.getUser(clerkUserId);
    const email = this.resolvePrimaryEmail(clerkUser);
    if (!email) {
      throw new UnprocessableEntityException(
        'Clerk user has no email address; cannot create a local account.',
      );
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          clerkUserId,
          email,
          firstName: clerkUser.firstName ?? null,
          lastName: clerkUser.lastName ?? null,
        },
      });
      this.logger.log(`Synced new user for Clerk id ${clerkUserId}`);
      return user;
    } catch (error) {
      // A concurrent first request may have created the row between our
      // findUnique and create — resolve the race by returning the winner.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.user.findUnique({
          where: { clerkUserId },
        });
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  private resolvePrimaryEmail(clerkUser: {
    primaryEmailAddressId: string | null;
    emailAddresses: { id: string; emailAddress: string }[];
  }): string | null {
    const primary = clerkUser.emailAddresses.find(
      (address) => address.id === clerkUser.primaryEmailAddressId,
    );
    return (primary ?? clerkUser.emailAddresses[0])?.emailAddress ?? null;
  }
}
