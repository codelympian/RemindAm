import { Test } from '@nestjs/testing';
import { type Customer, type Paginated } from '@remindam/shared';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { type AuthenticatedRequest } from '../auth/authenticated-request';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { type CreateCustomerDto } from './dto/create-customer.dto';
import { type UpdateCustomerDto } from './dto/update-customer.dto';

const customer: Customer = {
  id: 'c-1',
  businessId: 'b-1',
  name: 'Ada Okafor',
  phone: '+2348012345678',
  email: 'ada@example.com',
  notes: null,
  createdAt: '2026-09-10T10:00:00.000Z',
  updatedAt: '2026-09-10T10:00:00.000Z',
};

describe('CustomersController', () => {
  const service = {
    list: jest.fn(),
    create: jest.fn(),
    getOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const request = { auth: { clerkUserId: 'user_123' } } as AuthenticatedRequest;
  const businessId = 'b-1';

  let controller: CustomersController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [{ provide: CustomersService, useValue: service }],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(CustomersController);
  });

  it('delegates list with the verified clerk id, active business id and query', async () => {
    const page: Paginated<Customer> = {
      data: [customer],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };
    service.list.mockResolvedValue(page);

    const result = await controller.list(request, businessId, { q: 'ada' });

    expect(service.list).toHaveBeenCalledWith('user_123', 'b-1', { q: 'ada' });
    expect(result).toBe(page);
  });

  it('delegates create with the verified clerk id and active business id', async () => {
    const dto: CreateCustomerDto = { name: 'Ada Okafor' };
    service.create.mockResolvedValue(customer);

    const result = await controller.create(request, businessId, dto);

    expect(service.create).toHaveBeenCalledWith('user_123', 'b-1', dto);
    expect(result).toBe(customer);
  });

  it('delegates get with the path id', async () => {
    service.getOne.mockResolvedValue(customer);

    const result = await controller.get(request, businessId, 'c-1');

    expect(service.getOne).toHaveBeenCalledWith('user_123', 'b-1', 'c-1');
    expect(result).toBe(customer);
  });

  it('delegates update with the path id and body', async () => {
    const dto: UpdateCustomerDto = { name: 'Ada N.' };
    service.update.mockResolvedValue({ ...customer, name: 'Ada N.' });

    const result = await controller.update(request, businessId, 'c-1', dto);

    expect(service.update).toHaveBeenCalledWith('user_123', 'b-1', 'c-1', dto);
    expect(result.name).toBe('Ada N.');
  });

  it('delegates remove with the path id', async () => {
    service.remove.mockResolvedValue(undefined);

    await controller.remove(request, businessId, 'c-1');

    expect(service.remove).toHaveBeenCalledWith('user_123', 'b-1', 'c-1');
  });
});
