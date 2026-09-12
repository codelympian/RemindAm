import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

/**
 * Leads CRUD, scoped to a business. Imports {@link AuthModule} for the
 * verification guard and {@link UsersModule} to resolve the local user from the
 * verified Clerk id. PrismaService is available globally.
 */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
