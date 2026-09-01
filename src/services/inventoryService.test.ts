import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../lib/supabase'
import { adjustStock } from './inventoryService'

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))

const row = {
  id: 'prod-1',
  business_id: 'business-1',
  category_id: 'cat-1',
  name: 'Soda 500ml',
  sku: 'SODA-500',
  barcode: null,
  cost_price: '55.00',
  selling_price: '70.00',
  stock_quantity: 18,
  minimum_stock: 5,
  is_active: true,
  created_at: '2026-08-28T11:46:26.06033+00:00',
  updated_at: '2026-08-28T11:58:54.297155+00:00',
}

describe('inventoryService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adjusts stock and maps the returned product', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: row, error: null } as never)

    await expect(adjustStock('prod-1', 10, 'purchase', '  New delivery  ')).resolves.toMatchObject({
      id: 'prod-1',
      businessId: 'business-1',
      stockQuantity: 18,
      costPrice: 55,
      sellingPrice: 70,
    })

    expect(supabase.rpc).toHaveBeenCalledWith('adjust_stock', {
      p_product_id: 'prod-1',
      p_quantity_delta: 10,
      p_type: 'purchase',
      p_reason: 'New delivery',
    })
  })

  it('allows a negative stock adjustment', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: row, error: null } as never)

    await expect(adjustStock('prod-1', -3, 'damage', '  Damaged items  ')).resolves.toMatchObject({
      id: 'prod-1',
    })

    expect(supabase.rpc).toHaveBeenCalledWith('adjust_stock', {
      p_product_id: 'prod-1',
      p_quantity_delta: -3,
      p_type: 'damage',
      p_reason: 'Damaged items',
    })
  })

  it('rejects a missing product', async () => {
    await expect(adjustStock('', 1, 'purchase')).rejects.toThrow('Product is required.')
  })

  it('rejects zero quantity', async () => {
    await expect(adjustStock('prod-1', 0, 'purchase')).rejects.toThrow(
      'Stock adjustment quantity must be a non-zero integer.',
    )
  })

  it('rejects non-integer quantity', async () => {
    await expect(adjustStock('prod-1', 1.5, 'purchase')).rejects.toThrow(
      'Stock adjustment quantity must be a non-zero integer.',
    )
  })

  it('requires a reason for adjustment movements', async () => {
    await expect(adjustStock('prod-1', 1, 'adjustment')).rejects.toThrow(
      'A reason is required for adjustment movements.',
    )
  })

  it('requires a reason for damage movements', async () => {
    await expect(adjustStock('prod-1', -1, 'damage', '   ')).rejects.toThrow(
      'A reason is required for damage movements.',
    )
  })

  it('does not require a reason for purchases or returns', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: row, error: null } as never)

    await expect(adjustStock('prod-1', 5, 'return')).resolves.toMatchObject({ id: 'prod-1' })
    expect(supabase.rpc).toHaveBeenCalledWith('adjust_stock', {
      p_product_id: 'prod-1',
      p_quantity_delta: 5,
      p_type: 'return',
      p_reason: null,
    })
  })

  it('propagates Supabase errors', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: new Error('database failure'),
    } as never)

    await expect(adjustStock('prod-1', 1, 'purchase')).rejects.toThrow('database failure')
  })
})
