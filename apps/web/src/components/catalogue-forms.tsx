'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, SelectInput, TextInput } from '@tadpods/ui';
import { browserApi } from '../lib/api';

type Category = { id: string; name: string; parentId: string | null };
type TaxRate = { id: string; code: string; name: string };
type Warehouse = { id: string; code: string; name: string; isDefault: boolean; status: string };

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

export function ProductCreateForm({ categories, taxRates }: { categories: Category[]; taxRates: TaxRate[] }) {
  const mutation = useMutation();
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutation.run(async () => {
      await browserApi('/products', {
        method: 'POST',
        body: JSON.stringify({
          sku: data.get('sku'),
          barcode: data.get('barcode') || null,
          name: data.get('name'),
          description: data.get('description') || null,
          categoryId: data.get('categoryId') || null,
          unitOfMeasure: data.get('unitOfMeasure'),
          salesPrice: data.get('salesPrice'),
          purchaseCost: data.get('purchaseCost'),
          taxRateId: data.get('taxRateId') || null,
          reorderLevel: data.get('reorderLevel') || '0',
          reorderQuantity: data.get('reorderQuantity') || '0',
          leadTimeDays: Number(data.get('leadTimeDays') || 0)
        })
      });
      form.reset();
    });
  }
  return <form className="form-stack" onSubmit={submit}>
    {mutation.error ? <div className="form-message" role="alert">{mutation.error}</div> : null}
    <div className="grid grid--2">
      <Field label="SKU"><TextInput name="sku" required maxLength={64} /></Field>
      <Field label="Barcode"><TextInput name="barcode" maxLength={64} /></Field>
    </div>
    <Field label="Name"><TextInput name="name" required maxLength={200} /></Field>
    <Field label="Description"><TextInput name="description" maxLength={2000} /></Field>
    <div className="grid grid--2">
      <Field label="Category">
        <SelectInput name="categoryId" defaultValue="">
          <option value="">No category</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </SelectInput>
      </Field>
      <Field label="Unit of measure"><TextInput name="unitOfMeasure" required maxLength={20} defaultValue="each" /></Field>
    </div>
    <div className="grid grid--2">
      <Field label="Sales price" hint="Up to two decimal places"><TextInput name="salesPrice" required inputMode="decimal" defaultValue="0.00" /></Field>
      <Field label="Purchase cost" hint="Up to two decimal places"><TextInput name="purchaseCost" required inputMode="decimal" defaultValue="0.00" /></Field>
    </div>
    <Field label="Tax rate">
      <SelectInput name="taxRateId" defaultValue="">
        <option value="">No tax rate</option>
        {taxRates.map((rate) => <option key={rate.id} value={rate.id}>{rate.code} — {rate.name}</option>)}
      </SelectInput>
    </Field>
    <div className="grid grid--2">
      <Field label="Reorder level"><TextInput name="reorderLevel" inputMode="decimal" defaultValue="0" /></Field>
      <Field label="Reorder quantity"><TextInput name="reorderQuantity" inputMode="decimal" defaultValue="0" /></Field>
    </div>
    <Field label="Lead time (days)"><TextInput name="leadTimeDays" type="number" min={0} max={3650} defaultValue={0} /></Field>
    <Button disabled={mutation.busy}>Create product</Button>
  </form>;
}

export function ProductArchiveButton({ productId, archived }: { productId: string; archived: boolean }) {
  const mutation = useMutation();
  if (archived) return <span className="muted">Archived</span>;
  return <Button variant="danger" disabled={mutation.busy} onClick={() => void mutation.run(() => browserApi(`/products/${productId}/archive`, { method: 'POST' }))}>
    Archive
  </Button>;
}

export function CategoryCreateForm({ categories }: { categories: Category[] }) {
  const mutation = useMutation();
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutation.run(async () => {
      await browserApi('/product-categories', { method: 'POST', body: JSON.stringify({ name: data.get('name'), parentId: data.get('parentId') || null }) });
      form.reset();
    });
  }
  return <form className="form-stack" onSubmit={submit}>
    {mutation.error ? <div className="form-message" role="alert">{mutation.error}</div> : null}
    <Field label="Category name"><TextInput name="name" required maxLength={160} /></Field>
    <Field label="Parent category">
      <SelectInput name="parentId" defaultValue="">
        <option value="">No parent</option>
        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
      </SelectInput>
    </Field>
    <Button variant="secondary" disabled={mutation.busy}>Add category</Button>
  </form>;
}

export function WarehouseCreateForm() {
  const mutation = useMutation();
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutation.run(async () => {
      await browserApi('/warehouses', {
        method: 'POST',
        body: JSON.stringify({
          code: data.get('code'),
          name: data.get('name'),
          addressLine1: data.get('addressLine1') || null,
          city: data.get('city') || null,
          region: data.get('region') || null,
          postalCode: data.get('postalCode') || null,
          country: data.get('country') || null,
          isDefault: data.get('isDefault') === 'on'
        })
      });
      form.reset();
    });
  }
  return <form className="form-stack" onSubmit={submit}>
    {mutation.error ? <div className="form-message" role="alert">{mutation.error}</div> : null}
    <div className="grid grid--2">
      <Field label="Code"><TextInput name="code" required maxLength={20} /></Field>
      <Field label="Name"><TextInput name="name" required maxLength={160} /></Field>
    </div>
    <Field label="Address"><TextInput name="addressLine1" maxLength={200} /></Field>
    <div className="grid grid--2">
      <Field label="City"><TextInput name="city" maxLength={120} /></Field>
      <Field label="Region"><TextInput name="region" maxLength={120} /></Field>
    </div>
    <div className="grid grid--2">
      <Field label="Postal code"><TextInput name="postalCode" maxLength={20} /></Field>
      <Field label="Country"><TextInput name="country" maxLength={120} /></Field>
    </div>
    <label><input type="checkbox" name="isDefault" /> Make this the default warehouse</label>
    <Button disabled={mutation.busy}>Create warehouse</Button>
  </form>;
}

export function WarehouseArchiveToggle({ warehouseId, status }: { warehouseId: string; status: string }) {
  const mutation = useMutation();
  const nextStatus = status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
  return <Button variant={status === 'ACTIVE' ? 'danger' : 'secondary'} disabled={mutation.busy} onClick={() => void mutation.run(() => browserApi(`/warehouses/${warehouseId}`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) }))}>
    {status === 'ACTIVE' ? 'Archive' : 'Reactivate'}
  </Button>;
}

export type { Category, TaxRate, Warehouse };
