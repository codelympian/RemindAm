'use client';

import { useAuth } from '@clerk/nextjs';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Banknote, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { Sale } from '@remindam/shared';
import { DEFAULT_PAGE_SIZE, PaymentStatus } from '@remindam/shared';
import { useActiveBusiness } from '@/components/app-shell/business-context';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Modal } from '@/components/ui/modal';
import { formatMoney } from '@/lib/format';
import { ApiRequestError } from '@/services/api/client';
import { listCustomers } from '@/services/api/customers';
import { createSale, deleteSale, listSales, updateSale } from '@/services/api/sales';
import {
  SaleFormDialog,
  toCreateInput,
  toUpdateInput,
  type SaleFormValues,
} from './sale-form-dialog';

const SKELETON_ROWS = ['s1', 's2', 's3', 's4', 's5', 's6'];

/** Sentinel for "no status filter"; a real status is never the empty string. */
const ALL_STATUSES = '';

const primaryBtn =
  'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50';
const secondaryBtn =
  'rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50';

/** Turn any thrown value into a human-readable message for the UI. */
function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-NG', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function itemLabel(count: number): string {
  return `${count} item${count === 1 ? '' : 's'}`;
}

/**
 * The Sales screen: the record of what the business has sold — the event every
 * later recommendation is derived from. Search-backed customer filter, status
 * filter, pagination, record/edit dialog and delete confirmation, with honest
 * empty / loading / error states. Data comes from the API via React Query (never
 * the DB directly); the active business id is passed to the API and re-validated
 * there against the caller's membership (§46).
 */
export function SalesView(): React.JSX.Element {
  const { active } = useActiveBusiness();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [customerFilter, setCustomerFilter] = useState<ComboboxOption | null>(
    null,
  );
  const [status, setStatus] = useState<PaymentStatus | ''>(ALL_STATUSES);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [deleting, setDeleting] = useState<Sale | null>(null);

  const customerFilterId = customerFilter?.id ?? null;

  const salesQuery = useQuery({
    queryKey: ['sales', active.id, customerFilterId, status, page],
    queryFn: async () => {
      const token = await getToken();
      return listSales(token, active.id, {
        customerId: customerFilterId || undefined,
        status: status || undefined,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
      });
    },
    placeholderData: keepPreviousData,
  });

  const data = salesQuery.data;
  const totalPages = data?.meta.totalPages ?? 1;

  // If a delete empties the current page, step back into range.
  useEffect(() => {
    if (data && page > data.meta.totalPages) {
      setPage(data.meta.totalPages);
    }
  }, [data, page]);

  const searchCustomers = useCallback(
    async (query: string): Promise<ComboboxOption[]> => {
      const token = await getToken();
      const result = await listCustomers(token, active.id, {
        q: query || undefined,
        pageSize: 10,
      });
      return result.data.map((customer) => ({
        id: customer.id,
        label: customer.name,
        meta: customer.phone ?? undefined,
      }));
    },
    [getToken, active.id],
  );

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['sales', active.id] });
  };

  const closeForm = (): void => {
    setFormOpen(false);
    setEditing(null);
  };

  const saveMutation = useMutation({
    mutationFn: async (values: SaleFormValues) => {
      const token = await getToken();
      return editing
        ? updateSale(token, active.id, editing.id, toUpdateInput(values))
        : createSale(token, active.id, toCreateInput(values));
    },
    onSuccess: async () => {
      await invalidate();
      closeForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (sale: Sale) => {
      const token = await getToken();
      return deleteSale(token, active.id, sale.id);
    },
    onSuccess: async () => {
      await invalidate();
      setDeleting(null);
    },
  });

  const openCreate = (): void => {
    setEditing(null);
    saveMutation.reset();
    setFormOpen(true);
  };

  const openEdit = (sale: Sale): void => {
    setEditing(sale);
    saveMutation.reset();
    setFormOpen(true);
  };

  const changeStatus = (value: PaymentStatus | ''): void => {
    setStatus(value);
    setPage(1);
  };

  const changeCustomer = (option: ComboboxOption | null): void => {
    setCustomerFilter(option);
    setPage(1);
  };

  const clearFilters = (): void => {
    changeCustomer(null);
    changeStatus(ALL_STATUSES);
  };

  const filtered = customerFilterId !== null || status !== ALL_STATUSES;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
          <p className="text-sm text-muted-foreground">{active.name}</p>
        </div>
        <button type="button" onClick={openCreate} className={primaryBtn}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Record sale
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Combobox
            value={customerFilterId}
            label={customerFilter?.label ?? ''}
            ariaLabel="Filter by customer"
            placeholder="Filter by customer…"
            emptyText="No customers match"
            allowClear
            onSearch={searchCustomers}
            onSelect={changeCustomer}
          />
        </div>
        <select
          value={status}
          onChange={(event) =>
            changeStatus(event.target.value as PaymentStatus | '')
          }
          aria-label="Filter by payment status"
          className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:w-48"
        >
          <option value={ALL_STATUSES}>All statuses</option>
          <option value={PaymentStatus.PAID}>Paid in full</option>
          <option value={PaymentStatus.PARTIAL}>Part payment</option>
          <option value={PaymentStatus.UNPAID}>Unpaid</option>
        </select>
      </div>

      {salesQuery.isPending ? (
        <ListSkeleton />
      ) : salesQuery.isError ? (
        <ErrorState
          message={errorMessage(salesQuery.error)}
          retrying={salesQuery.isFetching}
          onRetry={() => void salesQuery.refetch()}
        />
      ) : data && data.meta.total === 0 ? (
        filtered ? (
          <NoMatchesState onClear={clearFilters} />
        ) : (
          <EmptyState onAdd={openCreate} />
        )
      ) : (
        <>
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {data?.data.map((sale) => (
              <SaleRow
                key={sale.id}
                sale={sale}
                currency={active.currency}
                onEdit={() => openEdit(sale)}
                onDelete={() => setDeleting(sale)}
              />
            ))}
          </ul>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={data?.meta.total ?? 0}
            busy={salesQuery.isFetching}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
          />
        </>
      )}

      <SaleFormDialog
        open={formOpen}
        mode={editing ? 'edit' : 'create'}
        initial={editing}
        pending={saveMutation.isPending}
        errorMessage={
          saveMutation.isError ? errorMessage(saveMutation.error) : null
        }
        onSubmit={(values) => saveMutation.mutate(values)}
        onClose={() => {
          if (!saveMutation.isPending) closeForm();
        }}
      />

      <Modal
        open={deleting !== null}
        title="Delete sale"
        onClose={() => {
          if (!deleteMutation.isPending) setDeleting(null);
        }}
      >
        <p className="text-sm text-muted-foreground">
          Delete this sale
          {deleting?.customerName ? (
            <>
              {' '}
              for{' '}
              <span className="font-medium text-foreground">
                {deleting.customerName}
              </span>
            </>
          ) : null}
          ? Any linked debt is removed too. This can’t be undone.
        </p>
        {deleteMutation.isError && (
          <p className="text-sm text-destructive">
            {errorMessage(deleteMutation.error)}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setDeleting(null)}
            disabled={deleteMutation.isPending}
            className={secondaryBtn}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (deleting) deleteMutation.mutate(deleting);
            }}
            disabled={deleteMutation.isPending}
            className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </Modal>
    </section>
  );
}

function SaleRow({
  sale,
  currency,
  onEdit,
  onDelete,
}: {
  sale: Sale;
  currency: string;
  onEdit: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">
            {sale.customerName ?? 'Walk-in'}
          </p>
          <StatusBadge status={sale.paymentStatus} />
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {formatDate(sale.soldAt)} · {itemLabel(sale.items.length)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <div className="mr-1 text-right">
          <p className="font-medium tabular-nums">
            {formatMoney(sale.total, currency)}
          </p>
          {sale.amountOwed > 0 && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatMoney(sale.amountOwed, currency)} owed
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit sale"
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete sale"
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: PaymentStatus }): React.JSX.Element {
  const styles: Record<PaymentStatus, string> = {
    [PaymentStatus.PAID]:
      'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    [PaymentStatus.PARTIAL]:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    [PaymentStatus.UNPAID]:
      'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  };
  const labels: Record<PaymentStatus, string> = {
    [PaymentStatus.PAID]: 'Paid',
    [PaymentStatus.PARTIAL]: 'Part paid',
    [PaymentStatus.UNPAID]: 'Unpaid',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  busy,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  total: number;
  busy: boolean;
  onPrev: () => void;
  onNext: () => void;
}): React.JSX.Element {
  const pagerBtn =
    'rounded-lg border px-3 py-1.5 font-medium hover:bg-accent disabled:opacity-40';
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">
        {total} {total === 1 ? 'sale' : 'sales'} · Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={page <= 1 || busy}
          className={pagerBtn}
        >
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages || busy}
          className={pagerBtn}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Banknote className="h-7 w-7" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-lg font-semibold">No sales yet</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Record your first sale to start building the history every follow-up
          reminder is built on.
        </p>
      </div>
      <button type="button" onClick={onAdd} className={primaryBtn}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Record sale
      </button>
    </div>
  );
}

function NoMatchesState({ onClear }: { onClear: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
      <p className="max-w-sm text-sm text-muted-foreground">
        No sales match your filters.
      </p>
      <button type="button" onClick={onClear} className={secondaryBtn}>
        Clear filters
      </button>
    </div>
  );
}

function ErrorState({
  message,
  retrying,
  onRetry,
}: {
  message: string;
  retrying: boolean;
  onRetry: () => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
      <h2 className="text-lg font-semibold">We couldn’t load your sales</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className={primaryBtn}
      >
        {retrying ? 'Retrying…' : 'Try again'}
      </button>
    </div>
  );
}

function ListSkeleton(): React.JSX.Element {
  return (
    <ul
      className="flex flex-col divide-y rounded-xl border bg-card"
      aria-hidden="true"
    >
      {SKELETON_ROWS.map((id) => (
        <li key={id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-56 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-8 w-20 animate-pulse rounded bg-muted" />
        </li>
      ))}
    </ul>
  );
}
