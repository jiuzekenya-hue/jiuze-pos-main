import { supabase } from '../lib/supabase'

export type AnalyticsProduct = {
  id: string
  name: string
  units: number
  revenue: number
  profit: number
}

export type AnalyticsDay = {
  date: string
  revenue: number
  profit: number
}

export type AnalyticsData = {
  todayRevenue: number
  todayProfit: number
  todayTransactions: number
  weekRevenue: number
  weekProfit: number
  monthRevenue: number
  monthProfit: number
  monthTransactions: number
  inventoryValue: number
  lowStockCount: number
  averageSale: number
  grossMargin: number
  projectedMonthRevenue: number
  projectedMonthProfit: number
  salesTrend: AnalyticsDay[]
  topProducts: AnalyticsProduct[]
  slowProducts: AnalyticsProduct[]
}

type SaleRow = { id: string; total: number; discount: number; subtotal: number; created_at: string }
type ItemRow = { sale_id: string; product_id: string; product_name: string; quantity: number; unit_price: number; cost_price: number; discount: number; subtotal: number }

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const startOfWeek = (date: Date) => {
  const day = date.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const result = startOfDay(date)
  result.setDate(result.getDate() + mondayOffset)
  return result
}
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
const iso = (date: Date) => date.toISOString()

export async function getAnalyticsData(businessId: string): Promise<AnalyticsData> {
  if (!businessId) throw new Error('Business is required.')

  const now = new Date()
  const todayStart = startOfDay(now)
  const weekStart = startOfWeek(now)
  const monthStart = startOfMonth(now)
  const thirtyDaysAgo = new Date(todayStart)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)

  const [salesResult, itemsResult, productsResult] = await Promise.all([
    supabase.from('sales').select('id, total, discount, subtotal, created_at').eq('business_id', businessId).eq('status', 'completed').gte('created_at', iso(thirtyDaysAgo)).lt('created_at', iso(endOfDay(now))).order('created_at', { ascending: true }),
    supabase.from('sale_items').select('sale_id, product_id, product_name, quantity, unit_price, cost_price, discount, subtotal').eq('business_id', businessId),
    supabase.from('products').select('id, name, stock_quantity, cost_price, minimum_stock').eq('business_id', businessId).eq('is_active', true),
  ])

  if (salesResult.error) throw salesResult.error
  if (itemsResult.error) throw itemsResult.error
  if (productsResult.error) throw productsResult.error

  const sales = (salesResult.data ?? []) as SaleRow[]
  const items = (itemsResult.data ?? []) as ItemRow[]
  const products = productsResult.data ?? []
  const saleById = new Map(sales.map((sale) => [sale.id, sale]))
  const inRange = (createdAt: string, start: Date) => new Date(createdAt) >= start
  const salesInPeriod = (start: Date) => sales.filter((sale) => inRange(sale.created_at, start))
  const revenue = (rows: SaleRow[]) => rows.reduce((sum, row) => sum + Number(row.total), 0)

  // Profit is calculated from the actual sale subtotal after line discounts,
  // then the sale-level discount is allocated proportionally across its lines.
  // This prevents gross profit from being overstated when a sale has a discount.
  const profitForItems = (rows: ItemRow[]) => rows.reduce((sum, item) => {
    const sale = saleById.get(item.sale_id)
    const lineSubtotal = Number(item.subtotal)
    const saleSubtotal = Number(sale?.subtotal ?? 0)
    const saleDiscount = Number(sale?.discount ?? 0)
    const allocatedSaleDiscount = saleSubtotal > 0 ? (lineSubtotal / saleSubtotal) * saleDiscount : 0
    const netLineRevenue = lineSubtotal - allocatedSaleDiscount
    const cost = Number(item.cost_price) * Number(item.quantity)
    return sum + netLineRevenue - cost
  }, 0)

  const itemsForSales = (rows: SaleRow[]) => {
    const ids = new Set(rows.map((sale) => sale.id))
    return items.filter((item) => ids.has(item.sale_id))
  }

  const todaySales = salesInPeriod(todayStart)
  const weekSales = salesInPeriod(weekStart)
  const monthSales = salesInPeriod(monthStart)
  const todayItems = itemsForSales(todaySales)
  const weekItems = itemsForSales(weekSales)
  const monthItems = itemsForSales(monthSales)
  const monthRevenue = revenue(monthSales)
  const monthDaysElapsed = Math.max(1, Math.ceil((now.getTime() - monthStart.getTime()) / 86400000))
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const projectedMonthRevenue = (monthRevenue / monthDaysElapsed) * daysInMonth
  const monthProfit = profitForItems(monthItems)
  const projectedMonthProfit = (monthProfit / monthDaysElapsed) * daysInMonth

  const trendMap = new Map<string, { revenue: number; profit: number }>()
  for (let index = 0; index < 30; index += 1) {
    const date = new Date(thirtyDaysAgo)
    date.setDate(date.getDate() + index)
    trendMap.set(date.toISOString().slice(0, 10), { revenue: 0, profit: 0 })
  }
  for (const sale of sales) {
    const key = new Date(sale.created_at).toISOString().slice(0, 10)
    const current = trendMap.get(key)
    if (current) current.revenue += Number(sale.total)
  }
  for (const item of itemsForSales(sales)) {
    const sale = saleById.get(item.sale_id)
    const key = sale ? new Date(sale.created_at).toISOString().slice(0, 10) : ''
    const current = trendMap.get(key)
    if (current) current.profit += profitForItems([item])
  }

  const productMap = new Map<string, AnalyticsProduct>()
  for (const item of monthItems) {
    const id = item.product_id
    const sale = saleById.get(item.sale_id)
    const lineSubtotal = Number(item.subtotal)
    const saleSubtotal = Number(sale?.subtotal ?? 0)
    const saleDiscount = Number(sale?.discount ?? 0)
    const allocatedSaleDiscount = saleSubtotal > 0 ? (lineSubtotal / saleSubtotal) * saleDiscount : 0
    const netRevenue = lineSubtotal - allocatedSaleDiscount
    const profit = netRevenue - (Number(item.cost_price) * Number(item.quantity))
    const current = productMap.get(id) ?? { id, name: item.product_name, units: 0, revenue: 0, profit: 0 }
    current.units += Number(item.quantity)
    current.revenue += netRevenue
    current.profit += profit
    productMap.set(id, current)
  }
  const productPerformance = Array.from(productMap.values())
  const topProducts = [...productPerformance].sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  const slowProducts = [...productPerformance].sort((a, b) => a.units - b.units).slice(0, 5)

  const inventoryValue = products.reduce((sum, product) => sum + Number(product.stock_quantity) * Number(product.cost_price), 0)
  const lowStockCount = products.filter((product) => Number(product.stock_quantity) <= Number(product.minimum_stock)).length
  const averageSale = monthSales.length ? monthRevenue / monthSales.length : 0
  const grossMargin = monthRevenue > 0 ? (monthProfit / monthRevenue) * 100 : 0

  return {
    todayRevenue: revenue(todaySales),
    todayProfit: profitForItems(todayItems),
    todayTransactions: todaySales.length,
    weekRevenue: revenue(weekSales),
    weekProfit: profitForItems(weekItems),
    monthRevenue,
    monthProfit,
    monthTransactions: monthSales.length,
    inventoryValue,
    lowStockCount,
    averageSale,
    grossMargin,
    projectedMonthRevenue,
    projectedMonthProfit,
    salesTrend: Array.from(trendMap, ([date, values]) => ({ date, ...values })),
    topProducts,
    slowProducts,
  }
}
