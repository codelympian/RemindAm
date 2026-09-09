import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { type Business, type BusinessSummary } from '@remindam/shared';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { type AuthenticatedRequest } from '../auth/authenticated-request';
import { BusinessesService } from './businesses.service';
import { CreateBusinessDto } from './dto/create-business.dto';

/**
 * `/api/businesses` — create, list, and read the caller's businesses. The guard
 * verifies the session and sets `request.auth.clerkUserId`; every handler passes
 * that verified id down, never a client-supplied identity.
 */
@Controller('businesses')
@UseGuards(ClerkAuthGuard)
export class BusinessesController {
  constructor(private readonly businesses: BusinessesService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateBusinessDto,
  ): Promise<Business> {
    return this.businesses.create(request.auth.clerkUserId, dto);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest): Promise<BusinessSummary[]> {
    return this.businesses.listForUser(request.auth.clerkUserId);
  }

  @Get(':id')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Business> {
    return this.businesses.getForUser(request.auth.clerkUserId, id);
  }
}
