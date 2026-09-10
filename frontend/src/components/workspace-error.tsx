import Link from 'next/link';
import { RetryButton } from './retry-button';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface WorkspaceErrorProps {
  kind: 'signed-out' | 'unreachable' | 'unauthorized' | 'error';
  httpStatus: number;
  detail: string;
}

/**
 * Full-screen failure state shown when the workspace can't be loaded — without a
 * business context there is no shell to render. Surfaces the real
 * `kind · HTTP status · detail` so the failure is diagnosable, plus a retry.
 */
export function WorkspaceError({
  kind,
  httpStatus,
  detail,
}: WorkspaceErrorProps): React.JSX.Element {
  const headline =
    kind === 'unreachable'
      ? 'We couldn’t reach the RemindAm API'
      : kind === 'signed-out'
        ? 'Your session isn’t ready yet'
        : 'We couldn’t load your workspace';

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-bold tracking-tight">{headline}</h1>
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          {kind === 'unreachable' ? (
            <>
              The backend at <code>{API_URL}</code> didn’t respond. Start it with{' '}
              <code>npm run dev:backend</code>, wait until it logs{' '}
              <code>listening on {API_URL}/api</code>, then try again.
            </>
          ) : kind === 'unauthorized' ? (
            <>
              The backend rejected your session (HTTP {httpStatus}). The server
              is running — this points to a Clerk key mismatch between the
              frontend and backend, or a system-clock skew, rather than a missing
              backend.
            </>
          ) : kind === 'signed-out' ? (
            <>
              Your session token wasn’t ready on the server. Try again in a
              moment, or sign out and back in.
            </>
          ) : (
            <>
              Something went wrong while loading your workspace (HTTP{' '}
              {httpStatus}).
            </>
          )}
        </p>
        <p className="font-mono text-xs text-destructive">
          {kind} · HTTP {httpStatus} · {detail}
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
