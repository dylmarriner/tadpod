import { Card, EmptyState } from '@tadpods/ui';
import { AdjustmentForm } from '../../../../../components/adjustment-forms';
import { serverApi } from '../../../../../lib/server-api';
import { ApiError } from '../../../../../lib/api';

type Warehouse = { id: string; code: string; name: string; isDefault: boolean };

export const metadata = { title: 'Record opening stock or adjustment' };

export default async function NewAdjustmentPage() {
  let warehouses: Warehouse[] | null = null;
  let loadError = '';
  try {
    warehouses = await serverApi<Warehouse[]>('/inventory/adjustments/warehouses');
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load warehouses.';
  }

  return <>
    <header className="page-header">
      <div>
        <h1>Record opening stock or adjustment</h1>
        <p>A guided, stock-affecting posting to the immutable inventory ledger. Every positive or negative adjustment requires a reason; every posting requires explicit confirmation before it is recorded.</p>
      </div>
    </header>
    <Card title="New posting">
      {loadError ? <div className="form-message" role="alert">{loadError}</div>
        : warehouses === null || warehouses.length === 0
          ? <EmptyState title="No active warehouses" description="Create and activate a warehouse before recording opening stock or adjustments." />
          : <AdjustmentForm warehouses={warehouses} />}
    </Card>
  </>;
}
