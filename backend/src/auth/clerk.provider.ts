import { type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type ClerkClient, createClerkClient } from '@clerk/backend';

/**
 * Injection token for the Clerk Backend API client. Used to look up a user's
 * canonical profile (email/name) when synchronizing a local `User` record.
 */
export const CLERK_CLIENT = 'CLERK_CLIENT';

export const clerkClientProvider: Provider = {
  provide: CLERK_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): ClerkClient => {
    // getOrThrow => the app fails fast at startup with a clear message if the
    // secret key is missing, rather than at the first authenticated request.
    const secretKey = config.getOrThrow<string>('CLERK_SECRET_KEY');
    return createClerkClient({ secretKey });
  },
};
