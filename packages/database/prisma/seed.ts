import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const permissions = [
  ['*', 'Full system access'],
  ['admin.users', 'Manage users'],
  ['admin.roles', 'Manage roles and permissions'],
  ['admin.brand', 'Manage TADPODS branding'],
  ['audit.read', 'View audit history'],
  ['sales.read', 'View sales records'],
  ['sales.write', 'Create and update sales records'],
  ['purchasing.read', 'View purchasing records'],
  ['purchasing.write', 'Create and update purchasing records'],
  ['inventory.read', 'View inventory records'],
  ['inventory.write', 'Post inventory operations'],
  ['customers.read', 'View customer accounts'],
  ['customers.write', 'Manage customer accounts'],
  ['suppliers.read', 'View supplier accounts'],
  ['suppliers.write', 'Manage supplier accounts'],
  ['reports.read', 'View and export reports']
] as const;

const roles = [
  ['administrator', 'Administrator', 'Complete configuration and operational access'],
  ['sales', 'Sales', 'Sales orders, deliveries, invoices, customers and payments'],
  ['purchasing', 'Purchasing', 'Purchase orders, receipts, suppliers and bills'],
  ['warehouse', 'Warehouse', 'Stock, receipts, deliveries, transfers and counts'],
  ['accounts-receivable', 'Accounts receivable', 'Customer invoices, payments, credits and statements'],
  ['accounts-payable', 'Accounts payable', 'Supplier bills, payments, credits and statements'],
  ['manager', 'Manager', 'Operational oversight, approvals and reports'],
  ['read-only', 'Read-only', 'Read access without posting or configuration rights']
] as const;

const rolePermissions: Record<string, string[]> = {
  administrator: ['*'],
  sales: ['sales.read', 'sales.write', 'customers.read', 'customers.write', 'inventory.read'],
  purchasing: ['purchasing.read', 'purchasing.write', 'suppliers.read', 'suppliers.write', 'inventory.read'],
  warehouse: ['inventory.read', 'inventory.write', 'sales.read', 'purchasing.read'],
  'accounts-receivable': ['customers.read', 'customers.write', 'sales.read', 'reports.read'],
  'accounts-payable': ['suppliers.read', 'suppliers.write', 'purchasing.read', 'reports.read'],
  manager: ['sales.read', 'purchasing.read', 'inventory.read', 'customers.read', 'suppliers.read', 'reports.read', 'audit.read'],
  'read-only': ['sales.read', 'purchasing.read', 'inventory.read', 'customers.read', 'suppliers.read', 'reports.read']
};

async function seed(): Promise<void> {
  await prisma.brandSettings.upsert({
    where: { singletonKey: 'default' },
    update: {},
    create: { singletonKey: 'default', displayName: 'TADPODS' }
  });
  await prisma.systemSettings.upsert({
    where: { singletonKey: 'default' },
    update: {},
    create: { singletonKey: 'default', defaultCurrency: 'NZD', negativeStockEnabled: false }
  });

  for (const [key, name] of permissions) {
    await prisma.permission.upsert({ where: { key }, update: { name }, create: { key, name } });
  }
  for (const [key, name, description] of roles) {
    await prisma.role.upsert({ where: { key }, update: { name, description }, create: { key, name, description, system: true } });
  }

  for (const [roleKey, keys] of Object.entries(rolePermissions)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const matching = await prisma.permission.findMany({ where: { key: { in: keys } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: matching.map((permission) => ({ roleId: role.id, permissionId: permission.id })), skipDuplicates: true });
  }

  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@tadpods.local').trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe-123!';
  if (process.env.NODE_ENV === 'production' && !process.env.SEED_ADMIN_PASSWORD) {
    throw new Error('SEED_ADMIN_PASSWORD is required in production');
  }
  const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
  const administrator = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { displayName: 'TADPODS Administrator', status: 'ACTIVE' },
    create: { email: adminEmail, displayName: 'TADPODS Administrator', passwordHash, status: 'ACTIVE' }
  });
  const administratorRole = await prisma.role.findUniqueOrThrow({ where: { key: 'administrator' } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: administrator.id, roleId: administratorRole.id } },
    update: {},
    create: { userId: administrator.id, roleId: administratorRole.id }
  });

  for (const sequence of [
    ['sales-order', 'SO-'], ['delivery', 'DN-'], ['backorder', 'BO-'], ['customer-invoice', 'INV-'],
    ['customer-payment', 'CP-'], ['purchase-order', 'PO-'], ['goods-receipt', 'GRN-'],
    ['supplier-bill', 'BILL-'], ['supplier-payment', 'SP-'], ['credit-note', 'CR-']
  ] as const) {
    await prisma.documentSequence.upsert({ where: { key: sequence[0] }, update: { prefix: sequence[1] }, create: { key: sequence[0], prefix: sequence[1] } });
  }

  await prisma.taxRate.upsert({ where: { code: 'GST15' }, update: { name: 'GST 15%', rateBasis: 150000 }, create: { code: 'GST15', name: 'GST 15%', rateBasis: 150000 } });
  await prisma.taxRate.upsert({ where: { code: 'ZERO' }, update: { name: 'Zero rated', rateBasis: 0 }, create: { code: 'ZERO', name: 'Zero rated', rateBasis: 0 } });

  await prisma.warehouse.upsert({
    where: { code: 'MAIN' },
    update: {},
    create: { code: 'MAIN', name: 'Main warehouse', status: 'ACTIVE', isDefault: true }
  });
}

seed()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
