'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Product } from '@remindam/shared';
import { MAX_PRODUCT_MONEY } from '@remindam/shared';
import { Modal } from '@/components/ui/modal';

const MONEY_RE = /^\d+(\.\d{1,2})?$/;

/**
 * Price arrives from a text input, so it is validated as a string here and
 * converted to a number by the caller. Blank means "use zero" rather than an
 * error — a catalogue entry without a price yet is normal.
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

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Please enter a name')
    .max(160, 'Keep the name under 160 characters'),
  category: z.string().trim().max(60, 'Keep the category under 60 characters'),
  sku: z.string().trim().max(60, 'Keep the SKU under 60 characters'),
  price: money,
  description: z
    .string()
    .trim()
    .max(2000, 'Keep the description under 2000 characters'),
});

export type ProductFormValues = z.infer<typeof schema>;

const EMPTY: ProductFormValues = {
  name: '',
  category: '',
  sku: '',
  price: '',
  description: '',
};

const fieldClass =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring';

/** Drop the trailing `.00` Prisma returns so the input shows `2500`, not `2500.00`. */
function moneyToInput(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * Create/edit product form inside a {@link Modal}, validated with zod. The form
 * only collects and validates input; the parent owns the mutation, so `pending`
 * and `errorMessage` are driven from there. Opening the dialog resets the fields
 * to the product being edited (or blank for a new one).
 *
 * This is deliberately a "what we sell" form — name, category, SKU, price and
 * description. Stock, reorder threshold, cost and active status still exist in
 * the API and database for the phases that need them; they are simply not part
 * of the catalogue screen.
 */
export function ProductFormDialog({
  open,
  mode,
  initial,
  currency,
  categories,
  pending,
  errorMessage,
  onSubmit,
  onClose,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  initial: Product | null;
  currency: string;
  categories: string[];
  pending: boolean;
  errorMessage: string | null;
  onSubmit: (values: ProductFormValues) => void;
  onClose: () => void;
}): React.JSX.Element {
  const categoryListId = useId();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    reset(
      initial
        ? {
            name: initial.name,
            category: initial.category ?? '',
            sku: initial.sku ?? '',
            price: moneyToInput(initial.price),
            description: initial.description ?? '',
          }
        : EMPTY,
    );
  }, [open, initial, reset]);

  const submit = handleSubmit((values) => onSubmit(values));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit product' : 'Add product'}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Name" error={errors.name?.message} required>
          <input
            autoFocus
            type="text"
            placeholder="e.g. Ankara fabric"
            className={fieldClass}
            {...register('name')}
          />
        </Field>

        <Field
          label="Category"
          error={errors.category?.message}
          hint="Group similar products, e.g. Fabrics, Drinks, Shoes."
        >
          <input
            type="text"
            list={categoryListId}
            placeholder="e.g. Fabrics"
            className={fieldClass}
            {...register('category')}
          />
          <datalist id={categoryListId}>
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </Field>

        <Field
          label={`Price (${currency})`}
          error={errors.price?.message}
          hint="What you sell it for."
        >
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            className={fieldClass}
            {...register('price')}
          />
        </Field>

        <Field
          label="SKU"
          error={errors.sku?.message}
          hint="Your own product code. Must be unique in this business."
        >
          <input
            type="text"
            placeholder="e.g. ANK-001"
            className={fieldClass}
            {...register('sku')}
          />
        </Field>

        <Field label="Description" error={errors.description?.message}>
          <textarea
            rows={3}
            placeholder="Anything worth remembering about this product…"
            className={fieldClass}
            {...register('description')}
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
                : 'Add product'}
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
  required,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
