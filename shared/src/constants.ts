/**
 * Shared constants used across frontend and backend.
 */

export const DEFAULT_CURRENCY = 'NGN';
export const DEFAULT_TIMEZONE = 'Africa/Lagos';

/**
 * Onboarding Step 4 — "How do you currently track customers?". The canonical
 * set both apps agree on: the backend validates against it, the frontend
 * renders it. Stored on `Business.customerTrackingMethod`.
 */
export const CUSTOMER_TRACKING_METHODS = [
  'WhatsApp',
  'Excel',
  'Notebook',
  'Phone contacts',
  'Other',
] as const;

export type CustomerTrackingMethod = (typeof CUSTOMER_TRACKING_METHODS)[number];

/**
 * Transparent priority-scoring weights for the recommendation engine.
 * Kept here so the contract is visible; the backend owns the actual scoring.
 */
export const SCORE_WEIGHTS = {
  RECENT_INQUIRY: 30,
  HIGH_PURCHASE_INTENT: 25,
  PREVIOUS_PURCHASES: 15,
  REORDER_DUE: 20,
  OUTSTANDING_DEBT: 15,
  LONG_INACTIVITY: 10,
} as const;

export const MAX_SCORE = 100;

/** Default and maximum page sizes for paginated list endpoints (§39). */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const API_ROUTES = {
  HEALTH: '/health',
  BUSINESSES: '/businesses',
  CUSTOMERS: '/customers',
} as const;
