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

export {
  SALES_ORDER_STATUSES,
  SALES_ORDER_INVOICING_STATUSES,
  validateSalesOrderEditingTransition,
  validateLineQuantityBalance,
  computeSalesOrderLineProjection,
  deriveSalesOrderFulfilmentStatus,
  DISCOUNT_BASIS_SCALE,
  computeLineGrossMinorUnits,
  computeLineNetMinorUnits,
  computeSalesOrderTotalMinorUnits,
  exceedsCreditLimit,
  type SalesOrderStatus,
  type SalesOrderInvoicingStatus,
  type SalesOrderLineQuantities,
  type SalesOrderLineProjection
} from './sales-order.js';
export {
  RESERVATION_METHODS,
  computeAvailableStock,
  computeAvailableToPromise,
  planReservation,
  orderDemands,
  planAllocationRun,
  validateReservationWithinStock,
  type ReservationMethod,
  type AvailableToPromiseInput,
  type ReservationPlan,
  type ReservationDemand,
  type ReservationAllocation
} from './reservations.js';
export {
  BACKORDER_STATUSES,
  computeBackorderQuantity,
  computeBackorderOpenQuantity,
  deriveBackorderStatus,
  validateBackorderQuantityChange,
  planIncomingAllocation,
  suggestPurchaseQuantity,
  type BackorderStatus,
  type BackorderLineQuantities,
  type IncomingAllocationDemand,
  type IncomingAllocation
} from './backorders.js';
export {
  DELIVERY_STATUSES,
  DELIVERY_MODES,
  DELIVERY_SOURCE_TYPE,
  computeOutstandingDeliveryQuantity,
  planDeliveryLines,
  validateDeliveryQuantity,
  planReservationConsumption,
  buildDeliveryMovements,
  type DeliveryStatus,
  type DeliveryMode,
  type DeliverableLine,
  type PlannedDeliveryLine,
  type ReservationConsumption,
  type DeliveryMovementInput
} from './delivery.js';

export {
  CUSTOMER_INVOICE_STATUSES,
  deriveCustomerInvoiceDisplayStatus,
  deriveCustomerInvoiceStatus,
  computeCustomerInvoiceOutstandingMinorUnits,
  computeUninvoicedQuantity,
  validateInvoiceLineQuantity,
  deriveSalesOrderInvoicingStatus,
  type CustomerInvoiceStatus,
  type CustomerInvoiceDisplayStatus,
  type InvoiceableLine,
  type InvoiceLineDraft
} from './customer-invoice.js';
export {
  planPaymentAllocation,
  planCreditApplication,
  validateManualAllocation,
  type OpenInvoiceForAllocation,
  type PaymentAllocationLine,
  type PaymentAllocationPlan,
  type ManualAllocationInput
} from './customer-payment.js';
export {
  computeCustomerAccount,
  netAccountsReceivable,
  computeStatementBalance,
  type CustomerInvoiceForAccount,
  type CustomerAccountProjection
} from './customer-account.js';
export {
  INSTALLMENT_FREQUENCIES,
  validateInstallmentSchedule,
  generateRecurringSchedule,
  generateDepositAndFinalSchedule,
  type InstallmentFrequency,
  type InstallmentScheduleLineInput
} from './installments.js';

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
