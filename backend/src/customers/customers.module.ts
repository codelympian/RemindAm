import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

/**
 * Customer CRUD, scoped to a business. Imports {@link AuthModule} for the
 * verification guard and {@link UsersModule} to resolve the local user from the
 * verified Clerk id. PrismaService is available globally.
 */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
