import { type Request } from 'express';

/**
 * The verified Clerk identity attached to a request by {@link ClerkAuthGuard}.
 * `clerkUserId` is the Clerk `sub` claim from a cryptographically verified
 * session token — never a client-supplied value.
 */
export interface ClerkAuth {
  clerkUserId: string;
}

export interface AuthenticatedRequest extends Request {
  auth: ClerkAuth;
}
