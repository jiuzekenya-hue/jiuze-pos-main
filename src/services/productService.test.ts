import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createProduct, deactivateProduct, listProducts, updateProduct } from './productService'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

const row = {
  id: 'prod-1', business_id: 'business-1', category_id: 'cat-1', name: ' Soda 500ml ', sku: ' SODA-500 ',
  barcode: '6009900000001', cost_price: '55.00', selling_price: '70.00', stock_quantity: 18, minimum_stock: 5,
  is_active: true, created_at: '2026-08-28T11:46:26Z', updated_at: '2026-08-28T11:58:54Z',
}

const chain = (result: { data?: unknown; error?: unknown }) => {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ['select', 'eq', 'order', 'insert', 'update', 'single']) builder[method] = vi.fn(() => builder)
  builder.order.mockResolvedValue(result)
  builder.single.mockResolvedValue(result)
  return builder
}

describe('productService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists products and maps database fields', async () => {
    const builder = chain({ data: [row], error: null })
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    await expect(listProducts('business-1')).resolves.toEqual([expect.objectContaining({ id: 'prod-1', businessId: 'business-1', costPrice: 55, sellingPrice: 70 })])
  })

  it('trims and creates a product', async () => {
    const builder = chain({ data: { ...row, name: 'Soda 500ml', sku: 'SODA-500' }, error: null })
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    await expect(createProduct({ businessId: 'business-1', categoryId: 'cat-1', name: ' Soda 500ml ', sku: ' SODA-500 ', costPrice: 55, sellingPrice: 70, stockQuantity: 18, minimumStock: 5, unitType: 'piece' })).resolves.toMatchObject({ name: 'Soda 500ml', sku: 'SODA-500' })
    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({ business_id: 'business-1', name: 'Soda 500ml', sku: 'SODA-500', is_active: true }))
  })

  it('rejects empty names', async () => {
    await expect(createProduct({ businessId: 'business-1', categoryId: 'cat-1', name: ' ', sku: 'SKU', costPrice: 1, sellingPrice: 2, stockQuantity: 1, minimumStock: 1, unitType: 'piece' })).rejects.toThrow('Product name is required.')
  })

  it('rejects negative numeric values', async () => {
    await expect(createProduct({ businessId: 'business-1', categoryId: 'cat-1', name: 'Milk', sku: 'MILK', costPrice: -1, sellingPrice: 2, stockQuantity: 1, minimumStock: 1, unitType: 'piece' })).rejects.toThrow('cannot be negative')
  })

  it('rejects selling price below cost', async () => {
    await expect(createProduct({ businessId: 'business-1', categoryId: 'cat-1', name: 'Milk', sku: 'MILK', costPrice: 80, sellingPrice: 70, stockQuantity: 1, minimumStock: 1, unitType: 'piece' })).rejects.toThrow('Selling price cannot be lower than cost price.')
  })

  it('updates a product with a trimmed name', async () => {
    const current = chain({ data: { cost_price: '55', selling_price: '70', stock_quantity: 18, minimum_stock: 5 }, error: null })
    current.single.mockResolvedValueOnce({ data: { cost_price: '55', selling_price: '70', stock_quantity: 18, minimum_stock: 5 }, error: null }).mockResolvedValueOnce({ data: { ...row, name: 'Bread Loaf' }, error: null })
    vi.mocked(supabase.from).mockReturnValue(current as never)
    await expect(updateProduct('prod-1', { name: ' Bread Loaf ' })).resolves.toMatchObject({ name: 'Bread Loaf' })
    expect(current.update).toHaveBeenCalledWith({ name: 'Bread Loaf' })
  })

  it('deactivates instead of deleting', async () => {
    const builder = chain({ data: { ...row, is_active: false }, error: null })
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    await expect(deactivateProduct('prod-1')).resolves.toMatchObject({ isActive: false })
    expect(builder.update).toHaveBeenCalledWith({ is_active: false })
  })

  it('rejects an update with no changes', async () => {
    await expect(updateProduct('prod-1', {})).rejects.toThrow('No product changes provided.')
  })

  it('propagates Supabase errors', async () => {
    const builder = chain({ data: null, error: new Error('database failure') })
    vi.mocked(supabase.from).mockReturnValue(builder as never)
    await expect(listProducts('business-1')).rejects.toThrow('database failure')
  })
})
