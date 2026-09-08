import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/backend';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { type AuthenticatedRequest } from './authenticated-request';

jest.mock('@clerk/backend');

const mockVerifyToken = verifyToken as jest.MockedFunction<typeof verifyToken>;

/** Minimal ExecutionContext exposing a mutable request object we can assert on. */
function makeContext(headers: Record<string, string>): {
  context: ExecutionContext;
  request: Partial<AuthenticatedRequest>;
} {
  const request: Partial<AuthenticatedRequest> = { headers } as never;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('ClerkAuthGuard', () => {
  const config = {
    getOrThrow: jest.fn().mockReturnValue('sk_test_secret'),
    get: jest.fn((key: string) =>
      key === 'CORS_ORIGINS' ? 'http://localhost:3000' : undefined,
    ),
  } as unknown as ConfigService;

  let guard: ClerkAuthGuard;

  beforeEach(() => {
    mockVerifyToken.mockReset();
    guard = new ClerkAuthGuard(config);
  });

  it('rejects a request with no bearer token', async () => {
    const { context } = makeContext({});
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it('accepts a verified token and attaches the Clerk identity', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'user_123' } as never);
    const { context, request } = makeContext({
      authorization: 'Bearer good.jwt.token',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.auth).toEqual({ clerkUserId: 'user_123' });
    expect(mockVerifyToken).toHaveBeenCalledWith(
      'good.jwt.token',
      expect.objectContaining({ secretKey: 'sk_test_secret' }),
    );
  });

  it('rejects a token that fails verification', async () => {
    mockVerifyToken.mockRejectedValue(new Error('token expired'));
    const { context } = makeContext({ authorization: 'Bearer bad.token' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a verified token that has no subject claim', async () => {
    mockVerifyToken.mockResolvedValue({} as never);
    const { context } = makeContext({ authorization: 'Bearer no.sub.token' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
