import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  PaymentStatus,
  type Customer as CustomerRow,
} from '@prisma/client';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PaymentStatus as ApiPaymentStatus,
  type CreateCustomerInput,
  type Customer as CustomerDto,
  type CustomerListParams,
  type CustomerTimelineEvent,
  type Paginated,
  type UpdateCustomerInput,
} from '@remindam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

/** A sale with the relations the timeline reads: its item names and its debt. */
type SaleForTimeline = Prisma.SaleGetPayload<{
  include: { items: { select: { name: true } }; debt: true };
}>;

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

  /**
   * A customer's chronological timeline (§20): the "customer added" anchor plus
   * every purchase, lead and lead interaction, merged newest-first. Read-only —
   * it aggregates data other features own and writes nothing. Outstanding debt is
   * surfaced on the purchase it belongs to (`paymentStatus` + `amountOwed`)
   * rather than as a standalone event: a debt is created with its sale, and a
   * settled debt leaves no persisted record ({@link SalesService} deletes the
   * `Debt` row when a sale becomes PAID), so a dated "debt paid" event would be
   * fabricated. The anchor guarantees a real customer's timeline is never empty.
   */
  async getTimeline(
    clerkUserId: string,
    businessId: string,
    customerId: string,
  ): Promise<CustomerTimelineEvent[]> {
    await this.resolveMembership(clerkUserId, businessId);
    const customer = await this.findInBusiness(businessId, customerId);

    // Every query is scoped by both businessId and customerId for tenant safety.
    const [sales, leads, interactions] = await Promise.all([
      this.prisma.sale.findMany({
        where: { businessId, customerId },
        include: { items: { select: { name: true } }, debt: true },
      }),
      this.prisma.lead.findMany({ where: { businessId, customerId } }),
      this.prisma.leadInteraction.findMany({
        where: { lead: { customerId, businessId } },
      }),
    ]);

    const events: CustomerTimelineEvent[] = [
      {
        id: `customer:${customer.id}`,
        type: 'customer_created',
        at: customer.createdAt.toISOString(),
        label: null,
        amount: null,
        paymentStatus: null,
        amountOwed: null,
      },
    ];

    for (const sale of sales) {
      events.push({
        id: `purchase:${sale.id}`,
        type: 'purchase',
        at: sale.soldAt.toISOString(),
        label: this.summariseItems(sale.items),
        amount: sale.total.toNumber(),
        // Prisma and the shared enum share identical string values.
        paymentStatus: ApiPaymentStatus[sale.paymentStatus],
        amountOwed: this.owedOn(sale).toNumber(),
      });
    }

    for (const lead of leads) {
      const value = lead.value.toNumber();
      events.push({
        id: `lead:${lead.id}`,
        type: 'lead_created',
        at: lead.createdAt.toISOString(),
        label: lead.source ?? lead.interestedProduct ?? null,
        amount: value > 0 ? value : null,
        paymentStatus: null,
        amountOwed: null,
      });
    }

    for (const interaction of interactions) {
      events.push({
        id: `interaction:${interaction.id}`,
        type: 'lead_interaction',
        at: interaction.createdAt.toISOString(),
        label: interaction.note,
        amount: null,
        paymentStatus: null,
        amountOwed: null,
      });
    }

    // Newest first. `at` is always a UTC ISO string of identical shape, so a
    // lexicographic compare is a correct chronological one.
    events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return events;
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

  /** A short human summary of a sale's line items: "Rice +2 more" (null if none). */
  private summariseItems(items: SaleForTimeline['items']): string | null {
    if (items.length === 0) return null;
    const [first, ...rest] = items;
    return rest.length > 0 ? `${first.name} +${rest.length} more` : first.name;
  }

  /**
   * How much is still owed on a sale, derived exactly as {@link SalesService}
   * does in its `toDto` (the single source of truth): PAID owes nothing, PARTIAL
   * owes `total − paidAmount` floored at 0, UNPAID owes the whole total.
   */
  private owedOn(sale: SaleForTimeline): Prisma.Decimal {
    if (sale.paymentStatus === PaymentStatus.PAID) return new Prisma.Decimal(0);
    if (sale.paymentStatus === PaymentStatus.PARTIAL) {
      const paid = sale.debt?.paidAmount ?? new Prisma.Decimal(0);
      const owed = sale.total.minus(paid);
      return owed.lessThan(0) ? new Prisma.Decimal(0) : owed;
    }
    return sale.total; // UNPAID
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
