'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Field, ProgressSteps, SelectInput, TextInput } from '@tadpods/ui';
import { browserApi } from '../lib/api';

type Warehouse = { id: string; code: string; name: string; isDefault: boolean };
type ProductOption = { id: string; sku: string; name: string; barcode: string | null; unitOfMeasure: string };
type AdjustmentMode = 'OPENING_STOCK' | 'INCREASE' | 'DECREASE';

const STEPS = ['Enter details', 'Review and confirm'] as const;

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/**
 * Guided opening-stock / adjustment posting. Two steps — enter details, then an explicit
 * review-and-confirm screen showing before/change/after — because this always posts a
 * stock-affecting movement (see Phase 2 Task 3: "require confirmation for all stock-affecting
 * posts"). The before/after preview here is a convenience read of current stock on hand; the
 * server (`StockPostingService`) is the sole authority on what actually posts.
 */
export function AdjustmentForm({ warehouses }: { warehouses: Warehouse[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<AdjustmentMode>('OPENING_STOCK');
  const [warehouseId, setWarehouseId] = useState(warehouses.find((warehouse) => warehouse.isDefault)?.id ?? warehouses[0]?.id ?? '');
  const [productSearch, setProductSearch] = useState('');
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productSearchBusy, setProductSearchBusy] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [beforeQuantity, setBeforeQuantity] = useState<string | null>(null);
  const [beforeBusy, setBeforeBusy] = useState(false);
  const [beforeError, setBeforeError] = useState('');
  const [step, setStep] = useState<0 | 1>(0);
  const [idempotencyKey, setIdempotencyKey] = useState(randomId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [posted, setPosted] = useState(false);

  useEffect(() => {
    if (!productSearch.trim()) { setProductOptions([]); return; }
    let cancelled = false;
    setProductSearchBusy(true);
    const timeout = setTimeout(() => {
      browserApi<ProductOption[]>(`/inventory/adjustments/products?search=${encodeURIComponent(productSearch.trim())}`)
        .then((results) => { if (!cancelled) setProductOptions(results); })
        .catch(() => { if (!cancelled) setProductOptions([]); })
        .finally(() => { if (!cancelled) setProductSearchBusy(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [productSearch]);

  useEffect(() => {
    if (!selectedProduct || !warehouseId) { setBeforeQuantity(null); return; }
    let cancelled = false;
    setBeforeBusy(true);
    setBeforeError('');
    browserApi<{ total: { productId: string; quantity: string }[] }>(`/inventory/stock-on-hand?productId=${selectedProduct.id}&warehouseId=${warehouseId}`)
      .then((response) => { if (!cancelled) setBeforeQuantity(response.total[0]?.quantity ?? '0.0000'); })
      .catch(() => { if (!cancelled) setBeforeError('Could not load current stock on hand.'); })
      .finally(() => { if (!cancelled) setBeforeBusy(false); });
    return () => { cancelled = true; };
  }, [selectedProduct, warehouseId]);

  const afterQuantity = useMemo(() => {
    if (beforeQuantity === null || !quantity || Number.isNaN(Number(quantity))) return null;
    const signed = mode === 'DECREASE' ? -Number(quantity) : Number(quantity);
    return (Number(beforeQuantity) + signed).toFixed(4);
  }, [beforeQuantity, quantity, mode]);

  const reasonRequired = mode !== 'OPENING_STOCK';
  const canReview = Boolean(warehouseId && selectedProduct && quantity && Number(quantity) > 0 && (!reasonRequired || reason.trim().length >= 3));

  function selectProduct(product: ProductOption): void {
    setSelectedProduct(product);
    setProductOptions([]);
    setProductSearch(`${product.sku} — ${product.name}`);
  }

  function goToReview(event: FormEvent): void {
    event.preventDefault();
    if (!canReview) return;
    setError('');
    setStep(1);
  }

  async function confirmPost(): Promise<void> {
    if (!selectedProduct) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'OPENING_STOCK') {
        await browserApi('/inventory/opening-stock', {
          method: 'POST',
          body: JSON.stringify({ productId: selectedProduct.id, warehouseId, quantity, notes: notes.trim() || null, idempotencyKey })
        });
      } else {
        await browserApi('/inventory/adjustments', {
          method: 'POST',
          body: JSON.stringify({
            productId: selectedProduct.id,
            warehouseId,
            direction: mode,
            quantity,
            reason: reason.trim(),
            idempotencyKey,
            allowNegativeStockOverride: false
          })
        });
      }
      setPosted(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Posting failed');
    } finally {
      setBusy(false);
    }
  }

  function startAnother(): void {
    setSelectedProduct(null);
    setProductSearch('');
    setQuantity('');
    setReason('');
    setNotes('');
    setBeforeQuantity(null);
    setIdempotencyKey(randomId());
    setStep(0);
    setPosted(false);
    setError('');
  }

  if (posted) {
    return <div className="form-stack">
      <div className="empty-state"><strong>Posted.</strong><p>{mode === 'OPENING_STOCK' ? 'Opening stock has been posted to the ledger.' : 'The adjustment has been posted to the ledger.'} It can be reversed from the adjustments list if it was made in error.</p></div>
      <div className="grid grid--2">
        <Button onClick={startAnother}>Record another posting</Button>
        <Button variant="secondary" onClick={() => router.push('/inventory/adjustments')}>View adjustments</Button>
      </div>
    </div>;
  }

  return <div className="form-stack">
    <ProgressSteps steps={STEPS} current={step} />
    {step === 0 ? <form className="form-stack" onSubmit={goToReview}>
      <Field label="Posting type">
        <SelectInput value={mode} onChange={(event) => setMode(event.target.value as AdjustmentMode)}>
          <option value="OPENING_STOCK">Opening stock</option>
          <option value="INCREASE">Positive adjustment (increase)</option>
          <option value="DECREASE">Negative adjustment (decrease)</option>
        </SelectInput>
      </Field>
      <Field label="Warehouse">
        <SelectInput value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} required>
          {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} — {warehouse.name}{warehouse.isDefault ? ' (default)' : ''}</option>)}
        </SelectInput>
      </Field>
      <Field label="Product" hint="Search by SKU, name, or barcode.">
        <TextInput
          value={productSearch}
          onChange={(event) => { setProductSearch(event.target.value); setSelectedProduct(null); }}
          placeholder="Start typing to search products"
          required
        />
        {productSearchBusy ? <div className="muted" role="status">Searching products…</div> : null}
        {!selectedProduct && productSearch.trim() && !productSearchBusy ? (
          productOptions.length ? <div className="checkbox-list">{productOptions.map((product) => <button type="button" key={product.id} className="button button--secondary" onClick={() => selectProduct(product)}>{product.sku} — {product.name}</button>)}</div>
            : <div className="muted">No active products match &quot;{productSearch}&quot;.</div>
        ) : null}
        {selectedProduct ? <div><Badge tone="info">Selected: {selectedProduct.sku} — {selectedProduct.name}</Badge></div> : null}
      </Field>
      <Field label={`Quantity (${selectedProduct?.unitOfMeasure ?? 'units'})`}>
        <TextInput type="number" min="0" step="0.0001" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
      </Field>
      {reasonRequired ? <Field label="Reason" hint="Required for every adjustment — this becomes part of the permanent ledger record.">
        <TextInput value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} required />
      </Field> : <Field label="Notes (optional)">
        <TextInput value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} />
      </Field>}
      {selectedProduct && warehouseId ? <div className="card__body" style={{ border: '1px solid var(--border, #ddd)', borderRadius: 8, padding: '0.75rem' }}>
        {beforeBusy ? <div className="muted" role="status">Loading current stock on hand…</div>
          : beforeError ? <div className="field__error" role="alert">{beforeError}</div>
          : beforeQuantity !== null ? <p>Current stock on hand at this warehouse: <strong>{beforeQuantity}</strong>{afterQuantity !== null ? <> · Resulting stock on hand: <strong>{afterQuantity}</strong></> : null}</p>
          : null}
      </div> : null}
      <Button disabled={!canReview}>Review posting</Button>
    </form> : <div className="form-stack">
      <div className="card__body" style={{ border: '1px solid var(--border, #ddd)', borderRadius: 8, padding: '0.75rem' }}>
        <p><strong>Posting type:</strong> {mode === 'OPENING_STOCK' ? 'Opening stock' : mode === 'INCREASE' ? 'Positive adjustment' : 'Negative adjustment'}</p>
        <p><strong>Warehouse:</strong> {warehouses.find((warehouse) => warehouse.id === warehouseId)?.name}</p>
        <p><strong>Product:</strong> {selectedProduct?.sku} — {selectedProduct?.name}</p>
        <p><strong>Before quantity:</strong> {beforeQuantity ?? '—'}</p>
        <p><strong>Change:</strong> {mode === 'DECREASE' ? '-' : '+'}{quantity}</p>
        <p><strong>After quantity:</strong> {afterQuantity ?? '—'}</p>
        {reasonRequired ? <p><strong>Reason:</strong> {reason}</p> : notes ? <p><strong>Notes:</strong> {notes}</p> : null}
      </div>
      {error ? <div className="field__error" role="alert">{error}</div> : null}
      <div className="grid grid--2">
        <Button disabled={busy} onClick={() => void confirmPost()}>Confirm and post</Button>
        <Button variant="secondary" disabled={busy} onClick={() => setStep(0)}>Back</Button>
      </div>
    </div>}
  </div>;
}

/** Reverses a posted opening-stock or adjustment movement via the existing generic reversal endpoint. */
export function ReverseAdjustmentButton({ movementId, alreadyReversed }: { movementId: string; alreadyReversed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  async function reverse(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await browserApi(`/inventory/movements/${movementId}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: randomId(), notes: 'Reversed from the adjustments screen' })
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reversal failed');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (alreadyReversed) return <Badge tone="neutral">Reversed</Badge>;
  if (!confirming) return <Button variant="danger" onClick={() => setConfirming(true)}>Reverse</Button>;
  return <div className="form-stack">
    <p>Reverse this posting with an equal and opposite movement?</p>
    {error ? <div className="field__error" role="alert">{error}</div> : null}
    <div className="grid grid--2">
      <Button variant="danger" disabled={busy} onClick={() => void reverse()}>Confirm reversal</Button>
      <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
    </div>
  </div>;
}
