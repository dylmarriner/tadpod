import { Card, EmptyState } from '@tadpods/ui';
import { NewStockCountForm } from '../../../../../components/stock-count-forms';
import { serverApi } from '../../../../../lib/server-api';
import { ApiError } from '../../../../../lib/api';

type Warehouse = { id: string; code: string; name: string; isDefault: boolean };
type Category = { id: string; name: string };

export const metadata = { title: 'Start a stock count' };

export default async function NewStockCountPage() {
  let warehouses: Warehouse[] | null = null;
  let categories: Category[] = [];
  let loadError = '';
  try {
    [warehouses, categories] = await Promise.all([
      serverApi<Warehouse[]>('/inventory/stock-counts/warehouses'),
      serverApi<Category[]>('/inventory/stock-counts/categories')
    ]);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load warehouses.';
  }

  return <>
    <header className="page-header">
      <div>
        <h1>Start a stock count</h1>
        <p>Choose a warehouse and which products to count — a category, an explicit selection, or the full warehouse. Expected quantities are frozen from the ledger the moment you start.</p>
      </div>
    </header>
    <Card title="New stock count">
      {loadError ? <div className="form-message" role="alert">{loadError}</div>
        : warehouses === null || warehouses.length === 0
          ? <EmptyState title="No active warehouses" description="Create and activate a warehouse before starting a stock count." />
          : <NewStockCountForm warehouses={warehouses} categories={categories} />}
    </Card>
  </>;
}
