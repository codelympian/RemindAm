import { Module } from '@nestjs/common';
import { clerkClientProvider } from './clerk.provider';
import { ClerkAuthGuard } from './clerk-auth.guard';

/**
 * Provides Clerk-backed authentication primitives: the Backend API client
 * (for user lookups) and the session-token verification guard. Both are
 * exported so feature modules can synchronize users and protect routes.
 */
@Module({
  providers: [clerkClientProvider, ClerkAuthGuard],
  exports: [clerkClientProvider, ClerkAuthGuard],
})
export class AuthModule {}
