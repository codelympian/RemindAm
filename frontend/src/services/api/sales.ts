import type {
  CreateSaleInput,
  Paginated,
  Sale,
  SaleListParams,
  UpdateSaleInput,
} from '@remindam/shared';
import { API_ROUTES } from '@remindam/shared';
import { apiFetch } from './client';

/**
 * The active business id travels in the `x-business-id` header. It is only a
 * *claim* — the backend re-validates it against the caller's membership on every
 * request and 404s if they are not a member (master prompt §11/§46), so the
 * frontend never sends a business id as proof of authorization.
 */
function businessHeaders(businessId: string): Record<string, string> {
  return { 'x-business-id': businessId };
}

/** `GET /api/sales` — a page of the active business's sales, newest first. */
export function listSales(
  token: string | null,
  businessId: string,
  params: SaleListParams = {},
): Promise<Paginated<Sale>> {
  const query = new URLSearchParams();
  if (params.customerId) query.set('customerId', params.customerId);
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  const qs = query.toString();
  const path = qs ? `${API_ROUTES.SALES}?${qs}` : API_ROUTES.SALES;

  return apiFetch<Paginated<Sale>>(path, {
    token,
    headers: businessHeaders(businessId),
  });
}

/** `GET /api/sales/:id` — one sale in the active business. */
export function getSale(
  token: string | null,
  businessId: string,
  id: string,
): Promise<Sale> {
  return apiFetch<Sale>(`${API_ROUTES.SALES}/${id}`, {
    token,
    headers: businessHeaders(businessId),
  });
}

/** `POST /api/sales` — record a sale in the active business. */
export function createSale(
  token: string | null,
  businessId: string,
  input: CreateSaleInput,
): Promise<Sale> {
  return apiFetch<Sale>(API_ROUTES.SALES, {
    token,
    method: 'POST',
    body: input,
    headers: businessHeaders(businessId),
  });
}

/** `PATCH /api/sales/:id` — update a sale's header fields in the active business. */
export function updateSale(
  token: string | null,
  businessId: string,
  id: string,
  input: UpdateSaleInput,
): Promise<Sale> {
  return apiFetch<Sale>(`${API_ROUTES.SALES}/${id}`, {
    token,
    method: 'PATCH',
    body: input,
    headers: businessHeaders(businessId),
  });
}

/** `DELETE /api/sales/:id` — remove a sale (and its linked debt) from the business. */
export function deleteSale(
  token: string | null,
  businessId: string,
  id: string,
): Promise<void> {
  return apiFetch<void>(`${API_ROUTES.SALES}/${id}`, {
    token,
    method: 'DELETE',
    headers: businessHeaders(businessId),
  });
}
