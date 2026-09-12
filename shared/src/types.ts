/**
 * Shared cross-cutting types (API envelopes, pagination).
 * Domain DTOs live with their feature modules; these are contracts
 * both apps rely on.
 */

import { LeadStatus, MembershipRole, PaymentStatus } from './enums';

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

/**
 * A product in the business's catalogue, as returned by the API. Scoped to a
 * single business (tenant) exactly like {@link Customer}: the server resolves
 * `businessId` from the validated `x-business-id` header, never from the client.
 *
 * `price` and `cost` are stored as `Decimal(14,2)` and serialized as numbers —
 * safely within IEEE-754 integer precision at this scale. `lowStock` is derived
 * on the server (business rules never live in the frontend, §46): it is only
 * true when a reorder threshold is actually set, so catalogues that don't track
 * stock never show a meaningless warning (§36).
 */
export interface Product {
  id: string;
  businessId: string;
  name: string;
  sku: string | null;
  category: string | null;
  description: string | null;
  price: number;
  cost: number;
  stockQuantity: number;
  reorderThreshold: number;
  active: boolean;
  lowStock: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * Request body for `POST /api/products`. The owning business comes from the
 * `x-business-id` header (re-validated against the caller's memberships), so it
 * is never part of this payload. Omitted numeric fields fall back to the column
 * defaults (0), and `active` defaults to true.
 */
export interface CreateProductInput {
  name: string;
  sku?: string | null;
  category?: string | null;
  description?: string | null;
  price?: number;
  cost?: number;
  stockQuantity?: number;
  reorderThreshold?: number;
  active?: boolean;
}

/** Request body for `PATCH /api/products/:id` — any subset of the mutable fields. */
export interface UpdateProductInput {
  name?: string;
  sku?: string | null;
  category?: string | null;
  description?: string | null;
  price?: number;
  cost?: number;
  stockQuantity?: number;
  reorderThreshold?: number;
  active?: boolean;
}

/**
 * Query parameters for `GET /api/products`. `q` searches name/SKU
 * (case-insensitive); `category` narrows to one category and `active` filters by
 * status (both omitted shows everything). Results are ordered by name.
 */
export interface ProductListParams {
  q?: string;
  category?: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
}

/**
 * A single line on a sale, as returned by the API. `productId` links to a
 * catalogue product when one was chosen, but `name` and `unitPrice` are
 * *snapshots* taken at sale time — so the historical record survives a later
 * product rename, re-price or deletion (a free-text line has `productId: null`).
 * `lineTotal` is derived on the server (`quantity * unitPrice`); business rules
 * never live in the frontend (§46).
 */
export interface SaleItem {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/**
 * A recorded sale, scoped to a single business (tenant) exactly like
 * {@link Product} and {@link Customer}: the server resolves `businessId` from
 * the validated `x-business-id` header, never from the client.
 *
 * All money fields are `Decimal(14, 2)` serialized as numbers. The server owns
 * every total: `subtotal` is Σ of the line totals, `total` is
 * `max(0, subtotal - discount)`, and `amountPaid` / `amountOwed` are derived
 * from the payment status and the linked debt. An UNPAID or PARTIAL sale always
 * has a customer (a debt must belong to someone), so `customerId` is only ever
 * null on a fully-PAID walk-in sale.
 */
export interface Sale {
  id: string;
  businessId: string;
  customerId: string | null;
  customerName: string | null;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  amountOwed: number;
  soldAt: string; // ISO 8601
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/** A single line in the {@link CreateSaleInput} payload. */
export interface CreateSaleItemInput {
  productId?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Request body for `POST /api/sales`. The owning business comes from the
 * `x-business-id` header (re-validated against the caller's memberships), so it
 * is never part of this payload. `paymentStatus` defaults to PAID and `soldAt`
 * to now(); `amountPaid` is required (and must satisfy `0 < amountPaid < total`)
 * only when `paymentStatus` is PARTIAL. An UNPAID or PARTIAL sale must carry a
 * `customerId`.
 */
export interface CreateSaleInput {
  customerId?: string | null;
  items: CreateSaleItemInput[];
  discount?: number;
  paymentStatus?: PaymentStatus;
  amountPaid?: number;
  soldAt?: string;
}

/**
 * Request body for `PATCH /api/sales/:id`. Editing a sale is header-only — to
 * change line items you delete the sale and re-record it, which keeps the
 * stored totals unambiguous. Any subset of these fields may be sent.
 */
export interface UpdateSaleInput {
  customerId?: string | null;
  discount?: number;
  paymentStatus?: PaymentStatus;
  amountPaid?: number;
  soldAt?: string;
}

/**
 * Query parameters for `GET /api/sales`. `customerId` and `status` narrow the
 * list (both omitted shows everything); results are ordered newest-first by
 * `soldAt`. Paging defaults live in {@link DEFAULT_PAGE_SIZE}.
 */
export interface SaleListParams {
  customerId?: string;
  status?: PaymentStatus;
  page?: number;
  pageSize?: number;
}

/**
 * A single logged touch on a lead (a call, a WhatsApp message, a meeting note).
 * Immutable once written — the running history is what feeds a customer's
 * intelligence in later phases. Newest first in {@link Lead.interactions}.
 */
export interface LeadInteraction {
  id: string;
  leadId: string;
  note: string | null;
  createdAt: string; // ISO 8601
}

/**
 * A lead: an interested buyer moving through the pipeline (NEW → … → WON / LOST).
 * Scoped to a single business (tenant) exactly like {@link Sale}: the server
 * resolves `businessId` from the validated `x-business-id` header, never from the
 * client.
 *
 * A lead carries no name of its own — its identity comes from the linked
 * {@link Customer}, so in this build a lead always names one (the create contract
 * requires it). `customerId` stays nullable on read only defensively. `value` is
 * the expected deal size (`Decimal(14, 2)` as a number); `lastInteractionAt` is
 * derived on the server from the most recent interaction (business rules never
 * live in the frontend, §46).
 */
export interface Lead {
  id: string;
  businessId: string;
  customerId: string | null;
  customerName: string | null;
  source: string | null;
  interestedProduct: string | null;
  status: LeadStatus;
  value: number;
  nextFollowUpAt: string | null; // ISO 8601
  lastInteractionAt: string | null; // ISO 8601
  interactions: LeadInteraction[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * Request body for `POST /api/leads`. The owning business comes from the
 * `x-business-id` header (re-validated against the caller's memberships), so it
 * is never part of this payload. A lead must name a customer. `status` defaults
 * to NEW and `value` to 0; an optional `note` records a first interaction in the
 * same write.
 */
export interface CreateLeadInput {
  customerId: string;
  source?: string | null;
  interestedProduct?: string | null;
  status?: LeadStatus;
  value?: number;
  nextFollowUpAt?: string | null;
  note?: string | null;
}

/**
 * Request body for `PATCH /api/leads/:id` — any subset of the mutable fields.
 * The customer can be reassigned but not cleared (a lead always names one);
 * passing `null` for `source`, `interestedProduct` or `nextFollowUpAt` clears it.
 */
export interface UpdateLeadInput {
  customerId?: string;
  source?: string | null;
  interestedProduct?: string | null;
  status?: LeadStatus;
  value?: number;
  nextFollowUpAt?: string | null;
}

/** Request body for `POST /api/leads/:id/interactions` — logs one note. */
export interface CreateLeadInteractionInput {
  note: string;
}

/**
 * Query parameters for `GET /api/leads`. `customerId` and `status` narrow the
 * list (both omitted shows everything); results are ordered newest-first by
 * `createdAt`. Paging defaults live in {@link DEFAULT_PAGE_SIZE}.
 */
export interface LeadListParams {
  customerId?: string;
  status?: LeadStatus;
  page?: number;
  pageSize?: number;
}
