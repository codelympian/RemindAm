import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { BusinessesController } from './businesses.controller';
import { BusinessesService } from './businesses.service';

/**
 * Businesses (tenants) and owner memberships. Imports {@link AuthModule} for the
 * verification guard and {@link UsersModule} to resolve the local user from the
 * verified Clerk id. PrismaService is available globally.
 */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [BusinessesController],
  providers: [BusinessesService],
})
export class BusinessesModule {}
