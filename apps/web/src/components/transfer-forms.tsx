'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Field, ProgressSteps, SelectInput, TextInput } from '@tadpods/ui';
import { browserApi } from '../lib/api';

type Warehouse = { id: string; code: string; name: string; isDefault: boolean };
type ProductOption = { id: string; sku: string; name: string; barcode: string | null; unitOfMeasure: string };
type DraftLine = { key: string; product: ProductOption; quantity: string };

const STEPS = ['Choose warehouses and products', 'Review and confirm'] as const;

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/**
 * Guided, multi-line warehouse transfer. Two steps — enter details, then an explicit
 * review-and-confirm screen — because a transfer always posts a linked pair of
 * stock-affecting movements per line (see Phase 2 Task 4). The server
 * (`TransfersService`/`StockPostingService`) is the sole authority on what actually posts;
 * this form only assembles the request and previews it before submission.
 */
export function TransferForm({ warehouses }: { warehouses: Warehouse[] }) {
  const router = useRouter();
  const [fromWarehouseId, setFromWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [toWarehouseId, setToWarehouseId] = useState(warehouses[1]?.id ?? warehouses[0]?.id ?? '');
  const [productSearch, setProductSearch] = useState('');
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productSearchBusy, setProductSearchBusy] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [notes, setNotes] = useState('');
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
      browserApi<ProductOption[]>(`/inventory/transfers/products?search=${encodeURIComponent(productSearch.trim())}`)
        .then((results) => { if (!cancelled) setProductOptions(results); })
        .catch(() => { if (!cancelled) setProductOptions([]); })
        .finally(() => { if (!cancelled) setProductSearchBusy(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [productSearch]);

  const sameWarehouse = Boolean(fromWarehouseId) && fromWarehouseId === toWarehouseId;

  function addLine(product: ProductOption): void {
    if (!quantity || Number(quantity) <= 0) return;
    if (lines.some((line) => line.product.id === product.id)) return;
    setLines((current) => [...current, { key: randomId(), product, quantity }]);
    setProductSearch('');
    setProductOptions([]);
    setQuantity('');
  }

  function removeLine(key: string): void {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  const canReview = Boolean(fromWarehouseId && toWarehouseId && !sameWarehouse && lines.length > 0);

  function goToReview(event: FormEvent): void {
    event.preventDefault();
    if (!canReview) return;
    setError('');
    setStep(1);
  }

  async function confirmPost(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await browserApi('/inventory/transfers', {
        method: 'POST',
        body: JSON.stringify({
          fromWarehouseId,
          toWarehouseId,
          lines: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
          notes: notes.trim() || null,
          idempotencyKey
        })
      });
      setPosted(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Transfer failed');
    } finally {
      setBusy(false);
    }
  }

  function startAnother(): void {
    setLines([]);
    setQuantity('');
    setProductSearch('');
    setNotes('');
    setIdempotencyKey(randomId());
    setStep(0);
    setPosted(false);
    setError('');
  }

  if (posted) {
    return <div className="form-stack">
      <div className="empty-state"><strong>Transfer posted.</strong><p>Every line has posted as a linked pair of movements. It can be reversed from the transfers list if it was made in error.</p></div>
      <div className="grid grid--2">
        <Button onClick={startAnother}>Record another transfer</Button>
        <Button variant="secondary" onClick={() => router.push('/inventory/transfers')}>View transfers</Button>
      </div>
    </div>;
  }

  return <div className="form-stack">
    <ProgressSteps steps={STEPS} current={step} />
    {step === 0 ? <form className="form-stack" onSubmit={goToReview}>
      <div className="grid grid--2">
        <Field label="From warehouse">
          <SelectInput value={fromWarehouseId} onChange={(event) => setFromWarehouseId(event.target.value)} required>
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} — {warehouse.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="To warehouse" {...(sameWarehouse ? { error: 'Must be different from the source warehouse' } : {})}>
          <SelectInput value={toWarehouseId} onChange={(event) => setToWarehouseId(event.target.value)} required>
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} — {warehouse.name}</option>)}
          </SelectInput>
        </Field>
      </div>
      <Field label="Add a product" hint="Search by SKU, name, or barcode, enter a quantity, then add it as a line.">
        <TextInput
          value={productSearch}
          onChange={(event) => setProductSearch(event.target.value)}
          placeholder="Start typing to search products"
        />
        {productSearchBusy ? <div className="muted" role="status">Searching products…</div> : null}
        {productSearch.trim() && !productSearchBusy ? (
          productOptions.length ? <div className="checkbox-list">{productOptions.map((product) => <div key={product.id} className="grid grid--2">
              <span>{product.sku} — {product.name}</span>
              <div className="grid grid--2">
                <TextInput type="number" min="0" step="0.0001" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder={`Quantity (${product.unitOfMeasure})`} />
                <Button type="button" variant="secondary" onClick={() => addLine(product)} disabled={!quantity || Number(quantity) <= 0}>Add line</Button>
              </div>
            </div>)}</div>
            : <div className="muted">No active products match &quot;{productSearch}&quot;.</div>
        ) : null}
      </Field>
      {lines.length > 0 ? <Field label="Lines">
        <div className="checkbox-list">
          {lines.map((line) => <div key={line.key} className="grid grid--2">
            <span><Badge tone="info">{line.product.sku}</Badge> {line.product.name} — {line.quantity} {line.product.unitOfMeasure}</span>
            <Button type="button" variant="danger" onClick={() => removeLine(line.key)}>Remove</Button>
          </div>)}
        </div>
      </Field> : null}
      <Field label="Notes (optional)">
        <TextInput value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} />
      </Field>
      <Button disabled={!canReview}>Review transfer</Button>
    </form> : <div className="form-stack">
      <div className="card__body" style={{ border: '1px solid var(--border, #ddd)', borderRadius: 8, padding: '0.75rem' }}>
        <p><strong>From:</strong> {warehouses.find((warehouse) => warehouse.id === fromWarehouseId)?.name}</p>
        <p><strong>To:</strong> {warehouses.find((warehouse) => warehouse.id === toWarehouseId)?.name}</p>
        <p><strong>Lines:</strong></p>
        <ul>{lines.map((line) => <li key={line.key}>{line.product.sku} — {line.product.name}: {line.quantity} {line.product.unitOfMeasure}</li>)}</ul>
        {notes ? <p><strong>Notes:</strong> {notes}</p> : null}
      </div>
      {error ? <div className="field__error" role="alert">{error}</div> : null}
      <div className="grid grid--2">
        <Button disabled={busy} onClick={() => void confirmPost()}>Confirm and post transfer</Button>
        <Button variant="secondary" disabled={busy} onClick={() => setStep(0)}>Back</Button>
      </div>
    </div>}
  </div>;
}

/** Reverses every movement a transfer posted, atomically, via the transfer-level reversal endpoint. */
export function ReverseTransferButton({ transferId }: { transferId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  async function reverse(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await browserApi(`/inventory/transfers/${transferId}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: randomId(), notes: 'Reversed from the transfers screen' })
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reversal failed');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) return <Button variant="danger" onClick={() => setConfirming(true)}>Reverse</Button>;
  return <div className="form-stack">
    <p>Reverse every line of this transfer with equal and opposite movements?</p>
    {error ? <div className="field__error" role="alert">{error}</div> : null}
    <div className="grid grid--2">
      <Button variant="danger" disabled={busy} onClick={() => void reverse()}>Confirm reversal</Button>
      <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
    </div>
  </div>;
}
