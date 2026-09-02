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

  const [salesResult, productsResult] = await Promise.all([
    supabase.from('sales').select('id, total, discount, subtotal, created_at').eq('business_id', businessId).eq('status', 'completed').gte('created_at', iso(thirtyDaysAgo)).lt('created_at', iso(endOfDay(now))).order('created_at', { ascending: true }),
    supabase.from('products').select('id, name, stock_quantity, cost_price, minimum_stock').eq('business_id', businessId).eq('is_active', true),
  ])

  if (salesResult.error) throw salesResult.error
  if (productsResult.error) throw productsResult.error

  const sales = (salesResult.data ?? []) as SaleRow[]
  const products = productsResult.data ?? []

  // sale_items is tenant-scoped through its parent sale; it does not carry
  // a business_id column. Fetch only the sale IDs already verified above.
  const saleIds = sales.map((sale) => sale.id)
  let items: ItemRow[] = []
  if (saleIds.length > 0) {
    const itemsResult = await supabase
      .from('sale_items')
      .select('sale_id, product_id, product_name, quantity, unit_price, cost_price, discount, subtotal')
      .in('sale_id', saleIds)
    if (itemsResult.error) throw itemsResult.error
    items = (itemsResult.data ?? []) as ItemRow[]
  }

  const saleById = new Map(sales.map((sale) => [sale.id, sale]))
  const inRange = (createdAt: string, start: Date) => new Date(createdAt) >= start
  const salesInPeriod = (start: Date) => sales.filter((sale) => inRange(sale.created_at, start))
  const revenue = (rows: SaleRow[]) => rows.reduce((sum, row) => sum + Number(row.total), 0)

  // Profit uses the actual line subtotal after line discounts, then allocates
  // each sale-level discount proportionally across its lines.
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
  for (const item of items) {
    const sale = saleById.get(item.sale_id)
    if (!sale) continue
    const key = new Date(sale.created_at).toISOString().slice(0, 10)
    const current = trendMap.get(key)
    if (current) current.profit += profitForItems([item])
  }

  const productMap = new Map<string, AnalyticsProduct>()
  for (const item of monthItems) {
    const sale = saleById.get(item.sale_id)
    const lineSubtotal = Number(item.subtotal)
    const saleSubtotal = Number(sale?.subtotal ?? 0)
    const saleDiscount = Number(sale?.discount ?? 0)
    const allocatedSaleDiscount = saleSubtotal > 0 ? (lineSubtotal / saleSubtotal) * saleDiscount : 0
    const netRevenue = lineSubtotal - allocatedSaleDiscount
    const profit = netRevenue - (Number(item.cost_price) * Number(item.quantity))
    const current = productMap.get(item.product_id) ?? { id: item.product_id, name: item.product_name, units: 0, revenue: 0, profit: 0 }
    current.units += Number(item.quantity)
    current.revenue += netRevenue
    current.profit += profit
    productMap.set(item.product_id, current)
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
