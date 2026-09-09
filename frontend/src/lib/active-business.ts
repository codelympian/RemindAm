/**
 * The active-business selection is a **non-secret UI hint** stored in a cookie.
 * The server never trusts it blindly — it always re-validates the id against the
 * caller's memberships before using it (master prompt §11/§46). Full business
 * context and switching arrive in Phase 3.
 */
export const ACTIVE_BUSINESS_COOKIE = 'remindam_active_business';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Persist the chosen business id (client-side only; a no-op during SSR). */
export function setActiveBusinessCookie(businessId: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${ACTIVE_BUSINESS_COOKIE}=${encodeURIComponent(
    businessId,
  )}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

/** Read the chosen business id in the browser, or `null` when unset. */
export function readActiveBusinessCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${ACTIVE_BUSINESS_COOKIE}=`;
  const row = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(prefix));
  return row ? decodeURIComponent(row.slice(prefix.length)) : null;
}
