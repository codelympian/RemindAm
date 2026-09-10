/**
 * Shared cross-cutting types (API envelopes, pagination).
 * Domain DTOs live with their feature modules; these are contracts
 * both apps rely on.
 */

import { MembershipRole } from './enums';

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface HealthStatus {
  status: 'ok' | 'error';
  service: string;
  timestamp: string;
  database?: 'up' | 'down';
}

/**
 * The authenticated user's profile as synchronized from Clerk into the local
 * database. Returned by `GET /api/me`; the shape both apps agree on.
 */
export interface UserProfile {
  id: string;
  clerkUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * A business (tenant) as returned by the API. `industry` holds the onboarding
 * "category"; `customerTrackingMethod` is the onboarding survey answer.
 * Returned by `POST /api/businesses` and `GET /api/businesses/:id`.
 */
export interface Business {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  industry: string | null;
  customerTrackingMethod: string | null;
  currency: string;
  timezone: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * A lightweight business list item returned by `GET /api/businesses`, carrying
 * the authenticated caller's role in that business.
 */
export interface BusinessSummary {
  id: string;
  name: string;
  industry: string | null;
  currency: string;
  role: MembershipRole;
}

/**
 * Request body for `POST /api/businesses` (onboarding completion). The server
 * derives the owner from the verified Clerk session — never from this payload.
 */
export interface CreateBusinessInput {
  name: string;
  industry?: string | null;
  phone?: string | null;
  customerTrackingMethod?: string | null;
}

/**
 * A customer as returned by the API. Scoped to a single business (tenant); the
 * server resolves `businessId` from the validated `x-business-id` header, never
 * from the client. Returned by the `/api/customers` endpoints.
 */
export interface Customer {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * Request body for `POST /api/customers`. The owning business comes from the
 * `x-business-id` header (re-validated against the caller's memberships), so it
 * is never part of this payload.
 */
export interface CreateCustomerInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

/** Request body for `PATCH /api/customers/:id` — any subset of the mutable fields. */
export interface UpdateCustomerInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

/**
 * Query parameters for `GET /api/customers`. `q` searches name/phone/email
 * (case-insensitive); paging defaults live in {@link DEFAULT_PAGE_SIZE}.
 */
export interface CustomerListParams {
  q?: string;
  page?: number;
  pageSize?: number;
}
