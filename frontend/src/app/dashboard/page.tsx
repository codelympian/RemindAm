import { UserButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { BusinessSummary } from '@remindam/shared';
import { ACTIVE_BUSINESS_COOKIE } from '@/lib/active-business';
import { listBusinesses } from '@/services/api/businesses';
import { ApiRequestError } from '@/services/api/client';
import { BusinessSwitcher } from './business-switcher';
import { RetryButton } from './retry-button';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Loading the workspace can fail in materially different ways, and lumping them
 * all into "API unreachable" hides the real cause. We keep the distinction so
 * the UI can explain what actually happened — and so the failure is diagnosable.
 */
type LoadResult =
  | { ok: true; businesses: BusinessSummary[] }
  | {
      ok: false;
      kind: 'signed-out' | 'unreachable' | 'unauthorized' | 'error';
      status: number;
      detail: string;
    };

async function loadBusinesses(): Promise<LoadResult> {
  const { getToken } = await auth();
  const token = await getToken();

  if (!token) {
    return {
      ok: false,
      kind: 'signed-out',
      status: 401,
      detail: 'No Clerk session token was available on the server.',
    };
  }

  try {
    return { ok: true, businesses: await listBusinesses(token) };
  } catch (error) {
    if (error instanceof ApiRequestError) {
      const kind =
        error.status === 0
          ? 'unreachable'
          : error.status === 401 || error.status === 403
            ? 'unauthorized'
            : 'error';
      return { ok: false, kind, status: error.status, detail: error.message };
    }
    return {
      ok: false,
      kind: 'error',
      status: 500,
      detail: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const result = await loadBusinesses();

  // A read failure is different from "no businesses" — don't bounce to onboarding.
  if (!result.ok) {
    return <WorkspaceError result={result} />;
  }

  const { businesses } = result;

  // Per master prompt §15: never drop a user into an empty dashboard.
  if (businesses.length === 0) {
    redirect('/onboarding');
  }

  const cookieStore = await cookies();
  const requestedId = cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value;
  // Never trust the cookie blindly: honor it only if it maps to a real membership.
  const active =
    businesses.find((business) => business.id === requestedId) ?? businesses[0];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-primary">RemindAm</span>
          {businesses.length > 1 && (
            <BusinessSwitcher businesses={businesses} activeId={active.id} />
          )}
        </div>
        <nav className="flex items-center gap-3">
          <Link href="/account" className="text-sm font-medium hover:underline">
            Account
          </Link>
          <UserButton />
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome to {active.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {active.industry ? `${active.industry} · ` : ''}Your workspace is
            ready.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6">
          <h2 className="font-semibold">Your daily follow-up list is coming</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Customers, sales and the “who to contact today” recommendations
            arrive in the next phases. Your business is set up and ready for
            them.
          </p>
        </div>
      </main>
    </div>
  );
}

function WorkspaceError({
  result,
}: {
  result: Extract<LoadResult, { ok: false }>;
}): React.JSX.Element {
  const headline =
    result.kind === 'unreachable'
      ? 'We couldn’t reach the RemindAm API'
      : result.kind === 'signed-out'
        ? 'Your session isn’t ready yet'
        : 'We couldn’t load your workspace';

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-bold tracking-tight">{headline}</h1>
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          {result.kind === 'unreachable' ? (
            <>
              The backend at <code>{API_URL}</code> didn’t respond. Start it with{' '}
              <code>npm run dev:backend</code>, wait until it logs{' '}
              <code>listening on {API_URL}/api</code>, then try again.
            </>
          ) : result.kind === 'unauthorized' ? (
            <>
              The backend rejected your session (HTTP {result.status}). The
              server is running — this points to a Clerk key mismatch between
              the frontend and backend, or a system-clock skew, rather than a
              missing backend.
            </>
          ) : result.kind === 'signed-out' ? (
            <>
              Your session token wasn’t ready on the server. Try again in a
              moment, or sign out and back in.
            </>
          ) : (
            <>
              Something went wrong while loading your workspace (HTTP{' '}
              {result.status}).
            </>
          )}
        </p>
        <p className="font-mono text-xs text-destructive">
          {result.kind} · HTTP {result.status} · {result.detail}
        </p>
        <div>
          <RetryButton />
        </div>
      </div>
      <Link href="/" className="text-sm font-medium text-primary hover:underline">
        ← Back home
      </Link>
    </main>
  );
}
