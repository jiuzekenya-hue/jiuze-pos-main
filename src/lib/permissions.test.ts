import { describe, expect, it } from 'vitest'
import { can, permissionsFor, type Permission } from '../lib/permissions'

const OWNER_ONLY: Permission[] = [
  'dashboard',
  'products',
  'inventory',
  'sales',
  'reports',
  'settings',
  'userManagement',
  'stockAdjustments',
  'voidReturnSales',
]

describe('permissions', () => {
  it('grants owners every owner-level permission from the brief', () => {
    for (const permission of [...OWNER_ONLY, 'pos'] as Permission[]) {
      expect(can('owner', permission)).toBe(true)
    }
  })

  it('does not grant owners the cashier-only "mySales" permission', () => {
    // Owners see full Sales, not the cashier-scoped "My Sales" view.
    expect(can('owner', 'mySales')).toBe(false)
  })

  it('grants cashiers only pos and mySales', () => {
    expect(can('cashier', 'pos')).toBe(true)
    expect(can('cashier', 'mySales')).toBe(true)
    expect(permissionsFor('cashier').slice().sort()).toEqual(['mySales', 'pos'])
  })

  it('uses explicit custom permissions when saved, replacing defaults', () => {
    expect(can('cashier', 'products', ['products'])).toBe(true)
    expect(can('cashier', 'pos', ['products'])).toBe(false)
    expect(can('cashier', 'inventory', ['products', 'inventory'])).toBe(true)
  })

  it('preserves default access when no custom permission row exists', () => {
    expect(can('cashier', 'pos', null)).toBe(true)
    expect(can('cashier', 'mySales', undefined)).toBe(true)
    expect(can('cashier', 'products', null)).toBe(false)
  })

  it('blocks cashiers from every owner-only section', () => {
    for (const permission of OWNER_ONLY) {
      expect(can('cashier', permission)).toBe(false)
    }
  })

  it('denies every permission when role is null (not yet loaded / schema pending)', () => {
    const allPermissions: Permission[] = [...OWNER_ONLY, 'pos', 'mySales']
    for (const permission of allPermissions) {
      expect(can(null, permission)).toBe(false)
    }
    expect(permissionsFor(null)).toEqual([])
  })
})
