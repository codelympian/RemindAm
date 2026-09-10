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
import { type Customer, type Paginated } from '@remindam/shared';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { type AuthenticatedRequest } from '../auth/authenticated-request';
import { ActiveBusinessId } from '../common/active-business-id.decorator';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ListCustomersQueryDto } from './dto/list-customers.query';
import { UpdateCustomerDto } from './dto/update-customer.dto';

/**
 * `/api/customers` — customer CRUD scoped to the active business. The guard
 * verifies the session and sets `request.auth.clerkUserId`; `@ActiveBusinessId()`
 * supplies the business id from the `x-business-id` header, which the service
 * re-validates against the caller's membership before trusting (§11/§46).
 */
@Controller('customers')
@UseGuards(ClerkAuthGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Query() query: ListCustomersQueryDto,
  ): Promise<Paginated<Customer>> {
    return this.customers.list(request.auth.clerkUserId, businessId, query);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Body() dto: CreateCustomerDto,
  ): Promise<Customer> {
    return this.customers.create(request.auth.clerkUserId, businessId, dto);
  }

  @Get(':id')
  get(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Customer> {
    return this.customers.getOne(request.auth.clerkUserId, businessId, id);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<Customer> {
    return this.customers.update(request.auth.clerkUserId, businessId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.customers.remove(request.auth.clerkUserId, businessId, id);
  }
}
