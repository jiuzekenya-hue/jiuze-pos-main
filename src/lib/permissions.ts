import type { Role } from '../types/auth'

export type Permission =
  | 'dashboard' | 'pos' | 'products' | 'productCreate' | 'productEdit'
  | 'inventory' | 'stockAdjustments' | 'categories'
  | 'sales' | 'reports' | 'openBills' | 'recordOpenBillPayments'
  | 'settings' | 'userManagement' | 'voidReturnSales' | 'mySales'

export const PERMISSION_OPTIONS: { key: Permission; label: string; description: string }[] = [
  { key: 'pos', label: 'Process sales', description: 'Open checkout and create sales' },
  { key: 'mySales', label: 'View my sales', description: 'See the cashier’s own sales' },
  { key: 'products', label: 'View products', description: 'Browse the product catalogue' },
  { key: 'productCreate', label: 'Add products', description: 'Create new products' },
  { key: 'productEdit', label: 'Edit products', description: 'Change product names, prices, units and details' },
  { key: 'inventory', label: 'View stock', description: 'View inventory quantities' },
  { key: 'stockAdjustments', label: 'Adjust stock', description: 'Record stock additions, reductions and corrections' },
  { key: 'categories', label: 'Manage categories', description: 'Create and edit product categories' },
  { key: 'sales', label: 'View all sales', description: 'Browse business sales history' },
  { key: 'openBills', label: 'View Open Bills', description: 'View outstanding printed restaurant orders' },
  { key: 'recordOpenBillPayments', label: 'Record bill payments', description: 'Mark outstanding bills as paid after collecting payment' },
  { key: 'dashboard', label: 'Dashboard and analytics', description: 'View business performance and analytics' },
]

export const CASHIER_DEFAULT_PERMISSIONS: readonly Permission[] = ['pos', 'mySales']

// Full access covers regular POS operations, but never owner-only administration.
export const CASHIER_FULL_ACCESS_PERMISSIONS: readonly Permission[] = [
  'dashboard', 'pos', 'products', 'productCreate', 'productEdit',
  'inventory', 'stockAdjustments', 'categories', 'sales', 'reports',
  'openBills', 'recordOpenBillPayments', 'mySales', 'voidReturnSales',
]

const OWNER_PERMISSIONS: readonly Permission[] = [
  ...CASHIER_FULL_ACCESS_PERMISSIONS, 'settings', 'userManagement',
]

export const CASHIER_PERMISSION_PRESETS: { id: string; label: string; description: string; permissions: readonly Permission[] }[] = [
  { id: 'sales', label: 'Sales cashier', description: 'Checkout and own sales only', permissions: CASHIER_DEFAULT_PERMISSIONS },
  { id: 'stock', label: 'Stock manager', description: 'View and manage products, categories and stock', permissions: ['products', 'productCreate', 'productEdit', 'inventory', 'stockAdjustments', 'categories'] },
  { id: 'bills', label: 'Bill collector', description: 'View Open Bills and record collected payments', permissions: ['openBills', 'recordOpenBillPayments'] },
  { id: 'full', label: 'Full access', description: 'All regular POS permissions; no owner administration', permissions: CASHIER_FULL_ACCESS_PERMISSIONS },
]

export function can(role: Role | null, permission: Permission, customPermissions?: readonly Permission[] | null): boolean {
  if (!role) return false
  if (role === 'owner') return OWNER_PERMISSIONS.includes(permission)
  return customPermissions == null ? CASHIER_DEFAULT_PERMISSIONS.includes(permission) : customPermissions.includes(permission)
}

export function permissionsFor(role: Role | null, customPermissions?: readonly Permission[] | null): readonly Permission[] {
  if (!role) return []
  if (role === 'owner') return OWNER_PERMISSIONS
  return customPermissions == null ? CASHIER_DEFAULT_PERMISSIONS : customPermissions
}
