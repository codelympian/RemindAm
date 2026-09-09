'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BusinessSummary } from '@remindam/shared';
import { setActiveBusinessCookie } from '@/lib/active-business';

/**
 * Minimal active-business selector, shown only when the caller belongs to more
 * than one business. It writes the non-secret cookie and refreshes so the server
 * re-resolves — and re-validates — the active business. Full switching UX is
 * Phase 3.
 */
export function BusinessSwitcher({
  businesses,
  activeId,
}: {
  businesses: BusinessSummary[];
  activeId: string;
}): React.JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <select
      aria-label="Active business"
      value={activeId}
      disabled={pending}
      onChange={(event) => {
        setActiveBusinessCookie(event.target.value);
        setPending(true);
        router.refresh();
      }}
      className="rounded-lg border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
    >
      {businesses.map((business) => (
        <option key={business.id} value={business.id}>
          {business.name}
        </option>
      ))}
    </select>
  );
}
