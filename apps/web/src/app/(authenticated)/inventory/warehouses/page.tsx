import { Badge, Card, DataTable, EmptyState } from '@tadpods/ui';
import { WarehouseArchiveToggle, WarehouseCreateForm } from '../../../../components/catalogue-forms';
import { serverApi } from '../../../../lib/server-api';
import { ApiError } from '../../../../lib/api';

type Warehouse = { id: string; code: string; name: string; city: string | null; country: string | null; status: 'ACTIVE' | 'ARCHIVED'; isDefault: boolean };

export const metadata = { title: 'Warehouses' };

export default async function WarehousesPage() {
  let warehouses: { items: Warehouse[]; total: number } | null = null;
  let loadError = '';
  try {
    warehouses = await serverApi<{ items: Warehouse[]; total: number }>('/warehouses');
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load warehouses.';
  }

  return <>
    <header className="page-header">
      <div>
        <h1>Warehouses</h1>
        <p>Stock locations. Exactly one warehouse can be the default used to pre-fill stock-affecting forms.</p>
      </div>
    </header>
    {loadError ? <div className="form-message" role="alert">{loadError}</div> : <>
      <Card title="Create warehouse">
        <WarehouseCreateForm />
      </Card>
      <div style={{ marginTop: '1rem' }}>
        <Card title="All warehouses">
          {warehouses === null || warehouses.items.length === 0
            ? <EmptyState title="No warehouses yet" description="Create the first warehouse above." />
            : <DataTable label="Warehouses" headings={['Code', 'Name', 'Location', 'Default', 'Status', '']}>
                {warehouses.items.map((warehouse) => <tr key={warehouse.id}>
                  <td><strong>{warehouse.code}</strong></td>
                  <td>{warehouse.name}</td>
                  <td>{[warehouse.city, warehouse.country].filter(Boolean).join(', ') || '—'}</td>
                  <td>{warehouse.isDefault ? <Badge tone="info">Default</Badge> : '—'}</td>
                  <td><Badge tone={warehouse.status === 'ACTIVE' ? 'success' : 'neutral'}>{warehouse.status}</Badge></td>
                  <td><WarehouseArchiveToggle warehouseId={warehouse.id} status={warehouse.status} /></td>
                </tr>)}
              </DataTable>}
        </Card>
      </div>
    </>}
  </>;
}
