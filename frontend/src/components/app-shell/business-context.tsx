'use client';

import { createContext, useContext } from 'react';
import type { BusinessSummary } from '@remindam/shared';

/**
 * Client-side access to the active business, resolved on the server and passed
 * down through the shell. This is a **display convenience only** — the server
 * always re-resolves and re-validates the active business from the session and
 * cookie before trusting it (§11/§46); client code must never send a business
 * id as an authorization claim.
 */
export interface BusinessContextValue {
  active: BusinessSummary;
  businesses: BusinessSummary[];
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

export function BusinessProvider({
  value,
  children,
}: {
  value: BusinessContextValue;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <BusinessContext.Provider value={value}>
      {children}
    </BusinessContext.Provider>
  );
}

/** Read the active business inside the shell. Throws if used outside it. */
export function useActiveBusiness(): BusinessContextValue {
  const ctx = useContext(BusinessContext);
  if (!ctx) {
    throw new Error('useActiveBusiness must be used within a BusinessProvider');
  }
  return ctx;
}
