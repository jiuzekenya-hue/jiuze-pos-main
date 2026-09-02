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
    supabase.from('sales').select('id, total, created_at').eq('business_id', businessId).eq('status', 'completed').gte('created_at', iso(thirtyDaysAgo)).lt('created_at', iso(endOfDay(now))).order('created_at', { ascending: true }),
    supabase.from('sale_items').select('product_id, product_name, quantity, unit_price, cost_price, subtotal, sales!inner(business_id, status, created_at)').eq('sales.business_id', businessId).eq('sales.status', 'completed').gte('sales.created_at', iso(thirtyDaysAgo)).lt('sales.created_at', iso(endOfDay(now))),
    supabase.from('products').select('id, name, stock_quantity, cost_price, minimum_stock').eq('business_id', businessId).eq('is_active', true),
  ])

  if (salesResult.error) throw salesResult.error
  if (itemsResult.error) throw itemsResult.error
  if (productsResult.error) throw productsResult.error

  const sales = salesResult.data ?? []
  const items = itemsResult.data ?? []
  const products = productsResult.data ?? []
  const inRange = (createdAt: string, start: Date) => new Date(createdAt) >= start

  const todaySales = sales.filter((sale) => inRange(sale.created_at, todayStart))
  const weekSales = sales.filter((sale) => inRange(sale.created_at, weekStart))
  const monthSales = sales.filter((sale) => inRange(sale.created_at, monthStart))
  const revenue = (rows: typeof sales) => rows.reduce((sum, row) => sum + Number(row.total), 0)
  const itemForSale = (start: Date, end?: Date) => items.filter((item) => {
    const created = new Date(item.sales.created_at)
    return created >= start && (!end || created < end)
  })
  const profitForItems = (rows: typeof items) => rows.reduce((sum, item) => sum + ((Number(item.unit_price) - Number(item.cost_price)) * Number(item.quantity)), 0)

  const todayItems = itemForSale(todayStart)
  const weekItems = itemForSale(weekStart)
  const monthItems = itemForSale(monthStart)
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
    const key = new Date(item.sales.created_at).toISOString().slice(0, 10)
    const current = trendMap.get(key)
    if (current) current.profit += (Number(item.unit_price) - Number(item.cost_price)) * Number(item.quantity)
  }

  const productMap = new Map<string, AnalyticsProduct>()
  for (const item of monthItems) {
    const id = item.product_id
    const current = productMap.get(id) ?? { id, name: item.product_name, units: 0, revenue: 0, profit: 0 }
    current.units += Number(item.quantity)
    current.revenue += Number(item.subtotal)
    current.profit += (Number(item.unit_price) - Number(item.cost_price)) * Number(item.quantity)
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
