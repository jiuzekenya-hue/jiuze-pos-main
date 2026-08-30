import type { Role } from '../types/auth'

/**
 * Sections/capabilities from the implementation brief (§5, §14).
 * Do not add entries here without updating the brief first.
 */
export type Permission =
  | 'dashboard'
  | 'pos'
  | 'products'
  | 'inventory'
  | 'sales'
  | 'reports'
  | 'settings'
  | 'userManagement'
  | 'stockAdjustments'
  | 'voidReturnSales'
  | 'mySales'

const OWNER_PERMISSIONS: readonly Permission[] = [
  'dashboard',
  'pos',
  'products',
  'inventory',
  'sales',
  'reports',
  'settings',
  'userManagement',
  'stockAdjustments',
  'voidReturnSales',
]

const CASHIER_PERMISSIONS: readonly Permission[] = ['pos', 'mySales']

const PERMISSIONS_BY_ROLE: Record<Role, readonly Permission[]> = {
  owner: OWNER_PERMISSIONS,
  cashier: CASHIER_PERMISSIONS,
}

/**
 * SECURITY NOTE: This is a frontend convenience for showing/hiding UI.
 * It is NOT the authoritative security boundary. The authoritative
 * boundary is:
 *   - Supabase RLS policies (Phase 3), scoped by business_id and role
 *   - Server-side authorization inside secure database functions
 *     (e.g. complete_sale, void_sale — see brief §7, §27)
 *
 * A role of `null` (role not yet loaded, or schema not yet deployed)
 * grants no permissions — the safe default is to show nothing rather
 * than assume access.
 */
export function can(role: Role | null, permission: Permission): boolean {
  if (!role) return false
  return PERMISSIONS_BY_ROLE[role].includes(permission)
}

export function permissionsFor(role: Role | null): readonly Permission[] {
  if (!role) return []
  return PERMISSIONS_BY_ROLE[role]
}
