import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type Customer as CustomerRow } from '@prisma/client';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type CreateCustomerInput,
  type Customer as CustomerDto,
  type CustomerListParams,
  type Paginated,
  type UpdateCustomerInput,
} from '@remindam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

/**
 * Customer CRUD, scoped to a single business (tenant). Every method takes the
 * *verified* Clerk id (from the guard) plus the business id (from the validated
 * `x-business-id` header) and first re-checks the caller's membership — the
 * client never asserts a user, and a business id it isn't a member of is treated
 * as not found (master prompt §11/§46). Reads and writes are always filtered by
 * `businessId`, so one business can never see or touch another's customers.
 */
@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /** A page of the business's customers, newest first, optionally filtered by `q`. */
  async list(
    clerkUserId: string,
    businessId: string,
    params: CustomerListParams,
  ): Promise<Paginated<CustomerDto>> {
    await this.resolveMembership(clerkUserId, businessId);

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE),
    );
    const q = params.q?.trim();

    const where: Prisma.CustomerWhereInput = {
      businessId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: Prisma.QueryMode.insensitive } },
              { email: { contains: q, mode: Prisma.QueryMode.insensitive } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toDto(row)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  /** Create a customer under the active business. */
  async create(
    clerkUserId: string,
    businessId: string,
    input: CreateCustomerInput,
  ): Promise<CustomerDto> {
    await this.resolveMembership(clerkUserId, businessId);
    const customer = await this.prisma.customer.create({
      data: {
        businessId,
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        notes: input.notes ?? null,
      },
    });
    this.logger.log(`Created customer ${customer.id} in business ${businessId}`);
    return this.toDto(customer);
  }

  /** One customer, but only if it belongs to the active business (else 404). */
  async getOne(
    clerkUserId: string,
    businessId: string,
    id: string,
  ): Promise<CustomerDto> {
    await this.resolveMembership(clerkUserId, businessId);
    return this.toDto(await this.findInBusiness(businessId, id));
  }

  /** Update the provided fields of a customer in the active business. */
  async update(
    clerkUserId: string,
    businessId: string,
    id: string,
    input: UpdateCustomerInput,
  ): Promise<CustomerDto> {
    await this.resolveMembership(clerkUserId, businessId);
    await this.findInBusiness(businessId, id);

    // Only touch fields the caller actually sent; `null` clears, omitted keeps.
    const data: Prisma.CustomerUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.email !== undefined) data.email = input.email;
    if (input.notes !== undefined) data.notes = input.notes;

    const customer = await this.prisma.customer.update({
      where: { id },
      data,
    });
    return this.toDto(customer);
  }

  /** Delete a customer in the active business. */
  async remove(
    clerkUserId: string,
    businessId: string,
    id: string,
  ): Promise<void> {
    await this.resolveMembership(clerkUserId, businessId);
    await this.findInBusiness(businessId, id);
    await this.prisma.customer.delete({ where: { id } });
    this.logger.log(`Deleted customer ${id} in business ${businessId}`);
  }

  /**
   * Resolve the local user for the verified Clerk id and assert they are a member
   * of the business. Throws the same non-leaking 404 as reading a business the
   * caller doesn't belong to.
   */
  private async resolveMembership(
    clerkUserId: string,
    businessId: string,
  ): Promise<string> {
    const user = await this.users.getOrCreateFromClerk(clerkUserId);
    const membership = await this.prisma.businessMembership.findUnique({
      where: { userId_businessId: { userId: user.id, businessId } },
    });
    if (!membership) {
      throw new NotFoundException('Business not found');
    }
    return user.id;
  }

  /** A customer that must belong to `businessId`, or a non-leaking 404. */
  private async findInBusiness(
    businessId: string,
    id: string,
  ): Promise<CustomerRow> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, businessId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  private toDto(customer: CustomerRow): CustomerDto {
    return {
      id: customer.id,
      businessId: customer.businessId,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      notes: customer.notes,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }
}
