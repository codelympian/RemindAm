'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

/**
 * Re-runs the dashboard server component (which re-fetches the workspace) without
 * a full page reload. `useTransition` keeps `isPending` accurate for the whole
 * refresh and resets it automatically when the new render commits.
 */
export function RetryButton(): React.JSX.Element {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
    >
      {isPending ? 'Retrying…' : 'Try again'}
    </button>
  );
}
