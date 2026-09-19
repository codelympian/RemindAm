import type { ApiError } from '@remindam/shared';

/**
 * Origin of the RemindAm backend, plus its global `/api` prefix. The frontend
 * talks to the backend over HTTP only — never Prisma, never the database
 * directly (master prompt §46).
 */
const API_BASE = `${
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
}/api`;

/** Thrown by {@link apiFetch} on any non-2xx response or transport failure. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface ApiFetchOptions {
  /** Clerk session token; `null` short-circuits to a 401-style error. */
  token: string | null;
  method?: HttpMethod;
  /**
   * Request body. A plain object is JSON-encoded; a {@link FormData} is sent
   * as multipart (for file uploads) with the browser setting the boundary.
   */
  body?: unknown;
  signal?: AbortSignal;
  /**
   * Extra request headers (e.g. `x-business-id` for business-scoped routes).
   * `Authorization` is always set by `apiFetch` and takes precedence over
   * anything provided here; `Content-Type` is set for JSON bodies only (a
   * `FormData` body carries its own multipart content type).
   */
  headers?: Record<string, string>;
}

/**
 * Authenticated fetch against the backend. Attaches the bearer token, sends and
 * parses JSON, and turns the backend's {@link ApiError} envelope into a typed
 * {@link ApiRequestError}. Usable from both client and server components (plain
 * `fetch`, never cached).
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions,
): Promise<T> {
  const { token, method = 'GET', body, signal, headers } = options;

  if (!token) {
    throw new ApiRequestError(401, 'You are not signed in.');
  }

  // A FormData body is sent as-is (multipart); anything else is JSON-encoded.
  // The browser must set the multipart boundary itself, so we never add a
  // Content-Type for FormData.
  const isForm = body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...headers,
        Authorization: `Bearer ${token}`,
        ...(body === undefined || isForm
          ? {}
          : { 'Content-Type': 'application/json' }),
      },
      body:
        body === undefined
          ? undefined
          : isForm
            ? body
            : JSON.stringify(body),
      cache: 'no-store',
      signal,
    });
  } catch {
    throw new ApiRequestError(
      0,
      `Could not reach the RemindAm API at ${API_BASE}. Is the backend running?`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const envelope = (payload ?? {}) as Partial<ApiError>;
    throw new ApiRequestError(
      response.status,
      envelope.message ?? `Request failed with status ${response.status}.`,
      envelope.details,
    );
  }

  return payload as T;
}
