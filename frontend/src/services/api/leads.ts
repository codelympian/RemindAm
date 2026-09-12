import type {
  CreateLeadInput,
  CreateLeadInteractionInput,
  Lead,
  LeadInteraction,
  LeadListParams,
  Paginated,
  UpdateLeadInput,
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

/** `GET /api/leads` — a page of the active business's leads, newest first. */
export function listLeads(
  token: string | null,
  businessId: string,
  params: LeadListParams = {},
): Promise<Paginated<Lead>> {
  const query = new URLSearchParams();
  if (params.customerId) query.set('customerId', params.customerId);
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  const qs = query.toString();
  const path = qs ? `${API_ROUTES.LEADS}?${qs}` : API_ROUTES.LEADS;

  return apiFetch<Paginated<Lead>>(path, {
    token,
    headers: businessHeaders(businessId),
  });
}

/** `GET /api/leads/:id` — one lead in the active business. */
export function getLead(
  token: string | null,
  businessId: string,
  id: string,
): Promise<Lead> {
  return apiFetch<Lead>(`${API_ROUTES.LEADS}/${id}`, {
    token,
    headers: businessHeaders(businessId),
  });
}

/** `POST /api/leads` — create a lead in the active business. */
export function createLead(
  token: string | null,
  businessId: string,
  input: CreateLeadInput,
): Promise<Lead> {
  return apiFetch<Lead>(API_ROUTES.LEADS, {
    token,
    method: 'POST',
    body: input,
    headers: businessHeaders(businessId),
  });
}

/** `PATCH /api/leads/:id` — update a lead in the active business. */
export function updateLead(
  token: string | null,
  businessId: string,
  id: string,
  input: UpdateLeadInput,
): Promise<Lead> {
  return apiFetch<Lead>(`${API_ROUTES.LEADS}/${id}`, {
    token,
    method: 'PATCH',
    body: input,
    headers: businessHeaders(businessId),
  });
}

/** `DELETE /api/leads/:id` — remove a lead (and its interactions) from the business. */
export function deleteLead(
  token: string | null,
  businessId: string,
  id: string,
): Promise<void> {
  return apiFetch<void>(`${API_ROUTES.LEADS}/${id}`, {
    token,
    method: 'DELETE',
    headers: businessHeaders(businessId),
  });
}

/** `POST /api/leads/:id/interactions` — log one immutable note against a lead. */
export function addLeadInteraction(
  token: string | null,
  businessId: string,
  leadId: string,
  input: CreateLeadInteractionInput,
): Promise<LeadInteraction> {
  return apiFetch<LeadInteraction>(
    `${API_ROUTES.LEADS}/${leadId}/interactions`,
    {
      token,
      method: 'POST',
      body: input,
      headers: businessHeaders(businessId),
    },
  );
}
