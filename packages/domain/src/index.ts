export { Money } from './money.js';
export { Quantity } from './quantity.js';
export {
  computeSupplierAccount,
  netAccountsPayable,
  type SupplierAccountProjection,
  type SupplierBillForAccount
} from './supplier-account.js';
export {
  PURCHASE_ORDER_STATUSES,
  validateEditingTransition,
  computeLineProjection,
  deriveFulfillmentStatus,
  computeLineTotalMinorUnits,
  computeOrderTotalMinorUnits,
  type PurchaseOrderStatus,
  type PurchaseOrderLineQuantities,
  type PurchaseOrderLineProjection
} from './purchase-order.js';
export {
  STOCK_MOVEMENT_TYPES,
  validateMovementDirection,
  computeStockOnHand,
  computeStockByWarehouse,
  buildReversal,
  type StockMovementType,
  type PostedMovementLike,
  type WarehouseMovementLike,
  type ReversibleMovement,
  type ReversalMovementInput
} from './inventory.js';

export type Brand<T, Name extends string> = T & { readonly __brand: Name };
export type UserId = Brand<string, 'UserId'>;
export type RoleId = Brand<string, 'RoleId'>;
export type PermissionKey = Brand<string, 'PermissionKey'>;

export const USER_STATUSES = ['ACTIVE', 'INVITED', 'SUSPENDED', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const FOUNDATION_ROLES = [
  'Administrator',
  'Sales',
  'Purchasing',
  'Warehouse',
  'Accounts receivable',
  'Accounts payable',
  'Manager',
  'Read-only'
] as const;
