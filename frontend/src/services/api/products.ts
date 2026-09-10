import type {
  CreateProductInput,
  Paginated,
  Product,
  ProductListParams,
  UpdateProductInput,
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

/** `GET /api/products` — a page of the active business's catalogue. */
export function listProducts(
  token: string | null,
  businessId: string,
  params: ProductListParams = {},
): Promise<Paginated<Product>> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.category) query.set('category', params.category);
  if (params.active !== undefined) query.set('active', String(params.active));
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  const qs = query.toString();
  const path = qs ? `${API_ROUTES.PRODUCTS}?${qs}` : API_ROUTES.PRODUCTS;

  return apiFetch<Paginated<Product>>(path, {
    token,
    headers: businessHeaders(businessId),
  });
}

/**
 * `GET /api/products/categories` — the distinct categories already in use in
 * this business, alphabetically. Feeds the page filter and the form's
 * suggestion list.
 */
export function listProductCategories(
  token: string | null,
  businessId: string,
): Promise<string[]> {
  return apiFetch<string[]>(`${API_ROUTES.PRODUCTS}/categories`, {
    token,
    headers: businessHeaders(businessId),
  });
}

/** `GET /api/products/:id` — one product in the active business. */
export function getProduct(
  token: string | null,
  businessId: string,
  id: string,
): Promise<Product> {
  return apiFetch<Product>(`${API_ROUTES.PRODUCTS}/${id}`, {
    token,
    headers: businessHeaders(businessId),
  });
}

/** `POST /api/products` — add a product to the active business's catalogue. */
export function createProduct(
  token: string | null,
  businessId: string,
  input: CreateProductInput,
): Promise<Product> {
  return apiFetch<Product>(API_ROUTES.PRODUCTS, {
    token,
    method: 'POST',
    body: input,
    headers: businessHeaders(businessId),
  });
}

/** `PATCH /api/products/:id` — update a product in the active business. */
export function updateProduct(
  token: string | null,
  businessId: string,
  id: string,
  input: UpdateProductInput,
): Promise<Product> {
  return apiFetch<Product>(`${API_ROUTES.PRODUCTS}/${id}`, {
    token,
    method: 'PATCH',
    body: input,
    headers: businessHeaders(businessId),
  });
}

/** `DELETE /api/products/:id` — remove a product from the active business. */
export function deleteProduct(
  token: string | null,
  businessId: string,
  id: string,
): Promise<void> {
  return apiFetch<void>(`${API_ROUTES.PRODUCTS}/${id}`, {
    token,
    method: 'DELETE',
    headers: businessHeaders(businessId),
  });
}
