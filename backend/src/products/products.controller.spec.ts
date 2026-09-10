import { Test } from '@nestjs/testing';
import { type Paginated, type Product } from '@remindam/shared';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { type AuthenticatedRequest } from '../auth/authenticated-request';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { type CreateProductDto } from './dto/create-product.dto';
import { type UpdateProductDto } from './dto/update-product.dto';

const product: Product = {
  id: 'p-1',
  businessId: 'b-1',
  name: 'Ankara fabric',
  sku: 'ANK-001',
  category: 'Fabrics',
  description: null,
  price: 2500,
  cost: 1800,
  stockQuantity: 12,
  reorderThreshold: 0,
  active: true,
  lowStock: false,
  createdAt: '2026-09-10T10:00:00.000Z',
  updatedAt: '2026-09-10T10:00:00.000Z',
};

describe('ProductsController', () => {
  const service = {
    list: jest.fn(),
    listCategories: jest.fn(),
    create: jest.fn(),
    getOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const request = { auth: { clerkUserId: 'user_123' } } as AuthenticatedRequest;
  const businessId = 'b-1';

  let controller: ProductsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: service }],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(ProductsController);
  });

  it('delegates list with the verified clerk id, active business id and query', async () => {
    const page: Paginated<Product> = {
      data: [product],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };
    service.list.mockResolvedValue(page);

    const result = await controller.list(request, businessId, { q: 'ank' });

    expect(service.list).toHaveBeenCalledWith('user_123', 'b-1', { q: 'ank' });
    expect(result).toBe(page);
  });

  it('delegates create with the verified clerk id and active business id', async () => {
    const dto: CreateProductDto = { name: 'Ankara fabric' };
    service.create.mockResolvedValue(product);

    const result = await controller.create(request, businessId, dto);

    expect(service.create).toHaveBeenCalledWith('user_123', 'b-1', dto);
    expect(result).toBe(product);
  });

  it('delegates categories with the verified clerk id and active business id', async () => {
    service.listCategories.mockResolvedValue(['Drinks', 'Fabrics']);

    const result = await controller.categories(request, businessId);

    expect(service.listCategories).toHaveBeenCalledWith('user_123', 'b-1');
    expect(result).toEqual(['Drinks', 'Fabrics']);
  });

  it('delegates get with the path id', async () => {
    service.getOne.mockResolvedValue(product);

    const result = await controller.get(request, businessId, 'p-1');

    expect(service.getOne).toHaveBeenCalledWith('user_123', 'b-1', 'p-1');
    expect(result).toBe(product);
  });

  it('delegates update with the path id and body', async () => {
    const dto: UpdateProductDto = { price: 3000 };
    service.update.mockResolvedValue({ ...product, price: 3000 });

    const result = await controller.update(request, businessId, 'p-1', dto);

    expect(service.update).toHaveBeenCalledWith('user_123', 'b-1', 'p-1', dto);
    expect(result.price).toBe(3000);
  });

  it('delegates remove with the path id', async () => {
    service.remove.mockResolvedValue(undefined);

    await controller.remove(request, businessId, 'p-1');

    expect(service.remove).toHaveBeenCalledWith('user_123', 'b-1', 'p-1');
  });
});
