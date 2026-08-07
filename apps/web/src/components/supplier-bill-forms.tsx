'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, SelectInput, TextInput } from '@tadpods/ui';
import { browserApi } from '../lib/api';

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(path: string, method: string, body?: unknown): Promise<unknown> {
    setBusy(true); setError('');
    try {
      const result = await browserApi(path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      router.refresh();
      return result;
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Action failed'); throw caught; } finally { setBusy(false); }
  }
  return { run, busy, error };
}

type BillableLine = { purchaseOrderLineId: string; product: { sku: string; name: string }; unitCost: string; unbilledQuantity: string };

export function CreateSupplierBillForm({ purchaseOrderId, lines }: { purchaseOrderId: string; lines: BillableLine[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(lines.map((line) => line.purchaseOrderLineId)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function toggle(id: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submit(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const created = await browserApi<{ id: string }>('/supplier-bills', {
        method: 'POST',
        body: JSON.stringify({ purchaseOrderId, lines: lines.filter((line) => selected.has(line.purchaseOrderLineId)).map((line) => ({ purchaseOrderLineId: line.purchaseOrderLineId, quantity: line.unbilledQuantity })) })
      });
      router.push(`/purchasing/bills/${created.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create bill');
    } finally {
      setBusy(false);
    }
  }

  return <div className="form-stack">
    {error ? <div className="form-message" role="alert">{error}</div> : null}
    <table className="data-table">
      <thead><tr><th></th><th>Product</th><th>Unit cost</th><th>Unbilled quantity</th></tr></thead>
      <tbody>
        {lines.map((line) => <tr key={line.purchaseOrderLineId}>
          <td><input type="checkbox" checked={selected.has(line.purchaseOrderLineId)} onChange={() => toggle(line.purchaseOrderLineId)} /></td>
          <td>{line.product.sku} — {line.product.name}</td>
          <td>{line.unitCost}</td>
          <td>{line.unbilledQuantity}</td>
        </tr>)}
      </tbody>
    </table>
    <Button disabled={busy || selected.size === 0} onClick={() => void submit()}>Create bill</Button>
  </div>;
}

export function VoidSupplierBillButton({ billId }: { billId: string }) {
  const action = useAction();
  return <div className="form-stack">
    {action.error ? <div className="form-message" role="alert">{action.error}</div> : null}
    <Button variant="danger" disabled={action.busy} onClick={() => void action.run(`/supplier-bills/${billId}/void`, 'POST', {})}>Void bill</Button>
  </div>;
}

type PreviewAllocation = { supplierBillId: string; billNumber: string; amount: string };

export function SupplierPaymentSupplierSelect({ suppliers, selectedSupplierId }: { suppliers: { id: string; code: string; name: string }[]; selectedSupplierId: string }) {
  const router = useRouter();
  return <Field label="Supplier">
    <SelectInput value={selectedSupplierId} onChange={(event) => router.push(`/purchasing/payments/new?supplierId=${event.target.value}`)}>
      {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} — {supplier.name}</option>)}
    </SelectInput>
  </Field>;
}

export function RecordSupplierPaymentForm({ supplierId }: { supplierId: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank-transfer');
  const [reference, setReference] = useState('');
  const [preview, setPreview] = useState<{ allocations: PreviewAllocation[]; unappliedAmount: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadPreview(): Promise<void> {
    if (!amount || Number(amount) <= 0) { setPreview(null); return; }
    try {
      setPreview(await browserApi(`/supplier-payments/preview-allocation?supplierId=${supplierId}&amount=${encodeURIComponent(amount)}`));
    } catch { setPreview(null); }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!amount) return;
    setBusy(true);
    setError('');
    try {
      const created = await browserApi<{ id: string }>('/supplier-payments', {
        method: 'POST',
        body: JSON.stringify({ supplierId, amount, method, reference: reference.trim() || null, idempotencyKey: crypto.randomUUID() })
      });
      router.push(`/purchasing/payments/${created.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record payment');
    } finally {
      setBusy(false);
    }
  }

  return <form className="form-stack" onSubmit={(event) => void submit(event)}>
    {error ? <div className="form-message" role="alert">{error}</div> : null}
    <div className="grid grid--2">
      <Field label="Amount">
        <TextInput value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} onBlur={() => void loadPreview()} />
      </Field>
      <Field label="Method">
        <SelectInput value={method} onChange={(event) => setMethod(event.target.value)}>
          <option value="bank-transfer">Bank transfer</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="cheque">Cheque</option>
        </SelectInput>
      </Field>
    </div>
    <Field label="Reference"><TextInput value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} /></Field>
    {preview ? <div className="form-message" role="status">
      {preview.allocations.length === 0
        ? 'No open bills — this payment will be recorded entirely as unapplied credit.'
        : <>This will allocate: {preview.allocations.map((allocation) => `${allocation.billNumber} (${allocation.amount})`).join(', ')}
            {Number(preview.unappliedAmount) > 0 ? `, leaving ${preview.unappliedAmount} as unapplied credit.` : '.'}</>}
    </div> : null}
    <Button disabled={busy || !amount}>Record payment</Button>
  </form>;
}

export function ReverseSupplierPaymentButton({ paymentId }: { paymentId: string }) {
  const action = useAction();
  return <div className="form-stack">
    {action.error ? <div className="form-message" role="alert">{action.error}</div> : null}
    <Button variant="danger" disabled={action.busy} onClick={() => void action.run(`/supplier-payments/${paymentId}/reverse`, 'POST', {})}>Reverse payment</Button>
  </div>;
}

export function CreateSupplierCreditForm({ supplierId }: { supplierId: string }) {
  const mutation = useAction();
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutation.run('/supplier-credits', 'POST', { supplierId, amount: data.get('amount'), sourceType: data.get('sourceType'), notes: data.get('notes') || null }).then(() => form.reset());
  }
  return <form className="form-stack" onSubmit={submit}>
    {mutation.error ? <div className="form-message" role="alert">{mutation.error}</div> : null}
    <div className="grid grid--2">
      <Field label="Amount"><TextInput name="amount" inputMode="decimal" required /></Field>
      <Field label="Source">
        <SelectInput name="sourceType" defaultValue="MANUAL">
          <option value="MANUAL">Goodwill</option>
          <option value="RETURN">Return</option>
        </SelectInput>
      </Field>
    </div>
    <Field label="Notes"><TextInput name="notes" maxLength={2000} /></Field>
    <Button variant="secondary" disabled={mutation.busy}>Create credit</Button>
  </form>;
}

export function ApplySupplierCreditButton({ creditId }: { creditId: string }) {
  const action = useAction();
  return <div className="form-stack">
    {action.error ? <div className="form-message" role="alert">{action.error}</div> : null}
    <Button disabled={action.busy} onClick={() => void action.run(`/supplier-credits/${creditId}/apply`, 'POST', {})}>Apply to oldest open bills</Button>
  </div>;
}

export function CreateSupplierRefundForm({ creditId, maxAmount }: { creditId: string; maxAmount: string }) {
  const mutation = useAction();
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutation.run('/supplier-refunds', 'POST', { supplierCreditId: creditId, amount: data.get('amount'), method: data.get('method'), reference: data.get('reference') || null }).then(() => form.reset());
  }
  return <form className="form-stack" onSubmit={submit}>
    {mutation.error ? <div className="form-message" role="alert">{mutation.error}</div> : null}
    <div className="grid grid--2">
      <Field label={`Amount (up to ${maxAmount})`}><TextInput name="amount" inputMode="decimal" required /></Field>
      <Field label="Method">
        <SelectInput name="method" defaultValue="bank-transfer">
          <option value="bank-transfer">Bank transfer</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
        </SelectInput>
      </Field>
    </div>
    <Field label="Reference"><TextInput name="reference" maxLength={120} /></Field>
    <Button variant="secondary" disabled={mutation.busy}>Issue refund</Button>
  </form>;
}
