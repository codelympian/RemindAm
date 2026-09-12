'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { CreateLeadInput, Lead, UpdateLeadInput } from '@remindam/shared';
import {
  LeadStatus,
  MAX_LEAD_NOTE_LENGTH,
  MAX_LEAD_TEXT_LENGTH,
  MAX_PRODUCT_MONEY,
} from '@remindam/shared';
import { useActiveBusiness } from '@/components/app-shell/business-context';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Modal } from '@/components/ui/modal';
import { ApiRequestError } from '@/services/api/client';

const MONEY_RE = /^\d+(\.\d{1,2})?$/;

/** Common lead sources — suggestions only; the field stays free text. */
const SOURCE_SUGGESTIONS = [
  'WhatsApp',
  'Instagram',
  'Facebook',
  'Referral',
  'Walk-in',
  'Phone call',
];

const STATUS_LABELS: Record<LeadStatus, string> = {
  [LeadStatus.NEW]: 'New',
  [LeadStatus.CONTACTED]: 'Contacted',
  [LeadStatus.INTERESTED]: 'Interested',
  [LeadStatus.NEGOTIATING]: 'Negotiating',
  [LeadStatus.WON]: 'Won',
  [LeadStatus.LOST]: 'Lost',
};

/**
 * The expected deal size arrives from a text input, so it is validated as a
 * string here and converted by the mappers below. Blank means "not set" (0); the
 * server validates the parsed number again.
 */
const money = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === '' ||
      (MONEY_RE.test(value) && Number(value) <= MAX_PRODUCT_MONEY),
    { message: 'Enter an amount like 15000 or 15000.00' },
  );

const schema = z
  .object({
    customerId: z.string().nullable(),
    customerLabel: z.string(),
    source: z
      .string()
      .trim()
      .max(MAX_LEAD_TEXT_LENGTH, `Keep it under ${MAX_LEAD_TEXT_LENGTH} characters`),
    interestedProduct: z
      .string()
      .trim()
      .max(MAX_LEAD_TEXT_LENGTH, `Keep it under ${MAX_LEAD_TEXT_LENGTH} characters`),
    status: z.nativeEnum(LeadStatus),
    value: money,
    nextFollowUpAt: z.string(),
    note: z
      .string()
      .trim()
      .max(MAX_LEAD_NOTE_LENGTH, `Keep it under ${MAX_LEAD_NOTE_LENGTH} characters`),
  })
  .superRefine((value, ctx) => {
    // A lead always names a customer (§21) — the server requires it too.
    if (!value.customerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customerId'],
        message: 'Select or add a customer.',
      });
    }
  });

export type LeadFormValues = z.infer<typeof schema>;

const fieldClass =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50';

/** A blank amount means zero; anything non-numeric is treated as zero too. */
function toNumber(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Drop a trailing `.00` so an input shows `15000`, not `15000.00`. */
function moneyToInput(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** Local `YYYY-MM-DD` for an `<input type="date">` (never shifts the day by tz). */
function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Interpret the picked day at local midnight and send it as an ISO instant. */
function dateInputToIso(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

/** Turn any thrown value into a human-readable message for the quick-add form. */
function quickAddMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Could not add the customer. Please try again.';
}

function emptyForm(): LeadFormValues {
  return {
    customerId: null,
    customerLabel: '',
    source: '',
    interestedProduct: '',
    status: LeadStatus.NEW,
    value: '',
    nextFollowUpAt: '',
    note: '',
  };
}

function leadToForm(lead: Lead): LeadFormValues {
  return {
    customerId: lead.customerId,
    customerLabel: lead.customerName ?? '',
    source: lead.source ?? '',
    interestedProduct: lead.interestedProduct ?? '',
    status: lead.status,
    value: lead.value > 0 ? moneyToInput(lead.value) : '',
    nextFollowUpAt: lead.nextFollowUpAt
      ? formatDateInput(new Date(lead.nextFollowUpAt))
      : '',
    note: '',
  };
}

/** Form values → `POST /api/leads` body. */
export function toCreateInput(values: LeadFormValues): CreateLeadInput {
  if (!values.customerId) {
    // Guarded by the form's validation; never reached in practice.
    throw new Error('Select or add a customer.');
  }
  return {
    customerId: values.customerId,
    source: values.source.trim() || null,
    interestedProduct: values.interestedProduct.trim() || null,
    status: values.status,
    value: toNumber(values.value),
    nextFollowUpAt: values.nextFollowUpAt
      ? dateInputToIso(values.nextFollowUpAt)
      : null,
    note: values.note.trim() || undefined,
  };
}

/** Form values → `PATCH /api/leads/:id` body (customer reassigned, never cleared). */
export function toUpdateInput(values: LeadFormValues): UpdateLeadInput {
  return {
    customerId: values.customerId ?? undefined,
    source: values.source.trim() || null,
    interestedProduct: values.interestedProduct.trim() || null,
    status: values.status,
    value: toNumber(values.value),
    nextFollowUpAt: values.nextFollowUpAt
      ? dateInputToIso(values.nextFollowUpAt)
      : null,
  };
}

/**
 * Create / edit a lead inside a {@link Modal}, validated with zod. A lead always
 * names a customer, so the picker is a required, server-backed {@link Combobox}
 * with a quick “add a new customer” shortcut for a fresh enquiry (name + optional
 * phone). Source and interested product are free text; status is a plain field
 * with no side effects; value is the expected deal size. A first note is recorded
 * only when creating — afterwards notes live in the interactions timeline.
 */
export function LeadFormDialog({
  open,
  mode,
  initial,
  pending,
  errorMessage,
  searchCustomers,
  onCreateCustomer,
  onSubmit,
  onClose,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  initial: Lead | null;
  pending: boolean;
  errorMessage: string | null;
  searchCustomers: (query: string) => Promise<ComboboxOption[]>;
  onCreateCustomer: (input: {
    name: string;
    phone: string | null;
  }) => Promise<ComboboxOption>;
  onSubmit: (values: LeadFormValues) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { active } = useActiveBusiness();
  const currency = active.currency;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LeadFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyForm(),
  });

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickPending, setQuickPending] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  const resetQuickAdd = (): void => {
    setQuickAddOpen(false);
    setQuickName('');
    setQuickPhone('');
    setQuickError(null);
    setQuickPending(false);
  };

  useEffect(() => {
    if (!open) return;
    reset(initial ? leadToForm(initial) : emptyForm());
    resetQuickAdd();
  }, [open, initial, reset]);

  const customerId = watch('customerId');
  const customerLabel = watch('customerLabel') ?? '';

  const submit = handleSubmit((values) => onSubmit(values));

  const submitQuickAdd = async (): Promise<void> => {
    const name = quickName.trim();
    if (!name) {
      setQuickError('Enter the customer’s name.');
      return;
    }
    setQuickPending(true);
    setQuickError(null);
    try {
      const option = await onCreateCustomer({
        name,
        phone: quickPhone.trim() || null,
      });
      setValue('customerId', option.id, { shouldValidate: true });
      setValue('customerLabel', option.label);
      resetQuickAdd();
    } catch (error) {
      setQuickError(quickAddMessage(error));
    } finally {
      setQuickPending(false);
    }
  };

  const busy = pending || quickPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit lead' : 'Add lead'}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field
          label="Customer"
          error={errors.customerId?.message}
          hint="Every lead names a customer. Add a new one if they aren’t saved yet."
        >
          <Combobox
            value={customerId}
            label={customerLabel}
            ariaLabel="Customer"
            placeholder="Search customers…"
            emptyText="No customers match"
            allowClear
            disabled={busy}
            invalid={Boolean(errors.customerId)}
            onSearch={searchCustomers}
            onSelect={(option) => {
              setValue('customerId', option?.id ?? null, {
                shouldValidate: true,
              });
              setValue('customerLabel', option?.label ?? '');
            }}
          />
          {quickAddOpen ? (
            <div className="mt-2 flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
              <input
                type="text"
                placeholder="New customer name"
                aria-label="New customer name"
                className={fieldClass}
                disabled={quickPending}
                value={quickName}
                onChange={(event) => setQuickName(event.target.value)}
              />
              <input
                type="tel"
                placeholder="Phone (optional)"
                aria-label="New customer phone"
                className={fieldClass}
                disabled={quickPending}
                value={quickPhone}
                onChange={(event) => setQuickPhone(event.target.value)}
              />
              {quickError && (
                <p className="text-sm text-destructive">{quickError}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetQuickAdd}
                  disabled={quickPending}
                  className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitQuickAdd()}
                  disabled={quickPending}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {quickPending ? 'Adding…' : 'Add customer'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setQuickError(null);
                setQuickAddOpen(true);
              }}
              disabled={busy}
              className="mt-1 inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary hover:underline disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              New customer
            </button>
          )}
        </Field>

        <Field label="Source" error={errors.source?.message} hint="Where did this lead come from?">
          <input
            type="text"
            list="lead-source-suggestions"
            placeholder="e.g. WhatsApp, Referral"
            className={fieldClass}
            disabled={busy}
            {...register('source')}
          />
          <datalist id="lead-source-suggestions">
            {SOURCE_SUGGESTIONS.map((source) => (
              <option key={source} value={source} />
            ))}
          </datalist>
        </Field>

        <Field
          label="Interested in"
          error={errors.interestedProduct?.message}
          hint="What are they looking to buy?"
        >
          <input
            type="text"
            placeholder="e.g. Ankara fabric, wholesale order"
            className={fieldClass}
            disabled={busy}
            {...register('interestedProduct')}
          />
        </Field>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Field label="Status" error={errors.status?.message}>
            <select className={fieldClass} disabled={busy} {...register('status')}>
              {Object.values(LeadStatus).map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </Field>

          <Field label={`Value (${currency})`} error={errors.value?.message}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              className={fieldClass}
              disabled={busy}
              {...register('value')}
            />
          </Field>
        </div>

        <Field
          label="Next follow-up"
          error={errors.nextFollowUpAt?.message}
          hint="When should you check back? Leave blank if there’s no date yet."
        >
          <input
            type="date"
            className={fieldClass}
            disabled={busy}
            {...register('nextFollowUpAt')}
          />
        </Field>

        {mode === 'create' && (
          <Field
            label="First note"
            error={errors.note?.message}
            hint="Optional — log the first conversation. More notes go in the timeline."
          >
            <textarea
              rows={3}
              placeholder="e.g. Asked about bulk pricing on WhatsApp"
              className={fieldClass}
              disabled={busy}
              {...register('note')}
            />
          </Field>
        )}

        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pending
              ? 'Saving…'
              : mode === 'edit'
                ? 'Save changes'
                : 'Add lead'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
