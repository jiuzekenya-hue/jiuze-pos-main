import { supabase } from '../lib/supabase'

export type DashboardData = {
  todayRevenue: number
  todayTransactions: number
  todayItemsSold: number
  lowStockCount: number
  lowStockProducts: Array<{ id: string; name: string; stockQuantity: number; minimumStock: number }>
  recentSales: Array<{ id: string; receiptNumber: string; total: number; createdAt: string }>
}

const startOfToday = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
}

export const getDashboardData = async (businessId: string): Promise<DashboardData> => {
  if (!businessId) throw new Error('Business is required.')
  const today = startOfToday()

  const [salesResult, itemResult, productsResult, recentResult] = await Promise.all([
    supabase.from('sales').select('total').eq('business_id', businessId).eq('status', 'completed').gte('created_at', today),
    supabase.from('sale_items').select('quantity, sales!inner(business_id, status, created_at)').eq('sales.business_id', businessId).eq('sales.status', 'completed').gte('sales.created_at', today),
    supabase.from('products').select('id, name, stock_quantity, minimum_stock').eq('business_id', businessId).eq('is_active', true).order('stock_quantity'),
    supabase.from('sales').select('id, receipt_number, total, created_at').eq('business_id', businessId).eq('status', 'completed').order('created_at', { ascending: false }).limit(5),
  ])

  if (salesResult.error) throw salesResult.error
  if (itemResult.error) throw itemResult.error
  if (productsResult.error) throw productsResult.error
  if (recentResult.error) throw recentResult.error

  const lowStockProducts = (productsResult.data ?? [])
    .filter((row) => row.stock_quantity <= row.minimum_stock)
    .map((row) => ({ id: row.id, name: row.name, stockQuantity: row.stock_quantity, minimumStock: row.minimum_stock }))

  return {
    todayRevenue: (salesResult.data ?? []).reduce((sum, row) => sum + Number(row.total), 0),
    todayTransactions: salesResult.data?.length ?? 0,
    todayItemsSold: (itemResult.data ?? []).reduce((sum, row) => sum + Number(row.quantity), 0),
    lowStockCount: lowStockProducts.length,
    lowStockProducts,
    recentSales: (recentResult.data ?? []).map((row) => ({ id: row.id, receiptNumber: row.receipt_number, total: Number(row.total), createdAt: row.created_at })),
  }
}
