import type {
  CreateCustomerInput,
  Customer,
  CustomerListParams,
  Paginated,
  UpdateCustomerInput,
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

/** `GET /api/customers` — a page of the active business's customers. */
export function listCustomers(
  token: string | null,
  businessId: string,
  params: CustomerListParams = {},
): Promise<Paginated<Customer>> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  const qs = query.toString();
  const path = qs ? `${API_ROUTES.CUSTOMERS}?${qs}` : API_ROUTES.CUSTOMERS;

  return apiFetch<Paginated<Customer>>(path, {
    token,
    headers: businessHeaders(businessId),
  });
}

/** `GET /api/customers/:id` — one customer in the active business. */
export function getCustomer(
  token: string | null,
  businessId: string,
  id: string,
): Promise<Customer> {
  return apiFetch<Customer>(`${API_ROUTES.CUSTOMERS}/${id}`, {
    token,
    headers: businessHeaders(businessId),
  });
}

/** `POST /api/customers` — create a customer in the active business. */
export function createCustomer(
  token: string | null,
  businessId: string,
  input: CreateCustomerInput,
): Promise<Customer> {
  return apiFetch<Customer>(API_ROUTES.CUSTOMERS, {
    token,
    method: 'POST',
    body: input,
    headers: businessHeaders(businessId),
  });
}

/** `PATCH /api/customers/:id` — update a customer in the active business. */
export function updateCustomer(
  token: string | null,
  businessId: string,
  id: string,
  input: UpdateCustomerInput,
): Promise<Customer> {
  return apiFetch<Customer>(`${API_ROUTES.CUSTOMERS}/${id}`, {
    token,
    method: 'PATCH',
    body: input,
    headers: businessHeaders(businessId),
  });
}

/** `DELETE /api/customers/:id` — remove a customer from the active business. */
export function deleteCustomer(
  token: string | null,
  businessId: string,
  id: string,
): Promise<void> {
  return apiFetch<void>(`${API_ROUTES.CUSTOMERS}/${id}`, {
    token,
    method: 'DELETE',
    headers: businessHeaders(businessId),
  });
}
