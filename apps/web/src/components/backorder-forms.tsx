'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, SelectInput, TextInput } from '@tadpods/ui';
import { browserApi } from '../lib/api';

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(path: string, method: string, body?: unknown): Promise<void> {
    setBusy(true); setError('');
    try {
      await browserApi(path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Action failed'); } finally { setBusy(false); }
  }
  return { run, busy, error };
}

export function CancelBackorderButton({ backorderId }: { backorderId: string }) {
  const action = useAction();
  return <div className="form-stack">
    {action.error ? <div className="form-message" role="alert">{action.error}</div> : null}
    <Button variant="danger" disabled={action.busy} onClick={() => void action.run(`/backorders/${backorderId}/cancel`, 'POST', {})}>Cancel entire backorder</Button>
  </div>;
}

export function CancelBackorderLineButton({ backorderId, lineId, openQuantity }: { backorderId: string; lineId: string; openQuantity: string }) {
  const action = useAction();
  if (Number(openQuantity) <= 0) return null;
  return <Button variant="danger" disabled={action.busy} onClick={() => void action.run(`/backorders/${backorderId}/lines/${lineId}/cancel`, 'POST', {})}>
    Cancel line
  </Button>;
}

type Supplier = { id: string; code: string; name: string };

export function GeneratePurchaseOrderForm({ supplierOptions, backorderLineIds }: { supplierOptions: Supplier[]; backorderLineIds: string[] }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(supplierOptions[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(): Promise<void> {
    if (!supplierId) return;
    setBusy(true);
    setError('');
    try {
      const result = await browserApi<{ purchaseOrderId: string }>('/backorders/generate-purchase-order', {
        method: 'POST',
        body: JSON.stringify({ supplierId, backorderLineIds })
      });
      router.push(`/purchasing/orders/${result.purchaseOrderId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate a purchase order');
    } finally {
      setBusy(false);
    }
  }

  if (supplierOptions.length === 0) return <p className="muted">Create a supplier before generating a purchase order from this backorder.</p>;

  return <div className="form-stack">
    {error ? <div className="form-message" role="alert">{error}</div> : null}
    <Field label="Supplier">
      <SelectInput value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
        {supplierOptions.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} — {supplier.name}</option>)}
      </SelectInput>
    </Field>
    <Button disabled={busy || !supplierId} onClick={() => void submit()}>Generate purchase order</Button>
  </div>;
}

export function AdjustBackorderLineQuantityForm({ backorderId, lineId, currentQuantity }: { backorderId: string; lineId: string; currentQuantity: string }) {
  const action = useAction();
  const [quantity, setQuantity] = useState(currentQuantity);
  return <div className="inline">
    {action.error ? <div className="form-message" role="alert">{action.error}</div> : null}
    <TextInput value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" style={{ width: '7rem' }} />
    <Button variant="secondary" disabled={action.busy || !quantity || quantity === currentQuantity} onClick={() => void action.run(`/backorders/${backorderId}/lines/${lineId}/adjust-quantity`, 'POST', { quantity })}>
      Adjust
    </Button>
  </div>;
}
