export { Money } from './money.js';
export { Quantity } from './quantity.js';

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
