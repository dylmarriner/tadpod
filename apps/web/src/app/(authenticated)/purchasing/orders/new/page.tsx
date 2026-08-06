import { Card, EmptyState } from '@tadpods/ui';
import Link from 'next/link';
import { NewPurchaseOrderForm } from '../../../../../components/purchase-order-forms';
import { serverApi } from '../../../../../lib/server-api';
import { ApiError } from '../../../../../lib/api';

type Supplier = { id: string; code: string; name: string; currency: string; active: boolean };

export const metadata = { title: 'New purchase order' };

export default async function NewPurchaseOrderPage() {
  let suppliers: Supplier[] = [];
  let loadError = '';
  try {
    const response = await serverApi<{ items: Supplier[] }>('/suppliers?active=true&pageSize=100');
    suppliers = response.items;
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load suppliers.';
  }

  return <>
    <header className="page-header">
      <div>
        <h1>New purchase order</h1>
        <p>Drafts can be edited freely. Confirming (or submitting for approval) locks the supplier, currency, and lines.</p>
      </div>
    </header>
    <Card title="Draft order">
      {loadError ? <div className="form-message" role="alert">{loadError}</div>
        : suppliers.length === 0
          ? <EmptyState title="No active suppliers" description="Create an active supplier before raising a purchase order." action={<Link href="/suppliers">Go to suppliers</Link>} />
          : <NewPurchaseOrderForm suppliers={suppliers} />}
    </Card>
  </>;
}
