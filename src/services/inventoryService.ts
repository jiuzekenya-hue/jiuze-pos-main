import { supabase } from '../lib/supabase'
import type { Product } from '../types/products'

type StockMovementType = 'purchase' | 'adjustment' | 'return' | 'damage'

type ProductRow = {
  id: string
  business_id: string
  category_id: string
  name: string
  sku: string
  barcode: string | null
  cost_price: number | string
  selling_price: number | string
  stock_quantity: number
  minimum_stock: number
  is_active: boolean
  created_at: string
  updated_at: string
}

const mapProduct = (row: ProductRow): Product => ({
  id: row.id,
  businessId: row.business_id,
  categoryId: row.category_id,
  name: row.name,
  sku: row.sku,
  barcode: row.barcode,
  costPrice: Number(row.cost_price),
  sellingPrice: Number(row.selling_price),
  stockQuantity: row.stock_quantity,
  minimumStock: row.minimum_stock,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const adjustStock = async (
  productId: string,
  quantityDelta: number,
  type: StockMovementType = 'adjustment',
  reason?: string,
): Promise<Product> => {
  if (!productId) throw new Error('Product is required.')
  if (!Number.isInteger(quantityDelta) || quantityDelta === 0) {
    throw new Error('Stock adjustment quantity must be a non-zero integer.')
  }
  if (type === 'adjustment' || type === 'damage') {
    if (!reason?.trim()) throw new Error(`A reason is required for ${type} movements.`)
  }

  const { data, error } = await supabase.rpc('adjust_stock', {
    p_product_id: productId,
    p_quantity_delta: quantityDelta,
    p_type: type,
    p_reason: reason?.trim() || null,
  })

  if (error) throw error
  return mapProduct(data as ProductRow)
}
