import { Card, EmptyState } from '@tadpods/ui';
import { TransferForm } from '../../../../../components/transfer-forms';
import { serverApi } from '../../../../../lib/server-api';
import { ApiError } from '../../../../../lib/api';

type Warehouse = { id: string; code: string; name: string; isDefault: boolean };

export const metadata = { title: 'Record a transfer' };

export default async function NewTransferPage() {
  let warehouses: Warehouse[] | null = null;
  let loadError = '';
  try {
    warehouses = await serverApi<Warehouse[]>('/inventory/transfers/warehouses');
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load warehouses.';
  }

  return <>
    <header className="page-header">
      <div>
        <h1>Record a transfer</h1>
        <p>Move one or more products from one warehouse to another. Every line posts as a linked pair of movements — either the whole transfer posts, or none of it does.</p>
      </div>
    </header>
    <Card title="New transfer">
      {loadError ? <div className="form-message" role="alert">{loadError}</div>
        : warehouses === null || warehouses.length < 2
          ? <EmptyState title="Need at least two active warehouses" description="Create and activate a second warehouse before recording a transfer." />
          : <TransferForm warehouses={warehouses} />}
    </Card>
  </>;
}
