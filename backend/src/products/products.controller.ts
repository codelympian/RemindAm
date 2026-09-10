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
import { type Paginated, type Product } from '@remindam/shared';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { type AuthenticatedRequest } from '../auth/authenticated-request';
import { ActiveBusinessId } from '../common/active-business-id.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products.query';
import { UpdateProductDto } from './dto/update-product.dto';

/**
 * `/api/products` — product CRUD scoped to the active business. The guard
 * verifies the session and sets `request.auth.clerkUserId`; `@ActiveBusinessId()`
 * supplies the business id from the `x-business-id` header, which the service
 * re-validates against the caller's membership before trusting (§11/§46).
 */
@Controller('products')
@UseGuards(ClerkAuthGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Query() query: ListProductsQueryDto,
  ): Promise<Paginated<Product>> {
    return this.products.list(request.auth.clerkUserId, businessId, query);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Body() dto: CreateProductDto,
  ): Promise<Product> {
    return this.products.create(request.auth.clerkUserId, businessId, dto);
  }

  /**
   * Declared **before** `@Get(':id')` on purpose: Nest matches routes in
   * declaration order, so the other way round `ParseUUIDPipe` would reject
   * `/products/categories` as a malformed id.
   */
  @Get('categories')
  categories(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
  ): Promise<string[]> {
    return this.products.listCategories(request.auth.clerkUserId, businessId);
  }

  @Get(':id')
  get(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Product> {
    return this.products.getOne(request.auth.clerkUserId, businessId, id);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<Product> {
    return this.products.update(request.auth.clerkUserId, businessId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Req() request: AuthenticatedRequest,
    @ActiveBusinessId() businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.products.remove(request.auth.clerkUserId, businessId, id);
  }
}
