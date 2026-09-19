import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

/**
 * Guided customer import (§24), scoped to a business. Imports {@link AuthModule}
 * for the verification guard and {@link UsersModule} to resolve the local user
 * from the verified Clerk id. PrismaService is available globally.
 */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
