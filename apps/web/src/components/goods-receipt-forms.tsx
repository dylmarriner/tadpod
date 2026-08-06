'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, SelectInput, TextInput } from '@tadpods/ui';
import { browserApi } from '../lib/api';

type OrderLine = {
  id: string;
  product: { id: string; sku: string; name: string };
  orderedQuantity: string;
  receivedQuantity: string;
  outstandingQuantity: string;
};
type Warehouse = { id: string; code: string; name: string };

function randomKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function NewGoodsReceiptForm({ purchaseOrderId, lines, warehouses }: { purchaseOrderId: string; lines: OrderLine[]; warehouses: Warehouse[] }) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [allowToleranceOverride, setAllowToleranceOverride] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, { received: string; rejected: string }>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function setReceived(lineId: string, value: string): void {
    setQuantities((current) => ({ ...current, [lineId]: { received: value, rejected: current[lineId]?.rejected ?? '' } }));
  }
  function setRejected(lineId: string, value: string): void {
    setQuantities((current) => ({ ...current, [lineId]: { received: current[lineId]?.received ?? '', rejected: value } }));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const receiptLines = Object.entries(quantities)
      .filter(([, value]) => value.received.trim())
      .map(([purchaseOrderLineId, value]) => ({
        purchaseOrderLineId,
        receivedQuantity: value.received.trim(),
        rejectedQuantity: value.rejected.trim() || '0'
      }));
    if (!warehouseId || receiptLines.length === 0) return;

    setBusy(true);
    setError('');
    try {
      const created = await browserApi<{ id: string }>('/goods-receipts', {
        method: 'POST',
        body: JSON.stringify({
          purchaseOrderId,
          warehouseId,
          notes: notes.trim() || null,
          allowToleranceOverride,
          idempotencyKey: randomKey(),
          lines: receiptLines
        })
      });
      router.push(`/purchasing/receipts/${created.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not post goods receipt');
    } finally {
      setBusy(false);
    }
  }

  return <form className="form-stack" onSubmit={(event) => void submit(event)}>
    {error ? <div className="form-message" role="alert">{error}</div> : null}
    <Field label="Warehouse">
      <SelectInput value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
        {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} — {warehouse.name}</option>)}
      </SelectInput>
    </Field>
    <Field label="Notes"><TextInput value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} /></Field>
    <label>
      <input type="checkbox" checked={allowToleranceOverride} onChange={(event) => setAllowToleranceOverride(event.target.checked)} />
      {' '}Allow receiving beyond the ordered quantity (requires purchasing.approve)
    </label>

    <table className="data-table">
      <thead><tr><th>Product</th><th>Ordered</th><th>Received so far</th><th>Outstanding</th><th>Receiving now</th><th>Rejected</th></tr></thead>
      <tbody>
        {lines.map((line) => <tr key={line.id}>
          <td><strong>{line.product.sku}</strong><div className="muted">{line.product.name}</div></td>
          <td>{line.orderedQuantity}</td>
          <td>{line.receivedQuantity}</td>
          <td>{line.outstandingQuantity}</td>
          <td><TextInput value={quantities[line.id]?.received ?? ''} onChange={(event) => setReceived(line.id, event.target.value)} inputMode="decimal" /></td>
          <td><TextInput value={quantities[line.id]?.rejected ?? ''} onChange={(event) => setRejected(line.id, event.target.value)} inputMode="decimal" /></td>
        </tr>)}
      </tbody>
    </table>

    <Button disabled={busy || !warehouseId}>Post goods receipt</Button>
  </form>;
}

export function ReverseGoodsReceiptAction({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function reverse(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await browserApi(`/goods-receipts/${id}/reverse`, { method: 'POST', body: JSON.stringify({ idempotencyKey: randomKey() }) });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reverse this goods receipt');
    } finally {
      setBusy(false);
    }
  }

  return <div className="form-stack">
    {error ? <div className="form-message" role="alert">{error}</div> : null}
    <Button variant="danger" disabled={busy} onClick={() => void reverse()}>Reverse receipt</Button>
  </div>;
}
