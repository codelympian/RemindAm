import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  LeadStatus,
  type LeadInteraction as LeadInteractionModel,
} from '@prisma/client';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  LeadStatus as ApiLeadStatus,
  type Lead as LeadDto,
  type LeadInteraction as LeadInteractionDto,
  type Paginated,
} from '@remindam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { CreateLeadInteractionDto } from './dto/create-lead-interaction.dto';
import { ListLeadsQueryDto } from './dto/list-leads.query';
import { UpdateLeadDto } from './dto/update-lead.dto';

/** Relations every lead response needs: its customer's name and its interactions. */
const LEAD_INCLUDE = {
  customer: { select: { name: true } },
  interactions: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.LeadInclude;

type LeadWithRelations = Prisma.LeadGetPayload<{ include: typeof LEAD_INCLUDE }>;

/**
 * Leads, scoped to a single business (tenant) — the same shape as
 * {@link SalesService}. Every method takes the *verified* Clerk id (from the
 * guard) plus the business id (from the validated `x-business-id` header) and
 * first re-checks the caller's membership; a business id they aren't a member of
 * is treated as not found (§11/§46).
 *
 * A lead always names a customer (create requires it), so its interactions feed
 * that customer's intelligence in later phases. Status is a plain field: moving a
 * lead to WON has **no** side effect — recording the actual sale stays the Sales
 * screen's job (deterministic, §46).
 */
@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /** A page of the business's leads, newest first, optionally filtered. */
  async list(
    clerkUserId: string,
    businessId: string,
    params: ListLeadsQueryDto,
  ): Promise<Paginated<LeadDto>> {
    await this.resolveMembership(clerkUserId, businessId);

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE),
    );

    const where: Prisma.LeadWhereInput = {
      businessId,
      ...(params.customerId ? { customerId: params.customerId } : {}),
      ...(params.status ? { status: params.status } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: LEAD_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.lead.count({ where }),
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
   * Create a lead: validate the customer belongs to the business (required — a
   * lead always names one), then write the lead and, when a first `note` is
   * given, its opening interaction in one atomic nested create. `status` defaults
   * to NEW and `value` to 0.
   */
  async create(
    clerkUserId: string,
    businessId: string,
    input: CreateLeadDto,
  ): Promise<LeadDto> {
    await this.resolveMembership(clerkUserId, businessId);
    await this.assertCustomerInBusiness(businessId, input.customerId);

    const lead = await this.prisma.lead.create({
      data: {
        businessId,
        customerId: input.customerId,
        source: input.source ?? null,
        interestedProduct: input.interestedProduct ?? null,
        status: input.status ?? LeadStatus.NEW,
        value: input.value ?? 0,
        nextFollowUpAt: input.nextFollowUpAt
          ? new Date(input.nextFollowUpAt)
          : null,
        ...(input.note
          ? { interactions: { create: { note: input.note } } }
          : {}),
      },
      include: LEAD_INCLUDE,
    });

    this.logger.log(`Created lead ${lead.id} in business ${businessId}`);
    return this.toDto(lead);
  }

  /** One lead, but only if it belongs to the active business (else 404). */
  async getOne(
    clerkUserId: string,
    businessId: string,
    id: string,
  ): Promise<LeadDto> {
    await this.resolveMembership(clerkUserId, businessId);
    return this.toDto(await this.findInBusiness(businessId, id));
  }

  /**
   * Update a lead. The customer can be reassigned (never cleared — a lead always
   * names one); an explicit `null` clears `source`, `interestedProduct` or
   * `nextFollowUpAt`. Only the fields actually sent are assigned. Status is
   * written straight through — no side effects.
   */
  async update(
    clerkUserId: string,
    businessId: string,
    id: string,
    input: UpdateLeadDto,
  ): Promise<LeadDto> {
    await this.resolveMembership(clerkUserId, businessId);
    await this.findInBusiness(businessId, id);

    if (input.customerId != null) {
      await this.assertCustomerInBusiness(businessId, input.customerId);
    }

    const data: Prisma.LeadUpdateInput = {};
    if (input.customerId != null) {
      data.customer = { connect: { id: input.customerId } };
    }
    if (input.source !== undefined) data.source = input.source;
    if (input.interestedProduct !== undefined) {
      data.interestedProduct = input.interestedProduct;
    }
    if (input.status !== undefined) data.status = input.status;
    if (input.value !== undefined) data.value = input.value;
    if (input.nextFollowUpAt !== undefined) {
      data.nextFollowUpAt =
        input.nextFollowUpAt === null ? null : new Date(input.nextFollowUpAt);
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data,
      include: LEAD_INCLUDE,
    });

    this.logger.log(`Updated lead ${id} in business ${businessId}`);
    return this.toDto(updated);
  }

  /**
   * Delete a lead. Its interactions cascade at the database
   * (`LeadInteraction.lead` is `onDelete: Cascade`), so there is no side table to
   * clean up — a single delete, no transaction.
   */
  async remove(
    clerkUserId: string,
    businessId: string,
    id: string,
  ): Promise<void> {
    await this.resolveMembership(clerkUserId, businessId);
    await this.findInBusiness(businessId, id);

    await this.prisma.lead.delete({ where: { id } });

    this.logger.log(`Deleted lead ${id} in business ${businessId}`);
  }

  /**
   * Log one immutable interaction against a lead. The lead must belong to the
   * active business (else 404); the note is an add-only audit entry that becomes
   * the lead's new last-contact point.
   */
  async addInteraction(
    clerkUserId: string,
    businessId: string,
    leadId: string,
    input: CreateLeadInteractionDto,
  ): Promise<LeadInteractionDto> {
    await this.resolveMembership(clerkUserId, businessId);
    await this.findInBusiness(businessId, leadId);

    const interaction = await this.prisma.leadInteraction.create({
      data: { leadId, note: input.note },
    });

    this.logger.log(`Logged interaction on lead ${leadId} in ${businessId}`);
    return this.toInteractionDto(interaction);
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

  /** A lead (with its relations) that must belong to `businessId`, or a 404. */
  private async findInBusiness(
    businessId: string,
    id: string,
  ): Promise<LeadWithRelations> {
    const lead = await this.prisma.lead.findFirst({
      where: { id, businessId },
      include: LEAD_INCLUDE,
    });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    return lead;
  }

  /**
   * A customer referenced in the body must belong to the active business. This is
   * bad *input* (a 400), distinct from asking for a lead that doesn't exist (404).
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

  private toDto(lead: LeadWithRelations): LeadDto {
    return {
      id: lead.id,
      businessId: lead.businessId,
      customerId: lead.customerId,
      customerName: lead.customer?.name ?? null,
      source: lead.source,
      interestedProduct: lead.interestedProduct,
      // Prisma and the shared enum share identical string values.
      status: ApiLeadStatus[lead.status],
      value: lead.value.toNumber(),
      nextFollowUpAt: lead.nextFollowUpAt
        ? lead.nextFollowUpAt.toISOString()
        : null,
      // interactions are ordered newest-first, so the head is the last contact.
      lastInteractionAt: lead.interactions[0]?.createdAt.toISOString() ?? null,
      interactions: lead.interactions.map((i) => this.toInteractionDto(i)),
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
    };
  }

  private toInteractionDto(
    interaction: LeadInteractionModel,
  ): LeadInteractionDto {
    return {
      id: interaction.id,
      leadId: interaction.leadId,
      note: interaction.note,
      createdAt: interaction.createdAt.toISOString(),
    };
  }
}
