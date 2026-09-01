import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../lib/supabase'
import { getSale, listSales } from './salesHistoryService'

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

const makeBuilder = (result: { data: unknown; error: unknown }) => {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order', 'ilike']) builder[method] = vi.fn(() => builder)
  builder['maybeSingle'] = vi.fn(() => Promise.resolve(result))
  builder['then'] = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return builder
}

describe('salesHistoryService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists sales and maps database fields', async () => {
    const builder = makeBuilder({ data: [{ id: 'sale-1', receipt_number: 'R-001', cashier_id: 'user-1', subtotal: '160.00', discount: '0.00', total: '160.00', status: 'completed', created_at: '2026-09-01T10:00:00Z' }], error: null })
    vi.mocked(supabase.from).mockReturnValue(builder as never)

    await expect(listSales('business-1')).resolves.toEqual([{ id: 'sale-1', receiptNumber: 'R-001', cashierId: 'user-1', subtotal: 160, discount: 0, total: 160, status: 'completed', createdAt: '2026-09-01T10:00:00Z' }])
    expect(supabase.from).toHaveBeenCalledWith('sales')
  })

  it('filters by receipt number when searching', async () => {
    const builder = makeBuilder({ data: [], error: null })
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    await listSales('business-1', ' R-001 ')
    expect(builder.ilike).toHaveBeenCalledWith('receipt_number', '%R-001%')
  })

  it('propagates list errors', async () => {
    const builder = makeBuilder({ data: null, error: new Error('database failure') })
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    await expect(listSales('business-1')).rejects.toThrow('database failure')
  })

  it('gets sale details, items and payment', async () => {
    const saleBuilder = makeBuilder({ data: { id: 'sale-1', receipt_number: 'R-001', cashier_id: 'user-1', subtotal: '160.00', discount: '0.00', total: '160.00', status: 'completed', created_at: '2026-09-01T10:00:00Z' }, error: null })
    const itemsBuilder = makeBuilder({ data: [{ id: 'item-1', product_id: 'prod-1', product_name: 'Bread Loaf', quantity: 2, unit_price: '80.00', discount: '0.00', subtotal: '160.00' }], error: null })
    const paymentBuilder = makeBuilder({ data: { method: 'cash', amount: '200.00', reference: null }, error: null })
    vi.mocked(supabase.from).mockImplementation((table) => ({ sales: saleBuilder, sale_items: itemsBuilder, payments: paymentBuilder }[table] as never))

    await expect(getSale('business-1', 'sale-1')).resolves.toMatchObject({ receiptNumber: 'R-001', total: 160, items: [{ productName: 'Bread Loaf', quantity: 2, unitPrice: 80, subtotal: 160 }], payment: { method: 'cash', amount: 200 } })
  })

  it('rejects when the sale does not belong to the business or does not exist', async () => {
    const saleBuilder = makeBuilder({ data: null, error: null })
    const emptyBuilder = makeBuilder({ data: [], error: null })
    const paymentBuilder = makeBuilder({ data: null, error: null })
    vi.mocked(supabase.from).mockImplementation((table) => ({ sales: saleBuilder, sale_items: emptyBuilder, payments: paymentBuilder }[table] as never))
    await expect(getSale('business-1', 'missing')).rejects.toThrow('Sale not found.')
  })
})
