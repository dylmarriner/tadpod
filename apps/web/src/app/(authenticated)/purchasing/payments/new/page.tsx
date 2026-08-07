import Link from 'next/link';
import { Card, EmptyState } from '@tadpods/ui';
import { RecordSupplierPaymentForm, SupplierPaymentSupplierSelect } from '../../../../../components/supplier-bill-forms';
import { serverApi } from '../../../../../lib/server-api';
import { ApiError } from '../../../../../lib/api';

type Supplier = { id: string; code: string; name: string };

export const metadata = { title: 'Record supplier payment' };

export default async function NewSupplierPaymentPage({ searchParams }: { searchParams: Promise<{ supplierId?: string }> }) {
  const { supplierId } = await searchParams;
  let suppliers: Supplier[] = [];
  let loadError = '';
  try {
    suppliers = (await serverApi<{ items: Supplier[] }>('/suppliers?active=true&pageSize=100')).items;
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load suppliers.';
  }

  if (loadError) return <div className="form-message" role="alert">{loadError}</div>;
  if (suppliers.length === 0) return <EmptyState title="No active suppliers" description="Create an active supplier first." action={<Link href="/suppliers">Go to suppliers</Link>} />;

  const selectedSupplierId = supplierId && suppliers.some((supplier) => supplier.id === supplierId) ? supplierId : suppliers[0]!.id;

  return <>
    <header className="page-header">
      <div>
        <h1>Record supplier payment</h1>
        <p>The payment is recorded once in full, then allocated across open bills oldest first.</p>
      </div>
    </header>
    <Card title="Payment">
      <div style={{ marginBottom: '1rem' }}>
        <SupplierPaymentSupplierSelect suppliers={suppliers} selectedSupplierId={selectedSupplierId} />
      </div>
      <RecordSupplierPaymentForm supplierId={selectedSupplierId} />
    </Card>
  </>;
}
