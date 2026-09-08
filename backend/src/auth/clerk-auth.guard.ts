import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/backend';
import { type AuthenticatedRequest } from './authenticated-request';

/**
 * Verifies the incoming `Authorization: Bearer <token>` as a Clerk session
 * token and attaches the verified identity to `request.auth`.
 *
 * Verification is cryptographic (Clerk's JWKS, fetched+cached via the secret
 * key) — the client cannot forge or assert an identity. `authorizedParties`
 * pins the token's `azp` claim to our own frontend origins so a token minted
 * for another app cannot be replayed here.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);
  private readonly secretKey: string;
  private readonly authorizedParties: string[];

  constructor(private readonly config: ConfigService) {
    this.secretKey = this.config.getOrThrow<string>('CLERK_SECRET_KEY');
    this.authorizedParties = (
      this.config.get<string>('CLERK_AUTHORIZED_PARTIES') ??
      this.config.get<string>('CORS_ORIGINS') ??
      'http://localhost:3000'
    )
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const payload = await verifyToken(token, {
        secretKey: this.secretKey,
        authorizedParties: this.authorizedParties,
      });

      if (!payload.sub) {
        throw new UnauthorizedException('Token is missing a subject claim');
      }

      request.auth = { clerkUserId: payload.sub };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.warn(
        `Rejected session token: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new UnauthorizedException('Invalid or expired session token');
    }
  }

  private extractBearerToken(header: string | undefined): string | null {
    if (!header) {
      return null;
    }
    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !value) {
      return null;
    }
    return value.trim();
  }
}
