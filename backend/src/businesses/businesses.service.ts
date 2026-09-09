import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type Business } from '@prisma/client';
import {
  MembershipRole,
  type Business as BusinessDto,
  type BusinessSummary,
  type CreateBusinessInput,
} from '@remindam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

/**
 * Owns businesses (tenants) and the caller's membership in them. Every method
 * takes the *verified* Clerk id (from the guard) and resolves the local user
 * server-side — the client never supplies a user or business owner. Reads are
 * scoped through `BusinessMembership`, so a user can only see businesses they
 * belong to (master prompt §11/§46).
 */
@Injectable()
export class BusinessesService {
  private readonly logger = new Logger(BusinessesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /**
   * Onboarding completion: create the business and the owner membership
   * atomically, so a user is never left with a business they cannot access.
   */
  async create(
    clerkUserId: string,
    input: CreateBusinessInput,
  ): Promise<BusinessDto> {
    const user = await this.users.getOrCreateFromClerk(clerkUserId);

    const business = await this.prisma.$transaction(async (tx) => {
      const created = await tx.business.create({
        data: {
          name: input.name,
          industry: input.industry ?? null,
          phone: input.phone ?? null,
          customerTrackingMethod: input.customerTrackingMethod ?? null,
        },
      });
      await tx.businessMembership.create({
        data: { userId: user.id, businessId: created.id, role: 'OWNER' },
      });
      return created;
    });

    this.logger.log(`Created business ${business.id} owned by user ${user.id}`);
    return this.toDto(business);
  }

  /** Every business the user is a member of, with their role in each. */
  async listForUser(clerkUserId: string): Promise<BusinessSummary[]> {
    const user = await this.users.getOrCreateFromClerk(clerkUserId);
    const memberships = await this.prisma.businessMembership.findMany({
      where: { userId: user.id },
      include: { business: true },
      orderBy: { business: { createdAt: 'asc' } },
    });
    return memberships.map((membership) => ({
      id: membership.business.id,
      name: membership.business.name,
      industry: membership.business.industry,
      currency: membership.business.currency,
      // Prisma and shared MembershipRole share identical string values.
      role: MembershipRole[membership.role],
    }));
  }

  /** A single business, but only if the caller is a member (else 404). */
  async getForUser(
    clerkUserId: string,
    businessId: string,
  ): Promise<BusinessDto> {
    const user = await this.users.getOrCreateFromClerk(clerkUserId);
    const membership = await this.prisma.businessMembership.findUnique({
      where: { userId_businessId: { userId: user.id, businessId } },
      include: { business: true },
    });
    if (!membership) {
      // Don't distinguish "not yours" from "doesn't exist" — avoid leaking ids.
      throw new NotFoundException('Business not found');
    }
    return this.toDto(membership.business);
  }

  private toDto(business: Business): BusinessDto {
    return {
      id: business.id,
      name: business.name,
      phone: business.phone,
      email: business.email,
      industry: business.industry,
      customerTrackingMethod: business.customerTrackingMethod,
      currency: business.currency,
      timezone: business.timezone,
      createdAt: business.createdAt.toISOString(),
      updatedAt: business.updatedAt.toISOString(),
    };
  }
}
