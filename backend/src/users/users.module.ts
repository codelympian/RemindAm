import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MeController } from './me.controller';
import { UsersService } from './users.service';

/**
 * Owns local user records synchronized from Clerk and the `/api/me` endpoint.
 * Imports {@link AuthModule} for the verification guard and Clerk client;
 * PrismaService is available globally.
 */
@Module({
  imports: [AuthModule],
  controllers: [MeController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
