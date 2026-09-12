import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  type Lead,
  type LeadInteraction,
  type Paginated,
} from '@remindam/shared';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { type AuthenticatedRequest } from '../auth/authenticated-request';
import { ActiveBusinessId } from '../common/active-business-id.decorator';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { CreateLeadInteractionDto } from './dto/create-lead-interaction.dto';
import { ListLeadsQueryDto } from './dto/list-leads.query';
import { UpdateLeadDto } from './dto/update-lead.dto';

/**
 * `/api/leads` — leads CRUD scoped to the active business. The guard verifies the
 * session and sets `request.auth.clerkUserId`; `@ActiveBusinessId()` supplies the
 * business id from the `x-business-id` header, which the service re-validates
 * against the caller's membership before trusting (§11/§46).
 */
@Controller('leads')
@UseGuards(ClerkAuthGuard)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Query() query: ListLeadsQueryDto,
  ): Promise<Paginated<Lead>> {
    return this.leads.list(request.auth.clerkUserId, businessId, query);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Body() dto: CreateLeadDto,
  ): Promise<Lead> {
    return this.leads.create(request.auth.clerkUserId, businessId, dto);
  }

  @Get(':id')
  get(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Lead> {
    return this.leads.getOne(request.auth.clerkUserId, businessId, id);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
  ): Promise<Lead> {
    return this.leads.update(request.auth.clerkUserId, businessId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.leads.remove(request.auth.clerkUserId, businessId, id);
  }

  @Post(':id/interactions')
  addInteraction(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLeadInteractionDto,
  ): Promise<LeadInteraction> {
    return this.leads.addInteraction(
      request.auth.clerkUserId,
      businessId,
      id,
      dto,
    );
  }
}
