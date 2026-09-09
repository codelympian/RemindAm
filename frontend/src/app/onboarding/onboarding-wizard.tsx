'use client';

import { useAuth } from '@clerk/nextjs';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CUSTOMER_TRACKING_METHODS } from '@remindam/shared';
import { setActiveBusinessCookie } from '@/lib/active-business';
import { createBusiness } from '@/services/api/businesses';

/** Presentation-only category list for Nigerian SMEs. Stored as `industry`. */
const BUSINESS_CATEGORIES = [
  'Fashion & Apparel',
  'Beauty & Cosmetics',
  'Food & Restaurant',
  'Groceries & Provisions',
  'Electronics & Gadgets',
  'Phone & Accessories',
  'Health & Pharmacy',
  'Home & Furniture',
  'Agriculture',
  'Services',
  'Other',
] as const;

const CATEGORY_OTHER = 'Other';
const TOTAL_STEPS = 5;

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Please enter your business name')
      .max(120, 'Keep the name under 120 characters'),
    category: z.string().min(1, 'Please choose a category'),
    otherCategory: z
      .string()
      .trim()
      .max(80, 'Keep it under 80 characters')
      .optional(),
    phone: z
      .string()
      .trim()
      .max(40, 'Keep the phone number under 40 characters')
      .optional(),
    customerTrackingMethod: z.enum(CUSTOMER_TRACKING_METHODS, {
      required_error: 'Please choose one',
    }),
  })
  .refine(
    (values) =>
      values.category !== CATEGORY_OTHER ||
      (values.otherCategory?.trim().length ?? 0) > 0,
    { path: ['otherCategory'], message: 'Please describe your business type' },
  );

type OnboardingValues = z.infer<typeof schema>;

/** Fields validated before advancing out of each step (review step has none). */
const STEP_FIELDS: Array<Array<keyof OnboardingValues>> = [
  ['name'],
  ['category', 'otherCategory'],
  ['phone'],
  ['customerTrackingMethod'],
  [],
];

const fieldClass =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring';

export function OnboardingWizard(): React.JSX.Element {
  const router = useRouter();
  const { getToken } = useAuth();
  const [step, setStep] = useState(0);

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    formState: { errors },
  } = useForm<OnboardingValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: '',
      category: '',
      otherCategory: '',
      phone: '',
    },
  });

  const values = watch();

  const mutation = useMutation({
    mutationFn: async (input: OnboardingValues) => {
      const token = await getToken();
      const industry =
        input.category === CATEGORY_OTHER
          ? input.otherCategory?.trim() || null
          : input.category;
      const phone = input.phone?.trim() ? input.phone.trim() : null;
      return createBusiness(token, {
        name: input.name.trim(),
        industry,
        phone,
        customerTrackingMethod: input.customerTrackingMethod,
      });
    },
    onSuccess: (business) => {
      setActiveBusinessCookie(business.id);
      router.push('/dashboard');
      router.refresh();
    },
  });

  const goNext = async (): Promise<void> => {
    const valid = await trigger(STEP_FIELDS[step]);
    if (valid) setStep((current) => Math.min(current + 1, TOTAL_STEPS - 1));
  };

  const goBack = (): void => setStep((current) => Math.max(current - 1, 0));

  const onSubmit = handleSubmit((input) => {
    mutation.mutate(input);
  });

  const busy = mutation.isPending || mutation.isSuccess;
  const industrySummary =
    values.category === CATEGORY_OTHER
      ? values.otherCategory?.trim() || CATEGORY_OTHER
      : values.category || '—';

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 py-10">
      <div>
        <p className="text-sm font-medium text-primary">
          Step {step + 1} of {TOTAL_STEPS}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        onKeyDown={(event) => {
          // Enter should advance via the Next button, never submit early.
          if (event.key === 'Enter' && step < TOTAL_STEPS - 1) {
            event.preventDefault();
          }
        }}
        className="flex flex-col gap-6"
        noValidate
      >
        {step === 0 && (
          <Field
            label="What is your business called?"
            hint="You can change this later."
            error={errors.name?.message}
          >
            <input
              id="name"
              type="text"
              autoFocus
              placeholder="e.g. Ada Stores"
              className={fieldClass}
              {...register('name')}
            />
          </Field>
        )}

        {step === 1 && (
          <>
            <Field
              label="What do you sell?"
              hint="Pick the closest category."
              error={errors.category?.message}
            >
              <select id="category" className={fieldClass} {...register('category')}>
                <option value="">Select a category…</option>
                {BUSINESS_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </Field>

            {values.category === CATEGORY_OTHER && (
              <Field
                label="Tell us your business type"
                error={errors.otherCategory?.message}
              >
                <input
                  id="otherCategory"
                  type="text"
                  placeholder="e.g. Event planning"
                  className={fieldClass}
                  {...register('otherCategory')}
                />
              </Field>
            )}
          </>
        )}

        {step === 2 && (
          <Field
            label="Business phone number"
            hint="Optional — used for your own records for now."
            error={errors.phone?.message}
          >
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              placeholder="e.g. 0801 234 5678"
              className={fieldClass}
              {...register('phone')}
            />
          </Field>
        )}

        {step === 3 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="font-medium">
              How do you currently track customers?
            </legend>
            <div className="flex flex-col gap-2">
              {CUSTOMER_TRACKING_METHODS.map((method) => (
                <label
                  key={method}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-accent"
                >
                  <input
                    type="radio"
                    value={method}
                    className="accent-primary"
                    {...register('customerTrackingMethod')}
                  />
                  <span>{method}</span>
                </label>
              ))}
            </div>
            {errors.customerTrackingMethod?.message && (
              <p className="text-sm text-destructive">
                {errors.customerTrackingMethod.message}
              </p>
            )}
          </fieldset>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Review your business
              </h1>
              <p className="text-sm text-muted-foreground">
                Confirm the details below, then finish to open your dashboard.
              </p>
            </div>
            <dl className="space-y-3 rounded-xl border bg-card p-6">
              <ReviewRow label="Business name" value={values.name || '—'} />
              <ReviewRow label="Category" value={industrySummary} />
              <ReviewRow label="Phone" value={values.phone?.trim() || '—'} />
              <ReviewRow
                label="Tracks customers with"
                value={values.customerTrackingMethod ?? '—'}
              />
            </dl>
            {mutation.isError && (
              <p className="text-sm text-destructive">
                {mutation.error?.message ?? 'Something went wrong. Please try again.'}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={goBack}
              disabled={busy}
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              Back
            </button>
          ) : (
            <span />
          )}

          {step < TOTAL_STEPS - 1 ? (
            <button
              type="button"
              onClick={() => {
                void goNext();
              }}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Finish'}
            </button>
          )}
        </div>
      </form>
    </main>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <label className="font-medium">{label}</label>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function ReviewRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="font-medium">{label}</dt>
      <dd className="text-sm text-muted-foreground">{value}</dd>
    </div>
  );
}
