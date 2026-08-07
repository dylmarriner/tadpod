'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Field, SelectInput, TextInput } from '@tadpods/ui';
import { browserApi } from '../lib/api';

type Customer = { id: string; code: string; name: string; currency: string };
type Warehouse = { id: string; code: string; name: string };
type ProductOption = { id: string; sku: string; name: string; barcode: string | null; unitOfMeasure: string };
type DraftLine = { key: string; productId: string; label: string; unitPrice: string; orderedQuantity: string };
type Availability = { stockOnHand: string; availableStock: string; availableToPromise: string; incoming: string; openBackordered: string };

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function NewSalesOrderForm({ customers, warehouses, initialCustomerId }: { customers: Customer[]; warehouses: Warehouse[]; initialCustomerId: string }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(initialCustomerId || (customers[0]?.id ?? ''));
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [priority, setPriority] = useState('5');
  const [promisedDate, setPromisedDate] = useState('');
  const [customerReference, setCustomerReference] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [pendingUnitPrice, setPendingUnitPrice] = useState('');
  const [pendingQuantity, setPendingQuantity] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function checkAvailability(product: ProductOption): Promise<void> {
    if (!warehouseId) { setAvailability(null); return; }
    try {
      setAvailability(await browserApi<Availability>(`/sales-orders/availability?productId=${product.id}&warehouseId=${warehouseId}`));
    } catch { setAvailability(null); }
  }

  async function searchProducts(value: string): Promise<void> {
    setProductSearch(value);
    setAvailability(null);
    if (!value.trim()) { setProductOptions([]); return; }
    try {
      setProductOptions(await browserApi<ProductOption[]>(`/inventory/adjustments/products?search=${encodeURIComponent(value.trim())}`));
    } catch { setProductOptions([]); }
  }

  async function selectProduct(product: ProductOption): Promise<void> {
    setSelectedProduct(product);
    setProductSearch(`${product.sku} — ${product.name}`);
    setProductOptions([]);
    await checkAvailability(product);
  }

  function addLine(): void {
    if (!selectedProduct || !pendingUnitPrice || !pendingQuantity) return;
    setLines((current) => [...current, {
      key: randomId(),
      productId: selectedProduct.id,
      label: `${selectedProduct.sku} — ${selectedProduct.name}`,
      unitPrice: pendingUnitPrice,
      orderedQuantity: pendingQuantity
    }]);
    setSelectedProduct(null);
    setProductSearch('');
    setProductOptions([]);
    setPendingUnitPrice('');
    setPendingQuantity('');
    setAvailability(null);
  }

  function removeLine(key: string): void {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!customerId || !warehouseId || lines.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const created = await browserApi<{ id: string }>('/sales-orders', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          warehouseId,
          priority: Number(priority),
          promisedDate: promisedDate ? new Date(promisedDate).toISOString() : null,
          customerReference: customerReference.trim() || null,
          notes: notes.trim() || null,
          lines: lines.map((line) => ({ productId: line.productId, unitPrice: line.unitPrice, orderedQuantity: line.orderedQuantity }))
        })
      });
      router.push(`/sales/orders/${created.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create sales order');
    } finally {
      setBusy(false);
    }
  }

  return <form className="form-stack" onSubmit={(event) => void submit(event)}>
    {error ? <div className="form-message" role="alert">{error}</div> : null}
    <div className="grid grid--2">
      <Field label="Customer">
        <SelectInput value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
          {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} — {customer.name}</option>)}
        </SelectInput>
      </Field>
      <Field label="Warehouse">
        <SelectInput value={warehouseId} onChange={(event) => { setWarehouseId(event.target.value); setAvailability(null); }}>
          {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} — {warehouse.name}</option>)}
        </SelectInput>
      </Field>
    </div>
    <div className="grid grid--2">
      <Field label="Priority (1 = most urgent)"><TextInput name="priority" type="number" min={1} max={9} value={priority} onChange={(event) => setPriority(event.target.value)} /></Field>
      <Field label="Promised date"><TextInput type="date" value={promisedDate} onChange={(event) => setPromisedDate(event.target.value)} /></Field>
    </div>
    <div className="grid grid--2">
      <Field label="Customer reference"><TextInput value={customerReference} onChange={(event) => setCustomerReference(event.target.value)} maxLength={120} /></Field>
      <Field label="Notes"><TextInput value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} /></Field>
    </div>

    <fieldset className="form-stack">
      <legend>Add line</legend>
      <Field label="Product">
        <TextInput value={productSearch} placeholder="Search by SKU, name, or barcode" onChange={(event) => void searchProducts(event.target.value)} />
      </Field>
      {productOptions.length > 0 ? <ul className="option-list">
        {productOptions.map((product) => <li key={product.id}>
          <button type="button" onClick={() => void selectProduct(product)}>{product.sku} — {product.name}</button>
        </li>)}
      </ul> : null}
      {availability ? <div className="form-message" role="status">
        Stock on hand: <strong>{availability.stockOnHand}</strong> · Available now: <strong>{availability.availableStock}</strong> · Available to promise: <strong>{availability.availableToPromise}</strong>
        {Number(availability.availableStock) <= 0 ? ' — this line would be backordered.' : ''}
      </div> : null}
      <div className="grid grid--2">
        <Field label="Unit price"><TextInput value={pendingUnitPrice} onChange={(event) => setPendingUnitPrice(event.target.value)} inputMode="decimal" /></Field>
        <Field label="Ordered quantity"><TextInput value={pendingQuantity} onChange={(event) => setPendingQuantity(event.target.value)} inputMode="decimal" /></Field>
      </div>
      <Button type="button" variant="secondary" disabled={!selectedProduct || !pendingUnitPrice || !pendingQuantity} onClick={addLine}>Add line</Button>
    </fieldset>

    {lines.length > 0 ? <table className="data-table">
      <thead><tr><th>Product</th><th>Unit price</th><th>Quantity</th><th></th></tr></thead>
      <tbody>
        {lines.map((line) => <tr key={line.key}>
          <td>{line.label}</td>
          <td>{line.unitPrice}</td>
          <td>{line.orderedQuantity}</td>
          <td><Button type="button" variant="danger" onClick={() => removeLine(line.key)}>Remove</Button></td>
        </tr>)}
      </tbody>
    </table> : null}

    <Button disabled={busy || !customerId || !warehouseId || lines.length === 0}>Create draft sales order</Button>
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

const CANCELLABLE_STATUSES = new Set(['DRAFT', 'CONFIRMED', 'PARTIALLY_ALLOCATED', 'ALLOCATED', 'PARTIALLY_DELIVERED', 'BACKORDERED']);
const DELIVERABLE_STATUSES = new Set(['CONFIRMED', 'PARTIALLY_ALLOCATED', 'ALLOCATED', 'PARTIALLY_DELIVERED', 'BACKORDERED']);

export function SalesOrderActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const action = useAction();
  const [duplicating, setDuplicating] = useState(false);

  async function duplicate(): Promise<void> {
    setDuplicating(true);
    try {
      const created = await browserApi<{ id: string }>(`/sales-orders/${id}/duplicate`, { method: 'POST' });
      router.push(`/sales/orders/${created.id}`);
      router.refresh();
    } finally {
      setDuplicating(false);
    }
  }

  return <div className="form-stack">
    {action.error ? <div className="form-message" role="alert">{action.error}</div> : null}
    <div className="inline">
      {status === 'DRAFT' ? <Button disabled={action.busy} onClick={() => void action.run(`/sales-orders/${id}/confirm`, { idempotencyKey: crypto.randomUUID() })}>Confirm</Button> : null}
      {CANCELLABLE_STATUSES.has(status) ? <Button variant="danger" disabled={action.busy} onClick={() => void action.run(`/sales-orders/${id}/cancel`, {})}>Cancel order</Button> : null}
      {DELIVERABLE_STATUSES.has(status) ? <Link href={`/sales/orders/${id}/deliver`}><Button variant="secondary">Deliver</Button></Link> : null}
      <Button variant="secondary" disabled={duplicating} onClick={() => void duplicate()}>Duplicate</Button>
    </div>
  </div>;
}

export function CancelSalesOrderLineButton({ orderId, lineId, outstandingQuantity }: { orderId: string; lineId: string; outstandingQuantity: string }) {
  const action = useAction();
  if (Number(outstandingQuantity) <= 0) return null;
  return <Button variant="danger" disabled={action.busy} onClick={() => void action.run(`/sales-orders/${orderId}/lines/${lineId}/cancel`, {})}>
    Cancel remaining
  </Button>;
}

type DeliverableLine = { salesOrderLineId: string; label: string; outstandingQuantity: string; deliverableQuantity: string };

export function DeliverSalesOrderForm({ salesOrderId, lines }: { salesOrderId: string; lines: DeliverableLine[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<'AVAILABLE' | 'ALL' | 'SELECTED'>('AVAILABLE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const draft = await browserApi<{ id: string }>('/deliveries', {
        method: 'POST',
        body: JSON.stringify({ salesOrderId, mode, idempotencyKey: crypto.randomUUID() })
      });
      await browserApi(`/deliveries/${draft.id}/post`, { method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }) });
      router.push(`/sales/orders/${salesOrderId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not post delivery');
    } finally {
      setBusy(false);
    }
  }

  return <div className="form-stack">
    {error ? <div className="form-message" role="alert">{error}</div> : null}
    <Field label="What to ship">
      <SelectInput value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
        <option value="AVAILABLE">Only what is reserved and available now</option>
        <option value="ALL">Everything still outstanding (may need a negative-stock override)</option>
      </SelectInput>
    </Field>
    <table className="data-table">
      <thead><tr><th>Product</th><th>Outstanding</th><th>Deliverable now</th></tr></thead>
      <tbody>
        {lines.map((line) => <tr key={line.salesOrderLineId}>
          <td>{line.label}</td>
          <td>{line.outstandingQuantity}</td>
          <td>{line.deliverableQuantity}</td>
        </tr>)}
      </tbody>
    </table>
    <Button disabled={busy} onClick={() => void submit()}>Create and post delivery</Button>
  </div>;
}

export function ReservationAllocationRunButton({ productId, warehouseId, method }: { productId: string; warehouseId: string; method: 'PRIORITY' | 'PROMISED_DATE' | 'OLDEST_FIRST' }) {
  const action = useAction();
  return <Button variant="secondary" disabled={action.busy} onClick={() => void action.run('/reservations/run-allocation', { productId, warehouseId, method })}>
    Run allocation
  </Button>;
}

export function ReservationStatusBadge({ status }: { status: string }) {
  const tone = status === 'ACTIVE' ? 'success' : status === 'CONSUMED' ? 'info' : 'neutral';
  return <Badge tone={tone}>{status}</Badge>;
}
