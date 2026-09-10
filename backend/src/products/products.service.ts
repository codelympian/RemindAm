import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Product as ProductRow } from '@prisma/client';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type CreateProductInput,
  type Paginated,
  type Product as ProductDto,
  type ProductListParams,
  type UpdateProductInput,
} from '@remindam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

/**
 * Product CRUD, scoped to a single business (tenant) — the same shape as
 * {@link CustomersService}. Every method takes the *verified* Clerk id (from the
 * guard) plus the business id (from the validated `x-business-id` header) and
 * first re-checks the caller's membership; a business id they aren't a member of
 * is treated as not found (master prompt §11/§46). Reads and writes are always
 * filtered by `businessId`, so one business can never see or touch another's
 * catalogue.
 */
@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /**
   * A page of the business's catalogue, ordered by name, optionally filtered by
   * a name/SKU search and by active status.
   */
  async list(
    clerkUserId: string,
    businessId: string,
    params: ProductListParams,
  ): Promise<Paginated<ProductDto>> {
    await this.resolveMembership(clerkUserId, businessId);

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE),
    );
    const q = params.q?.trim();

    const where: Prisma.ProductWhereInput = {
      businessId,
      ...(params.active === undefined ? {} : { active: params.active }),
      ...(params.category ? { category: params.category } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: Prisma.QueryMode.insensitive } },
              { sku: { contains: q, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
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
   * The distinct categories actually in use in this business's catalogue,
   * alphabetically. Powers the category filter and the form's suggestion list,
   * so the UI never has to invent a category vocabulary.
   */
  async listCategories(
    clerkUserId: string,
    businessId: string,
  ): Promise<string[]> {
    await this.resolveMembership(clerkUserId, businessId);

    const rows = await this.prisma.product.findMany({
      where: { businessId, category: { not: null } },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });

    return rows
      .map((row) => row.category)
      .filter((category): category is string => category !== null);
  }

  /** Create a product in the active business's catalogue. */
  async create(
    clerkUserId: string,
    businessId: string,
    input: CreateProductInput,
  ): Promise<ProductDto> {
    await this.resolveMembership(clerkUserId, businessId);

    try {
      const product = await this.prisma.product.create({
        data: {
          businessId,
          name: input.name,
          sku: input.sku ?? null,
          category: input.category ?? null,
          description: input.description ?? null,
          price: input.price ?? 0,
          cost: input.cost ?? 0,
          stockQuantity: input.stockQuantity ?? 0,
          reorderThreshold: input.reorderThreshold ?? 0,
          active: input.active ?? true,
        },
      });
      this.logger.log(`Created product ${product.id} in business ${businessId}`);
      return this.toDto(product);
    } catch (error) {
      throw this.writeError(error, input.sku ?? null);
    }
  }

  /** One product, but only if it belongs to the active business (else 404). */
  async getOne(
    clerkUserId: string,
    businessId: string,
    id: string,
  ): Promise<ProductDto> {
    await this.resolveMembership(clerkUserId, businessId);
    return this.toDto(await this.findInBusiness(businessId, id));
  }

  /** Update the provided fields of a product in the active business. */
  async update(
    clerkUserId: string,
    businessId: string,
    id: string,
    input: UpdateProductInput,
  ): Promise<ProductDto> {
    await this.resolveMembership(clerkUserId, businessId);
    await this.findInBusiness(businessId, id);

    // Only touch fields the caller actually sent; `null` clears, omitted keeps.
    const data: Prisma.ProductUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.sku !== undefined) data.sku = input.sku;
    if (input.category !== undefined) data.category = input.category;
    if (input.description !== undefined) data.description = input.description;
    if (input.price !== undefined) data.price = input.price;
    if (input.cost !== undefined) data.cost = input.cost;
    if (input.stockQuantity !== undefined) {
      data.stockQuantity = input.stockQuantity;
    }
    if (input.reorderThreshold !== undefined) {
      data.reorderThreshold = input.reorderThreshold;
    }
    if (input.active !== undefined) data.active = input.active;

    try {
      return this.toDto(
        await this.prisma.product.update({ where: { id }, data }),
      );
    } catch (error) {
      throw this.writeError(error, input.sku ?? null);
    }
  }

  /** Delete a product from the active business's catalogue. */
  async remove(
    clerkUserId: string,
    businessId: string,
    id: string,
  ): Promise<void> {
    await this.resolveMembership(clerkUserId, businessId);
    await this.findInBusiness(businessId, id);
    await this.prisma.product.delete({ where: { id } });
    this.logger.log(`Deleted product ${id} in business ${businessId}`);
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

  /** A product that must belong to `businessId`, or a non-leaking 404. */
  private async findInBusiness(
    businessId: string,
    id: string,
  ): Promise<ProductRow> {
    const product = await this.prisma.product.findFirst({
      where: { id, businessId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  /**
   * Turn the unique-constraint violation on `(business_id, sku)` into a 409 the
   * UI can show, instead of letting it surface as an opaque 500. Anything else
   * is passed through untouched.
   */
  private writeError(error: unknown, sku: string | null): Error {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(
        sku
          ? `A product with SKU "${sku}" already exists.`
          : 'That SKU is already used by another product.',
      );
    }
    return error instanceof Error
      ? error
      : new Error('Unexpected error saving the product');
  }

  private toDto(product: ProductRow): ProductDto {
    return {
      id: product.id,
      businessId: product.businessId,
      name: product.name,
      sku: product.sku,
      category: product.category,
      description: product.description,
      price: product.price.toNumber(),
      cost: product.cost.toNumber(),
      stockQuantity: product.stockQuantity,
      reorderThreshold: product.reorderThreshold,
      active: product.active,
      // Only meaningful once a threshold is actually set — otherwise every
      // product with no stock would claim to be low (§36).
      lowStock:
        product.reorderThreshold > 0 &&
        product.stockQuantity <= product.reorderThreshold,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }
}
