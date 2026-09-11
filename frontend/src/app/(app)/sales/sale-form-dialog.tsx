'use client';

import { useAuth } from '@clerk/nextjs';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import type { CreateSaleInput, Sale, UpdateSaleInput } from '@remindam/shared';
import {
  MAX_PRODUCT_MONEY,
  MAX_PRODUCT_QUANTITY,
  MAX_SALE_ITEMS,
  PaymentStatus,
} from '@remindam/shared';
import { useActiveBusiness } from '@/components/app-shell/business-context';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Modal } from '@/components/ui/modal';
import { formatMoney } from '@/lib/format';
import { listCustomers } from '@/services/api/customers';
import { listProducts } from '@/services/api/products';

const MONEY_RE = /^\d+(\.\d{1,2})?$/;

/**
 * Money arrives from text inputs, so it is validated as a string here and
 * converted by the mappers below. Blank means zero — a free line or no discount
 * is normal; the server validates the parsed number again.
 */
const money = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === '' ||
      (MONEY_RE.test(value) && Number(value) <= MAX_PRODUCT_MONEY),
    { message: 'Enter an amount like 2500 or 2500.00' },
  );

const quantity = z
  .string()
  .trim()
  .refine(
    (value) =>
      /^\d+$/.test(value) &&
      Number(value) >= 1 &&
      Number(value) <= MAX_PRODUCT_QUANTITY,
    { message: 'Enter a whole number, 1 or more' },
  );

const lineSchema = z.object({
  // The catalogue link (null = a free-text line). `productLabel` is only for the
  // picker's display and is never sent to the API.
  productId: z.string().nullable(),
  productLabel: z.string(),
  name: z
    .string()
    .trim()
    .min(1, 'Enter an item name')
    .max(160, 'Keep the name under 160 characters'),
  quantity,
  unitPrice: money,
});

const schema = z
  .object({
    customerId: z.string().nullable(),
    customerLabel: z.string(),
    items: z.array(lineSchema).min(1, 'Add at least one item'),
    discount: money,
    paymentStatus: z.nativeEnum(PaymentStatus),
    amountPaid: money,
    soldAt: z.string().min(1, 'Choose a date'),
  })
  .superRefine((value, ctx) => {
    const unpaidOrPartial =
      value.paymentStatus === PaymentStatus.UNPAID ||
      value.paymentStatus === PaymentStatus.PARTIAL;

    // Mirrors the server rule: a debt must belong to someone.
    if (unpaidOrPartial && !value.customerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customerId'],
        message:
          'Choose a customer — an unpaid or partial sale is tracked as a debt.',
      });
    }

    if (value.paymentStatus === PaymentStatus.PARTIAL) {
      const { total } = computeTotals(value.items, value.discount);
      const paidText = value.amountPaid.trim();
      if (paidText === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amountPaid'],
          message: 'Enter how much was paid.',
        });
      } else {
        const paid = Number(paidText);
        if (!(paid > 0 && paid < total)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['amountPaid'],
            message:
              'The amount paid must be more than zero and less than the total.',
          });
        }
      }
    }
  });

export type SaleFormValues = z.infer<typeof schema>;

const fieldClass =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50';

/** A blank amount means zero; anything non-numeric is treated as zero too. */
function toNumber(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Two-decimal rounding for the *display* total; the server owns the real one. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Live subtotal / discount / total from the raw string fields, for the summary. */
function computeTotals(
  items: { quantity: string; unitPrice: string }[],
  discountText: string,
): { subtotal: number; discount: number; total: number } {
  const subtotal = round2(
    items.reduce((acc, line) => {
      const qty = Number(line.quantity);
      const price = toNumber(line.unitPrice);
      return Number.isFinite(qty) && Number.isFinite(price)
        ? acc + qty * price
        : acc;
    }, 0),
  );
  const discount = toNumber(discountText);
  return { subtotal, discount, total: round2(Math.max(0, subtotal - discount)) };
}

/** Drop a trailing `.00` so an input shows `2500`, not `2500.00`. */
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

const EMPTY_LINE = {
  productId: null,
  productLabel: '',
  name: '',
  quantity: '1',
  unitPrice: '',
} satisfies SaleFormValues['items'][number];

function emptyForm(): SaleFormValues {
  return {
    customerId: null,
    customerLabel: '',
    items: [{ ...EMPTY_LINE }],
    discount: '',
    paymentStatus: PaymentStatus.PAID,
    amountPaid: '',
    soldAt: formatDateInput(new Date()),
  };
}

function saleToForm(sale: Sale): SaleFormValues {
  return {
    customerId: sale.customerId,
    customerLabel: sale.customerName ?? '',
    items: sale.items.map((item) => ({
      productId: item.productId,
      productLabel: item.productId ? item.name : '',
      name: item.name,
      quantity: String(item.quantity),
      unitPrice: moneyToInput(item.unitPrice),
    })),
    discount: moneyToInput(sale.discount),
    paymentStatus: sale.paymentStatus,
    amountPaid:
      sale.paymentStatus === PaymentStatus.PARTIAL
        ? moneyToInput(sale.amountPaid)
        : '',
    soldAt: formatDateInput(new Date(sale.soldAt)),
  };
}

/** Form values → `POST /api/sales` body. */
export function toCreateInput(values: SaleFormValues): CreateSaleInput {
  return {
    customerId: values.customerId,
    items: values.items.map((line) => ({
      productId: line.productId,
      name: line.name.trim(),
      quantity: Number(line.quantity),
      unitPrice: toNumber(line.unitPrice),
    })),
    discount: toNumber(values.discount),
    paymentStatus: values.paymentStatus,
    amountPaid:
      values.paymentStatus === PaymentStatus.PARTIAL
        ? toNumber(values.amountPaid)
        : undefined,
    soldAt: dateInputToIso(values.soldAt),
  };
}

/** Form values → `PATCH /api/sales/:id` body (header-only; items are immutable). */
export function toUpdateInput(values: SaleFormValues): UpdateSaleInput {
  return {
    customerId: values.customerId,
    discount: toNumber(values.discount),
    paymentStatus: values.paymentStatus,
    amountPaid:
      values.paymentStatus === PaymentStatus.PARTIAL
        ? toNumber(values.amountPaid)
        : undefined,
    soldAt: dateInputToIso(values.soldAt),
  };
}

/**
 * Record / edit a sale inside a {@link Modal}, validated with zod. Recording is
 * the event the whole product does — a customer (optional for a paid walk-in),
 * one or more line items (each optionally linked to a catalogue product, which
 * autofills its name and price), a discount, a payment status and a date.
 *
 * The pickers are server-backed {@link Combobox}es so they scale past one page
 * of customers or products. Totals shown here are a live preview; the server
 * recomputes and owns them (§46). Editing is **header-only** — line items render
 * read-only, because changing what was sold means deleting and re-recording.
 */
export function SaleFormDialog({
  open,
  mode,
  initial,
  pending,
  errorMessage,
  onSubmit,
  onClose,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  initial: Sale | null;
  pending: boolean;
  errorMessage: string | null;
  onSubmit: (values: SaleFormValues) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { getToken } = useAuth();
  const { active } = useActiveBusiness();
  const currency = active.currency;

  // Product prices captured during search, so selecting a product can autofill
  // its price without a second request (the combobox hands back only id + label).
  const productCache = useRef(new Map<string, { name: string; price: number }>());

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SaleFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyForm(),
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  useEffect(() => {
    if (!open) return;
    productCache.current.clear();
    reset(initial ? saleToForm(initial) : emptyForm());
  }, [open, initial, reset]);

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

  const searchProducts = useCallback(
    async (query: string): Promise<ComboboxOption[]> => {
      const token = await getToken();
      const result = await listProducts(token, active.id, {
        q: query || undefined,
        pageSize: 10,
      });
      result.data.forEach((product) =>
        productCache.current.set(product.id, {
          name: product.name,
          price: product.price,
        }),
      );
      return result.data.map((product) => ({
        id: product.id,
        label: product.name,
        meta: formatMoney(product.price, currency),
      }));
    },
    [getToken, active.id, currency],
  );

  const readOnlyItems = mode === 'edit';
  const items = watch('items') ?? [];
  const discount = watch('discount') ?? '';
  const paymentStatus = watch('paymentStatus');
  const customerId = watch('customerId');
  const customerLabel = watch('customerLabel') ?? '';
  const amountPaid = watch('amountPaid') ?? '';

  const totals = computeTotals(items, discount);
  const paidPreview =
    paymentStatus === PaymentStatus.PAID
      ? totals.total
      : paymentStatus === PaymentStatus.PARTIAL
        ? toNumber(amountPaid)
        : 0;
  const owedPreview = round2(Math.max(0, totals.total - paidPreview));

  const submit = handleSubmit((values) => onSubmit(values));

  const selectProduct = (index: number, option: ComboboxOption | null): void => {
    if (!option) {
      setValue(`items.${index}.productId`, null);
      setValue(`items.${index}.productLabel`, '');
      return;
    }
    const cached = productCache.current.get(option.id);
    setValue(`items.${index}.productId`, option.id);
    setValue(`items.${index}.productLabel`, option.label);
    setValue(`items.${index}.name`, cached?.name ?? option.label, {
      shouldValidate: true,
    });
    if (cached) {
      setValue(`items.${index}.unitPrice`, moneyToInput(cached.price), {
        shouldValidate: true,
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit sale' : 'Record sale'}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field
          label="Customer"
          error={errors.customerId?.message}
          hint="Leave blank for a walk-in. Required for an unpaid or partial sale."
        >
          <Combobox
            value={customerId}
            label={customerLabel}
            ariaLabel="Customer"
            placeholder="Search customers, or leave blank…"
            emptyText="No customers match"
            allowClear
            disabled={pending}
            invalid={Boolean(errors.customerId)}
            onSearch={searchCustomers}
            onSelect={(option) => {
              setValue(`customerId`, option?.id ?? null, {
                shouldValidate: true,
              });
              setValue(`customerLabel`, option?.label ?? '');
            }}
          />
        </Field>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Items</span>
            {readOnlyItems && (
              <span className="text-xs text-muted-foreground">
                Delete and re-record to change items
              </span>
            )}
          </div>

          {readOnlyItems ? (
            <ul className="flex flex-col divide-y rounded-lg border bg-muted/30">
              {items.map((line, index) => (
                <li
                  key={fields[index]?.id ?? index}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {line.name}
                    <span className="text-muted-foreground">
                      {' '}
                      × {line.quantity}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatMoney(
                      round2(Number(line.quantity) * toNumber(line.unitPrice)),
                      currency,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col gap-3">
              {fields.map((field, index) => {
                const line = items[index];
                const lineTotal =
                  line &&
                  Number.isFinite(Number(line.quantity)) &&
                  Number.isFinite(toNumber(line.unitPrice))
                    ? round2(Number(line.quantity) * toNumber(line.unitPrice))
                    : 0;
                const lineErrors = errors.items?.[index];
                return (
                  <li
                    key={field.id}
                    className="flex flex-col gap-2 rounded-lg border p-3"
                  >
                    <Combobox
                      value={line?.productId ?? null}
                      label={line?.productLabel ?? ''}
                      ariaLabel={`Product for item ${index + 1}`}
                      placeholder="Link a product (optional)…"
                      emptyText="No products match"
                      allowClear
                      disabled={pending}
                      onSearch={searchProducts}
                      onSelect={(option) => selectProduct(index, option)}
                    />

                    <input
                      type="text"
                      placeholder="Item name"
                      aria-label={`Name for item ${index + 1}`}
                      aria-invalid={Boolean(lineErrors?.name) || undefined}
                      className={fieldClass}
                      disabled={pending}
                      {...register(`items.${index}.name`)}
                    />

                    <div className="flex items-end gap-2">
                      <label className="flex-1">
                        <span className="mb-1 block text-xs text-muted-foreground">
                          Qty
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`Quantity for item ${index + 1}`}
                          aria-invalid={Boolean(lineErrors?.quantity) || undefined}
                          className={fieldClass}
                          disabled={pending}
                          {...register(`items.${index}.quantity`)}
                        />
                      </label>
                      <label className="flex-1">
                        <span className="mb-1 block text-xs text-muted-foreground">
                          Unit price ({currency})
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0.00"
                          aria-label={`Unit price for item ${index + 1}`}
                          aria-invalid={Boolean(lineErrors?.unitPrice) || undefined}
                          className={fieldClass}
                          disabled={pending}
                          {...register(`items.${index}.unitPrice`)}
                        />
                      </label>
                      <div className="flex flex-col items-end">
                        <span className="mb-1 block text-xs text-muted-foreground">
                          Line total
                        </span>
                        <span className="py-2 text-sm font-medium tabular-nums">
                          {formatMoney(lineTotal, currency)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        disabled={pending || fields.length <= 1}
                        aria-label={`Remove item ${index + 1}`}
                        className="mb-1 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    {(lineErrors?.name ||
                      lineErrors?.quantity ||
                      lineErrors?.unitPrice) && (
                      <p className="text-sm text-destructive">
                        {lineErrors?.name?.message ??
                          lineErrors?.quantity?.message ??
                          lineErrors?.unitPrice?.message}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {errors.items?.message && (
            <p className="text-sm text-destructive">{errors.items.message}</p>
          )}

          {!readOnlyItems && (
            <button
              type="button"
              onClick={() => append({ ...EMPTY_LINE })}
              disabled={pending || fields.length >= MAX_SALE_ITEMS}
              className="inline-flex items-center gap-2 self-start rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add item
            </button>
          )}
        </div>

        <Field
          label={`Discount (${currency})`}
          error={errors.discount?.message}
        >
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            className={fieldClass}
            disabled={pending}
            {...register('discount')}
          />
        </Field>

        <dl className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3 text-sm">
          <SummaryRow label="Subtotal" value={formatMoney(totals.subtotal, currency)} />
          <SummaryRow
            label="Discount"
            value={`−${formatMoney(totals.discount, currency)}`}
          />
          <SummaryRow label="Total" value={formatMoney(totals.total, currency)} strong />
          {paymentStatus !== PaymentStatus.PAID && (
            <SummaryRow
              label="Owed"
              value={formatMoney(owedPreview, currency)}
            />
          )}
        </dl>

        <Field label="Payment status" error={errors.paymentStatus?.message}>
          <select
            className={fieldClass}
            disabled={pending}
            {...register('paymentStatus')}
          >
            <option value={PaymentStatus.PAID}>Paid in full</option>
            <option value={PaymentStatus.PARTIAL}>Part payment</option>
            <option value={PaymentStatus.UNPAID}>Unpaid (owing)</option>
          </select>
        </Field>

        {paymentStatus === PaymentStatus.PARTIAL && (
          <Field
            label={`Amount paid (${currency})`}
            error={errors.amountPaid?.message}
            hint="More than zero and less than the total. The rest is recorded as a debt."
          >
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              className={fieldClass}
              disabled={pending}
              {...register('amountPaid')}
            />
          </Field>
        )}

        <Field label="Date" error={errors.soldAt?.message}>
          <input
            type="date"
            className={fieldClass}
            disabled={pending}
            {...register('soldAt')}
          />
        </Field>

        {errorMessage && (
          <p className="text-sm text-destructive">{errorMessage}</p>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pending
              ? 'Saving…'
              : mode === 'edit'
                ? 'Save changes'
                : 'Record sale'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SummaryRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <dt className={strong ? 'font-semibold' : 'text-muted-foreground'}>
        {label}
      </dt>
      <dd className={`tabular-nums ${strong ? 'font-semibold' : ''}`}>
        {value}
      </dd>
    </div>
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
    <div className="flex flex-col gap-1.5">
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
