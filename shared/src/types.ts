/**
 * Shared cross-cutting types (API envelopes, pagination).
 * Domain DTOs live with their feature modules; these are contracts
 * both apps rely on.
 */

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
