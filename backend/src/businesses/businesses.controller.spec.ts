import { Test } from '@nestjs/testing';
import {
  type Business,
  type BusinessSummary,
  MembershipRole,
} from '@remindam/shared';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { type AuthenticatedRequest } from '../auth/authenticated-request';
import { BusinessesService } from './businesses.service';
import { BusinessesController } from './businesses.controller';
import { type CreateBusinessDto } from './dto/create-business.dto';

const businessDto: Business = {
  id: 'b-1',
  name: 'Ada Stores',
  phone: '+2348012345678',
  email: null,
  industry: 'Retail',
  customerTrackingMethod: 'WhatsApp',
  currency: 'NGN',
  timezone: 'Africa/Lagos',
  createdAt: '2026-09-09T10:00:00.000Z',
  updatedAt: '2026-09-09T10:00:00.000Z',
};

describe('BusinessesController', () => {
  const service = {
    create: jest.fn(),
    listForUser: jest.fn(),
    getForUser: jest.fn(),
  };
  const request = { auth: { clerkUserId: 'user_123' } } as AuthenticatedRequest;

  let controller: BusinessesController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [BusinessesController],
      providers: [{ provide: BusinessesService, useValue: service }],
    })
      // The guard is exercised in its own spec; here we only assert delegation.
      .overrideGuard(ClerkAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(BusinessesController);
  });

  it('delegates create with the guard-provided clerk id', async () => {
    const dto: CreateBusinessDto = {
      name: 'Ada Stores',
      industry: 'Retail',
      phone: '+2348012345678',
      customerTrackingMethod: 'WhatsApp',
    };
    service.create.mockResolvedValue(businessDto);

    const result = await controller.create(request, dto);

    expect(service.create).toHaveBeenCalledWith('user_123', dto);
    expect(result).toBe(businessDto);
  });

  it('delegates list with the guard-provided clerk id', async () => {
    const summaries: BusinessSummary[] = [
      {
        id: 'b-1',
        name: 'Ada Stores',
        industry: 'Retail',
        currency: 'NGN',
        role: MembershipRole.OWNER,
      },
    ];
    service.listForUser.mockResolvedValue(summaries);

    const result = await controller.list(request);

    expect(service.listForUser).toHaveBeenCalledWith('user_123');
    expect(result).toBe(summaries);
  });

  it('delegates get with the verified clerk id and the path id', async () => {
    service.getForUser.mockResolvedValue(businessDto);

    const result = await controller.get(request, 'b-1');

    expect(service.getForUser).toHaveBeenCalledWith('user_123', 'b-1');
    expect(result).toBe(businessDto);
  });
});
