import Link from 'next/link';
import { Badge, Card, DataTable, EmptyState } from '@tadpods/ui';
import { ProductArchiveButton } from '../../../../../components/catalogue-forms';
import { serverApi } from '../../../../../lib/server-api';
import { ApiError } from '../../../../../lib/api';

type ProductSupplier = { id: string; supplierId: string; supplierProductCode: string; purchaseCost: string; preferred: boolean; leadTimeDays: number };
type Product = {
  id: string; sku: string; barcode: string | null; name: string; description: string | null;
  unitOfMeasure: string; salesPrice: string; purchaseCost: string; reorderLevel: string; reorderQuantity: string;
  leadTimeDays: number; status: 'ACTIVE' | 'ARCHIVED'; suppliers?: ProductSupplier[];
};
type StockOnHand = { byWarehouse: { warehouseId: string; quantity: string }[]; total: { quantity: string }[] };
type Warehouse = { id: string; code: string; name: string };

export const metadata = { title: 'Product detail' };

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let product: Product | null = null;
  let stock: StockOnHand | null = null;
  let warehouses: Warehouse[] = [];
  let loadError = '';
  try {
    [product, stock, warehouses] = await Promise.all([
      serverApi<Product>(`/products/${id}`),
      serverApi<StockOnHand>(`/inventory/stock-on-hand?productId=${id}`),
      serverApi<{ items: Warehouse[] }>('/warehouses').then((response) => response.items)
    ]);
  } catch (caught) {
    loadError = caught instanceof ApiError ? caught.message : 'Could not load this product.';
  }

  if (loadError || !product) return <div className="form-message" role="alert">{loadError || 'Product not found.'}</div>;

  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const totalOnHand = stock?.total[0]?.quantity ?? '0.0000';

  return <>
    <header className="page-header">
      <div>
        <h1>{product.name}</h1>
        <p><strong>{product.sku}</strong>{product.barcode ? ` · Barcode ${product.barcode}` : ''} · Stock on hand: {totalOnHand} {product.unitOfMeasure}</p>
      </div>
      <ProductArchiveButton productId={product.id} archived={product.status === 'ARCHIVED'} />
    </header>
    <div className="grid grid--2">
      <Card title="Details">
        <dl className="definition-list">
          <div><dt>Status</dt><dd><Badge tone={product.status === 'ACTIVE' ? 'success' : 'neutral'}>{product.status}</Badge></dd></div>
          <div><dt>Sales price</dt><dd>{product.salesPrice}</dd></div>
          <div><dt>Purchase cost</dt><dd>{product.purchaseCost}</dd></div>
          <div><dt>Reorder level</dt><dd>{product.reorderLevel}</dd></div>
          <div><dt>Reorder quantity</dt><dd>{product.reorderQuantity}</dd></div>
          <div><dt>Lead time</dt><dd>{product.leadTimeDays} days</dd></div>
          {product.description ? <div><dt>Description</dt><dd>{product.description}</dd></div> : null}
        </dl>
      </Card>
      <Card title="Stock by warehouse">
        {!stock || stock.byWarehouse.length === 0
          ? <EmptyState title="No stock movements yet" description="Record opening stock to establish a balance for this product." action={<Link href="/inventory/adjustments/new">Record opening stock</Link>} />
          : <DataTable label="Stock by warehouse" headings={['Warehouse', 'Quantity']}>
              {stock.byWarehouse.map((row) => <tr key={row.warehouseId}>
                <td>{warehouseById.get(row.warehouseId)?.name ?? row.warehouseId}</td>
                <td>{row.quantity}</td>
              </tr>)}
            </DataTable>}
      </Card>
    </div>
    <div style={{ marginTop: '1rem' }}>
      <Card title="Preferred suppliers" action={<Link href="/inventory/adjustments">View movement history</Link>}>
        {!product.suppliers || product.suppliers.length === 0
          ? <EmptyState title="No suppliers linked" description="Supplier codes and purchase costs are managed from Phase 3 supplier records." />
          : <DataTable label="Suppliers" headings={['Supplier product code', 'Purchase cost', 'Preferred', 'Lead time']}>
              {product.suppliers.map((supplier) => <tr key={supplier.id}>
                <td>{supplier.supplierProductCode}</td>
                <td>{supplier.purchaseCost}</td>
                <td>{supplier.preferred ? <Badge tone="success">Preferred</Badge> : '—'}</td>
                <td>{supplier.leadTimeDays} days</td>
              </tr>)}
            </DataTable>}
      </Card>
    </div>
  </>;
}
