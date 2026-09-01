import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../lib/supabase'
import { createCashier, listBusinessUsers } from './cashierService'

vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

describe('cashierService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists business users through the secure function', async () => {
    const users = [{ id: 'owner-1', email: 'owner@example.com', fullName: 'Owner', phone: null, role: 'owner', createdAt: '2026-09-01T00:00:00Z' }]
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { users }, error: null })

    await expect(listBusinessUsers()).resolves.toEqual(users)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('manage-cashiers', { body: { action: 'list' } })
  })

  it('creates a cashier through the secure function', async () => {
    const user = { id: 'cashier-1', email: 'cashier@example.com', fullName: 'Cashier', phone: '0700000000', role: 'cashier', createdAt: '2026-09-01T00:00:00Z' }
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { user }, error: null })

    await expect(createCashier({ email: 'cashier@example.com', password: 'password123', fullName: 'Cashier', phone: '0700000000' })).resolves.toEqual(user)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('manage-cashiers', { body: { action: 'create', email: 'cashier@example.com', password: 'password123', fullName: 'Cashier', phone: '0700000000' } })
  })

  it('propagates function errors', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: null, error: new Error('Owner access required') })
    await expect(listBusinessUsers()).rejects.toThrow('Owner access required')
  })

  it('rejects a successful response without a created user', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: {}, error: null })
    await expect(createCashier({ email: 'cashier@example.com', password: 'password123' })).rejects.toThrow('Cashier account was not created.')
  })
})
