'use client';

import { MessageSquare } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Lead } from '@remindam/shared';
import { MAX_LEAD_NOTE_LENGTH } from '@remindam/shared';
import { Modal } from '@/components/ui/modal';

const fieldClass =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50';

/** Full date + time for a note — interactions are timestamped to the minute. */
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
 * The interactions timeline for one lead: an immutable, newest-first log of dated
 * notes plus a box to add another. Notes feed the customer's intelligence read by
 * later phases, so they are add-only here (no edit/delete of a single note). The
 * `lead` is derived from live query data by the parent, so a freshly added note
 * appears as soon as the add-note mutation invalidates the list.
 */
export function LeadInteractionsDialog({
  open,
  lead,
  pending,
  errorMessage,
  onAdd,
  onClose,
}: {
  open: boolean;
  lead: Lead | null;
  pending: boolean;
  errorMessage: string | null;
  onAdd: (note: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [note, setNote] = useState('');
  const previousPending = useRef(pending);

  // Clear the box when a note finishes saving (pending falls true → false with no
  // error), and whenever the dialog is opened for a lead.
  useEffect(() => {
    if (previousPending.current && !pending && !errorMessage) {
      setNote('');
    }
    previousPending.current = pending;
  }, [pending, errorMessage]);

  useEffect(() => {
    if (open) setNote('');
  }, [open, lead?.id]);

  const interactions = lead?.interactions ?? [];
  const trimmed = note.trim();
  const tooLong = trimmed.length > MAX_LEAD_NOTE_LENGTH;
  const canSubmit = trimmed.length > 0 && !tooLong && !pending;

  const submit = (): void => {
    if (!canSubmit) return;
    onAdd(trimmed);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Interactions — ${lead?.customerName ?? 'Lead'}`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Log a call, message or visit…"
            aria-label="New interaction note"
            disabled={pending}
            className={fieldClass}
          />
          <div className="flex items-center justify-between gap-3">
            <p
              className={`text-xs ${
                tooLong ? 'text-destructive' : 'text-muted-foreground'
              }`}
            >
              {tooLong
                ? `Keep it under ${MAX_LEAD_NOTE_LENGTH} characters`
                : 'Notes can’t be edited once added.'}
            </p>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {pending ? 'Adding…' : 'Add note'}
            </button>
          </div>
          {errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}
        </div>

        <div className="border-t pt-4">
          {interactions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MessageSquare className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="text-sm text-muted-foreground">
                No interactions yet. Add the first note above.
              </p>
            </div>
          ) : (
            <ol className="flex max-h-72 flex-col gap-3 overflow-auto pr-1">
              {interactions.map((interaction) => (
                <li
                  key={interaction.id}
                  className="rounded-lg border bg-card px-3 py-2"
                >
                  <p className="whitespace-pre-wrap text-sm">
                    {interaction.note}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatTimestamp(interaction.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Modal>
  );
}
