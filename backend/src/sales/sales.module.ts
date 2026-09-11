import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

/**
 * Sales CRUD, scoped to a business. Imports {@link AuthModule} for the
 * verification guard and {@link UsersModule} to resolve the local user from the
 * verified Clerk id. PrismaService is available globally.
 */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
