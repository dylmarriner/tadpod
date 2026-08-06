import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState } from '@tadpods/ui';
import { CategoryCreateForm, ProductArchiveButton, ProductCreateForm } from '../../../../components/catalogue-forms';
import { serverApi } from '../../../../lib/server-api';
import { ApiError } from '../../../../lib/api';

type Product = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  unitOfMeasure: string;
  salesPrice: string;
  purchaseCost: string;
  reorderLevel: string;
  status: 'ACTIVE' | 'ARCHIVED';
};
type Category = { id: string; name: string; parentId: string | null };
type TaxRate = { id: string; code: string; name: string };

export const metadata = { title: 'Products' };

export default async function ProductsPage() {
  let products: { items: Product[]; total: number } | null = null;
  let categories: Category[] = [];
  let taxRates: TaxRate[] = [];
  let loadError = '';
  try {
    [products, categories, taxRates] = await Promise.all([
      serverApi<{ items: Product[]; total: number }>('/products'),
      serverApi<Category[]>('/product-categories'),
      serverApi<TaxRate[]>('/tax-rates')
    ]);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load products.';
  }

  return <>
    <header className="page-header">
      <div>
        <h1>Products</h1>
        <p>SKUs, barcodes, pricing, and reorder settings. Stock on hand and movement history live under Adjustments, Transfers, and Stock counts.</p>
      </div>
    </header>
    {loadError ? <div className="form-message" role="alert">{loadError}</div> : <>
      <div className="grid grid--2">
        <Card title="Create product">
          <ProductCreateForm categories={categories} taxRates={taxRates} />
        </Card>
        <Card title="Categories">
          <CategoryCreateForm categories={categories} />
        </Card>
      </div>
      <div style={{ marginTop: '1rem' }}>
        <Card title="Product catalogue">
          {products === null || products.items.length === 0
            ? <EmptyState title="No products yet" description="Create the first product above." />
            : <DataTable label="Products" headings={['SKU', 'Name', 'Unit', 'Sales price', 'Purchase cost', 'Reorder level', 'Status', '']}>
                {products.items.map((product) => <tr key={product.id}>
                  <td><strong>{product.sku}</strong>{product.barcode ? <div className="muted">{product.barcode}</div> : null}</td>
                  <td><Link href={`/inventory/products/${product.id}`}>{product.name}</Link></td>
                  <td>{product.unitOfMeasure}</td>
                  <td>{product.salesPrice}</td>
                  <td>{product.purchaseCost}</td>
                  <td>{product.reorderLevel}</td>
                  <td><Badge tone={product.status === 'ACTIVE' ? 'success' : 'neutral'}>{product.status}</Badge></td>
                  <td><ProductArchiveButton productId={product.id} archived={product.status === 'ARCHIVED'} /></td>
                </tr>)}
              </DataTable>}
        </Card>
      </div>
    </>}
  </>;
}
