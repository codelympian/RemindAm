'use client';

import { useAuth } from '@clerk/nextjs';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { MessageSquare, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { Lead } from '@remindam/shared';
import { DEFAULT_PAGE_SIZE, LeadStatus } from '@remindam/shared';
import { useActiveBusiness } from '@/components/app-shell/business-context';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Modal } from '@/components/ui/modal';
import { formatMoney } from '@/lib/format';
import { ApiRequestError } from '@/services/api/client';
import { createCustomer, listCustomers } from '@/services/api/customers';
import {
  addLeadInteraction,
  createLead,
  deleteLead,
  listLeads,
  updateLead,
} from '@/services/api/leads';
import {
  LeadFormDialog,
  toCreateInput,
  toUpdateInput,
  type LeadFormValues,
} from './lead-form-dialog';
import { LeadInteractionsDialog } from './lead-interactions-dialog';

const SKELETON_ROWS = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'];

/** Sentinel for "no status filter"; a real status is never the empty string. */
const ALL_STATUSES = '';

/** Human labels for the six pipeline statuses (§21). */
const STATUS_LABELS: Record<LeadStatus, string> = {
  [LeadStatus.NEW]: 'New',
  [LeadStatus.CONTACTED]: 'Contacted',
  [LeadStatus.INTERESTED]: 'Interested',
  [LeadStatus.NEGOTIATING]: 'Negotiating',
  [LeadStatus.WON]: 'Won',
  [LeadStatus.LOST]: 'Lost',
};

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

/**
 * The Leads screen: the pipeline of interested buyers moving from first enquiry
 * to won or lost, so no prospect slips through the cracks. Every lead names a
 * customer (with quick-add in the form), status is a plain field with no side
 * effects, and each lead carries a dedicated interaction timeline. Search-backed
 * customer filter, status filter, pagination, create/edit dialog and delete
 * confirmation, with honest empty / loading / error states. Data comes from the
 * API via React Query (never the DB directly); the active business id is passed
 * to the API and re-validated there against the caller's membership (§46).
 */
export function LeadsView(): React.JSX.Element {
  const { active } = useActiveBusiness();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [customerFilter, setCustomerFilter] = useState<ComboboxOption | null>(
    null,
  );
  const [status, setStatus] = useState<LeadStatus | ''>(ALL_STATUSES);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState<Lead | null>(null);
  const [interactingId, setInteractingId] = useState<string | null>(null);

  const customerFilterId = customerFilter?.id ?? null;

  const leadsQuery = useQuery({
    queryKey: ['leads', active.id, customerFilterId, status, page],
    queryFn: async () => {
      const token = await getToken();
      return listLeads(token, active.id, {
        customerId: customerFilterId || undefined,
        status: status || undefined,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
      });
    },
    placeholderData: keepPreviousData,
  });

  const data = leadsQuery.data;
  const totalPages = data?.meta.totalPages ?? 1;

  // The interactions dialog reads the live lead from query data by id, so a note
  // added through the mutation appears as soon as the list is invalidated.
  const interacting =
    data?.data.find((lead) => lead.id === interactingId) ?? null;

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

  const createCustomerOption = useCallback(
    async (input: {
      name: string;
      phone: string | null;
    }): Promise<ComboboxOption> => {
      const token = await getToken();
      const customer = await createCustomer(token, active.id, {
        name: input.name,
        phone: input.phone,
      });
      return {
        id: customer.id,
        label: customer.name,
        meta: customer.phone ?? undefined,
      };
    },
    [getToken, active.id],
  );

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['leads', active.id] });
  };

  const closeForm = (): void => {
    setFormOpen(false);
    setEditing(null);
  };

  const saveMutation = useMutation({
    mutationFn: async (values: LeadFormValues) => {
      const token = await getToken();
      return editing
        ? updateLead(token, active.id, editing.id, toUpdateInput(values))
        : createLead(token, active.id, toCreateInput(values));
    },
    onSuccess: async () => {
      await invalidate();
      closeForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (lead: Lead) => {
      const token = await getToken();
      return deleteLead(token, active.id, lead.id);
    },
    onSuccess: async () => {
      await invalidate();
      setDeleting(null);
    },
  });

  const interactionMutation = useMutation({
    mutationFn: async (note: string) => {
      if (!interactingId) throw new Error('No lead selected.');
      const token = await getToken();
      return addLeadInteraction(token, active.id, interactingId, { note });
    },
    onSuccess: async () => {
      await invalidate();
    },
  });

  const openCreate = (): void => {
    setEditing(null);
    saveMutation.reset();
    setFormOpen(true);
  };

  const openEdit = (lead: Lead): void => {
    setEditing(lead);
    saveMutation.reset();
    setFormOpen(true);
  };

  const openInteractions = (lead: Lead): void => {
    setInteractingId(lead.id);
    interactionMutation.reset();
  };

  const changeStatus = (value: LeadStatus | ''): void => {
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
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">{active.name}</p>
        </div>
        <button type="button" onClick={openCreate} className={primaryBtn}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add lead
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
            changeStatus(event.target.value as LeadStatus | '')
          }
          aria-label="Filter by status"
          className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:w-48"
        >
          <option value={ALL_STATUSES}>All statuses</option>
          {Object.values(LeadStatus).map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      {leadsQuery.isPending ? (
        <ListSkeleton />
      ) : leadsQuery.isError ? (
        <ErrorState
          message={errorMessage(leadsQuery.error)}
          retrying={leadsQuery.isFetching}
          onRetry={() => void leadsQuery.refetch()}
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
            {data?.data.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                currency={active.currency}
                onInteractions={() => openInteractions(lead)}
                onEdit={() => openEdit(lead)}
                onDelete={() => setDeleting(lead)}
              />
            ))}
          </ul>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={data?.meta.total ?? 0}
            busy={leadsQuery.isFetching}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
          />
        </>
      )}

      <LeadFormDialog
        open={formOpen}
        mode={editing ? 'edit' : 'create'}
        initial={editing}
        pending={saveMutation.isPending}
        errorMessage={
          saveMutation.isError ? errorMessage(saveMutation.error) : null
        }
        searchCustomers={searchCustomers}
        onCreateCustomer={createCustomerOption}
        onSubmit={(values) => saveMutation.mutate(values)}
        onClose={() => {
          if (!saveMutation.isPending) closeForm();
        }}
      />

      <LeadInteractionsDialog
        open={interactingId !== null}
        lead={interacting}
        pending={interactionMutation.isPending}
        errorMessage={
          interactionMutation.isError
            ? errorMessage(interactionMutation.error)
            : null
        }
        onAdd={(note) => interactionMutation.mutate(note)}
        onClose={() => {
          if (!interactionMutation.isPending) setInteractingId(null);
        }}
      />

      <Modal
        open={deleting !== null}
        title="Delete lead"
        onClose={() => {
          if (!deleteMutation.isPending) setDeleting(null);
        }}
      >
        <p className="text-sm text-muted-foreground">
          Delete this lead
          {deleting?.customerName ? (
            <>
              {' '}
              for{' '}
              <span className="font-medium text-foreground">
                {deleting.customerName}
              </span>
            </>
          ) : null}
          ? Its interaction history is removed too. This can’t be undone.
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

function LeadRow({
  lead,
  currency,
  onInteractions,
  onEdit,
  onDelete,
}: {
  lead: Lead;
  currency: string;
  onInteractions: () => void;
  onEdit: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const details: string[] = [];
  if (lead.source) details.push(lead.source);
  if (lead.interestedProduct) details.push(lead.interestedProduct);
  if (lead.nextFollowUpAt) {
    details.push(`Follow up ${formatDate(lead.nextFollowUpAt)}`);
  }
  if (lead.lastInteractionAt) {
    details.push(`Last contact ${formatDate(lead.lastInteractionAt)}`);
  }
  if (details.length === 0) {
    details.push(`Added ${formatDate(lead.createdAt)}`);
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">
            {lead.customerName ?? 'Unknown customer'}
          </p>
          <StatusBadge status={lead.status} />
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {details.join(' · ')}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {lead.value > 0 && (
          <p className="mr-1 text-right font-medium tabular-nums">
            {formatMoney(lead.value, currency)}
          </p>
        )}
        <button
          type="button"
          onClick={onInteractions}
          aria-label="View interactions"
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit lead"
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete lead"
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: LeadStatus }): React.JSX.Element {
  const styles: Record<LeadStatus, string> = {
    [LeadStatus.NEW]:
      'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
    [LeadStatus.CONTACTED]:
      'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
    [LeadStatus.INTERESTED]:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    [LeadStatus.NEGOTIATING]:
      'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
    [LeadStatus.WON]:
      'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    [LeadStatus.LOST]:
      'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {STATUS_LABELS[status]}
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
        {total} {total === 1 ? 'lead' : 'leads'} · Page {page} of {totalPages}
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
        <UserPlus className="h-7 w-7" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-lg font-semibold">No leads yet</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Add your first lead to track interested buyers from enquiry to won —
          so no follow-up slips through the cracks.
        </p>
      </div>
      <button type="button" onClick={onAdd} className={primaryBtn}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add lead
      </button>
    </div>
  );
}

function NoMatchesState({ onClear }: { onClear: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
      <p className="max-w-sm text-sm text-muted-foreground">
        No leads match your filters.
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
      <h2 className="text-lg font-semibold">We couldn’t load your leads</h2>
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
