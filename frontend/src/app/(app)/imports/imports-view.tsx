'use client';

import { useAuth } from '@clerk/nextjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  FileUp,
  Upload,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type {
  CustomerColumnMapping,
  ImportableCustomerField,
  ImportRowResult,
  ImportSummary,
} from '@remindam/shared';
import { MAX_IMPORT_FILE_BYTES } from '@remindam/shared';
import { useActiveBusiness } from '@/components/app-shell/business-context';
import { Modal } from '@/components/ui/modal';
import { ApiRequestError } from '@/services/api/client';
import {
  commitCustomerImport,
  getImport,
  listImports,
  previewCustomerImport,
} from '@/services/api/imports';

const primaryBtn =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50';
const secondaryBtn =
  'inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50';
const fieldClass =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring';

type Step = 'upload' | 'map' | 'summary';

const STEPS: ReadonlyArray<{ key: Step; label: string }> = [
  { key: 'upload', label: 'Upload' },
  { key: 'map', label: 'Map columns' },
  { key: 'summary', label: 'Summary' },
];

const MAPPING_FIELDS: ReadonlyArray<{
  key: ImportableCustomerField;
  label: string;
  required: boolean;
}> = [
  { key: 'name', label: 'Name', required: true },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'notes', label: 'Notes', required: false },
];

/** Turn any thrown value into a human-readable message for the UI. */
function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The Imports screen: a guided three-step wizard (Upload → Map columns →
 * Summary) for bringing customers in from a CSV or XLSX file. The frontend only
 * uploads the raw file and guides the review; all parsing, validation and
 * duplicate detection run on the backend (§46). Nothing is written until the
 * user confirms on the map step, and the summary shows exactly what happened to
 * every row — nothing is silently discarded (§24).
 */
export function ImportsView(): React.JSX.Element {
  const { active } = useActiveBusiness();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<CustomerColumnMapping>({
    name: null,
    phone: null,
    email: null,
    notes: null,
  });
  const [viewingId, setViewingId] = useState<string | null>(null);

  const importsQuery = useQuery({
    queryKey: ['imports', active.id],
    queryFn: async () => {
      const token = await getToken();
      return listImports(token, active.id, { pageSize: 5 });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (picked: File) => {
      const token = await getToken();
      return previewCustomerImport(token, active.id, picked);
    },
    onSuccess: (preview) => {
      setMapping(preview.suggestedMapping);
      setStep('map');
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Please choose a file first.');
      const token = await getToken();
      return commitCustomerImport(token, active.id, file, mapping);
    },
    onSuccess: async () => {
      setStep('summary');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customers', active.id] }),
        queryClient.invalidateQueries({ queryKey: ['imports', active.id] }),
      ]);
    },
  });

  const onPickFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const picked = event.target.files?.[0] ?? null;
    previewMutation.reset();
    if (!picked) {
      setFile(null);
      setFileError(null);
      return;
    }
    const lower = picked.name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx')) {
      setFile(null);
      setFileError('Please choose a .csv or .xlsx file.');
      return;
    }
    if (picked.size > MAX_IMPORT_FILE_BYTES) {
      setFile(null);
      setFileError('That file is larger than 5 MB. Please choose a smaller file.');
      return;
    }
    setFileError(null);
    setFile(picked);
  };

  const resetAll = (): void => {
    setStep('upload');
    setFile(null);
    setFileError(null);
    previewMutation.reset();
    commitMutation.reset();
  };

  const preview = previewMutation.data;
  const summary = commitMutation.data;
  const nameMapped = mapping.name !== null;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 py-2">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import customers</h1>
        <p className="text-sm text-muted-foreground">{active.name}</p>
      </div>

      <Stepper current={step} />

      {step === 'upload' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-6">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center hover:bg-accent">
              <FileUp
                className="h-8 w-8 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="text-sm font-medium">
                {file ? file.name : 'Choose a CSV or XLSX file'}
              </span>
              <span className="text-xs text-muted-foreground">
                {file ? formatBytes(file.size) : 'Up to 5 MB · .csv or .xlsx'}
              </span>
              <input
                type="file"
                accept=".csv,.xlsx"
                className="sr-only"
                onChange={onPickFile}
              />
            </label>

            <p className="text-xs text-muted-foreground">
              Nothing is saved yet — you’ll map the columns and review every row
              before anything is imported.
            </p>

            {fileError && (
              <p className="text-sm text-destructive">{fileError}</p>
            )}
            {previewMutation.isError && (
              <p className="text-sm text-destructive">
                {errorMessage(previewMutation.error)}
              </p>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (file) previewMutation.mutate(file);
                }}
                disabled={!file || previewMutation.isPending}
                className={primaryBtn}
              >
                {previewMutation.isPending ? 'Reading file…' : 'Continue'}
              </button>
            </div>
          </div>

          <RecentImports
            loading={importsQuery.isPending}
            error={importsQuery.isError ? errorMessage(importsQuery.error) : null}
            items={importsQuery.data?.data ?? []}
            onOpen={setViewingId}
          />
        </div>
      )}

      {step === 'map' && preview && (
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="text-lg font-semibold">Map your columns</h2>
            <p className="text-sm text-muted-foreground">
              Tell RemindAm which column holds each detail. We’ve guessed from
              your headers — adjust anything that looks wrong.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {MAPPING_FIELDS.map((field) => (
              <MappingField
                key={field.key}
                label={field.label}
                required={field.required}
                value={mapping[field.key]}
                columns={preview.columns}
                onChange={(next) =>
                  setMapping((current) => ({ ...current, [field.key]: next }))
                }
              />
            ))}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">
              Preview{' '}
              <span className="font-normal text-muted-foreground">
                (showing {preview.sampleRows.length} of {preview.totalRows}{' '}
                {preview.totalRows === 1 ? 'row' : 'rows'})
              </span>
            </h3>
            <PreviewTable columns={preview.columns} rows={preview.sampleRows} />
          </div>

          {commitMutation.isError && (
            <p className="text-sm text-destructive">
              {errorMessage(commitMutation.error)}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                commitMutation.reset();
                setStep('upload');
              }}
              disabled={commitMutation.isPending}
              className={secondaryBtn}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>
            <button
              type="button"
              onClick={() => commitMutation.mutate()}
              disabled={!nameMapped || commitMutation.isPending}
              className={primaryBtn}
            >
              {commitMutation.isPending
                ? 'Importing…'
                : `Import ${preview.totalRows} ${
                    preview.totalRows === 1 ? 'row' : 'rows'
                  }`}
            </button>
          </div>
          {!nameMapped && (
            <p className="text-right text-xs text-muted-foreground">
              Choose which column holds the customer’s name to continue.
            </p>
          )}
        </div>
      )}

      {step === 'summary' && summary && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Import complete</h2>
              <p className="text-sm text-muted-foreground">
                {summary.filename} · {summary.totalRows}{' '}
                {summary.totalRows === 1 ? 'row' : 'rows'} processed
              </p>
            </div>
          </div>

          <SummaryDetail summary={summary} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={resetAll} className={secondaryBtn}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              Import another file
            </button>
            <Link href="/customers" className={primaryBtn}>
              <Users className="h-4 w-4" aria-hidden="true" />
              View customers
            </Link>
          </div>
        </div>
      )}

      <PastImportModal
        businessId={active.id}
        importId={viewingId}
        onClose={() => setViewingId(null)}
      />
    </section>
  );
}

function Stepper({ current }: { current: Step }): React.JSX.Element {
  const currentIndex = STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="flex items-center gap-2 text-sm">
      {STEPS.map((s, index) => {
        const state =
          index < currentIndex
            ? 'done'
            : index === currentIndex
              ? 'current'
              : 'todo';
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ' +
                (state === 'todo'
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-primary text-primary-foreground')
              }
            >
              {index + 1}
            </span>
            <span
              className={
                state === 'current'
                  ? 'font-medium'
                  : 'text-muted-foreground'
              }
            >
              {s.label}
            </span>
            {index < STEPS.length - 1 && (
              <span className="mx-1 h-px w-6 bg-border" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function MappingField({
  label,
  required,
  value,
  columns,
  onChange,
}: {
  label: string;
  required: boolean;
  value: number | null;
  columns: string[];
  onChange: (next: number | null) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      <select
        value={value === null ? '' : String(value)}
        onChange={(event) =>
          onChange(event.target.value === '' ? null : Number(event.target.value))
        }
        className={fieldClass}
      >
        {required ? (
          value === null && <option value="">Choose a column…</option>
        ) : (
          <option value="">— Don’t import —</option>
        )}
        {columns.map((column, index) => (
          <option key={`${index}-${column}`} value={index}>
            {column || `Column ${index + 1}`}
          </option>
        ))}
      </select>
    </div>
  );
}

function PreviewTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: string[][];
}): React.JSX.Element {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-muted/50">
          <tr>
            {columns.map((column, index) => (
              <th
                key={`${index}-${column}`}
                scope="col"
                className="whitespace-nowrap px-3 py-2 font-medium"
              >
                {column || `Column ${index + 1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((_column, colIndex) => (
                <td
                  key={colIndex}
                  className="max-w-[16rem] truncate px-3 py-2 text-muted-foreground"
                >
                  {row[colIndex] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryDetail({
  summary,
}: {
  summary: ImportSummary;
}): React.JSX.Element {
  const skipped = summary.rows.filter((row) => row.status !== 'imported');
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Imported" value={summary.validRows} tone="good" />
        <Stat label="Duplicates" value={summary.duplicateRows} tone="warn" />
        <Stat label="Errors" value={summary.errorRows} tone="bad" />
      </div>

      {skipped.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Every row was imported cleanly — no duplicates or errors.
        </p>
      ) : (
        <div>
          <h3 className="mb-2 text-sm font-medium">
            Rows we didn’t import ({skipped.length})
          </h3>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Row
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Name
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Contact
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Reason
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {skipped.map((row) => (
                  <SkippedRow key={row.rowIndex} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SkippedRow({ row }: { row: ImportRowResult }): React.JSX.Element {
  const contact =
    [row.data.phone, row.data.email].filter(Boolean).join(' · ') || '—';
  const isError = row.status === 'error';
  return (
    <tr>
      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
        {row.rowIndex + 2}
      </td>
      <td className="px-3 py-2">{row.data.name || '—'}</td>
      <td className="px-3 py-2 text-muted-foreground">{contact}</td>
      <td className="px-3 py-2">
        <span
          className={
            'inline-flex items-center gap-1.5 ' +
            (isError ? 'text-destructive' : 'text-amber-600')
          }
        >
          <span
            className={
              'h-1.5 w-1.5 rounded-full ' +
              (isError ? 'bg-destructive' : 'bg-amber-500')
            }
            aria-hidden="true"
          />
          {row.message ?? (isError ? 'Invalid row' : 'Duplicate')}
        </span>
      </td>
    </tr>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'good' | 'warn' | 'bad';
}): React.JSX.Element {
  const toneClass =
    tone === 'good'
      ? 'text-primary'
      : tone === 'warn'
        ? 'text-amber-600'
        : 'text-destructive';
  return (
    <div className="rounded-xl border bg-card px-4 py-3 text-center">
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function RecentImports({
  loading,
  error,
  items,
  onOpen,
}: {
  loading: boolean;
  error: string | null;
  items: Array<{
    id: string;
    filename: string;
    createdAt: string;
    validRows: number;
    duplicateRows: number;
    errorRows: number;
  }>;
  onOpen: (id: string) => void;
}): React.JSX.Element | null {
  if (loading) {
    return (
      <div className="space-y-2" aria-hidden="true">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-14 animate-pulse rounded-xl bg-muted" />
        <div className="h-14 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-muted-foreground">
        We couldn’t load your recent imports right now.
      </p>
    );
  }
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Recent imports</h2>
      <ul className="flex flex-col divide-y rounded-xl border bg-card">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onOpen(item.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {item.filename}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {formatWhen(item.createdAt)}
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {item.validRows} imported · {item.duplicateRows} dup ·{' '}
                {item.errorRows} err
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PastImportModal({
  businessId,
  importId,
  onClose,
}: {
  businessId: string;
  importId: string | null;
  onClose: () => void;
}): React.JSX.Element {
  const { getToken } = useAuth();
  const query = useQuery({
    queryKey: ['import', businessId, importId],
    queryFn: async () => {
      const token = await getToken();
      return getImport(token, businessId, importId as string);
    },
    enabled: importId !== null,
  });

  return (
    <Modal open={importId !== null} onClose={onClose} title="Import summary">
      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : query.isError ? (
        <p className="text-sm text-destructive">{errorMessage(query.error)}</p>
      ) : query.data ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {query.data.filename} · {formatWhen(query.data.createdAt)}
          </p>
          <SummaryDetail summary={query.data} />
        </div>
      ) : null}
    </Modal>
  );
}
