'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, SelectInput, TextInput } from '@tadpods/ui';
import { browserApi } from '../lib/api';

type Supplier = { id: string; code: string; name: string; currency: string };
type ProductOption = { id: string; sku: string; name: string; barcode: string | null; unitOfMeasure: string };
type DraftLine = { key: string; productId: string; label: string; unitCost: string; orderedQuantity: string };

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function NewPurchaseOrderForm({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [pendingUnitCost, setPendingUnitCost] = useState('');
  const [pendingQuantity, setPendingQuantity] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function searchProducts(value: string): Promise<void> {
    setProductSearch(value);
    if (!value.trim()) { setProductOptions([]); return; }
    try {
      setProductOptions(await browserApi<ProductOption[]>(`/inventory/adjustments/products?search=${encodeURIComponent(value.trim())}`));
    } catch { setProductOptions([]); }
  }

  function addLine(): void {
    if (!selectedProduct || !pendingUnitCost || !pendingQuantity) return;
    setLines((current) => [...current, {
      key: randomId(),
      productId: selectedProduct.id,
      label: `${selectedProduct.sku} — ${selectedProduct.name}`,
      unitCost: pendingUnitCost,
      orderedQuantity: pendingQuantity
    }]);
    setSelectedProduct(null);
    setProductSearch('');
    setProductOptions([]);
    setPendingUnitCost('');
    setPendingQuantity('');
  }

  function removeLine(key: string): void {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!supplierId || lines.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const created = await browserApi<{ id: string }>('/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          supplierId,
          notes: notes.trim() || null,
          lines: lines.map((line) => ({ productId: line.productId, unitCost: line.unitCost, orderedQuantity: line.orderedQuantity }))
        })
      });
      router.push(`/purchasing/orders/${created.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create purchase order');
    } finally {
      setBusy(false);
    }
  }

  return <form className="form-stack" onSubmit={(event) => void submit(event)}>
    {error ? <div className="form-message" role="alert">{error}</div> : null}
    <Field label="Supplier">
      <SelectInput value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
        {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} — {supplier.name}</option>)}
      </SelectInput>
    </Field>
    <Field label="Notes"><TextInput value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} /></Field>

    <fieldset className="form-stack">
      <legend>Add line</legend>
      <Field label="Product">
        <TextInput value={productSearch} placeholder="Search by SKU, name, or barcode" onChange={(event) => void searchProducts(event.target.value)} />
      </Field>
      {productOptions.length > 0 ? <ul className="option-list">
        {productOptions.map((product) => <li key={product.id}>
          <button type="button" onClick={() => { setSelectedProduct(product); setProductSearch(`${product.sku} — ${product.name}`); setProductOptions([]); }}>
            {product.sku} — {product.name}
          </button>
        </li>)}
      </ul> : null}
      <div className="grid grid--2">
        <Field label="Unit cost"><TextInput value={pendingUnitCost} onChange={(event) => setPendingUnitCost(event.target.value)} inputMode="decimal" /></Field>
        <Field label="Ordered quantity"><TextInput value={pendingQuantity} onChange={(event) => setPendingQuantity(event.target.value)} inputMode="decimal" /></Field>
      </div>
      <Button type="button" variant="secondary" disabled={!selectedProduct || !pendingUnitCost || !pendingQuantity} onClick={addLine}>Add line</Button>
    </fieldset>

    {lines.length > 0 ? <table className="data-table">
      <thead><tr><th>Product</th><th>Unit cost</th><th>Quantity</th><th></th></tr></thead>
      <tbody>
        {lines.map((line) => <tr key={line.key}>
          <td>{line.label}</td>
          <td>{line.unitCost}</td>
          <td>{line.orderedQuantity}</td>
          <td><Button type="button" variant="danger" onClick={() => removeLine(line.key)}>Remove</Button></td>
        </tr>)}
      </tbody>
    </table> : null}

    <Button disabled={busy || !supplierId || lines.length === 0}>Create draft purchase order</Button>
  </form>;
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(path: string, body?: unknown): Promise<void> {
    setBusy(true); setError('');
    try {
      await browserApi(path, { method: 'POST', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Action failed'); } finally { setBusy(false); }
  }
  return { run, busy, error };
}

export function PurchaseOrderActions({ id, status, canApprove }: { id: string; status: string; canApprove: boolean }) {
  const router = useRouter();
  const action = useAction();
  const [duplicating, setDuplicating] = useState(false);

  async function duplicate(): Promise<void> {
    setDuplicating(true);
    try {
      const created = await browserApi<{ id: string }>(`/purchase-orders/${id}/duplicate`, { method: 'POST' });
      router.push(`/purchasing/orders/${created.id}`);
      router.refresh();
    } finally {
      setDuplicating(false);
    }
  }

  return <div className="form-stack">
    {action.error ? <div className="form-message" role="alert">{action.error}</div> : null}
    <div className="button-row">
      {status === 'DRAFT' ? <Button disabled={action.busy} onClick={() => void action.run(`/purchase-orders/${id}/confirm`)}>Confirm</Button> : null}
      {status === 'DRAFT' ? <Button variant="secondary" disabled={action.busy} onClick={() => void action.run(`/purchase-orders/${id}/submit`)}>Submit for approval</Button> : null}
      {status === 'AWAITING_APPROVAL' && canApprove ? <Button disabled={action.busy} onClick={() => void action.run(`/purchase-orders/${id}/approve`)}>Approve</Button> : null}
      {(status === 'DRAFT' || status === 'AWAITING_APPROVAL' || status === 'CONFIRMED') ? <Button variant="danger" disabled={action.busy} onClick={() => void action.run(`/purchase-orders/${id}/cancel`, {})}>Cancel</Button> : null}
      <Button variant="secondary" disabled={duplicating} onClick={() => void duplicate()}>Duplicate</Button>
    </div>
  </div>;
}
