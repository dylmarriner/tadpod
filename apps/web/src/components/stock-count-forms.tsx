'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Field, SelectInput, TextInput } from '@tadpods/ui';
import { browserApi } from '../lib/api';

type Warehouse = { id: string; code: string; name: string; isDefault: boolean };
type Category = { id: string; name: string };
type ProductOption = { id: string; sku: string; name: string; barcode: string | null; unitOfMeasure: string };
type Scope = 'ALL' | 'CATEGORY' | 'PRODUCTS';

/** Starts a stock count for a whole warehouse, a category, or an explicit product selection. */
export function NewStockCountForm({ warehouses, categories }: { warehouses: Warehouse[]; categories: Category[] }) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouses.find((warehouse) => warehouse.isDefault)?.id ?? warehouses[0]?.id ?? '');
  const [scope, setScope] = useState<Scope>('ALL');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [productSearch, setProductSearch] = useState('');
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<ProductOption[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (scope !== 'PRODUCTS' || !productSearch.trim()) { setProductOptions([]); return; }
    let cancelled = false;
    const timeout = setTimeout(() => {
      browserApi<ProductOption[]>(`/inventory/adjustments/products?search=${encodeURIComponent(productSearch.trim())}`)
        .then((results) => { if (!cancelled) setProductOptions(results); })
        .catch(() => { if (!cancelled) setProductOptions([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [scope, productSearch]);

  function addProduct(product: ProductOption): void {
    if (selectedProducts.some((existing) => existing.id === product.id)) return;
    setSelectedProducts((current) => [...current, product]);
    setProductSearch('');
    setProductOptions([]);
  }

  function removeProduct(id: string): void {
    setSelectedProducts((current) => current.filter((product) => product.id !== id));
  }

  const canSubmit = Boolean(warehouseId) && (scope === 'ALL' || (scope === 'CATEGORY' && categoryId) || (scope === 'PRODUCTS' && selectedProducts.length > 0));

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      const count = await browserApi<{ id: string }>('/inventory/stock-counts', {
        method: 'POST',
        body: JSON.stringify({
          warehouseId,
          ...(scope === 'CATEGORY' ? { categoryId } : {}),
          ...(scope === 'PRODUCTS' ? { productIds: selectedProducts.map((product) => product.id) } : {}),
          notes: notes.trim() || null
        })
      });
      router.push(`/inventory/stock-counts/${count.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start the stock count');
    } finally {
      setBusy(false);
    }
  }

  return <form className="form-stack" onSubmit={submit}>
    <Field label="Warehouse">
      <SelectInput value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} required>
        {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} — {warehouse.name}{warehouse.isDefault ? ' (default)' : ''}</option>)}
      </SelectInput>
    </Field>
    <Field label="What to count">
      <SelectInput value={scope} onChange={(event) => setScope(event.target.value as Scope)}>
        <option value="ALL">The full warehouse (every active product)</option>
        <option value="CATEGORY">A category</option>
        <option value="PRODUCTS">A specific product selection</option>
      </SelectInput>
    </Field>
    {scope === 'CATEGORY' ? <Field label="Category">
      {categories.length === 0
        ? <div className="muted">No categories exist yet.</div>
        : <SelectInput value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </SelectInput>}
    </Field> : null}
    {scope === 'PRODUCTS' ? <Field label="Products" hint="Search by SKU, name, or barcode, then add each one to the count.">
      <TextInput value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Start typing to search products" />
      {productSearch.trim() ? (
        productOptions.length ? <div className="checkbox-list">{productOptions.map((product) => <button type="button" key={product.id} className="button button--secondary" onClick={() => addProduct(product)}>{product.sku} — {product.name}</button>)}</div>
          : <div className="muted">No active products match &quot;{productSearch}&quot;.</div>
      ) : null}
      {selectedProducts.length > 0 ? <div className="checkbox-list">
        {selectedProducts.map((product) => <div key={product.id} className="grid grid--2">
          <span><Badge tone="info">{product.sku}</Badge> {product.name}</span>
          <Button type="button" variant="danger" onClick={() => removeProduct(product.id)}>Remove</Button>
        </div>)}
      </div> : null}
    </Field> : null}
    <Field label="Notes (optional)">
      <TextInput value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} />
    </Field>
    {error ? <div className="field__error" role="alert">{error}</div> : null}
    <Button disabled={!canSubmit || busy}>Start stock count</Button>
  </form>;
}

type StockCountLine = {
  id: string;
  product: { id: string; sku: string; name: string; barcode: string | null; unitOfMeasure: string };
  expectedQuantity: string;
  countedQuantity: string | null;
  variance: string | null;
};

/**
 * Barcode-friendly count entry: a single search box filters the line list by SKU, name, or
 * barcode as staff scan or type, and the matching line's counted-quantity field can be
 * focused and submitted without navigating away from the count.
 */
export function StockCountEntry({ countId, lines, status }: { countId: string; lines: StockCountLine[]; status: 'DRAFT' | 'POSTED' }) {
  const router = useRouter();
  const [filter, setFilter] = useState('');
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [posting, setPosting] = useState(false);
  const [confirmingPost, setConfirmingPost] = useState(false);
  const [idempotencyKey] = useState(() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`));

  const normalizedFilter = filter.trim().toLowerCase();
  const visibleLines = normalizedFilter
    ? lines.filter((line) =>
        line.product.sku.toLowerCase().includes(normalizedFilter) ||
        line.product.name.toLowerCase().includes(normalizedFilter) ||
        (line.product.barcode ?? '').toLowerCase().includes(normalizedFilter))
    : lines;

  async function saveLine(lineId: string): Promise<void> {
    const value = draftValues[lineId];
    if (!value || Number.isNaN(Number(value)) || Number(value) < 0) return;
    setSavingLineId(lineId);
    setError('');
    try {
      await browserApi(`/inventory/stock-counts/lines/${lineId}`, {
        method: 'PATCH',
        body: JSON.stringify({ countedQuantity: value })
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the counted quantity');
    } finally {
      setSavingLineId(null);
    }
  }

  async function postCount(): Promise<void> {
    setPosting(true);
    setError('');
    try {
      await browserApi(`/inventory/stock-counts/${countId}/post`, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey })
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not post the stock count');
      setConfirmingPost(false);
    } finally {
      setPosting(false);
    }
  }

  const allCounted = lines.every((line) => line.countedQuantity !== null);

  return <div className="form-stack">
    {status === 'DRAFT' ? <Field label="Find a line" hint="Search or scan by SKU, name, or barcode.">
      <TextInput value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Scan or type to filter" autoFocus />
    </Field> : null}
    {error ? <div className="field__error" role="alert">{error}</div> : null}
    <div className="checkbox-list">
      {visibleLines.length === 0 ? <div className="muted">No lines match &quot;{filter}&quot;.</div> : visibleLines.map((line) => <div key={line.id} className="grid grid--2">
        <span>
          <strong>{line.product.sku}</strong> {line.product.name}
          {line.product.barcode ? <span className="muted"> · {line.product.barcode}</span> : null}
          <div className="muted">Expected: {line.expectedQuantity} {line.product.unitOfMeasure}{line.countedQuantity !== null ? ` · Counted: ${line.countedQuantity} · Variance: ${line.variance}` : ''}</div>
        </span>
        {status === 'DRAFT'
          ? <div className="grid grid--2">
              <TextInput
                type="number"
                min="0"
                step="0.0001"
                defaultValue={line.countedQuantity ?? ''}
                onChange={(event) => setDraftValues((current) => ({ ...current, [line.id]: event.target.value }))}
                placeholder={`Counted (${line.product.unitOfMeasure})`}
              />
              <Button type="button" variant="secondary" disabled={savingLineId === line.id} onClick={() => void saveLine(line.id)}>Save</Button>
            </div>
          : <Badge tone={line.variance && line.variance !== '0.0000' ? 'warning' : 'neutral'}>{line.countedQuantity ?? '—'}</Badge>}
      </div>)}
    </div>
    {status === 'DRAFT' ? (
      confirmingPost ? <div className="form-stack">
        <p>Post this stock count? Every non-zero variance will post as a stock movement, and the count will be locked.</p>
        <div className="grid grid--2">
          <Button disabled={posting} onClick={() => void postCount()}>Confirm and post</Button>
          <Button variant="secondary" disabled={posting} onClick={() => setConfirmingPost(false)}>Cancel</Button>
        </div>
      </div> : <Button disabled={!allCounted} onClick={() => setConfirmingPost(true)}>{allCounted ? 'Post stock count' : 'Count every line before posting'}</Button>
    ) : <Badge tone="neutral">Posted — locked</Badge>}
  </div>;
}
