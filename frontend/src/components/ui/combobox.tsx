'use client';

import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

/** One selectable row in a {@link Combobox}. `meta` is an optional second line. */
export interface ComboboxOption {
  id: string;
  label: string;
  meta?: string;
}

/**
 * A controlled, accessible, server-backed single-select combobox.
 *
 * Products used a native `<select>`/`<datalist>`, but those cap at one page of
 * options and can't hand back an id. Sales needs to pick a customer or a product
 * out of a set that may run past the 100-row page, so this searches the API as
 * you type: it debounces input (300 ms), ignores out-of-order responses (the
 * latest query always wins), and shows honest loading / empty states.
 *
 * The parent owns the value: it passes the selected `label` to display and gets
 * the chosen `ComboboxOption` (or `null` on clear) back through `onSelect`.
 * `onSearch` returns the options for a query — an empty query should return the
 * first page, so opening the menu immediately shows something to pick.
 *
 * Kept usable inside {@link Modal}: Escape closes just the menu (its propagation
 * is stopped so the dialog itself stays open), and Enter selects the active
 * option instead of submitting the surrounding form.
 */
export function Combobox({
  value,
  label,
  onSelect,
  onSearch,
  placeholder = 'Search…',
  emptyText = 'No matches',
  allowClear = false,
  disabled = false,
  ariaLabel,
  invalid = false,
}: {
  value: string | null;
  label: string;
  onSelect: (option: ComboboxOption | null) => void;
  onSearch: (query: string) => Promise<ComboboxOption[]>;
  placeholder?: string;
  emptyText?: string;
  allowClear?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  invalid?: boolean;
}): React.JSX.Element {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Keep the latest onSearch without making the debounce effect depend on its
  // (usually inline, ever-changing) identity.
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  // Only the most recent request may update state — guards against a slow
  // earlier query landing after a newer one (races).
  const requestId = useRef(0);

  const runSearch = useCallback(async (q: string): Promise<void> => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const results = await onSearchRef.current(q);
      if (id !== requestId.current) return;
      setOptions(results);
      setActiveIndex(results.length > 0 ? 0 : -1);
    } catch {
      if (id !== requestId.current) return;
      setOptions([]);
      setActiveIndex(-1);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  // Debounce searches while open; an empty query fires immediately so opening
  // the menu shows the first page without a pause.
  useEffect(() => {
    if (!open) return undefined;
    const handle = setTimeout(() => void runSearch(query), query === '' ? 0 : 300);
    return () => clearTimeout(handle);
  }, [open, query, runSearch]);

  // Close when focus leaves the whole control (click outside).
  useEffect(() => {
    if (!open) return undefined;
    const onDocMouseDown = (event: MouseEvent): void => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const openMenu = (): void => {
    if (disabled || open) return;
    setQuery('');
    setOpen(true);
  };

  const closeMenu = (): void => {
    setOpen(false);
    setQuery('');
  };

  const choose = (option: ComboboxOption): void => {
    onSelect(option);
    closeMenu();
    inputRef.current?.blur();
  };

  const clear = (): void => {
    onSelect(null);
    setQuery('');
    setOptions([]);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      setActiveIndex((current) =>
        options.length === 0 ? -1 : (current + 1) % options.length,
      );
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) return;
      setActiveIndex((current) =>
        options.length === 0
          ? -1
          : (current - 1 + options.length) % options.length,
      );
    } else if (event.key === 'Enter') {
      if (open && activeIndex >= 0 && options[activeIndex]) {
        // Select the highlighted option rather than submitting the form.
        event.preventDefault();
        choose(options[activeIndex]);
      }
    } else if (event.key === 'Escape') {
      if (open) {
        // Close only the menu; keep the surrounding Modal open.
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
      }
    }
  };

  const showClear = allowClear && value !== null && !disabled;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
          }
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={open ? query : label}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={openMenu}
          onMouseDown={openMenu}
          onKeyDown={onKeyDown}
          className={`w-full rounded-lg border bg-background py-2 pl-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 ${
            showClear ? 'pr-16' : 'pr-9'
          } ${invalid ? 'border-destructive' : ''}`}
        />
        <div className="pointer-events-none absolute right-0 top-0 flex h-full items-center gap-1 pr-2 text-muted-foreground">
          {loading && open && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {showClear && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear selection"
              className="pointer-events-auto rounded p-0.5 hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <ChevronsUpDown className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border bg-card p-1 shadow-lg"
        >
          {loading && options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Searching…</li>
          ) : options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</li>
          ) : (
            options.map((option, index) => {
              const selected = option.id === value;
              const activeRow = index === activeIndex;
              return (
                <li
                  key={option.id}
                  id={`${listboxId}-opt-${index}`}
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(event) => {
                    // Keep focus on the input; select before blur can close us.
                    event.preventDefault();
                    choose(option);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm ${
                    activeRow ? 'bg-accent' : ''
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{option.label}</span>
                    {option.meta && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {option.meta}
                      </span>
                    )}
                  </span>
                  {selected && (
                    <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
