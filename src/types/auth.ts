/**
 * The two roles supported in V1. Do not add roles here without updating
 * the implementation brief first — this list is the single source of
 * truth for role-based UI and permission checks.
 */
export type Role = 'owner' | 'cashier'

export const ROLES: readonly Role[] = ['owner', 'cashier'] as const

export function isRole(value: unknown): value is Role {
  return value === 'owner' || value === 'cashier'
}
