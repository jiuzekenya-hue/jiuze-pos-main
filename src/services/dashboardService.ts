import { supabase } from '../lib/supabase'

export type DashboardData = {
  todayRevenue: number
  todayTransactions: number
  todayItemsSold: number
  todayReturns: number
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

  const [salesResult, itemResult, productsResult, recentResult, returnsResult, returnItemsResult] = await Promise.all([
    supabase.from('sales').select('total').eq('business_id', businessId).eq('status', 'completed').gte('created_at', today),
    supabase.from('sale_items').select('quantity, sales!inner(business_id, status, created_at)').eq('sales.business_id', businessId).eq('sales.status', 'completed').gte('sales.created_at', today),
    supabase.from('products').select('id, name, stock_quantity, minimum_stock').eq('business_id', businessId).eq('is_active', true).order('stock_quantity'),
    supabase.from('sales').select('id, receipt_number, total, created_at').eq('business_id', businessId).eq('status', 'completed').order('created_at', { ascending: false }).limit(5),
    supabase.from('sales_returns').select('refund_amount').eq('business_id', businessId).gte('created_at', today),
    supabase.from('sales_return_items').select('quantity, sales_returns!inner(business_id, created_at)').eq('business_id', businessId).eq('sales_returns.business_id', businessId).gte('sales_returns.created_at', today),
  ])

  if (salesResult.error) throw salesResult.error
  if (itemResult.error) throw itemResult.error
  if (productsResult.error) throw productsResult.error
  if (recentResult.error) throw recentResult.error
  if (returnsResult.error) throw returnsResult.error
  if (returnItemsResult.error) throw returnItemsResult.error

  const lowStockProducts = (productsResult.data ?? [])
    .filter((row) => row.stock_quantity <= row.minimum_stock)
    .map((row) => ({ id: row.id, name: row.name, stockQuantity: row.stock_quantity, minimumStock: row.minimum_stock }))

  const grossRevenue = (salesResult.data ?? []).reduce((sum, row) => sum + Number(row.total), 0)
  const todayReturns = (returnsResult.data ?? []).reduce((sum, row) => sum + Number(row.refund_amount), 0)
  const grossItemsSold = (itemResult.data ?? []).reduce((sum, row) => sum + Number(row.quantity), 0)
  const returnedItems = (returnItemsResult.data ?? []).reduce((sum, row) => sum + Number(row.quantity), 0)

  return {
    todayRevenue: grossRevenue - todayReturns,
    todayTransactions: salesResult.data?.length ?? 0,
    todayItemsSold: Math.max(0, grossItemsSold - returnedItems),
    todayReturns,
    lowStockCount: lowStockProducts.length,
    lowStockProducts,
    recentSales: (recentResult.data ?? []).map((row) => ({ id: row.id, receiptNumber: row.receipt_number, total: Number(row.total), createdAt: row.created_at })),
  }
}
