import { Test } from '@nestjs/testing';
import {
  LeadStatus,
  type Lead,
  type LeadInteraction,
  type Paginated,
} from '@remindam/shared';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { type AuthenticatedRequest } from '../auth/authenticated-request';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { type CreateLeadDto } from './dto/create-lead.dto';
import { type UpdateLeadDto } from './dto/update-lead.dto';
import { type CreateLeadInteractionDto } from './dto/create-lead-interaction.dto';

const lead: Lead = {
  id: 'l-1',
  businessId: 'b-1',
  customerId: 'c-1',
  customerName: 'Chidi',
  source: 'WhatsApp',
  interestedProduct: 'Ankara fabric',
  status: LeadStatus.NEW,
  value: 15000,
  nextFollowUpAt: '2026-09-20T09:00:00.000Z',
  lastInteractionAt: '2026-09-12T10:00:00.000Z',
  interactions: [
    {
      id: 'li-1',
      leadId: 'l-1',
      note: 'Called, interested',
      createdAt: '2026-09-12T10:00:00.000Z',
    },
  ],
  createdAt: '2026-09-12T10:00:00.000Z',
  updatedAt: '2026-09-12T10:00:00.000Z',
};

describe('LeadsController', () => {
  const service = {
    list: jest.fn(),
    create: jest.fn(),
    getOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    addInteraction: jest.fn(),
  };
  const request = { auth: { clerkUserId: 'user_123' } } as AuthenticatedRequest;
  const businessId = 'b-1';

  let controller: LeadsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [LeadsController],
      providers: [{ provide: LeadsService, useValue: service }],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(LeadsController);
  });

  it('delegates list with the verified clerk id, active business id and query', async () => {
    const page: Paginated<Lead> = {
      data: [lead],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };
    service.list.mockResolvedValue(page);

    const result = await controller.list(request, businessId, {
      status: LeadStatus.NEW,
    });

    expect(service.list).toHaveBeenCalledWith('user_123', 'b-1', {
      status: LeadStatus.NEW,
    });
    expect(result).toBe(page);
  });

  it('delegates create with the verified clerk id and active business id', async () => {
    const dto: CreateLeadDto = { customerId: 'c-1' };
    service.create.mockResolvedValue(lead);

    const result = await controller.create(request, businessId, dto);

    expect(service.create).toHaveBeenCalledWith('user_123', 'b-1', dto);
    expect(result).toBe(lead);
  });

  it('delegates get with the path id', async () => {
    service.getOne.mockResolvedValue(lead);

    const result = await controller.get(request, businessId, 'l-1');

    expect(service.getOne).toHaveBeenCalledWith('user_123', 'b-1', 'l-1');
    expect(result).toBe(lead);
  });

  it('delegates update with the path id and body', async () => {
    const dto: UpdateLeadDto = { status: LeadStatus.WON };
    service.update.mockResolvedValue({ ...lead, status: LeadStatus.WON });

    const result = await controller.update(request, businessId, 'l-1', dto);

    expect(service.update).toHaveBeenCalledWith('user_123', 'b-1', 'l-1', dto);
    expect(result.status).toBe(LeadStatus.WON);
  });

  it('delegates remove with the path id', async () => {
    service.remove.mockResolvedValue(undefined);

    await controller.remove(request, businessId, 'l-1');

    expect(service.remove).toHaveBeenCalledWith('user_123', 'b-1', 'l-1');
  });

  it('delegates addInteraction with the path id and note body', async () => {
    const dto: CreateLeadInteractionDto = { note: 'Sent quote' };
    const interaction: LeadInteraction = {
      id: 'li-9',
      leadId: 'l-1',
      note: 'Sent quote',
      createdAt: '2026-09-12T11:00:00.000Z',
    };
    service.addInteraction.mockResolvedValue(interaction);

    const result = await controller.addInteraction(
      request,
      businessId,
      'l-1',
      dto,
    );

    expect(service.addInteraction).toHaveBeenCalledWith(
      'user_123',
      'b-1',
      'l-1',
      dto,
    );
    expect(result).toBe(interaction);
  });
});
