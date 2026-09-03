import { supabase } from '../lib/supabase'

export type StockMovement = {
  id: string
  productId: string
  productName: string
  sku: string
  type: 'purchase' | 'sale' | 'adjustment' | 'return' | 'damage'
  quantity: number
  reason: string | null
  createdBy: string | null
  createdAt: string
}

type MovementRow = {
  id: string
  product_id: string
  type: StockMovement['type']
  quantity: number
  reason: string | null
  created_by: string | null
  created_at: string
  products: { name: string; sku: string } | { name: string; sku: string }[] | null
}

export const listStockMovements = async (businessId: string): Promise<StockMovement[]> => {
  if (!businessId) return []

  const { data, error } = await supabase
    .from('stock_movements')
    .select('id, product_id, type, quantity, reason, created_by, created_at, products!inner(name, sku)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as MovementRow[]).map((row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products
    return {
      id: row.id,
      productId: row.product_id,
      productName: product?.name ?? 'Unknown product',
      sku: product?.sku ?? '—',
      type: row.type,
      quantity: row.quantity,
      reason: row.reason,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }
  })
}
