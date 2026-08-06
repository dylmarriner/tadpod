'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, SelectInput, TextInput } from '@tadpods/ui';
import { browserApi } from '../lib/api';

function useMutation() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(operation: () => Promise<unknown>): Promise<void> {
    setBusy(true); setError('');
    try { await operation(); router.refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Request failed'); } finally { setBusy(false); }
  }
  return { run, error, busy };
}

export function SupplierCreateForm() {
  const mutation = useMutation();
  const [similarNames, setSimilarNames] = useState<{ id: string; code: string; name: string }[]>([]);

  async function checkSimilarNames(name: string): Promise<void> {
    if (!name.trim()) { setSimilarNames([]); return; }
    try {
      setSimilarNames(await browserApi<{ id: string; code: string; name: string }[]>(`/suppliers/similar-names?name=${encodeURIComponent(name.trim())}`));
    } catch { setSimilarNames([]); }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutation.run(async () => {
      await browserApi('/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          code: data.get('code'),
          name: data.get('name'),
          legalName: data.get('legalName') || null,
          taxNumber: data.get('taxNumber') || null,
          currency: data.get('currency') || 'NZD',
          paymentTermsDays: Number(data.get('paymentTermsDays') || 20),
          contactName: data.get('contactName') || null,
          contactEmail: data.get('contactEmail') || null,
          contactPhone: data.get('contactPhone') || null
        })
      });
      form.reset();
      setSimilarNames([]);
    });
  }

  return <form className="form-stack" onSubmit={submit}>
    {mutation.error ? <div className="form-message" role="alert">{mutation.error}</div> : null}
    <div className="grid grid--2">
      <Field label="Account code"><TextInput name="code" required maxLength={40} /></Field>
      <Field label="Display name">
        <TextInput name="name" required maxLength={160} onBlur={(event) => void checkSimilarNames(event.currentTarget.value)} />
      </Field>
    </div>
    {similarNames.length > 0 ? <div className="form-message" role="status">
      Possible duplicate: {similarNames.map((supplier) => `${supplier.code} — ${supplier.name}`).join(', ')}. This is only a warning; you can still create this supplier.
    </div> : null}
    <Field label="Legal name"><TextInput name="legalName" maxLength={200} /></Field>
    <div className="grid grid--2">
      <Field label="Tax number"><TextInput name="taxNumber" maxLength={40} /></Field>
      <Field label="Currency"><TextInput name="currency" maxLength={3} defaultValue="NZD" /></Field>
    </div>
    <Field label="Payment terms (days)"><TextInput name="paymentTermsDays" type="number" min={0} max={365} defaultValue={20} /></Field>
    <div className="grid grid--2">
      <Field label="Contact name"><TextInput name="contactName" maxLength={160} /></Field>
      <Field label="Contact email"><TextInput name="contactEmail" type="email" maxLength={254} /></Field>
    </div>
    <Field label="Contact phone"><TextInput name="contactPhone" maxLength={40} /></Field>
    <Button disabled={mutation.busy}>Create supplier</Button>
  </form>;
}

export function SupplierArchiveToggle({ supplierId, active }: { supplierId: string; active: boolean }) {
  const mutation = useMutation();
  return <Button variant={active ? 'danger' : 'secondary'} disabled={mutation.busy} onClick={() => void mutation.run(() => browserApi(`/suppliers/${supplierId}`, { method: 'PATCH', body: JSON.stringify({ active: !active }) }))}>
    {active ? 'Deactivate' : 'Reactivate'}
  </Button>;
}

export function SupplierAddressForm({ supplierId }: { supplierId: string }) {
  const mutation = useMutation();
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutation.run(async () => {
      await browserApi(`/suppliers/${supplierId}/addresses`, {
        method: 'POST',
        body: JSON.stringify({
          type: data.get('type'),
          addressLine1: data.get('addressLine1') || null,
          city: data.get('city') || null,
          region: data.get('region') || null,
          postalCode: data.get('postalCode') || null,
          country: data.get('country') || null
        })
      });
      form.reset();
    });
  }
  return <form className="form-stack" onSubmit={submit}>
    {mutation.error ? <div className="form-message" role="alert">{mutation.error}</div> : null}
    <Field label="Address type">
      <SelectInput name="type" defaultValue="GENERAL">
        <option value="GENERAL">General</option>
        <option value="BILLING">Billing</option>
        <option value="DELIVERY">Delivery</option>
      </SelectInput>
    </Field>
    <Field label="Address"><TextInput name="addressLine1" maxLength={200} /></Field>
    <div className="grid grid--2">
      <Field label="City"><TextInput name="city" maxLength={120} /></Field>
      <Field label="Region"><TextInput name="region" maxLength={120} /></Field>
    </div>
    <div className="grid grid--2">
      <Field label="Postal code"><TextInput name="postalCode" maxLength={20} /></Field>
      <Field label="Country"><TextInput name="country" maxLength={120} /></Field>
    </div>
    <Button variant="secondary" disabled={mutation.busy}>Add address</Button>
  </form>;
}

export function RemoveSupplierAddressButton({ supplierId, addressId }: { supplierId: string; addressId: string }) {
  const mutation = useMutation();
  return <Button variant="danger" disabled={mutation.busy} onClick={() => void mutation.run(() => browserApi(`/suppliers/${supplierId}/addresses/${addressId}`, { method: 'DELETE' }))}>
    Remove
  </Button>;
}
