import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import { type Request } from 'express';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Supplies the active business id from the `x-business-id` request header to a
 * controller handler, validating it is a UUID first.
 *
 * The value is only a *claim*: the service still re-checks the caller's
 * membership before trusting it (master prompt §11/§46). Validating the shape
 * here keeps a malformed header from reaching Prisma as an opaque 500 and gives
 * the client a clear 400 instead.
 */
export const ActiveBusinessId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const header = request.headers['x-business-id'];
    const value = Array.isArray(header) ? header[0] : header;
    if (!value || !UUID_RE.test(value)) {
      throw new BadRequestException('Missing or invalid x-business-id header');
    }
    return value;
  },
);
