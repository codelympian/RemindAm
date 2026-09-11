import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PaymentStatus } from '@prisma/client';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_PRODUCT_MONEY,
  PaymentStatus as ApiPaymentStatus,
  type Paginated,
  type Sale as SaleDto,
} from '@remindam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateSaleItemDto } from './dto/create-sale-item.dto';
import { ListSalesQueryDto } from './dto/list-sales.query';
import { UpdateSaleDto } from './dto/update-sale.dto';

/** Relations every sale response needs: its lines, its customer's name, its debt. */
const SALE_INCLUDE = {
  items: true,
  customer: { select: { name: true } },
  debt: true,
} satisfies Prisma.SaleInclude;

type SaleWithRelations = Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>;

/** The debt a sale should have, or `null` when nothing is owed (a PAID sale). */
interface DebtState {
  customerId: string;
  amount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
}

/**
 * Sales, scoped to a single business (tenant) — the same shape as
 * {@link ProductsService}. Every method takes the *verified* Clerk id (from the
 * guard) plus the business id (from the validated `x-business-id` header) and
 * first re-checks the caller's membership; a business id they aren't a member of
 * is treated as not found (§11/§46).
 *
 * The server owns every total, and keeps the linked {@link Debt} in lockstep
 * with the sale's payment status: an UNPAID or PARTIAL sale has a debt equal to
 * what is still owed, a PAID sale has none. Recording a sale deliberately does
 * not touch product stock — products are a catalogue in this build.
 */
@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /** A page of the business's sales, newest first, optionally filtered. */
  async list(
    clerkUserId: string,
    businessId: string,
    params: ListSalesQueryDto,
  ): Promise<Paginated<SaleDto>> {
    await this.resolveMembership(clerkUserId, businessId);

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE),
    );

    const where: Prisma.SaleWhereInput = {
      businessId,
      ...(params.customerId ? { customerId: params.customerId } : {}),
      ...(params.status ? { paymentStatus: params.status } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        include: SALE_INCLUDE,
        orderBy: { soldAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.sale.count({ where }),
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

  /**
   * Record a sale: validate the customer and any linked products belong to the
   * business, compute the totals, and write the sale, its line items and (when
   * unpaid/partial) its debt in one atomic nested create.
   */
  async create(
    clerkUserId: string,
    businessId: string,
    input: CreateSaleDto,
  ): Promise<SaleDto> {
    await this.resolveMembership(clerkUserId, businessId);

    const customerId = input.customerId ?? null;
    if (customerId) {
      await this.assertCustomerInBusiness(businessId, customerId);
    }
    await this.assertProductsInBusiness(businessId, input.items);

    const total = this.computeTotal(input.items, input.discount ?? 0);
    const status = input.paymentStatus ?? PaymentStatus.PAID;
    const debt = this.resolveDebtState(status, total, input.amountPaid, customerId);

    const sale = await this.prisma.sale.create({
      data: {
        businessId,
        customerId,
        discount: input.discount ?? 0,
        total,
        paymentStatus: status,
        ...(input.soldAt ? { soldAt: new Date(input.soldAt) } : {}),
        items: {
          create: input.items.map((item) => ({
            productId: item.productId ?? null,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        },
        ...(debt
          ? {
              debt: {
                create: {
                  customerId: debt.customerId,
                  amount: debt.amount,
                  paidAmount: debt.paidAmount,
                },
              },
            }
          : {}),
      },
      include: SALE_INCLUDE,
    });

    this.logger.log(`Recorded sale ${sale.id} in business ${businessId}`);
    return this.toDto(sale);
  }

  /** One sale, but only if it belongs to the active business (else 404). */
  async getOne(
    clerkUserId: string,
    businessId: string,
    id: string,
  ): Promise<SaleDto> {
    await this.resolveMembership(clerkUserId, businessId);
    return this.toDto(await this.findInBusiness(businessId, id));
  }

  /**
   * Update a sale's header fields (customer, discount, payment status, amount
   * paid, date). Line items are immutable here. The total is recomputed from the
   * existing lines whenever the discount changes, and the linked debt is
   * reconciled to match the new payment state — created, updated or deleted — in
   * the same transaction as the sale update.
   */
  async update(
    clerkUserId: string,
    businessId: string,
    id: string,
    input: UpdateSaleDto,
  ): Promise<SaleDto> {
    await this.resolveMembership(clerkUserId, businessId);
    const existing = await this.findInBusiness(businessId, id);

    // The values the sale will have after this edit (sent value, else current).
    const customerId =
      input.customerId !== undefined ? input.customerId : existing.customerId;
    const discount =
      input.discount !== undefined
        ? input.discount
        : existing.discount.toNumber();
    const status = input.paymentStatus ?? existing.paymentStatus;
    const amountPaid =
      input.amountPaid !== undefined
        ? input.amountPaid
        : existing.debt?.paidAmount.toNumber();

    if (input.customerId) {
      await this.assertCustomerInBusiness(businessId, input.customerId);
    }

    const total = this.computeTotal(
      existing.items.map((item) => ({
        quantity: item.quantity,
        unitPrice: item.unitPrice.toNumber(),
      })),
      discount,
    );
    const debt = this.resolveDebtState(status, total, amountPaid, customerId);

    const data: Prisma.SaleUpdateInput = {};
    if (input.customerId !== undefined) {
      data.customer = input.customerId
        ? { connect: { id: input.customerId } }
        : { disconnect: true };
    }
    if (input.discount !== undefined) {
      data.discount = discount;
      data.total = total; // total only moves when the discount does
    }
    if (input.paymentStatus !== undefined) data.paymentStatus = status;
    if (input.soldAt !== undefined) data.soldAt = new Date(input.soldAt);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.sale.update({ where: { id }, data });

      if (debt) {
        await tx.debt.upsert({
          where: { saleId: id },
          create: {
            saleId: id,
            customerId: debt.customerId,
            amount: debt.amount,
            paidAmount: debt.paidAmount,
          },
          update: {
            customerId: debt.customerId,
            amount: debt.amount,
            paidAmount: debt.paidAmount,
            paidAt: null,
          },
        });
      } else if (existing.debt) {
        await tx.debt.delete({ where: { saleId: id } });
      }

      return tx.sale.findUniqueOrThrow({ where: { id }, include: SALE_INCLUDE });
    });

    this.logger.log(`Updated sale ${id} in business ${businessId}`);
    return this.toDto(updated);
  }

  /**
   * Delete a sale. Its line items cascade at the database, but the debt would be
   * orphaned (`Debt.saleId` is `SetNull`, not cascade), so it is removed here in
   * the same transaction — a deleted sale must leave no phantom balance.
   */
  async remove(
    clerkUserId: string,
    businessId: string,
    id: string,
  ): Promise<void> {
    await this.resolveMembership(clerkUserId, businessId);
    const existing = await this.findInBusiness(businessId, id);

    await this.prisma.$transaction([
      ...(existing.debt
        ? [this.prisma.debt.delete({ where: { saleId: id } })]
        : []),
      this.prisma.sale.delete({ where: { id } }),
    ]);

    this.logger.log(`Deleted sale ${id} in business ${businessId}`);
  }

  /**
   * Resolve the local user for the verified Clerk id and assert they are a member
   * of the business — the same non-leaking 404 as reading a business the caller
   * doesn't belong to.
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

  /** A sale (with its relations) that must belong to `businessId`, or a 404. */
  private async findInBusiness(
    businessId: string,
    id: string,
  ): Promise<SaleWithRelations> {
    const sale = await this.prisma.sale.findFirst({
      where: { id, businessId },
      include: SALE_INCLUDE,
    });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    return sale;
  }

  /**
   * A customer referenced in the body must belong to the active business. This is
   * bad *input* (a 400), distinct from asking for a sale that doesn't exist (404).
   */
  private async assertCustomerInBusiness(
    businessId: string,
    customerId: string,
  ): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId },
      select: { id: true },
    });
    if (!customer) {
      throw new BadRequestException(
        'The selected customer was not found in this business.',
      );
    }
  }

  /** Every product referenced by a line item must belong to the active business. */
  private async assertProductsInBusiness(
    businessId: string,
    items: CreateSaleItemDto[],
  ): Promise<void> {
    const ids = [
      ...new Set(
        items
          .map((item) => item.productId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];
    if (ids.length === 0) return;

    const found = await this.prisma.product.findMany({
      where: { businessId, id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException(
        'One or more selected products were not found in this business.',
      );
    }
  }

  /**
   * Subtotal is Σ(quantity × unit price); the grand total is that less the
   * discount, floored at zero. Guarded against overflowing the `Decimal(14, 2)`
   * column so an absurd sale fails as a 400 rather than a 500 from Postgres.
   */
  private computeTotal(
    items: { quantity: number; unitPrice: number }[],
    discount: number,
  ): Prisma.Decimal {
    const subtotal = items.reduce(
      (acc, item) =>
        acc.plus(new Prisma.Decimal(item.unitPrice).times(item.quantity)),
      new Prisma.Decimal(0),
    );
    if (subtotal.greaterThan(MAX_PRODUCT_MONEY)) {
      throw new BadRequestException('The sale total is too large.');
    }
    const total = subtotal.minus(discount);
    return total.lessThan(0) ? new Prisma.Decimal(0) : total;
  }

  /**
   * The debt a sale should carry given its payment state, or `null` for a PAID
   * sale. Enforces the rules that make the "who owes me" data trustworthy: an
   * unpaid or partial sale must have a customer (a debt belongs to someone), and
   * a partial payment must be more than nothing and less than the full total.
   */
  private resolveDebtState(
    status: PaymentStatus,
    total: Prisma.Decimal,
    amountPaid: number | undefined,
    customerId: string | null,
  ): DebtState | null {
    if (status === PaymentStatus.PAID) return null;

    if (!customerId) {
      throw new BadRequestException(
        'Select a customer for an unpaid or partial sale.',
      );
    }

    if (status === PaymentStatus.UNPAID) {
      return { customerId, amount: total, paidAmount: new Prisma.Decimal(0) };
    }

    // PARTIAL
    if (amountPaid === undefined) {
      throw new BadRequestException(
        'Enter how much was paid for a partial sale.',
      );
    }
    const paid = new Prisma.Decimal(amountPaid);
    if (paid.lessThanOrEqualTo(0) || paid.greaterThanOrEqualTo(total)) {
      throw new BadRequestException(
        'The amount paid must be more than zero and less than the sale total.',
      );
    }
    return { customerId, amount: total, paidAmount: paid };
  }

  private toDto(sale: SaleWithRelations): SaleDto {
    const items = sale.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toNumber(),
      lineTotal: item.unitPrice.times(item.quantity).toNumber(),
    }));

    const subtotal = sale.items.reduce(
      (acc, item) => acc.plus(item.unitPrice.times(item.quantity)),
      new Prisma.Decimal(0),
    );
    const total = sale.total;

    // Paid / owed are derived from the status and the linked debt, never stored
    // twice — the sale's total and the debt's paidAmount are the sources of truth.
    let amountPaid = new Prisma.Decimal(0);
    let amountOwed = new Prisma.Decimal(0);
    if (sale.paymentStatus === PaymentStatus.PAID) {
      amountPaid = total;
    } else if (sale.paymentStatus === PaymentStatus.PARTIAL) {
      amountPaid = sale.debt?.paidAmount ?? new Prisma.Decimal(0);
      const owed = total.minus(amountPaid);
      amountOwed = owed.lessThan(0) ? new Prisma.Decimal(0) : owed;
    } else {
      amountOwed = total;
    }

    return {
      id: sale.id,
      businessId: sale.businessId,
      customerId: sale.customerId,
      customerName: sale.customer?.name ?? null,
      items,
      subtotal: subtotal.toNumber(),
      discount: sale.discount.toNumber(),
      total: total.toNumber(),
      // Prisma and the shared enum share identical string values.
      paymentStatus: ApiPaymentStatus[sale.paymentStatus],
      amountPaid: amountPaid.toNumber(),
      amountOwed: amountOwed.toNumber(),
      soldAt: sale.soldAt.toISOString(),
      createdAt: sale.createdAt.toISOString(),
      updatedAt: sale.updatedAt.toISOString(),
    };
  }
}
