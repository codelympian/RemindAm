import type {
  CustomerColumnMapping,
  ImportListItem,
  ImportListParams,
  ImportPreview,
  ImportSummary,
  Paginated,
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

/**
 * `POST /api/imports/preview` — upload a CSV/XLSX and get back the parsed
 * headers, a sample of rows and a suggested column mapping. Persists nothing;
 * the server only reads the file so the user can confirm before committing.
 */
export function previewCustomerImport(
  token: string | null,
  businessId: string,
  file: File,
): Promise<ImportPreview> {
  const form = new FormData();
  form.append('file', file);

  return apiFetch<ImportPreview>(`${API_ROUTES.IMPORTS}/preview`, {
    token,
    method: 'POST',
    body: form,
    headers: businessHeaders(businessId),
  });
}

/**
 * `POST /api/imports` — commit the import with the confirmed mapping. The same
 * file is re-uploaded alongside the chosen column indices; the server parses,
 * validates, dedupes and persists, then returns the honest per-row summary.
 * Null mappings (fields the user chose not to import) are simply omitted.
 */
export function commitCustomerImport(
  token: string | null,
  businessId: string,
  file: File,
  mapping: CustomerColumnMapping,
): Promise<ImportSummary> {
  const form = new FormData();
  form.append('file', file);
  if (mapping.name !== null) form.append('nameColumn', String(mapping.name));
  if (mapping.phone !== null) form.append('phoneColumn', String(mapping.phone));
  if (mapping.email !== null) form.append('emailColumn', String(mapping.email));
  if (mapping.notes !== null) form.append('notesColumn', String(mapping.notes));

  return apiFetch<ImportSummary>(API_ROUTES.IMPORTS, {
    token,
    method: 'POST',
    body: form,
    headers: businessHeaders(businessId),
  });
}

/** `GET /api/imports` — a page of the active business's import history, newest first. */
export function listImports(
  token: string | null,
  businessId: string,
  params: ImportListParams = {},
): Promise<Paginated<ImportListItem>> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  const qs = query.toString();
  const path = qs ? `${API_ROUTES.IMPORTS}?${qs}` : API_ROUTES.IMPORTS;

  return apiFetch<Paginated<ImportListItem>>(path, {
    token,
    headers: businessHeaders(businessId),
  });
}

/** `GET /api/imports/:id` — the full summary of one past import, including per-row detail. */
export function getImport(
  token: string | null,
  businessId: string,
  id: string,
): Promise<ImportSummary> {
  return apiFetch<ImportSummary>(`${API_ROUTES.IMPORTS}/${id}`, {
    token,
    headers: businessHeaders(businessId),
  });
}
