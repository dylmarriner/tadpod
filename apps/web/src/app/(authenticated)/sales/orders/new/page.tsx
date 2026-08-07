import Link from 'next/link';
import { Card, EmptyState } from '@tadpods/ui';
import { NewSalesOrderForm } from '../../../../../components/sales-order-forms';
import { serverApi } from '../../../../../lib/server-api';
import { ApiError } from '../../../../../lib/api';

type Customer = { id: string; code: string; name: string; currency: string; active: boolean };
type Warehouse = { id: string; code: string; name: string };

export const metadata = { title: 'New sales order' };

export default async function NewSalesOrderPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const { customerId } = await searchParams;
  let customers: Customer[] = [];
  let warehouses: Warehouse[] = [];
  let loadError = '';
  try {
    const [customerResponse, warehouseResponse] = await Promise.all([
      serverApi<{ items: Customer[] }>('/customers?active=true&pageSize=100'),
      serverApi<{ items: Warehouse[] }>('/warehouses?status=ACTIVE&pageSize=100')
    ]);
    customers = customerResponse.items;
    warehouses = warehouseResponse.items;
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load customers or warehouses.';
  }

  return <>
    <header className="page-header">
      <div>
        <h1>New sales order</h1>
        <p>Drafts can be edited freely. Confirming reserves what stock is available and backorders the rest.</p>
      </div>
    </header>
    <Card title="Draft order">
      {loadError ? <div className="form-message" role="alert">{loadError}</div>
        : customers.length === 0
          ? <EmptyState title="No active customers" description="Create an active customer before raising a sales order." action={<Link href="/customers">Go to customers</Link>} />
          : warehouses.length === 0
            ? <EmptyState title="No active warehouses" description="Create an active warehouse before raising a sales order." action={<Link href="/inventory/warehouses">Go to warehouses</Link>} />
            : <NewSalesOrderForm customers={customers} warehouses={warehouses} initialCustomerId={customerId ?? ''} />}
    </Card>
  </>;
}
