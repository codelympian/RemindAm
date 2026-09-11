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
import { type Paginated, type Sale } from '@remindam/shared';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { type AuthenticatedRequest } from '../auth/authenticated-request';
import { ActiveBusinessId } from '../common/active-business-id.decorator';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ListSalesQueryDto } from './dto/list-sales.query';
import { UpdateSaleDto } from './dto/update-sale.dto';

/**
 * `/api/sales` — sales CRUD scoped to the active business. The guard verifies
 * the session and sets `request.auth.clerkUserId`; `@ActiveBusinessId()` supplies
 * the business id from the `x-business-id` header, which the service re-validates
 * against the caller's membership before trusting (§11/§46).
 */
@Controller('sales')
@UseGuards(ClerkAuthGuard)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Query() query: ListSalesQueryDto,
  ): Promise<Paginated<Sale>> {
    return this.sales.list(request.auth.clerkUserId, businessId, query);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Body() dto: CreateSaleDto,
  ): Promise<Sale> {
    return this.sales.create(request.auth.clerkUserId, businessId, dto);
  }

  @Get(':id')
  get(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Sale> {
    return this.sales.getOne(request.auth.clerkUserId, businessId, id);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSaleDto,
  ): Promise<Sale> {
    return this.sales.update(request.auth.clerkUserId, businessId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.sales.remove(request.auth.clerkUserId, businessId, id);
  }
}
