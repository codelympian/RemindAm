import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

/**
 * Product CRUD, scoped to a business. Imports {@link AuthModule} for the
 * verification guard and {@link UsersModule} to resolve the local user from the
 * verified Clerk id. PrismaService is available globally.
 */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
