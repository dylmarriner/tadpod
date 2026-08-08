import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState, PageHeader } from '@tadpods/ui';
import { SupplierCreateForm } from '../../../components/supplier-forms';
import { serverApi } from '../../../lib/server-api';
import { ApiError } from '../../../lib/api';

type Supplier = { id: string; code: string; name: string; currency: string; paymentTermsDays: number; contactEmail: string | null; active: boolean };

export const metadata = { title: 'Suppliers' };

export default async function SuppliersPage() {
  let suppliers: { items: Supplier[]; total: number } | null = null;
  let loadError = '';
  try {
    suppliers = await serverApi<{ items: Supplier[]; total: number }>('/suppliers');
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load suppliers.';
  }

  return <>
    <PageHeader kicker="Accounts" title="Suppliers" description="Supplier master records, contact details, payment terms and purchasing relationships." />
    {loadError ? <div className="form-message" role="alert">{loadError}</div> : <>
      <Card kicker="New account" title="Create supplier">
        <SupplierCreateForm />
      </Card>
      <div style={{ marginTop: '1rem' }}>
        <Card kicker="Register" title="All suppliers">
          {suppliers === null || suppliers.items.length === 0
            ? <EmptyState title="No suppliers yet" description="Create the first supplier above." />
            : <DataTable label="Suppliers" headings={['Code', 'Name', 'Currency', 'Payment terms', 'Contact', 'Status']}>
                {suppliers.items.map((supplier) => <tr key={supplier.id}>
                  <td><strong>{supplier.code}</strong></td>
                  <td><Link href={`/suppliers/${supplier.id}`}>{supplier.name}</Link></td>
                  <td>{supplier.currency}</td>
                  <td>{supplier.paymentTermsDays} days</td>
                  <td>{supplier.contactEmail ?? '—'}</td>
                  <td><Badge tone={supplier.active ? 'success' : 'neutral'}>{supplier.active ? 'Active' : 'Inactive'}</Badge></td>
                </tr>)}
              </DataTable>}
        </Card>
      </div>
    </>}
  </>;
}
