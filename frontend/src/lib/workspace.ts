import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { cache } from 'react';
import type { BusinessSummary } from '@remindam/shared';
import { ACTIVE_BUSINESS_COOKIE } from '@/lib/active-business';
import { listBusinesses } from '@/services/api/businesses';
import { ApiRequestError } from '@/services/api/client';

/**
 * The authenticated workspace, resolved on the server for every app route.
 * Loading can fail in materially different ways; keeping them distinct lets the
 * shell explain what actually happened instead of a blanket message — and keeps
 * failures diagnosable.
 */
export type WorkspaceResult =
  | { status: 'ready'; businesses: BusinessSummary[]; active: BusinessSummary }
  | { status: 'empty' }
  | {
      status: 'error';
      kind: 'signed-out' | 'unreachable' | 'unauthorized' | 'error';
      httpStatus: number;
      detail: string;
    };

/**
 * Loads the caller's businesses and resolves the active one from the non-secret
 * cookie — re-validated against real memberships, never trusted blindly
 * (master prompt §11/§46).
 *
 * Wrapped in React `cache()` so the app layout and the page it renders share a
 * single backend call within one request, instead of each fetching on its own.
 */
export const loadWorkspace = cache(async (): Promise<WorkspaceResult> => {
  const { getToken } = await auth();
  const token = await getToken();

  if (!token) {
    return {
      status: 'error',
      kind: 'signed-out',
      httpStatus: 401,
      detail: 'No Clerk session token was available on the server.',
    };
  }

  let businesses: BusinessSummary[];
  try {
    businesses = await listBusinesses(token);
  } catch (error) {
    if (error instanceof ApiRequestError) {
      const kind =
        error.status === 0
          ? 'unreachable'
          : error.status === 401 || error.status === 403
            ? 'unauthorized'
            : 'error';
      return {
        status: 'error',
        kind,
        httpStatus: error.status,
        detail: error.message,
      };
    }
    return {
      status: 'error',
      kind: 'error',
      httpStatus: 500,
      detail: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // A signed-in user with no business belongs in onboarding, not the shell.
  if (businesses.length === 0) {
    return { status: 'empty' };
  }

  const cookieStore = await cookies();
  const requestedId = cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value;
  // Honor the cookie only when it maps to a real membership; else fall back.
  const active =
    businesses.find((business) => business.id === requestedId) ?? businesses[0];

  return { status: 'ready', businesses, active };
});
