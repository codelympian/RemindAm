import type {
  Business,
  BusinessSummary,
  CreateBusinessInput,
} from '@remindam/shared';
import { API_ROUTES } from '@remindam/shared';
import { apiFetch } from './client';

/** `GET /api/businesses` — the caller's businesses, with their role in each. */
export function listBusinesses(
  token: string | null,
): Promise<BusinessSummary[]> {
  return apiFetch<BusinessSummary[]>(API_ROUTES.BUSINESSES, { token });
}

/** `GET /api/businesses/:id` — one business the caller is a member of. */
export function getBusiness(
  token: string | null,
  id: string,
): Promise<Business> {
  return apiFetch<Business>(`${API_ROUTES.BUSINESSES}/${id}`, { token });
}

/** `POST /api/businesses` — create a business; the caller becomes its OWNER. */
export function createBusiness(
  token: string | null,
  input: CreateBusinessInput,
): Promise<Business> {
  return apiFetch<Business>(API_ROUTES.BUSINESSES, {
    token,
    method: 'POST',
    body: input,
  });
}
