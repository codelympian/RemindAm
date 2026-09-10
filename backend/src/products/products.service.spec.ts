import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ProductsService } from './products.service';

const now = new Date('2026-09-10T10:00:00.000Z');

const productRow = {
  id: 'p-1',
  businessId: 'b-1',
  name: 'Ankara fabric',
  sku: 'ANK-001',
  category: 'Fabrics',
  description: null,
  price: new Prisma.Decimal('2500.00'),
  cost: new Prisma.Decimal('1800.00'),
  stockQuantity: 12,
  reorderThreshold: 0,
  active: true,
  createdAt: now,
  updatedAt: now,
};

describe('ProductsService', () => {
  const prisma = {
    $transaction: jest.fn(),
    businessMembership: { findUnique: jest.fn() },
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const users = { getOrCreateFromClerk: jest.fn() };

  let service: ProductsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    users.getOrCreateFromClerk.mockResolvedValue({ id: 'user-1' });
    prisma.businessMembership.findUnique.mockResolvedValue({ id: 'm-1' });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: users },
      ],
    }).compile();

    service = moduleRef.get(ProductsService);
  });

  it('rejects a caller with no membership in the business as NotFound', async () => {
    prisma.businessMembership.findUnique.mockResolvedValue(null);

    await expect(service.list('clerk_1', 'b-x', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('lists products scoped to the business, by name, paginated', async () => {
    prisma.$transaction.mockResolvedValue([[productRow], 1]);

    const result = await service.list('clerk_1', 'b-1', {
      page: 1,
      pageSize: 20,
    });

    expect(users.getOrCreateFromClerk).toHaveBeenCalledWith('clerk_1');
    expect(prisma.businessMembership.findUnique).toHaveBeenCalledWith({
      where: { userId_businessId: { userId: 'user-1', businessId: 'b-1' } },
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { businessId: 'b-1' },
      orderBy: { name: 'asc' },
      skip: 0,
      take: 20,
    });
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('serializes Decimal money as numbers', async () => {
    prisma.$transaction.mockResolvedValue([[productRow], 1]);

    const result = await service.list('clerk_1', 'b-1', {});

    expect(result.data[0]).toMatchObject({
      id: 'p-1',
      price: 2500,
      cost: 1800,
      createdAt: now.toISOString(),
    });
  });

  it('flags low stock only when a reorder threshold is actually set', async () => {
    prisma.$transaction.mockResolvedValue([
      [
        { ...productRow, id: 'p-none', stockQuantity: 0, reorderThreshold: 0 },
        { ...productRow, id: 'p-low', stockQuantity: 2, reorderThreshold: 5 },
        { ...productRow, id: 'p-ok', stockQuantity: 9, reorderThreshold: 5 },
      ],
      3,
    ]);

    const result = await service.list('clerk_1', 'b-1', {});

    expect(result.data.map((p) => [p.id, p.lowStock])).toEqual([
      ['p-none', false],
      ['p-low', true],
      ['p-ok', false],
    ]);
  });

  it('applies a case-insensitive search across name and SKU', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.list('clerk_1', 'b-1', { q: 'ank' });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: 'b-1',
          OR: [
            { name: { contains: 'ank', mode: Prisma.QueryMode.insensitive } },
            { sku: { contains: 'ank', mode: Prisma.QueryMode.insensitive } },
          ],
        },
      }),
    );
  });

  it('filters by active status only when the caller asks for it', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.list('clerk_1', 'b-1', { active: false });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: 'b-1', active: false },
      }),
    );
  });

  it('narrows the list to one category when asked', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.list('clerk_1', 'b-1', { category: 'Fabrics' });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: 'b-1', category: 'Fabrics' },
      }),
    );
  });

  it('lists the distinct categories in use, dropping nulls', async () => {
    prisma.product.findMany.mockResolvedValue([
      { category: 'Drinks' },
      { category: 'Fabrics' },
    ]);

    const result = await service.listCategories('clerk_1', 'b-1');

    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { businessId: 'b-1', category: { not: null } },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    expect(result).toEqual(['Drinks', 'Fabrics']);
  });

  it('will not list categories for a business the caller is not a member of', async () => {
    prisma.businessMembership.findUnique.mockResolvedValue(null);

    await expect(
      service.listCategories('clerk_1', 'b-x'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('creates a product with business-scoped data and column defaults', async () => {
    prisma.product.create.mockResolvedValue(productRow);

    const result = await service.create('clerk_1', 'b-1', {
      name: 'Ankara fabric',
      sku: 'ANK-001',
      category: 'Fabrics',
      price: 2500,
    });

    expect(prisma.product.create).toHaveBeenCalledWith({
      data: {
        businessId: 'b-1',
        name: 'Ankara fabric',
        sku: 'ANK-001',
        category: 'Fabrics',
        description: null,
        price: 2500,
        cost: 0,
        stockQuantity: 0,
        reorderThreshold: 0,
        active: true,
      },
    });
    expect(result.id).toBe('p-1');
  });

  it('turns a duplicate SKU into a 409 rather than a 500', async () => {
    prisma.product.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.create('clerk_1', 'b-1', { name: 'Dup', sku: 'ANK-001' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns a single product that belongs to the active business', async () => {
    prisma.product.findFirst.mockResolvedValue(productRow);

    const result = await service.getOne('clerk_1', 'b-1', 'p-1');

    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: 'p-1', businessId: 'b-1' },
    });
    expect(result.id).toBe('p-1');
  });

  it('throws NotFound for a product id outside the active business', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(
      service.getOne('clerk_1', 'b-1', 'p-x'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates only the fields the caller sent, after confirming ownership', async () => {
    prisma.product.findFirst.mockResolvedValue(productRow);
    prisma.product.update.mockResolvedValue({
      ...productRow,
      price: new Prisma.Decimal('3000.00'),
    });

    const result = await service.update('clerk_1', 'b-1', 'p-1', {
      price: 3000,
    });

    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: 'p-1', businessId: 'b-1' },
    });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { price: 3000 },
    });
    expect(result.price).toBe(3000);
  });

  it('clears a nullable field when the caller sends null', async () => {
    prisma.product.findFirst.mockResolvedValue(productRow);
    prisma.product.update.mockResolvedValue({ ...productRow, sku: null });

    await service.update('clerk_1', 'b-1', 'p-1', { sku: null });

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { sku: null },
    });
  });

  it('will not update a product outside the active business', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(
      service.update('clerk_1', 'b-1', 'p-x', { name: 'Nope' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('deletes a product that belongs to the active business', async () => {
    prisma.product.findFirst.mockResolvedValue(productRow);
    prisma.product.delete.mockResolvedValue(productRow);

    await service.remove('clerk_1', 'b-1', 'p-1');

    expect(prisma.product.delete).toHaveBeenCalledWith({
      where: { id: 'p-1' },
    });
  });
});
