'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * App-wide client providers. Holds a single {@link QueryClient} for the browser
 * session (created lazily so it stays stable across re-renders). Mounted inside
 * `<ClerkProvider>` in the root layout so `useAuth` and friends are available to
 * every query and mutation.
 */
export function Providers({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
