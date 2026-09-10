'use client';

import { useAuth } from '@clerk/nextjs';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Package, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Product } from '@remindam/shared';
import { DEFAULT_PAGE_SIZE } from '@remindam/shared';
import { useActiveBusiness } from '@/components/app-shell/business-context';
import { formatMoney } from '@/lib/format';
import { ApiRequestError } from '@/services/api/client';
import {
  createProduct,
  deleteProduct,
  listProductCategories,
  listProducts,
  updateProduct,
} from '@/services/api/products';
import {
  ProductFormDialog,
  type ProductFormValues,
} from './product-form-dialog';
import { Modal } from '@/components/ui/modal';

const SKELETON_ROWS = ['s1', 's2', 's3', 's4', 's5', 's6'];

/** Sentinel for "no category filter"; a real category is never the empty string. */
const ALL_CATEGORIES = '';

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

/** A blank price means zero; the API validates the parsed value again. */
function toNumber(value: string): number {
  return value.trim() === '' ? 0 : Number(value);
}

/**
 * The Products screen: a list of what the business sells — search, filter by
 * category, paginate, create, edit and delete. Data comes from the API via
 * React Query (never the DB directly). The active business id is read from
 * context for display and passed to the API, where it is re-validated against
 * the caller's membership (§46).
 */
export function ProductsView(): React.JSX.Element {
  const { active } = useActiveBusiness();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);

  // Debounce the search box into the query key; reset to the first page on change.
  useEffect(() => {
    const handle = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  const categoriesQuery = useQuery({
    queryKey: ['product-categories', active.id],
    queryFn: async () => {
      const token = await getToken();
      return listProductCategories(token, active.id);
    },
  });
  const categories = categoriesQuery.data ?? [];

  const productsQuery = useQuery({
    queryKey: ['products', active.id, q, category, page],
    queryFn: async () => {
      const token = await getToken();
      return listProducts(token, active.id, {
        q: q || undefined,
        category: category || undefined,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
      });
    },
    placeholderData: keepPreviousData,
  });

  const data = productsQuery.data;
  const totalPages = data?.meta.totalPages ?? 1;

  // If a delete empties the current page, step back into range.
  useEffect(() => {
    if (data && page > data.meta.totalPages) {
      setPage(data.meta.totalPages);
    }
  }, [data, page]);

  // A category can disappear when its last product is deleted or recategorised.
  useEffect(() => {
    if (
      category !== ALL_CATEGORIES &&
      categoriesQuery.data &&
      !categoriesQuery.data.includes(category)
    ) {
      setCategory(ALL_CATEGORIES);
    }
  }, [categoriesQuery.data, category]);

  const invalidate = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['products', active.id] }),
      queryClient.invalidateQueries({
        queryKey: ['product-categories', active.id],
      }),
    ]);
  };

  const closeForm = (): void => {
    setFormOpen(false);
    setEditing(null);
  };

  const saveMutation = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      const token = await getToken();
      // Only the catalogue fields are sent. On create the rest fall back to the
      // column defaults; on update, omitted fields are left untouched.
      const payload = {
        name: values.name.trim(),
        category: values.category.trim() ? values.category.trim() : null,
        sku: values.sku.trim() ? values.sku.trim() : null,
        description: values.description.trim()
          ? values.description.trim()
          : null,
        price: toNumber(values.price),
      };
      return editing
        ? updateProduct(token, active.id, editing.id, payload)
        : createProduct(token, active.id, payload);
    },
    onSuccess: async () => {
      await invalidate();
      closeForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (product: Product) => {
      const token = await getToken();
      return deleteProduct(token, active.id, product.id);
    },
    onSuccess: async () => {
      await invalidate();
      setDeleting(null);
    },
  });

  const openCreate = (): void => {
    setEditing(null);
    saveMutation.reset();
    setFormOpen(true);
  };

  const openEdit = (product: Product): void => {
    setEditing(product);
    saveMutation.reset();
    setFormOpen(true);
  };

  const changeCategory = (value: string): void => {
    setCategory(value);
    setPage(1);
  };

  const clearFilters = (): void => {
    setSearch('');
    changeCategory(ALL_CATEGORIES);
  };

  const filtered = q !== '' || category !== ALL_CATEGORIES;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">{active.name}</p>
        </div>
        <button type="button" onClick={openCreate} className={primaryBtn}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add product
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or SKU…"
            aria-label="Search products"
            className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {categories.length > 0 && (
          <select
            value={category}
            onChange={(event) => changeCategory(event.target.value)}
            aria-label="Filter by category"
            className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:w-52"
          >
            <option value={ALL_CATEGORIES}>All categories</option>
            {categories.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )}
      </div>

      {productsQuery.isPending ? (
        <ListSkeleton />
      ) : productsQuery.isError ? (
        <ErrorState
          message={errorMessage(productsQuery.error)}
          retrying={productsQuery.isFetching}
          onRetry={() => void productsQuery.refetch()}
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
            {data?.data.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                currency={active.currency}
                onEdit={() => openEdit(product)}
                onDelete={() => setDeleting(product)}
              />
            ))}
          </ul>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={data?.meta.total ?? 0}
            busy={productsQuery.isFetching}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
          />
        </>
      )}

      <ProductFormDialog
        open={formOpen}
        mode={editing ? 'edit' : 'create'}
        initial={editing}
        currency={active.currency}
        categories={categories}
        pending={saveMutation.isPending}
        errorMessage={
          saveMutation.isError ? errorMessage(saveMutation.error) : null
        }
        onSubmit={(values) => saveMutation.mutate(values)}
        onClose={() => {
          if (!saveMutation.isPending) closeForm();
        }}
      />

      <Modal
        open={deleting !== null}
        title="Delete product"
        onClose={() => {
          if (!deleteMutation.isPending) setDeleting(null);
        }}
      >
        <p className="text-sm text-muted-foreground">
          Delete{' '}
          <span className="font-medium text-foreground">{deleting?.name}</span>?
          This can’t be undone.
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

function ProductRow({
  product,
  currency,
  onEdit,
  onDelete,
}: {
  product: Product;
  currency: string;
  onEdit: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{product.name}</p>
          {product.category && <Badge>{product.category}</Badge>}
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {formatMoney(product.price, currency)}
          {product.sku && <> · {product.sku}</>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${product.name}`}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${product.name}`}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

function Badge({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {children}
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
        {total} {total === 1 ? 'product' : 'products'} · Page {page} of{' '}
        {totalPages}
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
        <Package className="h-7 w-7" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-lg font-semibold">No products yet</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Add what you sell, with prices, so you can attach products to sales.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={onAdd} className={primaryBtn}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add product
        </button>
        <Link
          href="/imports"
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          Import products
        </Link>
      </div>
    </div>
  );
}

function NoMatchesState({
  onClear,
}: {
  onClear: () => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
      <p className="max-w-sm text-sm text-muted-foreground">
        No products match your search and filter.
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
      <h2 className="text-lg font-semibold">We couldn’t load your products</h2>
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
        <li
          key={id}
          className="flex items-center justify-between gap-3 px-4 py-3"
        >
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-56 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-8 w-16 animate-pulse rounded bg-muted" />
        </li>
      ))}
    </ul>
  );
}
