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
