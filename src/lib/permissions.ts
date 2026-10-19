import type { Role } from '../types/auth'

export type Permission =
  | 'dashboard' | 'pos' | 'products' | 'inventory' | 'sales' | 'reports'
  | 'settings' | 'userManagement' | 'stockAdjustments' | 'voidReturnSales' | 'mySales'

export const PERMISSION_OPTIONS: { key: Permission; label: string; description: string }[] = [
  { key: 'pos', label: 'Process sales', description: 'Open checkout and create sales' },
  { key: 'mySales', label: 'View my sales', description: 'See the cashier’s own sales' },
  { key: 'products', label: 'View products', description: 'Browse product catalogue' },
  { key: 'inventory', label: 'View stock', description: 'View inventory quantities' },
  { key: 'sales', label: 'View all sales', description: 'Browse business sales history' },
  { key: 'dashboard', label: 'Dashboard', description: 'View business dashboard' },
  { key: 'reports', label: 'Reports & analytics', description: 'View business reports' },
  { key: 'stockAdjustments', label: 'Adjust stock', description: 'Record inventory adjustments' },
  { key: 'voidReturnSales', label: 'Void / return sales', description: 'Void or return completed sales' },
  { key: 'categories', label: 'Categories', description: 'Manage product categories' } as never,
]

const OWNER_PERMISSIONS: readonly Permission[] = ['dashboard','pos','products','inventory','sales','reports','settings','userManagement','stockAdjustments','voidReturnSales']
export const CASHIER_DEFAULT_PERMISSIONS: readonly Permission[] = ['pos','mySales']
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
