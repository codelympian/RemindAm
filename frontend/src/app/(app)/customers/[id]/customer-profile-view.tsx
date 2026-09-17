'use client';

import { useAuth } from '@clerk/nextjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  MessageSquare,
  Pencil,
  ShoppingCart,
  UserPlus,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { CustomerTimelineEvent } from '@remindam/shared';
import { PaymentStatus } from '@remindam/shared';
import { useActiveBusiness } from '@/components/app-shell/business-context';
import { formatMoney } from '@/lib/format';
import { ApiRequestError } from '@/services/api/client';
import {
  getCustomer,
  listCustomerTimeline,
  updateCustomer,
} from '@/services/api/customers';
import {
  CustomerFormDialog,
  type CustomerFormValues,
} from '../customer-form-dialog';

const secondaryBtn =
  'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50';
const primaryBtn =
  'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50';

/** Human labels for the payment status shown on a purchase entry. */
const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.PAID]: 'Paid',
  [PaymentStatus.PARTIAL]: 'Partially paid',
  [PaymentStatus.UNPAID]: 'Unpaid',
};

/** Turn any thrown value into a human-readable message for the UI. */
function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

function formatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-NG', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * A single customer's profile: an identity header (reusing the shared edit
 * dialog) above a read-only, chronological timeline that merges the customer's
 * purchases, leads and interactions — the point at which the data captured
 * across the app comes together per customer (§20). Numeric intelligence
 * (balances, lifetime value, reorder timing) is deliberately deferred to
 * Phase 10. Data comes from the API via React Query (never the DB directly); the
 * active business id is re-validated on the backend against the caller's
 * membership (§46).
 */
export function CustomerProfileView({
  customerId,
}: {
  customerId: string;
}): React.JSX.Element {
  const { active } = useActiveBusiness();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);

  const customerQuery = useQuery({
    queryKey: ['customer', active.id, customerId],
    queryFn: async () => {
      const token = await getToken();
      return getCustomer(token, active.id, customerId);
    },
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 3,
  });

  const timelineQuery = useQuery({
    queryKey: ['customer-timeline', active.id, customerId],
    queryFn: async () => {
      const token = await getToken();
      return listCustomerTimeline(token, active.id, customerId);
    },
    // Only load history once the customer itself is known to exist.
    enabled: customerQuery.isSuccess,
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 3,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: CustomerFormValues) => {
      const token = await getToken();
      const payload = {
        name: values.name.trim(),
        phone: values.phone.trim() ? values.phone.trim() : null,
        email: values.email.trim() ? values.email.trim() : null,
        notes: values.notes.trim() ? values.notes.trim() : null,
      };
      return updateCustomer(token, active.id, customerId, payload);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['customer', active.id, customerId],
        }),
        queryClient.invalidateQueries({ queryKey: ['customers', active.id] }),
      ]);
      setEditOpen(false);
    },
  });

  const customer = customerQuery.data;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 py-2">
      <Link
        href="/customers"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Customers
      </Link>

      {customerQuery.isPending ? (
        <HeaderSkeleton />
      ) : customerQuery.isError ? (
        isNotFound(customerQuery.error) ? (
          <NotFoundState />
        ) : (
          <ErrorState
            message={errorMessage(customerQuery.error)}
            retrying={customerQuery.isFetching}
            onRetry={() => void customerQuery.refetch()}
          />
        )
      ) : (
        <>
          <header className="rounded-xl border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold tracking-tight">
                  {customerQuery.data.name}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[customerQuery.data.phone, customerQuery.data.email]
                    .filter(Boolean)
                    .join(' · ') || 'No contact details'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  saveMutation.reset();
                  setEditOpen(true);
                }}
                className={secondaryBtn}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit
              </button>
            </div>
            {customerQuery.data.notes && (
              <p className="mt-4 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm text-foreground">
                {customerQuery.data.notes}
              </p>
            )}
          </header>

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Timeline
            </h2>
            {timelineQuery.isPending ? (
              <TimelineSkeleton />
            ) : timelineQuery.isError ? (
              <ErrorState
                message={errorMessage(timelineQuery.error)}
                retrying={timelineQuery.isFetching}
                onRetry={() => void timelineQuery.refetch()}
              />
            ) : (
              <Timeline
                events={timelineQuery.data ?? []}
                currency={active.currency}
              />
            )}
          </div>
        </>
      )}

      <CustomerFormDialog
        open={editOpen}
        mode="edit"
        initial={customer ?? null}
        pending={saveMutation.isPending}
        errorMessage={
          saveMutation.isError ? errorMessage(saveMutation.error) : null
        }
        onSubmit={(values) => saveMutation.mutate(values)}
        onClose={() => {
          if (!saveMutation.isPending) setEditOpen(false);
        }}
      />
    </section>
  );
}

function Timeline({
  events,
  currency,
}: {
  events: CustomerTimelineEvent[];
  currency: string;
}): React.JSX.Element {
  return (
    <ol className="flex flex-col rounded-xl border bg-card p-5">
      {events.map((event, index) => (
        <TimelineItem
          key={event.id}
          event={event}
          currency={currency}
          last={index === events.length - 1}
        />
      ))}
    </ol>
  );
}

function TimelineItem({
  event,
  currency,
  last,
}: {
  event: CustomerTimelineEvent;
  currency: string;
  last: boolean;
}): React.JSX.Element {
  const { Icon, title, meta } = describeEvent(event, currency);
  return (
    <li className={`relative flex gap-4 ${last ? '' : 'pb-6'}`}>
      {!last && (
        <span
          className="absolute left-[17px] top-9 h-[calc(100%-2rem)] w-px bg-border"
          aria-hidden="true"
        />
      )}
      <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-sm font-medium">{title}</p>
        {meta}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatTimestamp(event.at)}
        </p>
      </div>
    </li>
  );
}

/**
 * Compose the sentence for one timeline event from the server's facts. The
 * backend provides the structured datum (`label`, `amount`, `paymentStatus`,
 * `amountOwed`); the phrasing lives here (§46).
 */
function describeEvent(
  event: CustomerTimelineEvent,
  currency: string,
): {
  Icon: typeof ShoppingCart;
  title: string;
  meta: React.JSX.Element | null;
} {
  switch (event.type) {
    case 'purchase': {
      const owed = event.amountOwed ?? 0;
      return {
        Icon: ShoppingCart,
        title: event.label ? `Purchased ${event.label}` : 'Purchase',
        meta: (
          <p className="text-sm text-muted-foreground">
            {formatMoney(event.amount ?? 0, currency)}
            {owed > 0 && (
              <span className="text-destructive">
                {' · '}
                {formatMoney(owed, currency)} owed
                {event.paymentStatus
                  ? ` (${PAYMENT_LABELS[event.paymentStatus]})`
                  : ''}
              </span>
            )}
          </p>
        ),
      };
    }
    case 'lead_created':
      return {
        Icon: UserPlus,
        title: event.label ? `New lead — ${event.label}` : 'New lead',
        meta: event.amount ? (
          <p className="text-sm text-muted-foreground">
            Expected {formatMoney(event.amount, currency)}
          </p>
        ) : null,
      };
    case 'lead_interaction':
      return {
        Icon: MessageSquare,
        title: event.label ?? 'Interaction logged',
        meta: null,
      };
    case 'customer_created':
    default:
      return { Icon: UserRound, title: 'Customer added', meta: null };
  }
}

function NotFoundState(): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <UserRound className="h-7 w-7" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-lg font-semibold">Customer not found</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          This customer doesn’t exist in this business, or may have been
          removed.
        </p>
      </div>
      <Link href="/customers" className={primaryBtn}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to customers
      </Link>
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
      <h2 className="text-lg font-semibold">Something went wrong</h2>
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

function HeaderSkeleton(): React.JSX.Element {
  return (
    <div className="rounded-xl border bg-card p-5" aria-hidden="true">
      <div className="h-7 w-48 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted" />
    </div>
  );
}

function TimelineSkeleton(): React.JSX.Element {
  return (
    <ul
      className="flex flex-col gap-6 rounded-xl border bg-card p-5"
      aria-hidden="true"
    >
      {['t1', 't2', 't3'].map((id) => (
        <li key={id} className="flex gap-4">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}
