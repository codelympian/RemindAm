/**
 * Shared constants used across frontend and backend.
 */

export const DEFAULT_CURRENCY = 'NGN';
export const DEFAULT_TIMEZONE = 'Africa/Lagos';

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

export const API_ROUTES = {
  HEALTH: '/health',
} as const;
