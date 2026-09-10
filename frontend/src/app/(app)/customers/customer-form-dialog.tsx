'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Customer } from '@remindam/shared';
import { Modal } from '@/components/ui/modal';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Please enter a name')
    .max(120, 'Keep the name under 120 characters'),
  phone: z
    .string()
    .trim()
    .max(40, 'Keep the phone number under 40 characters'),
  email: z
    .string()
    .trim()
    .max(160, 'Keep the email under 160 characters')
    .refine((value) => value.length === 0 || EMAIL_RE.test(value), {
      message: 'Enter a valid email address',
    }),
  notes: z
    .string()
    .trim()
    .max(2000, 'Keep notes under 2000 characters'),
});

export type CustomerFormValues = z.infer<typeof schema>;

const EMPTY: CustomerFormValues = { name: '', phone: '', email: '', notes: '' };

const fieldClass =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring';

/**
 * Create/edit customer form inside a {@link Modal}, validated with zod. The form
 * only collects and validates input; the parent owns the mutation, so `pending`
 * and `errorMessage` are driven from there. Opening the dialog resets the fields
 * to the customer being edited (or blank for a new one).
 */
export function CustomerFormDialog({
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
  initial: Customer | null;
  pending: boolean;
  errorMessage: string | null;
  onSubmit: (values: CustomerFormValues) => void;
  onClose: () => void;
}): React.JSX.Element {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    reset(
      initial
        ? {
            name: initial.name,
            phone: initial.phone ?? '',
            email: initial.email ?? '',
            notes: initial.notes ?? '',
          }
        : EMPTY,
    );
  }, [open, initial, reset]);

  const submit = handleSubmit((values) => onSubmit(values));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit customer' : 'Add customer'}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Name" error={errors.name?.message} required>
          <input
            autoFocus
            type="text"
            placeholder="e.g. Ada Okafor"
            className={fieldClass}
            {...register('name')}
          />
        </Field>

        <Field label="Phone" error={errors.phone?.message}>
          <input
            type="tel"
            inputMode="tel"
            placeholder="e.g. 0801 234 5678"
            className={fieldClass}
            {...register('phone')}
          />
        </Field>

        <Field label="Email" error={errors.email?.message}>
          <input
            type="email"
            placeholder="e.g. ada@example.com"
            className={fieldClass}
            {...register('email')}
          />
        </Field>

        <Field label="Notes" error={errors.notes?.message}>
          <textarea
            rows={3}
            placeholder="Anything worth remembering about this customer…"
            className={fieldClass}
            {...register('notes')}
          />
        </Field>

        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

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
                : 'Add customer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
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
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
