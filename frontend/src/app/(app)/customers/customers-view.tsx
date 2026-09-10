'use client';

import { useAuth } from '@clerk/nextjs';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2, Upload, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Customer } from '@remindam/shared';
import { DEFAULT_PAGE_SIZE } from '@remindam/shared';
import { useActiveBusiness } from '@/components/app-shell/business-context';
import { ApiRequestError } from '@/services/api/client';
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  updateCustomer,
} from '@/services/api/customers';
import {
  CustomerFormDialog,
  type CustomerFormValues,
} from './customer-form-dialog';
import { Modal } from '@/components/ui/modal';

const SKELETON_ROWS = ['s1', 's2', 's3', 's4', 's5', 's6'];

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

/**
 * The Customers screen: search, paginate, create, edit and delete customers for
 * the active business. Data comes from the API via React Query (never the DB
 * directly). The active business id is read from context for display and passed
 * to the API, where it is re-validated against the caller's membership (§46).
 */
export function CustomersView(): React.JSX.Element {
  const { active } = useActiveBusiness();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  // Debounce the search box into the query key; reset to the first page on change.
  useEffect(() => {
    const handle = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  const customersQuery = useQuery({
    queryKey: ['customers', active.id, q, page],
    queryFn: async () => {
      const token = await getToken();
      return listCustomers(token, active.id, {
        q: q || undefined,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
      });
    },
    placeholderData: keepPreviousData,
  });

  const data = customersQuery.data;
  const totalPages = data?.meta.totalPages ?? 1;

  // If a delete empties the current page, step back into range.
  useEffect(() => {
    if (data && page > data.meta.totalPages) {
      setPage(data.meta.totalPages);
    }
  }, [data, page]);

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['customers', active.id] });

  const closeForm = (): void => {
    setFormOpen(false);
    setEditing(null);
  };

  const saveMutation = useMutation({
    mutationFn: async (values: CustomerFormValues) => {
      const token = await getToken();
      const payload = {
        name: values.name.trim(),
        phone: values.phone.trim() ? values.phone.trim() : null,
        email: values.email.trim() ? values.email.trim() : null,
        notes: values.notes.trim() ? values.notes.trim() : null,
      };
      return editing
        ? updateCustomer(token, active.id, editing.id, payload)
        : createCustomer(token, active.id, payload);
    },
    onSuccess: async () => {
      await invalidate();
      closeForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (customer: Customer) => {
      const token = await getToken();
      return deleteCustomer(token, active.id, customer.id);
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

  const openEdit = (customer: Customer): void => {
    setEditing(customer);
    saveMutation.reset();
    setFormOpen(true);
  };

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">{active.name}</p>
        </div>
        <button type="button" onClick={openCreate} className={primaryBtn}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add customer
        </button>
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, phone or email…"
          aria-label="Search customers"
          className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {customersQuery.isPending ? (
        <ListSkeleton />
      ) : customersQuery.isError ? (
        <ErrorState
          message={errorMessage(customersQuery.error)}
          retrying={customersQuery.isFetching}
          onRetry={() => void customersQuery.refetch()}
        />
      ) : data && data.meta.total === 0 ? (
        q ? (
          <NoMatchesState query={q} onClear={() => setSearch('')} />
        ) : (
          <EmptyState onAdd={openCreate} />
        )
      ) : (
        <>
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {data?.data.map((customer) => (
              <CustomerRow
                key={customer.id}
                customer={customer}
                onEdit={() => openEdit(customer)}
                onDelete={() => setDeleting(customer)}
              />
            ))}
          </ul>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={data?.meta.total ?? 0}
            busy={customersQuery.isFetching}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
          />
        </>
      )}

      <CustomerFormDialog
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
        title="Delete customer"
        onClose={() => {
          if (!deleteMutation.isPending) setDeleting(null);
        }}
      >
        <p className="text-sm text-muted-foreground">
          Delete{' '}
          <span className="font-medium text-foreground">{deleting?.name}</span>?
          This can’t be undone.
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

function CustomerRow({
  customer,
  onEdit,
  onDelete,
}: {
  customer: Customer;
  onEdit: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const contact =
    [customer.phone, customer.email].filter(Boolean).join(' · ') ||
    'No contact details';

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{customer.name}</p>
        <p className="truncate text-sm text-muted-foreground">{contact}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${customer.name}`}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${customer.name}`}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
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
        {total} {total === 1 ? 'customer' : 'customers'} · Page {page} of{' '}
        {totalPages}
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
        <Users className="h-7 w-7" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-lg font-semibold">No customers yet</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Add the people you sell to, and RemindAm will help you remember who to
          follow up with.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={onAdd} className={primaryBtn}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add customer
        </button>
        <Link
          href="/imports"
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          Import customers
        </Link>
      </div>
    </div>
  );
}

function NoMatchesState({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
      <p className="max-w-sm text-sm text-muted-foreground">
        No customers match “{query}”.
      </p>
      <button type="button" onClick={onClear} className={secondaryBtn}>
        Clear search
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
      <h2 className="text-lg font-semibold">We couldn’t load your customers</h2>
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
          <div className="h-8 w-16 animate-pulse rounded bg-muted" />
        </li>
      ))}
    </ul>
  );
}
